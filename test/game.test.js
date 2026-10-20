import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRoom,
  addPlayer,
  removePlayer,
  startCountdown,
  beginRace,
  endRace,
  applyHit,
  forceFinish,
  resetToLobby,
  claimHost,
  releaseHost,
  snapshot,
  setOnline,
  castSkill,
  MAX_SLOTS,
  MAX_HITS,
  MAX_HITS_PER_SEC,
  PROGRESS_MAX,
  RACE_MS,
  SKILLS,
} from '../game.js'
import { castFileForSlot } from '../public/js/cast.js'

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

test('nhan vat nguoi choi gui len duoc giu va tra ve trong snapshot', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An', 'ogre')
  addPlayer(room, 'p2', 'Bao')
  const snap = snapshot(room)
  const an = snap.players.find((p) => p.id === 'p1')
  const bao = snap.players.find((p) => p.id === 'p2')
  assert.equal(an.cast, 'ogre')
  assert.equal(bao.cast, castFileForSlot(bao.slot))
})

test('nhan vat khong hop le thi quay ve nhan vat mac dinh cua slot', () => {
  const room = createRoom()
  const res = addPlayer(room, 'p1', 'An', 'khong-co-that')
  assert.equal(res.player.cast, castFileForSlot(res.slot))
})

test('vao lai bang cung id thi giu nguyen nhan vat cu', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An', 'ogre')
  addPlayer(room, 'p1', 'An', 'goblin')
  assert.equal(room.players[0].cast, 'ogre')
})

test('het slot thi nguoi moi bi tu choi', () => {
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

test('trong lobby van bam duoc de khoi dong tay, nhung khong tinh vao ket qua', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')

  const hit = applyHit(room, 'p1', 0)
  assert.equal(hit.accepted, true)
  assert.equal(hit.finished, false)
  assert.equal(room.players[0].progress, 2.5)
  assert.equal(room.players[0].place, null)
  assert.equal(room.order.length, 0)
  assert.equal(room.state, 'lobby')
})

test('bam du 400 lan trong lobby cung khong duoc tinh la ve dich', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  for (let i = 0; i < MAX_HITS + 60; i++) applyHit(room, 'p1', i * 1000)

  assert.equal(room.players[0].hits, MAX_HITS)
  assert.equal(room.players[0].place, null)
  assert.equal(room.order.length, 0)
  assert.equal(room.state, 'lobby')
})

test('host bam bat dau thi xoa sach thanh tich bam trong lobby', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  for (let i = 0; i < 40; i++) applyHit(room, 'p1', i * 1000)
  assert.ok(room.players[0].progress > 0)

  assert.equal(startCountdown(room, 'host1').ok, true)
  assert.equal(room.players[0].progress, 0)
  assert.equal(room.players[0].hits, 0)
  assert.equal(room.players[0].tokens, MAX_HITS_PER_SEC)
})

test('khong danh dau ve dich duoc khi chua dua', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  assert.equal(forceFinish(room, 'p1', 0).reason, 'not_racing')

  startCountdown(room, 'host1')
  assert.equal(forceFinish(room, 'p1', 0).reason, 'not_racing')
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
    'boosted', 'cast', 'cd', 'effects', 'id', 'name', 'online', 'place', 'progress', 'slot',
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

// --- Vong 4: 12 cho + 3 ky nang ---

test('phong chua duoc 12 nguoi', () => {
  assert.equal(MAX_SLOTS, 12)
})

test('nguoi thu 12 van vao duoc phong, nguoi thu 13 bi tu choi', () => {
  const room = createRoom()
  for (let i = 0; i < 12; i++) {
    const joined = addPlayer(room, `p${i}`, `Nguoi ${i + 1}`)
    assert.equal(joined.ok, true, `nguoi ${i + 1} phai vao duoc`)
  }
  assert.equal(room.players.length, 12)
  assert.equal(room.players[11].slot, 11)
  const full = addPlayer(room, 'x', 'Nguoi 13')
  assert.equal(full.ok, false)
  assert.equal(full.reason, 'room_full')
})

test('khong dung duoc ky nang khi chua toi han', () => {
  const room = racingRoom(['An', 'Bao'])
  const first = castSkill(room, 'p1', 'chan', 'p2', 0)
  assert.equal(first.ok, true)
  const again = castSkill(room, 'p1', 'chan', 'p2', 1000)
  assert.equal(again.ok, false)
  assert.equal(again.reason, 'cooldown')
})

test('ky nang toi han thi dung duoc va khoa lai dung so giay', () => {
  const room = racingRoom(['An', 'Bao', 'Cu'])
  const cd = SKILLS.chan.cooldown
  assert.equal(castSkill(room, 'p1', 'chan', 'p2', 0).ok, true)
  assert.equal(room.players[0].readyAt.chan, cd)
  assert.equal(castSkill(room, 'p1', 'chan', 'p2', cd - 1).reason, 'cooldown')
  assert.equal(castSkill(room, 'p1', 'chan', 'p3', cd).ok, true)
  assert.equal(room.players[0].readyAt.chan, cd + cd)
})

test('khong dung duoc ky nang ngoai luc dua', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  assert.equal(castSkill(room, 'p1', 'chan', 'p2', 0).reason, 'not_racing')
})

test('khong dung duoc ky nang sau khi da ve dich', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) applyHit(room, 'p1', i * 1000)
  assert.equal(room.players[0].place, 1)
  assert.equal(castSkill(room, 'p1', 'chan', 'p2', 60000).reason, 'already_finished')
})

test('khong duoc nham vao nguoi da ve dich', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS; i++) applyHit(room, 'p1', i * 1000)
  const shot = castSkill(room, 'p2', 'chan', 'p1', 60000)
  assert.equal(shot.ok, false)
  assert.equal(shot.reason, 'target_finished')
})

test('khong duoc nham vao chinh minh', () => {
  const room = racingRoom(['An', 'Bao'])
  const shot = castSkill(room, 'p1', 'chan', 'p1', 0)
  assert.equal(shot.ok, false)
  assert.equal(shot.reason, 'self_target')
})

test('ky nang la cua nguoi chua ton tai bi tu choi', () => {
  const room = racingRoom(['An', 'Bao'])
  assert.equal(castSkill(room, 'p1', 'teleport', 'p2', 0).reason, 'bad_skill')
})

test('bi chan thi cham bi tu choi va tien do dung yen', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'chan', 'p2', 0)
  const before = room.players[1].progress
  const hit = applyHit(room, 'p2', 100)
  assert.equal(hit.accepted, false)
  assert.equal(hit.reason, 'blocked')
  assert.equal(room.players[1].progress, before)
  assert.equal(room.players[1].hits, 0)
})

test('bi chan thi khong ton token', () => {
  const room = racingRoom(['An', 'Bao'])
  for (let i = 0; i < MAX_HITS_PER_SEC; i++) applyHit(room, 'p2', 0)
  const tokens = room.players[1].tokens
  castSkill(room, 'p1', 'chan', 'p2', 0)
  for (let i = 0; i < 5; i++) applyHit(room, 'p2', 0)
  assert.equal(room.players[1].tokens, tokens)
})

test('het hieu ung chan thi cham duoc lai ngay', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'chan', 'p2', 0)
  const at = SKILLS.chan.duration
  assert.equal(applyHit(room, 'p2', at).accepted, true)
  assert.equal(room.players[1].progress, 2.5)
})

test('bi cham thi chi nhip thu hai moi cong diem', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'cham', 'p2', 0)
  const first = applyHit(room, 'p2', 100)
  assert.equal(first.accepted, true)
  assert.equal(room.players[1].progress, 0)
  const second = applyHit(room, 'p2', 200)
  assert.equal(second.accepted, true)
  assert.equal(room.players[1].progress, 2.5)
})

test('mien nhiem 6 giay sau khi hieu ung het', () => {
  const room = racingRoom(['An', 'Bao', 'Cu'])
  castSkill(room, 'p1', 'chan', 'p3', 0)
  const end = SKILLS.chan.duration
  const immune = castSkill(room, 'p2', 'chan', 'p3', end)
  assert.equal(immune.ok, false)
  assert.equal(immune.reason, 'immune')
  const later = castSkill(room, 'p2', 'chan', 'p3', end + SKILLS.chan.immunity)
  assert.equal(later.ok, true)
})

test('hieu ung cung loai khong cong don va khong keo dai', () => {
  const room = racingRoom(['An', 'Bao', 'Cu'])
  castSkill(room, 'p1', 'chan', 'p3', 0)
  const again = castSkill(room, 'p2', 'chan', 'p3', 100)
  assert.equal(again.ok, false)
  assert.equal(again.reason, 'already_affected')
  const effect = room.players[2].effects.find((e) => e.type === 'chan')
  assert.equal(effect.until, SKILLS.chan.duration)
})

test('hai hieu ung khac loai khong cong don vao nhau', () => {
  const room = racingRoom(['An', 'Bao', 'Cu'])
  castSkill(room, 'p1', 'chan', 'p3', 0)
  castSkill(room, 'p2', 'cham', 'p3', 100)
  const effects = room.players[2].effects
  assert.equal(effects.length, 2)
  assert.equal(effects.find((e) => e.type === 'chan').until, SKILLS.chan.duration)
  assert.equal(effects.find((e) => e.type === 'cham').until, 100 + SKILLS.cham.duration)
})

test('tang toc cong dung 60 diem va khong can chon dich', () => {
  const room = racingRoom(['An', 'Bao'])
  const before = room.players[0].progress
  const shot = castSkill(room, 'p1', 'tangtoc', null, 0)
  assert.equal(shot.ok, true)
  assert.equal(room.players[0].progress - before, 60)
  assert.equal(castSkill(room, 'p1', 'tangtoc', null, 100).reason, 'cooldown')
})

test('tang toc duoc dung khi chua toi han thi khoa lai dung so giay', () => {
  const room = racingRoom(['An', 'Bao'])
  const cd = SKILLS.tangtoc.cooldown
  assert.equal(castSkill(room, 'p1', 'tangtoc', null, 0).ok, true)
  assert.equal(room.players[0].readyAt.tangtoc, cd)
  assert.equal(castSkill(room, 'p1', 'tangtoc', null, cd).ok, true)
})

test('anh chup phong cho biet hieu ung con lai va thoi gian hoi lai', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'chan', 'p2', 0)
  const snap = snapshot(room, 1000)
  const victim = snap.players[1]
  assert.equal(victim.effects.length, 1)
  assert.equal(victim.effects[0].type, 'chan')
  assert.equal(victim.effects[0].ms, SKILLS.chan.duration - 1000)
  assert.equal(victim.cd.chan, 0)
  assert.equal(snap.players[0].cd.chan, SKILLS.chan.cooldown - 1000)
  assert.equal(snap.players[0].effects.length, 0)
})

test('choi lai thi xoa sach ky nang va hieu ung', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'chan', 'p2', 0)
  castSkill(room, 'p1', 'tangtoc', null, 0)
  resetToLobby(room, 'host1')
  const p1 = room.players[0]
  const p2 = room.players[1]
  assert.deepEqual(p1.effects, [])
  assert.deepEqual(p2.effects, [])
  assert.equal(p1.readyAt.chan, 0)
  assert.equal(p1.readyAt.tangtoc, 0)
  assert.equal(p2.slowFlip, false)
})

// --- Vong 5: khong con chia qua trong game ---

test('het tran chi con thu hang, khong co tier hay ten mon qua', () => {
  const room = createRoom()
  room.hostId = 'host1'
  for (let i = 0; i < 12; i++) addPlayer(room, `p${i + 1}`, `N${i + 1}`)
  startCountdown(room, 'host1')
  beginRace(room)
  for (let i = 0; i < 12; i++) forceFinish(room, `p${i + 1}`, 1000 * (i + 1))

  const snap = snapshot(room, 20000)
  assert.deepEqual(snap.order, room.players.map((p) => p.id))
  for (const p of snap.players) {
    assert.equal(p.tier, undefined)
    assert.equal(p.gift, undefined)
    assert.deepEqual(Object.keys(p).sort(), [
      'boosted', 'cast', 'cd', 'effects', 'id', 'name', 'online', 'place', 'progress', 'slot',
    ])
  }
})

// --- Vong 6: bi ai lam cho ---

test('hieu ung ghi nhung ai gay ra', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'chan', 'p2', 0)
  const effect = room.players[1].effects.find((e) => e.type === 'chan')
  assert.equal(effect.by, 'p1')
})

test('anh chup phong cho biet ai gay ra hieu ung', () => {
  const room = racingRoom(['An', 'Bao'])
  castSkill(room, 'p1', 'cham', 'p2', 0)
  const snap = snapshot(room, 1000)
  const effect = snap.players[1].effects[0]
  assert.equal(effect.by, 'p1')
  assert.deepEqual(Object.keys(effect).sort(), ['by', 'ms', 'type'])
})

// --- Vong 7: gio dua 90 giay ---

test('snapshot tra ve thoi gian con lai cua tran dua', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  startCountdown(room, 'host1')
  beginRace(room, 5000)
  assert.equal(RACE_MS, 90000)
  assert.equal(snapshot(room, 5000).endsIn, 90000)
  assert.equal(snapshot(room, 35000).endsIn, 60000)
  assert.equal(snapshot(room, 95000).endsIn, 0)
})

test('het gio thi tu ket thuc, nguoi chua ve dich xep theo tien do', () => {
  const room = createRoom()
  room.hostId = 'host1'
  addPlayer(room, 'p1', 'An')
  addPlayer(room, 'p2', 'Bao')
  addPlayer(room, 'p3', 'Chi')
  startCountdown(room, 'host1')
  beginRace(room, 1000)
  forceFinish(room, 'p2', 2000)
  for (let i = 0; i < 3; i++) applyHit(room, 'p1', 3000)
  for (let i = 0; i < 7; i++) applyHit(room, 'p3', 3000)

  const result = endRace(room, 1000 + RACE_MS)
  assert.equal(room.state, 'finished')
  assert.deepEqual(room.order, ['p2', 'p3', 'p1'])
  assert.deepEqual(result.players.map((p) => p.place), [3, 1, 2])
  assert.equal(snapshot(room, 1000 + RACE_MS).endsIn, null)
})

test('goi ket thuc khi tran chua chay thi khong lam gi', () => {
  const room = createRoom()
  addPlayer(room, 'p1', 'An')
  assert.equal(endRace(room, 1000), null)
  assert.equal(room.state, 'lobby')
})