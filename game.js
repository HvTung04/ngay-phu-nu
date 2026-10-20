export const MAX_SLOTS = 12
export const MAX_NAME_LENGTH = 20
export const MAX_HITS = 400
export const PROGRESS_MAX = 1000
export const MAX_HITS_PER_SEC = 16
export const PROGRESS_PER_HIT = PROGRESS_MAX / MAX_HITS
export const RACE_MS = 90000

import { castFileForSlot, isCast } from './public/js/cast.js'

// Moi con so can bang cua ky nang deu nam o day.
// Chinh mot cho, sua mot dong la xong ca game.
export const SKILLS = {
  chan: {
    id: 'chan',
    name: 'CHẶN',
    kind: 'target',
    cooldown: 22000,
    duration: 2500,
    immunity: 6000,
  },
  cham: {
    id: 'cham',
    name: 'CHẬM',
    kind: 'target',
    cooldown: 28000,
    duration: 5000,
    immunity: 6000,
  },
  tangtoc: {
    id: 'tangtoc',
    name: 'TĂNG TỐC',
    kind: 'self',
    cooldown: 25000,
    bonus: 60,
  },
}

export const SKILL_IDS = Object.keys(SKILLS)

const BOOST_BADGE_MS = 1500

export function createRoom() {
  return {
    state: 'lobby',
    hostId: null,
    players: [],
    order: [],
    startedAt: null,
  }
}

export function claimHost(room, id) {
  if (room.hostId !== null && room.hostId !== id) {
    return { ok: false, reason: 'host_exists' }
  }
  room.hostId = id
  return { ok: true }
}

export function releaseHost(room, id) {
  if (room.hostId !== id) return false
  room.hostId = null
  return true
}

export function startCountdown(room, hostId) {
  if (room.hostId !== hostId) return { ok: false, reason: 'not_host' }
  if (room.state !== 'lobby') return { ok: false, reason: 'already_started' }
  // Tap trong luc cho chi la khoi dong tay: xoa sach truoc khi dem nguoc.
  resetPlayers(room)
  room.state = 'countdown'
  return { ok: true }
}

function resetPlayers(room) {
  room.order = []
  room.startedAt = null
  for (const player of room.players) {
    player.hits = 0
    player.progress = 0
    player.place = null
    player.finishedAt = null
    player.tokens = MAX_HITS_PER_SEC
    player.lastRefill = null
    player.effects = []
    player.slowFlip = false
    player.boostedUntil = 0
    for (const id of SKILL_IDS) player.readyAt[id] = 0
  }
}

export function beginRace(room, now = Date.now()) {
  if (room.state !== 'countdown') return false
  room.state = 'racing'
  room.startedAt = now
  return true
}

// Het gio: nguoi chua ve dich duoc xep theo tien do, hoa thi theo slot.
export function endRace(room, now = Date.now()) {
  if (room.state !== 'racing') return null
  const remaining = room.players
    .filter((p) => p.place === null)
    .sort((a, b) => b.progress - a.progress || b.hits - a.hits || a.slot - b.slot)
  for (const player of remaining) {
    player.place = room.order.length + 1
    room.order.push(player.id)
  }
  room.state = 'finished'
  return { order: [...room.order], players: snapshot(room, now).players }
}

export function raceEndsAt(room) {
  return room.state === 'racing' && room.startedAt !== null ? room.startedAt + RACE_MS : null
}

export function applyHit(room, playerId, now) {
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { accepted: false, reason: 'no_player' }
  // Lobby = san tap thu, chay duoc nhung khong tinh vao ket qua.
  const warmup = room.state === 'lobby'
  if (!warmup && room.state !== 'racing') return { accepted: false, reason: 'not_racing' }
  if (player.place !== null) return { accepted: false, reason: 'already_finished' }

  pruneEffects(player, now)

  // Dang bi chan: tu choi truoc khi tru token, spam cung vo nghia.
  if (hasEffect(player, 'chan', now)) return { accepted: false, reason: 'blocked' }

  refillTokens(player, now)
  if (player.tokens < 1) return { accepted: false, reason: 'rate_limit' }
  player.tokens -= 1

  // Dang bi cham: an token nhung nhip le khong cong tien do.
  if (hasEffect(player, 'cham', now)) {
    player.slowFlip = !player.slowFlip
    if (player.slowFlip) return { accepted: true, scored: false }
  }

  player.hits = Math.min(MAX_HITS, player.hits + 1)
  player.progress = Math.min(PROGRESS_MAX, player.hits * PROGRESS_PER_HIT)

  if (!warmup && player.hits >= MAX_HITS) {
    player.place = room.order.length + 1
    player.finishedAt = now
    room.order.push(player.id)
    return { accepted: true, finished: true, place: player.place }
  }
  return { accepted: true, finished: false }
}

export function castSkill(room, playerId, skillId, targetId, now) {
  const caster = room.players.find((p) => p.id === playerId)
  if (!caster) return { ok: false, reason: 'no_player' }
  if (room.state !== 'racing') return { ok: false, reason: 'not_racing' }
  if (caster.place !== null) return { ok: false, reason: 'already_finished' }

  const skill = SKILLS[skillId]
  if (!skill) return { ok: false, reason: 'bad_skill' }
  if (now < (caster.readyAt[skillId] ?? 0)) return { ok: false, reason: 'cooldown' }

  if (skill.kind === 'self') return castSelf(room, caster, skill, now)

  if (!targetId) return { ok: false, reason: 'no_target' }
  if (targetId === playerId) return { ok: false, reason: 'self_target' }
  const target = room.players.find((p) => p.id === targetId)
  if (!target) return { ok: false, reason: 'no_target' }
  if (target.place !== null) return { ok: false, reason: 'target_finished' }

  pruneEffects(target, now)
  const existing = target.effects.find((e) => e.type === skill.id)
  if (existing) {
    return { ok: false, reason: existing.until > now ? 'already_affected' : 'immune' }
  }

  const until = now + skill.duration
  target.effects.push({
    type: skill.id,
    until,
    immuneUntil: until + skill.immunity,
    by: caster.id,
  })
  if (skill.id === 'cham') target.slowFlip = false
  caster.readyAt[skill.id] = now + skill.cooldown

  return { ok: true, skillId: skill.id, effect: skill.id, targetId, until, duration: skill.duration }
}

function castSelf(room, caster, skill, now) {
  const bonusHits = Math.round(skill.bonus / PROGRESS_PER_HIT)
  caster.hits = Math.min(MAX_HITS, caster.hits + bonusHits)
  caster.progress = Math.min(PROGRESS_MAX, caster.hits * PROGRESS_PER_HIT)
  caster.readyAt[skill.id] = now + skill.cooldown
  caster.boostedUntil = now + BOOST_BADGE_MS

  if (caster.hits >= MAX_HITS) {
    caster.place = room.order.length + 1
    caster.finishedAt = now
    room.order.push(caster.id)
    return { ok: true, skillId: skill.id, effect: 'boost', targetId: caster.id, finished: true, place: caster.place }
  }
  return { ok: true, skillId: skill.id, effect: 'boost', targetId: caster.id, finished: false }
}

export function forceFinish(room, playerId, now) {
  if (room.state !== 'racing') return { accepted: false, reason: 'not_racing' }
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { accepted: false, reason: 'no_player' }
  if (player.place !== null) return { accepted: false, reason: 'already_finished' }
  player.hits = MAX_HITS
  player.progress = PROGRESS_MAX
  player.place = room.order.length + 1
  player.finishedAt = now
  room.order.push(player.id)
  return { accepted: true, place: player.place }
}

export function resetToLobby(room, hostId) {
  if (room.hostId !== hostId) return { ok: false, reason: 'not_host' }
  room.state = 'lobby'
  resetPlayers(room)
  return { ok: true }
}

export function snapshot(room, now = Date.now()) {
  const endsAt = raceEndsAt(room)
  return {
    state: room.state,
    hostId: room.hostId,
    order: [...room.order],
    endsIn: endsAt === null ? null : Math.max(0, endsAt - now),
    players: [...room.players]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        cast: p.cast,
        progress: p.progress,
        place: p.place,
        online: p.online,
        effects: activeEffects(p, now),
        cd: cooldowns(p, now),
        boosted: p.boostedUntil > now,
      })),
  }
}

function activeEffects(player, now) {
  return player.effects
    .filter((e) => e.until > now)
    .map((e) => ({ type: e.type, ms: e.until - now, by: e.by ?? null }))
}

function cooldowns(player, now) {
  const cd = {}
  for (const id of SKILL_IDS) cd[id] = Math.max(0, (player.readyAt[id] ?? 0) - now)
  return cd
}

function hasEffect(player, type, now) {
  return player.effects.some((e) => e.type === type && e.until > now)
}

function pruneEffects(player, now) {
  player.effects = player.effects.filter((e) => e.until > now || e.immuneUntil > now)
}

function refillTokens(player, now) {
  if (player.lastRefill === null) {
    player.lastRefill = now
    return
  }
  const elapsed = now - player.lastRefill
  if (elapsed <= 0) return
  player.tokens = Math.min(MAX_HITS_PER_SEC, player.tokens + (elapsed / 1000) * MAX_HITS_PER_SEC)
  player.lastRefill = now
}

export function addPlayer(room, id, rawName, cast = null) {
  const existing = room.players.find((p) => p.id === id)
  if (existing) {
    existing.online = true
    if (isCast(cast) && !existing.cast) existing.cast = cast
    return { ok: true, slot: existing.slot, player: existing }
  }

  if (room.state !== 'lobby') return { ok: false, reason: 'race_started' }

  const name = cleanName(rawName)
  if (!name) return { ok: false, reason: 'bad_name' }

  if (room.players.length >= MAX_SLOTS) return { ok: false, reason: 'room_full' }

  const slot = firstFreeSlot(room)
  const player = {
    id,
    name,
    slot,
    cast: isCast(cast) ? cast : castFileForSlot(slot),
    hits: 0,
    progress: 0,
    place: null,
    finishedAt: null,
    tokens: MAX_HITS_PER_SEC,
    lastRefill: null,
    online: true,
    effects: [],
    slowFlip: false,
    boostedUntil: 0,
    readyAt: Object.fromEntries(SKILL_IDS.map((id) => [id, 0])),
  }
  room.players.push(player)
  return { ok: true, slot, player }
}

export function removePlayer(room, id) {
  const index = room.players.findIndex((p) => p.id === id)
  if (index === -1) return false
  room.players.splice(index, 1)
  return true
}

export function setOnline(room, id, online) {
  const player = room.players.find((p) => p.id === id)
  if (!player) return false
  player.online = online
  return true
}

function cleanName(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NAME_LENGTH)
}

function firstFreeSlot(room) {
  const taken = new Set(room.players.map((p) => p.slot))
  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    if (!taken.has(slot)) return slot
  }
  return -1
}
