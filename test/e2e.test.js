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

test('QR tro ve duoc ma SVG', async () => {
  const res = await fetch(`${BASE}/qr.svg`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /<svg/)
})

test('trang dien thoai phuc vu duoc', async () => {
  const res = await fetch(`${BASE}/play`)
  assert.equal(res.status, 200)
  assert.match(await res.text(), /btn-run/)
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