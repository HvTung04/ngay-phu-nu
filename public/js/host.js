import { connect } from '/js/net.js'
import { runnerSvg, runnerCss } from '/js/pixel.js'
import { sfx, unlockAudio } from '/js/sfx.js'

document.head.insertAdjacentHTML('beforeend', runnerCss())

const $ = (id) => document.getElementById(id)
const screens = ['scr-lobby', 'scr-countdown', 'scr-race', 'scr-board']

let state = 'lobby'
let players = []
let order = []
let maxSlots = 7
let lastForceOpen = false
let confettiTimer = null

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
      render()
      break
    case 'countdown':
      showCountdown(msg.n)
      break
    case 'go':
      showCountdown('GO!')
      unlockAudio()
      sfx.go()
      setTimeout(() => {
        if (state === 'racing') switchTo('scr-race')
      }, 700)
      break
    case 'player_finished':
      if (lastForceOpen) {
        $('btn-force').textContent = `Đánh dấu về đích (hạng ${msg.place})`
        sfx.finish()
      }
      break
    case 'finish':
      order = msg.order
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
  if (state === 'racing') {
    switchTo('scr-race')
    renderRace()
    return
  }
  if (state === 'finished' && order.length) {
    renderBoard(order)
    switchTo('scr-board')
    return
  }
  if (state === 'countdown') return
  renderLobby()
}

function renderLobby() {
  $('joined').textContent = String(players.length)
  $('origin').textContent = location.origin
  $('btn-start').disabled = false
  $('slots').innerHTML = Array.from({ length: maxSlots }, (_, i) => {
    const p = players.find((x) => x.slot === i)
    if (!p) {
      return `<div class="slot"><span class="idx">${i + 1}</span><span class="empty-mark">+</span></div>`
    }
    return `<div class="slot filled${p.online ? '' : ' off'}">
      <span class="idx">${i + 1}</span>
      <div class="avatar">${runnerSvg(p.name).replace('class="runner"', 'class="runner idle"')}</div>
      <div class="who">${escapeHtml(p.name)}</div>
    </div>`
  }).join('')
}

const RUNNER_W = 46

function renderRace() {
  const lanes = $('lanes')
  const done = players.filter((p) => p.place !== null).length
  $('race-progress').textContent = `${done} / ${players.length} đã về đích`

  if (!lanes.children.length) {
    lanes.innerHTML = players
      .map(
        (p, i) => `<div class="lane${i % 2 ? ' odd' : ''}" data-id="${p.id}">
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="finish"></span>
        <span class="pct">0%</span>
        <div class="runner-wrap" style="--p:0">${runnerSvg(p.name)}</div>
      </div>`,
      )
      .join('')
    lastForceOpen = false
    $('btn-force').textContent = 'Đánh dấu về đích'
    return
  }

  for (const p of players) {
    const lane = lanes.querySelector(`[data-id="${CSS.escape(p.id)}"]`)
    if (!lane) continue
    const pct = p.progress / 1000
    lane.querySelector('.runner-wrap').style.left = `calc(${pct * 100}% - ${pct * RUNNER_W}px)`
    lane.querySelector('.pct').textContent = `${Math.floor(p.progress / 10)}%`
    lane.classList.toggle('done', p.place !== null)
    if (p.place !== null) {
      lane.querySelector('.pct').textContent = `Hạng ${p.place}`
    }
  }
}

function showCountdown(n) {
  switchTo('scr-countdown')
  unlockAudio()
  sfx.tick(n)
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
        <div class="avatar">${runnerSvg(p.name).replace('class="runner"', 'class="runner done"')}</div>
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
    room_full: 'Phòng đã đủ 7 người.',
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
  $('lanes').innerHTML = ''
  net.send({ type: 'host_replay' })
})

$('btn-force').addEventListener('click', () => {
  lastForceOpen = true
  const pending = players.filter((p) => p.place === null && p.online)
  for (const p of pending) net.send({ type: 'host_force_finish', playerId: p.id })
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