import { connect } from '/js/net.js'
import { castHtml, castCss } from '/js/cast.js'
import { sfx, unlockAudio } from '/js/sfx.js'

document.head.insertAdjacentHTML('beforeend', castCss())

const $ = (id) => document.getElementById(id)
const screens = ['scr-arena', 'scr-board']

let state = 'lobby'
let players = []
let order = []
let maxSlots = 12
let endsIn = null
let confettiTimer = null
let flashUntil = {}

const net = connect(onMessage, (status) => {
  $('offline').classList.toggle('on', status === 'offline')
  if (status === 'online') sendRole()
})
net.send({ type: 'host_claim' })

function sendRole() {
  net.send({ type: 'host_claim' })
}

function onMessage(msg) {
  switch (msg.type) {
    case 'room_state':
    case 'race_tick':
      if (msg.maxSlots) maxSlots = msg.maxSlots
      players = msg.players
      if (msg.order) order = msg.order
      if (msg.state) state = msg.state
      endsIn = msg.endsIn ?? null
      render()
      break
    case 'countdown':
      showCountdown(msg.n)
      break
    case 'go':
      showCountdown('GO!')
      unlockAudio()
      sfx.go()
      setTimeout(() => $('count-overlay').classList.remove('on'), 800)
      break
    case 'skill_cast':
      if (msg.targetId && msg.effect !== 'boost') flashUntil[msg.targetId] = Date.now() + 1600
      sfx.skill(msg.effect)
      flashScreen(msg.effect)
      render()
      break
    case 'finish':
      order = msg.order
      if (msg.players) players = msg.players
      endsIn = null
      renderClock()
      $('count-overlay').classList.remove('on')
      renderBoard(msg.order)
      switchTo('scr-board')
      sfx.fanfare()
      startConfetti()
      break
    case 'error':
      flash(msg.reason)
      break
  }
}

function switchTo(id) {
  for (const s of screens) $(s).classList.toggle('on', s === id)
  if (id === 'scr-board') stopConfetti()
}

function render() {
  renderClock()
  if (state === 'finished') {
    // Khong ve lai bang xep hang khi da hien: moi lan ve lai se lam dong
    // animation cua tung hang chay lai, dong duoi khong bao gio hien.
    if (!$('scr-board').classList.contains('on')) renderBoard(order)
    switchTo('scr-board')
    return
  }
  switchTo('scr-arena')
  renderArena()
}

function renderClock() {
  const el = $('race-clock')
  if (state !== 'racing' || endsIn === null) {
    el.hidden = true
    return
  }
  el.hidden = false
  const total = Math.max(0, Math.ceil(endsIn / 1000))
  el.textContent = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  el.classList.toggle('low', total <= 10)
}

const RUNNER_W = 64
let lanePlan = []

function renderArena() {
  const lobby = state === 'lobby'
  const racing = state === 'racing'

  $('origin').textContent = location.origin
  $('phase-label').textContent = racing ? 'ĐANG ĐUA' : state === 'countdown' ? 'CHUẨN BỊ' : 'CHỜ NGƯỜI CHƠI'
  $('join-info').hidden = !lobby
  $('race-progress').hidden = lobby
  // Host duoc bam BAT DAU voi bat ky so nguoi, ke ca 0.
  $('btn-start').hidden = !lobby
  $('btn-start').disabled = false

  const done = players.filter((p) => p.place !== null).length
  $('race-progress').textContent = `${done} / ${players.length} đã về đích`

  ensureLanes()
  updateLanes()
}

// San co dinh 12 lan theo slot: nguoi vao sau chi lap day o trong,
// khong xep lai ca bang -> man chieu lon khong bi giat.
function ensureLanes() {
  const lanes = $('lanes')
  if (lanes.children.length === maxSlots) return
  const cols = maxSlots > 6 ? 2 : 1
  const rows = Math.ceil(maxSlots / cols)
  lanes.style.setProperty('--cols', String(cols))
  lanes.style.setProperty('--lane-rows', String(rows))
  lanes.innerHTML = Array.from({ length: maxSlots }, (_, i) => `
    <div class="lane empty" data-slot="${i}">
      <span class="lane-top"><span class="name"></span><span class="badge"></span></span>
      <span class="slot-no">${i + 1}</span>
      <span class="finish"></span>
      <span class="pct"></span>
      <div class="runner-wrap"></div>
    </div>`).join('')
  lanePlan = new Array(maxSlots).fill(null)
}

function updateLanes() {
  const lanes = $('lanes')
  const bySlot = new Map(players.map((p) => [p.slot, p]))
  const now = Date.now()

  for (let slot = 0; slot < maxSlots; slot++) {
    const lane = lanes.children[slot]
    if (!lane) continue
    const p = bySlot.get(slot)

    if (!p) {
      if (lanePlan[slot] === null) continue
      lanePlan[slot] = null
      lane.className = 'lane empty'
      lane.querySelector('.name').textContent = ''
      lane.querySelector('.badge').textContent = ''
      lane.querySelector('.badge').className = 'badge'
      lane.querySelector('.pct').textContent = ''
      lane.querySelector('.runner-wrap').innerHTML = ''
      lane.querySelector('.runner-wrap').style.left = '0'
      continue
    }

    if (lanePlan[slot] !== p.id) {
      lanePlan[slot] = p.id
      lane.className = 'lane enter'
      lane.querySelector('.name').textContent = p.name
      lane.querySelector('.badge').textContent = ''
      lane.querySelector('.badge').className = 'badge'
      lane.querySelector('.runner-wrap').innerHTML = castHtml({ cast: p.cast, slot: p.slot, fitH: 84, fitW: 64 })
      lane.querySelector('.runner-wrap').style.left = '0'
      setTimeout(() => lane.classList.remove('enter'), 450)
    }

    const pct = p.progress / 1000
    lane.querySelector('.runner-wrap').style.left = `calc(${pct * 100}% - ${pct * RUNNER_W}px)`
    lane.querySelector('.pct').textContent =
      p.place !== null ? `Hạng ${p.place}` : `${Math.floor(p.progress / 10)}%`
    lane.classList.toggle('done', p.place !== null)
    lane.classList.toggle('offline', !p.online)
    lane.classList.toggle('targeted', (flashUntil[p.id] ?? 0) > now)
    const effects = p.effects ?? []
    lane.classList.toggle('blocked', effects.some((e) => e.type === 'chan'))
    lane.classList.toggle('slowed', effects.some((e) => e.type === 'cham'))
    lane.classList.toggle('boosted', Boolean(p.boosted))
    renderBadge(lane.querySelector('.badge'), p)
  }
}

function flashScreen(kind) {
  const el = $('fx-flash')
  el.className = 'fx-flash'
  void el.offsetWidth
  el.className = `fx-flash on ${kind}`
}

function renderBadge(badge, p) {
  const effects = p.effects ?? []
  const blocked = effects.find((e) => e.type === 'chan')
  const slowed = effects.find((e) => e.type === 'cham')
  const by = (eff) => {
    const who = players.find((x) => x.id === eff.by)
    return who ? ` · ${who.name}` : ''
  }
  if (blocked) {
    badge.textContent = `⛔ BỊ CHẶN ${(blocked.ms / 1000).toFixed(1)}s${by(blocked)}`
    badge.className = 'badge on chan'
    return
  }
  if (slowed) {
    badge.textContent = `🐌 BỊ CHẬM ${(slowed.ms / 1000).toFixed(1)}s${by(slowed)}`
    badge.className = 'badge on cham'
    return
  }
  if (p.boosted) {
    badge.textContent = '⚡ TĂNG TỐC!'
    badge.className = 'badge on boost'
    return
  }
  badge.textContent = ''
  badge.className = 'badge'
}

function showCountdown(n) {
  unlockAudio()
  sfx.tick(n)
  $('count-overlay').classList.add('on')
  const el = $('count-num')
  el.textContent = n === 'GO!' ? 'GO!' : String(n)
  el.classList.toggle('go', n === 'GO!')
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = ''
}

function renderBoard(order) {
  const byId = new Map(players.map((p) => [p.id, p]))
  const ranked = [...order.map((id) => byId.get(id)), ...players.filter((p) => !order.includes(p.id))]
  $('rows').innerHTML = ranked
    .map((p, i) => {
      const place = p.place ?? i + 1
      return `<div class="row${place === 1 ? ' first' : ''}" style="animation-delay:${i * 90}ms">
        <span class="rank">${place}</span>
        <div class="avatar">${castHtml({ cast: p.cast, slot: p.slot, fitH: 56, fitW: 48, anim: 'idle' })}</div>
        <span class="nm">${escapeHtml(p.name)}</span>
        <span class="taps">${Math.floor(p.progress / 10)}%</span>
      </div>`
    })
    .join('')
}

function startConfetti() {
  const colors = ['#ff4fa3', '#8b5cf6', '#7ef29a', '#ffd447', '#06b6d4', '#ffffff']
  const box = $('confetti')
  box.innerHTML = Array.from({ length: 90 }, () => {
    const c = colors[Math.floor(Math.random() * colors.length)]
    const left = Math.random() * 100
    const dur = 2 + Math.random() * 2
    const delay = Math.random() * 1.6
    return `<i style="left:${left}%;background:${c};animation-duration:${dur}s;animation-delay:${delay}s"></i>`
  }).join('')
  stopConfetti()
  confettiTimer = setTimeout(() => (box.innerHTML = ''), 7000)
}

function stopConfetti() {
  if (confettiTimer) clearTimeout(confettiTimer)
}

function flash(reason) {
  const map = {
    room_full: 'Phòng đã đủ 12 người.',
    host_exists: 'Đã có máy chiếu khác đang điều khiển.',
    not_host: 'Chỉ máy chiếu mới làm được.',
    already_started: 'Trận đã bắt đầu.',
  }
  const text = map[reason] ?? reason
  const bar = document.createElement('div')
  bar.className = 'offline-bar on'
  bar.textContent = text
  document.body.appendChild(bar)
  setTimeout(() => bar.remove(), 2600)
}

function escapeHtml(value) {
  return String(value).replace(/[<>&"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch],
  )
}

$('btn-start').addEventListener('click', () => net.send({ type: 'host_start' }))
$('btn-replay').addEventListener('click', () => {
  stopConfetti()
  $('confetti').innerHTML = ''
  flashUntil = {}
  net.send({ type: 'host_replay' })
})

for (const evt of ['pointerdown', 'keydown']) {
  window.addEventListener(evt, () => unlockAudio(), { once: true })
}

requestWakeLock()
setInterval(requestWakeLock, 20000)

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      await navigator.wakeLock.request('screen')
    }
  } catch {}
}