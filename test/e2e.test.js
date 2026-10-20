import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 3941
const BASE = `http://127.0.0.1:${PORT}`

let child = null
let serverLog = ''

async function startServer() {
  child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stderr.on('data', (d) => (serverLog += d.toString()))
  child.stdout.on('data', (d) => (serverLog += d.toString()))
  child.once('exit', (code) => {
    if (code) serverLog += `\n[server] ket voi code ${code}\n`
  })

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/health`)
      if (res.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error('server khong len duoc:\n' + serverLog)
}

before(startServer)
after(() => child?.kill())

beforeEach(async () => {
  child?.kill()
  await sleep(200)
  await startServer()
})

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function open() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`)
  const inbox = []
  const waiters = []

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    const waiter = waiters.find((w) => w.match(msg))
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1)
      waiter.run(msg)
    } else inbox.push(msg)
  })

  return {
    ws,
    send: (v) => ws.send(JSON.stringify(v)),
    drain: () => inbox.splice(0, inbox.length),
    waitFor(match, label = 'message') {
      const found = inbox.findIndex(match)
      if (found !== -1) return inbox.splice(found, 1)[0]
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const seen = inbox.map((m) => m.type).join(',') || '(rong)'
          reject(new Error(`het gio doi ${label} — da nhan: ${seen}`))
        }, 8000)
        waiters.push({
          match,
          run: (msg) => {
            clearTimeout(timer)
            resolve(msg)
          },
        })
      })
    },
    async open() {
      if (ws.readyState === 1) return
      await new Promise((resolve, reject) => {
        ws.once('open', resolve)
        ws.once('error', reject)
      })
    },
  }
}

test('QR da duoc go khoi he thong', async () => {
  const res = await fetch(`${BASE}/qr.svg`)
  assert.equal(res.status, 404)
})

test('chi co mot phong, khong tach theo truy van', async () => {
  const a = open()
  await a.open()
  a.send({ type: 'player_join', playerId: 'id-A', name: 'An' })
  await a.waitFor((m) => m.type === 'welcome' && m.role === 'player', 'welcome A')

  const b = open()
  await b.open()
  b.send({ type: 'player_join', playerId: 'id-B', name: 'Bao', room: 'phong-2' })
  await b.waitFor((m) => m.type === 'welcome' && m.role === 'player', 'welcome B')

  const state = await a.waitFor(
    (m) => m.type === 'room_state' && m.players.length === 2,
    'hai nguoi cung mot phong',
  )
  assert.deepEqual(state.players.map((p) => p.name).sort(), ['An', 'Bao'])

  const json = await fetch(`${BASE}/room.json?room=phong-3`)
  const room = await json.json()
  assert.equal(room.players.length, 2)

  a.ws.close()
  b.ws.close()
})

test('trang dien thoai phuc vu duoc', async () => {
  const res = await fetch(`${BASE}/play`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /btn-run/)
})

test('trang chu chuyen thang sang /play', async () => {
  const res = await fetch(`${BASE}/`, { redirect: 'manual' })
  assert.equal(res.status, 302)
  assert.equal(res.headers.get('location'), '/play')

  const old = await fetch(`${BASE}/index.html`, { redirect: 'manual' })
  assert.equal(old.status, 302)
  assert.equal(old.headers.get('location'), '/play')
})

test('may chieu van vao duoc trang host', async () => {
  const res = await fetch(`${BASE}/host`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /btn-start/)
})

test('khong phai lai duong ma trong thu muc public', async () => {
  const res = await fetch(`${BASE}/../server.js`)
  assert.notEqual(res.status, 200)
})

test('cua het mot vong dua day du', async () => {
  const host = open()
  await host.open()
  host.send({ type: 'host_claim' })
  await host.waitFor((m) => m.type === 'welcome' && m.role === 'host', 'welcome host')

  const names = ['An', 'Bao', 'Cu']
  const players = []
  for (const name of names) {
    const c = open()
    await c.open()
    c.send({ type: 'player_join', playerId: `id-${name}`, name })
    await c.waitFor((m) => m.type === 'welcome' && m.role === 'player', `welcome ${name}`)
    players.push(c)
  }

  const joined = await host.waitFor(
    (m) => m.type === 'room_state' && m.players.length === 3,
    'room_state 3 nguoi',
  )
  assert.deepEqual(joined.players.map((p) => p.name).sort(), names.slice().sort())

  host.send({ type: 'host_start' })
  await host.waitFor((m) => m.type === 'countdown' && m.n === 3, 'dem nguoc 3')
  const go = await host.waitFor((m) => m.type === 'go', 'GO')
  assert.ok(go)

  for (const c of players) {
    for (let i = 0; i < 60; i++) {
      c.send({ type: 'hit' })
      await sleep(12)
    }
  }

  const ticked = await host.waitFor(
    (m) => m.type === 'race_tick' && m.players.some((p) => p.progress > 0),
    'co tien do',
  )
  assert.ok(ticked.players.every((p) => p.progress <= 1000))

  for (const c of players) {
    host.send({ type: 'host_force_finish', playerId: `id-${names[players.indexOf(c)]}` })
    await sleep(80)
  }

  const finish = await host.waitFor((m) => m.type === 'finish', 'het tran')
  assert.equal(finish.order.length, 3)

  host.drain()
  host.send({ type: 'host_replay' })
  const lobby = await host.waitFor((m) => m.type === 'room_state' && m.state === 'lobby', 've lobby')
  assert.equal(lobby.players.length, 3)
  assert.ok(lobby.players.every((p) => p.progress === 0 && p.place === null))

  for (const c of [host, ...players]) c.ws.close()
})

test('khong co ai choi thi van bat duoc, va ket thuc ngay lap tuc', async () => {
  const host = open()
  await host.open()
  host.send({ type: 'host_claim' })
  await host.waitFor((m) => m.type === 'welcome' && m.role === 'host', 'welcome host')

  host.send({ type: 'host_start' })
  await host.waitFor((m) => m.type === 'countdown' && m.n === 3, 'dem nguoc')

  const finish = await host.waitFor((m) => m.type === 'finish', 'het tran rong')
  assert.deepEqual(finish.order, [])

  const board = await host.waitFor(
    (m) => m.type === 'room_state' && m.state === 'finished',
    've bang xep hang',
  )
  assert.equal(board.players.length, 0)

  host.ws.close()
})

test('phong 12 nguoi chay duoc va dung ky nang qua websocket that', async () => {
  const host = open()
  await host.open()
  host.send({ type: 'host_claim' })
  await host.waitFor((m) => m.type === 'welcome' && m.role === 'host', 'welcome host')

  const names = ['An', 'Bao', 'Cu', 'Duc', 'Em', 'Gia', 'Ha', 'Lan', 'Mai', 'Nam', 'Oa', 'Phu']
  const players = []
  for (const name of names) {
    const c = open()
    await c.open()
    c.send({ type: 'player_join', playerId: `id-${name}`, name })
    await c.waitFor((m) => m.type === 'welcome' && m.role === 'player', `welcome ${name}`)
    players.push(c)
  }

  const joined = await host.waitFor(
    (m) => m.type === 'room_state' && m.players.length === 12,
    'room_state 12 nguoi',
  )
  assert.equal(joined.players.length, 12)

  host.send({ type: 'host_start' })
  await host.waitFor((m) => m.type === 'countdown' && m.n === 3, 'dem nguoc')
  await host.waitFor((m) => m.type === 'go', 'GO')

  // An chan Bao
  players[0].send({ type: 'cast', skillId: 'chan', targetId: 'id-Bao' })
  const cast = await host.waitFor((m) => m.type === 'skill_cast', 'skill_cast')
  assert.equal(cast.skillId, 'chan')
  assert.equal(cast.casterId, 'id-An')
  assert.equal(cast.targetId, 'id-Bao')
  assert.equal(cast.duration, 2500)

  // Bao cung nhan duoc tin de hien bang canh bao
  const seen = await players[1].waitFor(
    (m) => m.type === 'skill_cast' && m.targetId === 'id-Bao',
    'Bao thay bi nhắm',
  )
  assert.equal(seen.casterId, 'id-An')

  // Cu chay, Bao bi chan nen dung yen
  for (let i = 0; i < 30; i++) players[2].send({ type: 'hit' })
  const ticked = await host.waitFor(
    (m) => m.type === 'race_tick' && m.players.find((p) => p.id === 'id-Cu')?.progress > 0,
    'Cu co tien do',
  )
  const cu = ticked.players.find((p) => p.id === 'id-Cu')
  const bao = ticked.players.find((p) => p.id === 'id-Bao')
  const an = ticked.players.find((p) => p.id === 'id-An')
  assert.ok(cu.progress > 0)
  assert.equal(bao.progress, 0, 'Bao dang bi chan nen khong tien duoc')
  assert.equal(bao.effects.length, 1)
  assert.equal(bao.effects[0].type, 'chan')
  assert.ok(bao.effects[0].ms > 0 && bao.effects[0].ms <= 2500)
  assert.ok(an.cd.chan > 0, 'An dang trong thoi gian hoi lai')
  assert.equal(bao.cd.chan, 0)

  // Duc tu tang toc: +60 diem
  players[3].send({ type: 'cast', skillId: 'tangtoc' })
  await host.waitFor((m) => m.type === 'skill_cast' && m.skillId === 'tangtoc', 'tang toc')
  const boosted = await host.waitFor(
    (m) => m.type === 'race_tick' && m.players.find((p) => p.id === 'id-Duc')?.progress === 60,
    'Duc duoc +60 diem',
  )
  assert.equal(boosted.players.find((p) => p.id === 'id-Duc').progress, 60)
  assert.ok(boosted.players.find((p) => p.id === 'id-Duc').cd.tangtoc > 0)

  // Chua toi han thi dung lai bi tu choi
  players[3].send({ type: 'cast', skillId: 'tangtoc' })
  const denied = await players[3].waitFor(
    (m) => m.type === 'error' && m.reason === 'cooldown',
    'bi tu choi vi con hoi lai',
  )
  assert.equal(denied.reason, 'cooldown')

  for (const c of [host, ...players]) c.ws.close()
})

test('het tran thi moi nguoi duoc chia qua theo tier', async () => {
  const host = open()
  await host.open()
  host.send({ type: 'host_claim' })
  await host.waitFor((m) => m.type === 'welcome' && m.role === 'host', 'welcome host')

  const names = ['An', 'Bao', 'Cu', 'Duc', 'Em', 'Gia', 'Ha', 'Lan', 'Mai', 'Nam', 'Oa', 'Phu']
  const players = []
  for (const name of names) {
    const c = open()
    await c.open()
    c.send({ type: 'player_join', playerId: `id-${name}`, name })
    await c.waitFor((m) => m.type === 'welcome' && m.role === 'player', `welcome ${name}`)
    players.push(c)
  }

  host.send({ type: 'host_start' })
  await host.waitFor((m) => m.type === 'countdown' && m.n === 3, 'dem nguoc')
  await host.waitFor((m) => m.type === 'go', 'GO')

  for (const name of names) {
    host.send({ type: 'host_force_finish', playerId: `id-${name}` })
    await sleep(60)
  }

  const finish = await host.waitFor((m) => m.type === 'finish', 'het tran')
  assert.equal(finish.order.length, 12)
  assert.equal(finish.players.length, 12)

  const byId = new Map(finish.players.map((p) => [p.id, p]))
  assert.equal(byId.get('id-An').tier, 1)
  assert.equal(byId.get('id-Cu').tier, 1)
  assert.equal(byId.get('id-Duc').tier, 2)
  assert.equal(byId.get('id-Ha').tier, 2)
  assert.equal(byId.get('id-Lan').tier, 3)
  assert.equal(byId.get('id-Phu').tier, 3)
  assert.ok(byId.get('id-An').gift, 'nguoi nhat phai co ten mon qua')
  assert.notEqual(byId.get('id-An').gift, byId.get('id-Bao').gift)

  for (const c of [host, ...players]) c.ws.close()
})