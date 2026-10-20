import { connect, playerId } from '/js/net.js'
import { runnerSvg, runnerCss } from '/js/pixel.js'
import { sfx, unlockAudio } from '/js/sfx.js'

document.head.insertAdjacentHTML('beforeend', runnerCss())

const $ = (id) => document.getElementById(id)
const screens = ['scr-join', 'scr-wait', 'scr-countdown', 'scr-race', 'scr-done']

const ERRORS = {
  room_full: 'Phòng đã đủ 12 người rồi.',
  race_started: 'Trận đã bắt đầu, chờ vòng sau nhé.',
  bad_name: 'Nhập tên trước đã.',
  cooldown: 'Kỹ năng chưa hồi lại.',
  already_affected: 'Người đó đang bị hiệu ứng này rồi.',
  immune: 'Người đó vừa thoát, còn miễn nhiễm.',
  target_finished: 'Người đó đã về đích rồi.',
  self_target: 'Không dùng lên chính mình.',
  bad_skill: 'Kỹ năng không tồn tại.',
  not_racing: 'Chưa tới lúc đua.',
}

const SKILL_LABEL = { chan: '⛔ CHẶN', cham: '🐌 CHẬM', tangtoc: '⚡' }

let state = 'lobby'
let me = null
let players = []
let joined = false
let showedDone = false
let skills = {}
let pendingSkill = null
let bannerKind = null
let toastTimer = null
let avatarName = null

const skillButtons = [...document.querySelectorAll('.skill-btn')]

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
    case 'welcome':
      if (msg.skills) skills = Object.fromEntries(msg.skills.map((s) => [s.id, s]))
      break
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
    case 'skill_cast':
      onSkillCast(msg)
      break
    case 'finish':
      if (msg.players) {
        players = msg.players
        syncMe()
      }
      onFinish()
      showPrize()
      break
    case 'error':
      if (state === 'racing') toast(ERRORS[msg.reason] ?? msg.reason)
      else $('join-error').textContent = ERRORS[msg.reason] ?? msg.reason
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
    if (avatarName !== found.name) {
      avatarName = found.name
      $('wait-avatar').innerHTML = idle(found.name)
      $('done-avatar').innerHTML = idle(found.name)
    }
    if (state === 'racing') switchTo('scr-race')
    else switchTo('scr-wait')
    $('join-error').textContent = ''
  }

  $('race-pct').textContent = `${Math.floor(found.progress / 10)}%`
  $('race-lead').textContent = leaderLabel(found)

  renderSkills(found)
  syncBanner(found)

  if (found.place !== null) onFinished(found)
}

/* ---------- ky nang ---------- */

function renderSkills(found) {
  for (const btn of skillButtons) {
    const id = btn.dataset.skill
    const cd = found.cd?.[id] ?? 0
    const cooling = cd > 0
    btn.classList.toggle('cooling', cooling)
    btn.disabled = cooling || !runEnabled
    btn.querySelector('.sk-cd').textContent = cooling ? `${Math.ceil(cd / 1000)}s` : ''
    const label = SKILL_LABEL[id] ?? skills[id]?.name ?? id
    if (btn.querySelector('.sk-name').textContent !== label) {
      btn.querySelector('.sk-name').textContent = label
    }
  }
}

function onSkillClick(id) {
  const skill = skills[id] ?? { id, kind: id === 'tangtoc' ? 'self' : 'target' }
  if (!runEnabled) return
  if (skill.kind === 'self') {
    net.send({ type: 'cast', skillId: id })
    return
  }
  openPicker(id)
}

function openPicker(skillId) {
  const myId = playerId()
  const targets = players.filter((p) => p.id !== myId && p.place === null)
  if (!targets.length) {
    toast('Không còn ai để nhắm.')
    return
  }
  pendingSkill = skillId
  $('target-picker').innerHTML =
    targets
      .map((p) => `<button class="target-btn" type="button" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`)
      .join('') + '<button class="target-btn cancel" type="button" data-cancel="1">HỦY</button>'
  $('target-picker').classList.add('on')
}

function closePicker() {
  pendingSkill = null
  $('target-picker').classList.remove('on')
  $('target-picker').innerHTML = ''
}

function onSkillCast(msg) {
  const myId = playerId()
  if (msg.casterId === myId) {
    if (msg.effect === 'boost') {
      sfx.boost()
      triggerFx('boost')
      toast('⚡ TĂNG TỐC! +60')
    } else {
      sfx.cast(msg.effect)
    }
    return
  }
  if (msg.targetId === myId && msg.effect !== 'boost') {
    sfx[msg.effect === 'chan' ? 'block' : 'slow']()
  }
}

function triggerFx(kind) {
  const el = $('fx-layer')
  el.className = 'fx-layer'
  void el.offsetWidth
  el.className = `fx-layer on ${kind}`
}

function syncBanner(found) {
  const eff = (found.effects ?? []).find((e) => e.type === 'chan' || e.type === 'cham')
  const el = $('alert-banner')
  const btn = $('btn-run')
  if (!eff) {
    if (bannerKind) {
      el.classList.remove('on')
      bannerKind = null
      btn.classList.remove('blocked', 'slowed')
    }
    return
  }
  if (bannerKind !== eff.type) {
    bannerKind = eff.type
    el.className = `alert-banner on ${eff.type}`
    navigator.vibrate?.(eff.type === 'chan' ? [90, 60, 90] : [60, 40, 60])
    btn.classList.toggle('blocked', eff.type === 'chan')
    btn.classList.toggle('slowed', eff.type === 'cham')
    triggerFx(eff.type)
  }
  const label = eff.type === 'chan' ? '⛔ BỊ CHẶN!' : '🐌 BỨT CHẬM!'
  $('alert-text').textContent = `${label} ${(eff.ms / 1000).toFixed(1)}s`
  const who = players.find((x) => x.id === eff.by)
  $('alert-by').textContent = who ? `bởi ${who.name}` : ''
}

function toast(text) {
  const el = $('toast')
  el.textContent = text
  el.classList.add('on')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('on'), 1400)
}

function escapeHtml(value) {
  return String(value).replace(/[<>&"]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch],
  )
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
    if (me) renderSkills(me)
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

function showPrize() {
  if (!me || !me.gift) return
  $('done-tier').textContent = `TIER ${me.tier}`
  $('done-tier').className = `tier t${me.tier}`
  $('done-gift').textContent = me.gift
  $('done-prize').hidden = false
}

function onFinished(player) {
  if (!player || player.place === null || showedDone) return
  showedDone = true
  runEnabled = false
  closePicker()
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
  if (pendingSkill) closePicker()
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

for (const skillBtn of skillButtons) {
  skillBtn.addEventListener('click', () => onSkillClick(skillBtn.dataset.skill))
}

$('target-picker').addEventListener('click', (e) => {
  const target = e.target.closest('button')
  if (!target) return
  if (target.dataset.cancel) {
    closePicker()
    return
  }
  const targetId = target.dataset.id
  if (!targetId || !pendingSkill) return
  net.send({ type: 'cast', skillId: pendingSkill, targetId })
  closePicker()
})

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