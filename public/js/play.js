import { connect, playerId } from '/js/net.js'
import { castHtml, castCss, castFileForName, randomCast } from '/js/cast.js'
import { sfx, unlockAudio } from '/js/sfx.js'

document.head.insertAdjacentHTML('beforeend', castCss())

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

const SKILL_LABEL = { chan: 'CHẶN', cham: 'CHẬM', tangtoc: 'TĂNG TỐC' }

let state = 'lobby'
let me = null
let players = []
let joined = false
let showedDone = false
let skills = {}
let pendingSkill = null
let toastTimer = null
let avatarKey = null
let lastChipsHtml = ''
let seenKinds = new Set()
let selectedCast = null
let endsIn = null

const skillButtons = [...document.querySelectorAll('.skill-btn')]

const net = connect(onMessage, (status) => {
  $('offline').classList.toggle('on', status === 'offline')
  if (status === 'online') join()
})

function join() {
  if (!joined) return
  const name = me?.name ?? savedName()
  net.send({ type: 'player_join', playerId: playerId(), name, cast: selectedCast ?? castFileForName(name) })
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
      endsIn = msg.endsIn ?? null
      syncMe()
      break
    case 'race_tick':
      players = msg.players
      if (msg.state) state = msg.state
      endsIn = msg.endsIn ?? null
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
    switchTo('scr-race')
  }

  if (!found) return
  me = found

  const key = `${found.name}:${found.slot}:${found.cast}`
  if (avatarKey !== key) {
    avatarKey = key
    $('wait-avatar').innerHTML = castHtml({ cast: found.cast, slot: found.slot, fitH: 144, fitW: 144, anim: 'idle' })
    $('done-avatar').innerHTML = castHtml({ cast: found.cast, slot: found.slot, fitH: 144, fitW: 144, anim: 'idle' })
    $('race-avatar').innerHTML = castHtml({ cast: found.cast, slot: found.slot, fitH: 140, fitW: 140 })
    $('race-name').textContent = found.name
    $('wait-name').textContent = found.name
  }

  if (!showedDone) {
    // Vao phong la bam duoc ngay, khong phai doi den luc dua.
    if (state === 'lobby' || state === 'racing') switchTo('scr-race')
    else if (state !== 'countdown') switchTo('scr-wait')
    $('join-error').textContent = ''
  }

  $('race-pct').textContent = `${Math.floor(found.progress / 10)}%`
  $('race-lead').textContent = leaderLabel(found)

  renderSkills(found)
  renderChips(found)
  renderClock()

  if (found.place !== null) onFinished(found)
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

/* ---------- ky nang ---------- */

function renderSkills(found) {
  for (const btn of skillButtons) {
    const id = btn.dataset.skill
    const cd = found.cd?.[id] ?? 0
    const cooling = cd > 0
    const total = skills[id]?.cooldown ?? 1
    btn.classList.toggle('cooling', cooling)
    btn.disabled = cooling || !runEnabled || state !== 'racing'
    btn.querySelector('.sk-cd').textContent = cooling ? `${Math.ceil(cd / 1000)}s` : ''
    btn.style.setProperty('--cool', `${cooling ? Math.min(100, (cd / total) * 100) : 0}%`)
    const desc = skillDesc(id)
    const descEl = btn.querySelector('.sk-desc')
    if (descEl.textContent !== desc) descEl.textContent = desc
    const label = SKILL_LABEL[id] ?? skills[id]?.name ?? id
    if (btn.querySelector('.sk-name').textContent !== label) {
      btn.querySelector('.sk-name').textContent = label
    }
  }
}

function skillDesc(id) {
  const s = skills[id]
  if (!s) return ''
  if (s.kind === 'self') return `+${s.bonus} điểm`
  return `${Math.round(s.duration / 1000)}s`
}

function rankOf(list) {
  return [...list].sort((a, b) => {
    if (a.place !== null && b.place !== null) return a.place - b.place
    if (a.place !== null) return -1
    if (b.place !== null) return 1
    return b.progress - a.progress || a.slot - b.slot
  })
}

function onSkillClick(id) {
  const skill = skills[id] ?? { id, kind: id === 'tangtoc' ? 'self' : 'target' }
  if (!runEnabled || state !== 'racing') return
  if (skill.kind === 'self') {
    net.send({ type: 'cast', skillId: id })
    return
  }
  openPicker(id)
}

function openPicker(skillId) {
  const myId = playerId()
  const ranked = rankOf(players)
  const targets = ranked
    .map((p, i) => ({ p, rank: i + 1 }))
    .filter(({ p }) => p.id !== myId && p.place === null)
  if (!targets.length) {
    toast('Không còn ai để nhắm.')
    return
  }
  pendingSkill = skillId
  $('target-picker').innerHTML =
    targets
      .map(({ p, rank }) => {
        const eff = (p.effects ?? [])
          .filter((e) => e.type === 'chan' || e.type === 'cham')
          .map((e) => (e.type === 'chan' ? '⛔' : '🐌'))
          .join('')
        return `<button class="target-btn" type="button" data-id="${escapeHtml(p.id)}">
          <span class="tg-rank">${rank}</span>
          <span class="tg-ava">${castHtml({ cast: p.cast, slot: p.slot, fitH: 44, fitW: 44, anim: 'idle' })}</span>
          <span class="tg-name">${escapeHtml(p.name)}${eff ? ` ${eff}` : ''}</span>
          <span class="tg-pct">${Math.floor(p.progress / 10)}%</span>
        </button>`
      })
      .join('') + '<button class="target-btn target-cancel" type="button" data-cancel="1">HỦY</button>'
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

function renderChips(found) {
  const effects = found.effects ?? []
  const kinds = new Set()
  let html = ''

  for (const eff of effects) {
    if (eff.type !== 'chan' && eff.type !== 'cham') continue
    kinds.add(eff.type)
    const secs = (Math.ceil(eff.ms / 500) / 2).toFixed(1)
    const icon = eff.type === 'chan' ? '⛔ BỊ CHẶN' : '🐌 BỊ CHẬM'
    const who = players.find((x) => x.id === eff.by)
    html += `<span class="chip ${eff.type}">${icon} ${secs}s${who ? ` · ${escapeHtml(who.name)}` : ''}</span>`
  }
  if (found.boosted) html += '<span class="chip boost">⚡ TĂNG TỐC</span>'

  if (html !== lastChipsHtml) {
    lastChipsHtml = html
    $('status-chips').innerHTML = html
  }

  for (const kind of kinds) {
    if (seenKinds.has(kind)) continue
    navigator.vibrate?.(kind === 'chan' ? [90, 60, 90] : [60, 40, 60])
    triggerFx(kind)
  }
  seenKinds = kinds

  $('btn-run').classList.toggle('blocked', kinds.has('chan'))
  $('btn-run').classList.toggle('slowed', kinds.has('cham'))
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
  const rank = rankOf(players).findIndex((p) => p.id === found.id) + 1
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

function onFinished(player) {
  if (!player || player.place === null || showedDone) return
  showedDone = true
  runEnabled = false
  closePicker()
  navigator.vibrate?.([40, 60, 40])
  $('done-rank').textContent = String(player.place)
  const finished = player.progress >= 1000
  $('done-place').textContent = finished
    ? player.place === 1 ? 'VỀ ĐÍCH NHẤT!' : 'Bạn đã về đích!'
    : 'HẾT GIỜ!'
  $('done-line').innerHTML = `${finished ? 'Bạn về đích thứ' : 'Bạn đứng thứ'} <b id="done-rank">${player.place}</b><br>Hãy nhìn lên màn hình lớn!`
  $('btn-again').hidden = false
  switchTo('scr-done')
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

function updateJoinAvatar() {
  $('join-avatar').innerHTML = castHtml({ cast: selectedCast, fitH: 112, fitW: 112, anim: 'idle' })
}

$('name').addEventListener('input', () => {
  selectedCast = randomCast()
  updateJoinAvatar()
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

selectedCast = randomCast()
updateJoinAvatar()

if (savedName()) $('name').value = savedName()