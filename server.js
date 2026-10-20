import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import {
  createRoom,
  addPlayer,
  removePlayer,
  setOnline,
  claimHost,
  releaseHost,
  startCountdown,
  beginRace,
  applyHit,
  castSkill,
  forceFinish,
  resetToLobby,
  snapshot,
  assignPrizes,
  MAX_HITS,
  MAX_SLOTS,
  MAX_HITS_PER_SEC,
  SKILLS,
} from './game.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT) || 3000

const TICK_MS = 50
const HEARTBEAT_MS = 500
const COUNTDOWN_FROM = 3

const room = createRoom()
const gifts = loadGifts()

function loadGifts() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gifts.json'), 'utf8'))
    return Array.isArray(raw.gifts) ? raw.gifts : []
  } catch (err) {
    console.warn('[ngay-phu-nu] khong doc duoc gifts.json:', err.message)
    return []
  }
}

const PAGES = new Map([
  ['/host', 'host.html'],
  ['/host.html', 'host.html'],
  ['/play', 'play.html'],
  ['/play.html', 'play.html'],
])

// Nguoi choi mo domain la vao thang trang dien thoai, khong phai chon.
const REDIRECTS = new Map([
  ['/', '/play'],
  ['/index.html', '/play'],
])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://placeholder')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === '/health') {
    return sendJson(res, 200, { ok: true, state: room.state, players: room.players.length })
  }

  if (pathname === '/room.json') {
    return sendJson(res, 200, snapshot(room))
  }

  const redirect = REDIRECTS.get(pathname)
  if (redirect) {
    res.writeHead(302, { location: redirect, 'cache-control': 'no-store' })
    return res.end()
  }

  const file = resolvePage(pathname)
  if (!file) return sendText(res, 404, 'Not found')
  sendFile(res, file)
})

function resolvePage(pathname) {
  const page = PAGES.get(pathname)
  if (page) return path.join(PUBLIC, page)
  if (!pathname.startsWith('/')) return null

  const target = path.resolve(PUBLIC, '.' + pathname)
  if (!target.startsWith(PUBLIC + path.sep)) return null
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null
  return target
}

function sendFile(res, file) {
  const body = fs.readFileSync(file)
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendJson(res, code, value) {
  const body = JSON.stringify(value)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendText(res, code, value) {
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' })
  res.end(value)
}

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  ws.id = `c${nextId++}`
  ws.isHost = false
  ws.hostId = null
  ws.playerId = null

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }
    handle(ws, msg)
  })

  ws.on('close', () => {
    releaseHost(room, ws.hostId ?? null)
    if (!ws.playerId) return
    if (room.state === 'lobby') removePlayer(room, ws.playerId)
    else setOnline(room, ws.playerId, false)
    broadcastState()
  })

  ws.on('error', () => {})
})

function handle(ws, msg) {
  switch (msg.type) {
    case 'host_claim':
      return hostClaim(ws)
    case 'player_join':
      return playerJoin(ws, msg)
    case 'hit':
      return hit(ws)
    case 'cast':
      return cast(ws, msg)
    case 'host_start':
      return hostStart(ws)
    case 'host_force_finish':
      return forceFinishCmd(ws, msg)
    case 'host_replay':
      return replay(ws)
  }
}

function hostClaim(ws) {
  const result = claimHost(room, ws.id)
  if (!result.ok) return send(ws, { type: 'error', reason: result.reason })
  ws.isHost = true
  ws.hostId = ws.id
  send(ws, { type: 'welcome', role: 'host', maxHits: MAX_HITS, maxSlots: MAX_SLOTS, skills: skillInfo() })
  broadcastState()
}

function playerJoin(ws, msg) {
  const playerId = String(msg.playerId ?? '').slice(0, 64)
  if (!playerId) return send(ws, { type: 'error', reason: 'bad_player_id' })

  const result = addPlayer(room, playerId, msg.name)
  if (!result.ok) {
    return send(ws, { type: 'error', reason: result.reason })
  }
  ws.playerId = playerId
  send(ws, {
    type: 'welcome',
    role: 'player',
    slot: result.slot,
    maxHits: MAX_HITS,
    maxHitsPerSec: MAX_HITS_PER_SEC,
    skills: skillInfo(),
  })
  broadcastState()
}

function skillInfo() {
  return Object.values(SKILLS).map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    cooldown: s.cooldown,
    duration: s.duration ?? 0,
    bonus: s.bonus ?? 0,
  }))
}

function hit(ws) {
  if (!ws.playerId) return
  applyHit(room, ws.playerId, Date.now())
}

function cast(ws, msg) {
  if (!ws.playerId) return send(ws, { type: 'error', reason: 'no_player' })
  const skillId = String(msg.skillId ?? '')
  const targetId = msg.targetId ? String(msg.targetId) : null
  const now = Date.now()
  const result = castSkill(room, ws.playerId, skillId, targetId, now)
  if (!result.ok) return send(ws, { type: 'error', reason: result.reason, skillId })

  sendAll({
    type: 'skill_cast',
    skillId: result.skillId,
    casterId: ws.playerId,
    targetId: result.targetId ?? null,
    effect: result.effect,
    duration: result.duration ?? 0,
    at: now,
  })

  if (result.finished) {
    sendAll({ type: 'player_finished', playerId: ws.playerId, place: result.place })
  }
}

function hostStart(ws) {
  if (!ws.isHost) return
  const result = startCountdown(room, ws.hostId)
  if (!result.ok) return send(ws, { type: 'error', reason: result.reason })
  runCountdown()
}

function forceFinishCmd(ws, msg) {
  if (!ws.isHost) return
  const result = forceFinish(room, String(msg.playerId ?? ''), Date.now())
  if (!result.accepted) return send(ws, { type: 'error', reason: result.reason })
  sendAll({ type: 'player_finished', playerId: msg.playerId, place: result.place })
}

function replay(ws) {
  if (!ws.isHost) return
  const result = resetToLobby(room, ws.hostId)
  if (!result.ok) return send(ws, { type: 'error', reason: result.reason })
  broadcastState()
}

function runCountdown() {
  let n = COUNTDOWN_FROM
  sendAll({ type: 'countdown', n })
  const timer = setInterval(() => {
    n -= 1
    if (n > 0) {
      sendAll({ type: 'countdown', n })
      return
    }
    clearInterval(timer)
    beginRace(room)
    sendAll({ type: 'go' })
    startTick()
  }, 1000)
}

let tickTimer = null

function startTick() {
  if (tickTimer) return
  tickTimer = setInterval(() => {
    const snap = snapshot(room)
    sendAll({ type: 'race_tick', state: snap.state, players: snap.players, order: snap.order })

    const allDone = room.players.every((p) => p.place !== null)
    if (allDone) {
      room.state = 'finished'
      clearInterval(tickTimer)
      tickTimer = null
      assignPrizes(room, gifts)
      const final = snapshot(room)
      sendAll({ type: 'finish', order: final.order, players: final.players })
    }
  }, TICK_MS)
}

function broadcastState() {
  sendAll({ type: 'room_state', ...snapshot(room), maxHits: MAX_HITS, maxSlots: MAX_SLOTS })
}

function send(ws, value) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(value))
}

function sendAll(value) {
  const raw = JSON.stringify(value)
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(raw)
  }
}

let nextId = 1

setInterval(() => broadcastState(), HEARTBEAT_MS)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[ngay-phu-nu] san server: http://localhost:${PORT}`)
  console.log(`  may chieu : http://<domain cua ban>/host`)
  console.log(`  dien thoai: http://<domain cua ban>/play`)
})

process.on('SIGINT', () => {
  if (tickTimer) clearInterval(tickTimer)
  process.exit(0)
})