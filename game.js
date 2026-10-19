export const MAX_SLOTS = 7
export const MAX_NAME_LENGTH = 20
export const MAX_HITS = 400
export const PROGRESS_MAX = 1000
export const MAX_HITS_PER_SEC = 16
export const PROGRESS_PER_HIT = PROGRESS_MAX / MAX_HITS

export function createRoom() {
  return {
    state: 'lobby',
    hostId: null,
    players: [],
    order: [],
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
  room.state = 'countdown'
  return { ok: true }
}

export function beginRace(room) {
  if (room.state !== 'countdown') return false
  room.state = 'racing'
  return true
}

export function applyHit(room, playerId, now) {
  const player = room.players.find((p) => p.id === playerId)
  if (!player) return { accepted: false, reason: 'no_player' }
  if (room.state !== 'racing') return { accepted: false, reason: 'not_racing' }
  if (player.place !== null) return { accepted: false, reason: 'already_finished' }

  refillTokens(player, now)
  if (player.tokens < 1) return { accepted: false, reason: 'rate_limit' }
  player.tokens -= 1

  player.hits += 1
  player.progress = Math.min(PROGRESS_MAX, player.hits * PROGRESS_PER_HIT)

  if (player.hits >= MAX_HITS) {
    player.place = room.order.length + 1
    player.finishedAt = now
    room.order.push(player.id)
    return { accepted: true, finished: true, place: player.place }
  }
  return { accepted: true, finished: false }
}

export function forceFinish(room, playerId, now) {
  const player = room.players.find((p) => p.id === playerId)
  if (!player || player.place !== null) return { accepted: false, reason: 'no_player' }
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
  room.order = []
  for (const player of room.players) {
    player.hits = 0
    player.progress = 0
    player.place = null
    player.finishedAt = null
    player.tokens = MAX_HITS_PER_SEC
    player.lastRefill = null
  }
  return { ok: true }
}

export function snapshot(room) {
  return {
    state: room.state,
    hostId: room.hostId,
    order: [...room.order],
    players: [...room.players]
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        progress: p.progress,
        place: p.place,
        online: p.online,
      })),
  }
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

export function addPlayer(room, id, rawName) {
  const existing = room.players.find((p) => p.id === id)
  if (existing) {
    existing.online = true
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
    hits: 0,
    progress: 0,
    place: null,
    finishedAt: null,
    tokens: MAX_HITS_PER_SEC,
    lastRefill: null,
    online: true,
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