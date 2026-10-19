import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRoom,
  addPlayer,
  removePlayer,
  startCountdown,
  beginRace,
  applyHit,
  forceFinish,
  resetToLobby,
  claimHost,
  releaseHost,
  snapshot,
  setOnline,
  MAX_SLOTS,
  MAX_HITS,
  MAX_HITS_PER_SEC,
  PROGRESS_MAX,
} from '../game.js'

test('phong moi bat dau o trang thai lobby va chua co ai', () => {
  const room = createRoom()
  assert.equal(room.state, 'lobby')
  assert.equal(room.hostId, null)
  assert.equal(room.players.length, 0)
})

test('nguoi choi nhan slot trong theo thu tu tu 0', () => {
  const room = createRoom()
  const a = addPlayer(room, 'p1', 'An')
  const b = addPlayer(room, 'p2', 'Bao')
  assert.equal(a.slot, 0)
  assert.equal(b.slot, 1)
})

test('slot trong giua duoc cho nguoi moi vao sau khi co nguoi roi di', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p3', 'Cu')
  removePlayer(room, 'p1')
  const b = addPlayer(room, 'p2', 'Bao')
  assert.equal(b.slot, 0)
})

test('tu choi lai thi giu nguyen slot cu va khong tao nguoi moi', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  const again = addPlayer(room, 'p2', 'Bao')
  assert.equal(again.slot, 1)
  assert.equal(room.players.length, 2)
  assert.deepEqual(again, { ok: true, slot: 1, player: room.players[1] })
})

test('het 7 slot thi nguoi moi bi tu choi', () => {
  const room = createRoom()
  for (let i = 0; i < MAX_SLOTS; i++) addPlayer(room, `p${i}`, `Nguoi ${i}`)
  const full = addPlayer(room, 'x', 'Nguoi 8')
  assert.equal(full.ok, false)
  assert.equal(full.reason, 'room_full')
})

test('ten rong bi tu choi, ten qua dai thi cat ngan lai', () => {
  const room = createRoom()
  assert.equal(addPlayer(room, 'p1', '   ').reason, 'bad_name')
  const long = addPlayer(room, 'p2', 'y'.repeat(40))
  assert.equal(long.ok, true)
  assert.equal(long.player.name.length, 20)
})

test('ten duoc cat khoang trang thua va gioi han 20 ky tu', () => {
  const room = createRoom()
  const p = addPlayer(room, 'p1', '  Nguyen   Van  A  ')
  assert.equal(p.player.name, 'Nguyen Van A')
  assert.equal(addPlayer(room, 'p2', 'y'.repeat(40)).player.name.length, 20)
})

test('nguoi moi khong duoc vao phong khi phong da bat dau', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  room.state = 'racing'
  assert.equal(addPlayer(room, 'p3', 'Cu').reason, 'race_started')
})

test('nguoi roi khoi phong khi phong dang chua thi chua mat cho', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  assert.equal(room.players.length, 1)
  assert.equal(setOnline(room, 'p1', false), true)
  assert.equal(room.players.length, 1)
  assert.equal(room.players[0].online, false)
})

test('nguoi choi bi mat ket noi giua duong van giu duoc thanh tich', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < 50; i++) applyHit(room, 'p1', i * 1000)
  const earned = room.players[0].progress
  setOnline(room, 'p1', false)
  assert.equal(room.players.length, 2)
  assert.equal(room.players[0].progress, earned)
  assert.equal(room.players[0].online, false)
})

test('nguoi da vao phong truoc do van vao lai duoc giua cuoc dua', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < 50; i++) applyHit(room, 'p1', i * 1000)
  setOnline(room, 'p1', false)
  const back = addPlayer(room, 'p1', 'An')
  assert.equal(back.ok, true)
  assert.equal(back.player.online, true)
  assert.equal(back.player.progress, 125)
  assert.equal(room.players.length, 2)
})

// --- Vong 2: bat dau, cham, cham spam, ve dich ---

function racingRoom(names = ['An', 'Bao']) {
  const room = createRoom()
  room.hostId = 'host1'
  names.forEach((name, i) => addPlayer(room, `p${i + 1}`, name))
  startCountdown(room, 'host1')
  beginRace(room)
  return room
}

test('chi host moi bat duoc cuoc dua', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  assert.equal(startCountdown(room, 'p1').reason, 'not_host')
})

test('chi 1 nguoi cung duoc bat dau', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  assert.deepEqual(startCountdown(room, 'host1'), { ok: true })
  assert.equal(room.state, 'countdown')
})

test('khong co ai cung bat duoc bat dau', () => {
  const room = createRoom()
  room.hostId = 'host1'
  assert.deepEqual(startCountdown(room, 'host1'), { ok: true })
  assert.equal(room.state, 'countdown')
})

test('bat dau duoc chuyen sang dem nguoc roi sang duang chay', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  assert.deepEqual(startCountdown(room, 'host1'), { ok: true })
  assert.equal(room.state, 'countdown')
  beginRace(room)
  assert.equal(room.state, 'racing')
})

test('khong bat duoc khi phong dang chay', () => {
  const room = racingRoom()
  assert.equal(startCountdown(room, 'host1').reason, 'already_started')
})

test('tap trong luc dem nguoc bi tu choi', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  startCountdown(room, 'host1')
  assert.equal(applyHit(room, 'p1', 0).reason, 'not_racing')
})

test('mot cham duoc cong dung 2.5 diem', () => {
  const room = racingRoom()
  const hit = applyHit(room, 'p1', 0)
  assert.equal(hit.accepted, true)
  assert.equal(room.players[0].progress, 2.5)
})

test('ve dich dung sau 400 cham', () => {
  const room = racingRoom()
  for (let i = 0; i < MAX_HITS; i++) {
    applyHit(room, 'p1', i * 1000)
  }
  assert.equal(room.players[0].progress, 1000)
})

test('nguoi chay het dau duoc gan thu tu va khong tang them', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) applyHit(room, 'p1', i * 1000)
  assert.equal(room.players[0].place, 1)
  assert.deepEqual(room.order, ['p1'])

  const late = applyHit(room, 'p1', 999999)
  assert.equal(late.accepted, false)
  assert.equal(late.reason, 'already_finished')
})

test('thu tu ve dich ghi theo dung thoi diem cham cuoi cung', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) {
    applyHit(room, 'p1', 5000 + i * 1000)
    applyHit(room, 'p2', 9000 + i * 1000)
  }
  assert.deepEqual(room.order, ['p1', 'p2'])
  assert.equal(room.players[1].place, 2)
})

test('khong vuot qua 16 cham moi giay', () => {
  const room = racingRoom()
  for (let i = 0; i < MAX_HITS_PER_SEC; i++) {
    assert.equal(applyHit(room, 'p1', 0).accepted, true, `tap ${i + 1} phai duoc nhan`)
  }
  assert.equal(applyHit(room, 'p1', 0).reason, 'rate_limit')
})

test('het token thi phai cho mot nhipp moi cham lai duoc', () => {
  const room = racingRoom()
  for (let i = 0; i < MAX_HITS_PER_SEC; i++) applyHit(room, 'p1', 0)
  assert.equal(applyHit(room, 'p1', 0).reason, 'rate_limit')
  assert.equal(applyHit(room, 'p1', 50).reason, 'rate_limit')
  assert.equal(applyHit(room, 'p1', 1000).accepted, true)
})

test('nguoi khong co trong phong thi cham vo hieu', () => {
  const room = racingRoom()
  assert.equal(applyHit(room, 'ghost', 0).reason, 'no_player')
})

// --- Vong 3: host, ve dich cuong ep, choi lai ---

test('chi mot may chieu duoc lam host', () => {
  const room = createRoom()
  assert.deepEqual(claimHost(room, 'host1'), { ok: true })
  assert.equal(claimHost(room, 'host2').reason, 'host_exists')
  assert.deepEqual(claimHost(room, 'host1'), { ok: true })
})

test('host doi may chieu thi vi tri host duoc giu lai', () => {
  const room = createRoom()
  claimHost(room, 'host1')
  assert.equal(releaseHost(room, 'host1'), true)
  assert.deepEqual(claimHost(room, 'host2'), { ok: true })
  assert.equal(room.hostId, 'host2')
})

test('khong phai host thi releaseHost khong lam gi', () => {
  const room = createRoom()
  claimHost(room, 'host1')
  assert.equal(releaseHost(room, 'khac'), false)
  assert.equal(room.hostId, 'host1')
})

test('danh dau ve dich tay cho nguoi ket giua duong', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) applyHit(room, 'p1', i * 1000)
  const forced = forceFinish(room, 'p2', 60000)
  assert.equal(forced.accepted, true)
  assert.equal(forced.place, 2)
  assert.equal(room.players[1].progress, PROGRESS_MAX)
  assert.deepEqual(room.order, ['p1', 'p2'])
})

test('khong the danh dau ve dich cho nguoi da ve dich', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) applyHit(room, 'p1', i * 1000)
  assert.equal(forceFinish(room, 'p1', 99999).accepted, false)
  assert.deepEqual(room.order, ['p1'])
})

test('choi lai ve lobby, xoa sach ket qua nhung giu nguyen nguoi choi', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) applyHit(room, 'p1', i * 1000)
  assert.deepEqual(resetToLobby(room, 'host1'), { ok: true })
  assert.equal(room.state, 'lobby')
  assert.deepEqual(room.order, [])
  assert.equal(room.players.length, 2)
  assert.equal(room.players[0].hits, 0)
  assert.equal(room.players[0].progress, 0)
  assert.equal(room.players[0].place, null)
})

test('choi lai thi nhanh da het phai duoc cap lai', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS_PER_SEC; i++) applyHit(room, 'p1', 0)
  resetToLobby(room, 'host1')
  startCountdown(room, 'host1')
  beginRace(room)
  assert.equal(applyHit(room, 'p1', 0).accepted, true)
})

test('nguoi khong phai host thi khong cho choi lai', () => {
  const room = racingRoom()
  assert.equal(resetToLobby(room, 'p1').reason, 'not_host')
})

test('anh chup phong luon sap xep theo slot va khong lo thong tin rat nhop', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  const snap = snapshot(room)
  assert.deepEqual(Object.keys(snap.players[0]).sort(), [
    'id', 'name', 'online', 'place', 'progress', 'slot',
  ])
  assert.equal(snap.state, 'lobby')
})

test('anh chup phong danh dau ai dang mat ket noi', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  setOnline(room, 'p1', false)
  const snap = snapshot(room)
  assert.equal(snap.players[0].online, false)
  assert.equal(snap.players[1].online, true)
})