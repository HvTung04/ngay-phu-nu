import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import QRCode from 'qrcode'
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
  forceFinish,
  resetToLobby,
  snapshot,
  MAX_HITS,
  MAX_SLOTS,
  MAX_HITS_PER_SEC,
} from './game.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC = path.join(ROOT, 'public')
const PORT = Number(process.env.PORT) || 3000

const TICK_MS = 50
const HEARTBEAT_MS = 500
const COUNTDOWN_FROM = 3

const room = createRoom()

const PAGES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/host', 'host.html'],
  ['/host.html', 'host.html'],
  ['/play', 'play.html'],
  ['/play.html', 'play.html'],
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

const qrCache = new Map()

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://placeholder')
  const pathname = decodeURIComponent(url.pathname)

  if (pathname === '/health') {
    return sendJson(res, 200, { ok: true, state: room.state, players: room.players.length })
  }

  if (pathname === '/qr.svg') {
    return sendQr(res, req)
  }

  if (pathname === '/room.json') {
    return sendJson(res, 200, snapshot(room))
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

async function sendQr(res, req) {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? `localhost:${PORT}`)
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http').split(',')[0].trim()
  const target = `${proto}://${host}/play`

  try {
    let svg = qrCache.get(target)
    if (!svg) {
      svg = await QRCode.toString(target, {
        type: 'svg',
        margin: 1,
        width: 320,
        color: { dark: '#1a1033', light: '#ffffff' },
      })
      qrCache.set(target, svg)
    }
    res.writeHead(200, {
      'content-type': 'image/svg+xml',
      'cache-control': 'no-store',
    })
    res.end(svg)
  } catch (err) {
    sendText(res, 500, 'QR error')
  }
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
  send(ws, { type: 'welcome', role: 'host', maxHits: MAX_HITS, maxSlots: MAX_SLOTS })
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
  })
  broadcastState()
}

function hit(ws) {
  if (!ws.playerId) return
  applyHit(room, ws.playerId, Date.now())
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
      sendAll({ type: 'finish', order: snap.order })
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