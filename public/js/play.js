import { connect, playerId } from '/js/net.js'
import { runnerSvg, runnerCss } from '/js/pixel.js'
import { unlockAudio } from '/js/sfx.js'

document.head.insertAdjacentHTML('beforeend', runnerCss())

const $ = (id) => document.getElementById(id)
const screens = ['scr-join', 'scr-wait', 'scr-countdown', 'scr-race', 'scr-done']

const ERRORS = {
  room_full: 'Phòng đã đủ 7 người rồi.',
  race_started: 'Trận đã bắt đầu, chờ vòng sau nhé.',
  bad_name: 'Nhập tên trước đã.',
}

let state = 'lobby'
let me = null
let players = []
let joined = false
let showedDone = false

const net = connect(onMessage, (status) => {
  $('offline').classList.toggle('on', status === 'offline')
  if (status === 'online') join()
})

function join() {
  if (!joined) return
  net.send({ type: 'player_join', playerId: playerId(), name: me?.name ?? savedName() })
}

function savedName() {
  return localStorage.getItem('ngay-phu-nu:name') ?? ''
}

function onMessage(msg) {
  switch (msg.type) {
    case 'room_state':
      state = msg.state
      players = msg.players
      syncMe()
      break
    case 'race_tick':
      players = msg.players
      if (msg.state) state = msg.state
      syncMe()
      break
    case 'countdown':
      showCountdown(msg.n)
      break
    case 'go':
      showCountdown('GO!')
      navigator.vibrate?.(40)
      setTimeout(() => switchTo('scr-race'), 650)
      break
    case 'finish':
      onFinish()
      break
    case 'error':
      $('join-error').textContent = ERRORS[msg.reason] ?? msg.reason
      break
  }
}

function syncMe() {
  const id = playerId()
  const found = players.find((p) => p.id === id)

  if (state === 'lobby' && showedDone) {
    showedDone = false
    $('btn-again').hidden = true
    $('race-pct').textContent = '0%'
    switchTo('scr-wait')
  }

if (!found) return
  me = found

  if (!showedDone) {
    $('wait-name').textContent = found.name
    $('wait-avatar').innerHTML = idle(found.name)
    $('done-avatar').innerHTML = idle(found.name)
    if (state === 'racing') switchTo('scr-race')
    else switchTo('scr-wait')
    $('join-error').textContent = ''
  }

  $('race-pct').textContent = `${Math.floor(found.progress / 10)}%`
  $('race-lead').textContent = leaderLabel(found)

  if (found.place !== null) onFinished(found)
}

function leaderLabel(found) {
  const sorted = [...players].sort((a, b) => b.progress - a.progress)
  const rank = sorted.findIndex((p) => p.id === found.id) + 1
  return `Hạng ${rank}/${players.length}`
}

function switchTo(id) {
  for (const s of screens) $(s).classList.toggle('on', s === id)
  if (id === 'scr-race') {
    runEnabled = true
    $('btn-run').disabled = false
  }
}

function showCountdown(n) {
  switchTo('scr-countdown')
  unlockAudio()
  navigator.vibrate?.(n === 'GO!' ? 40 : 15)
  const el = $('count-num')
  el.textContent = n === 'GO!' ? 'GO!' : String(n)
  el.classList.toggle('go', n === 'GO!')
  el.style.animation = 'none'
  void el.offsetWidth
  el.style.animation = ''
}

function onFinish() {
  onFinished(me)
}

function onFinished(player) {
  if (!player || player.place === null || showedDone) return
  showedDone = true
  runEnabled = false
  navigator.vibrate?.([40, 60, 40])
  $('done-rank').textContent = String(player.place)
  $('done-place').textContent = player.place === 1 ? 'VỀ ĐÍCH NHẤT!' : 'Bạn đã về đích!'
  $('btn-again').hidden = false
  switchTo('scr-done')
}

function idle(name) {
  return runnerSvg(name).replace('class="runner"', 'class="runner idle"')
}

/* ---------- spam tap ---------- */

let runEnabled = false
let pressTimer = null
let queue = 0
let lastSend = 0

function sendHit() {
  queue += 1
  const now = performance.now()
  if (now - lastSend < 25) return
  lastSend = now
  const n = queue
  queue = 0
  for (let i = 0; i < n; i++) net.send({ type: 'hit' })
}

function onPress(e) {
  e.preventDefault()
  if (!runEnabled) return
  $('btn-run').classList.add('press')
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = setTimeout(() => $('btn-run').classList.remove('press'), 60)
  sendHit()
}

const btn = $('btn-run')
btn.addEventListener('pointerdown', onPress)
btn.addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())

/* ---------- join form ---------- */

$('name').addEventListener('input', (e) => {
  const value = e.target.value
  $('join-avatar').innerHTML = idle(value || 'A')
})

$('name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('btn-join').click()
})

$('btn-join').addEventListener('click', () => {
  const name = $('name').value.trim()
  if (!name) {
    $('join-error').textContent = 'Nhập tên trước đã.'
    return
  }
  me = { name }
  localStorage.setItem('ngay-phu-nu:name', name)
  joined = true
  $('join-error').textContent = ''
  join()
})

$('btn-warm').addEventListener('click', function () {
  this.classList.add('press')
  setTimeout(() => this.classList.remove('press'), 60)
  navigator.vibrate?.(15)
})

$('btn-again').addEventListener('click', () => {
  runEnabled = false
  $('btn-again').hidden = true
  localStorage.removeItem('ngay-phu-nu:id')
  localStorage.removeItem('ngay-phu-nu:name')
  joined = false
  me = null
  players = []
  location.reload()
})

$('join-avatar').innerHTML = idle('A')

if (savedName()) $('name').value = savedName()