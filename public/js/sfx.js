let ctx = null

function audio() {
  if (ctx === null) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return null
    ctx = new Ctx()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

export function unlockAudio() {
  audio()
}

function tone(freq, durationMs, { type = 'square', gain = 0.08, delay = 0 } = {}) {
  const ac = audio()
  if (!ac) return
  const start = ac.currentTime + delay / 1000
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain, start + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000)
  osc.connect(amp).connect(ac.destination)
  osc.start(start)
  osc.stop(start + durationMs / 1000 + 0.02)
}

function sweep(from, to, durationMs, { type = 'sawtooth', gain = 0.08, delay = 0 } = {}) {
  const ac = audio()
  if (!ac) return
  const start = ac.currentTime + delay / 1000
  const osc = ac.createOscillator()
  const amp = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, start)
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + durationMs / 1000)
  amp.gain.setValueAtTime(0, start)
  amp.gain.linearRampToValueAtTime(gain, start + 0.01)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000)
  osc.connect(amp).connect(ac.destination)
  osc.start(start)
  osc.stop(start + durationMs / 1000 + 0.02)
}

function noise(durationMs, { gain = 0.08, filter = 900, delay = 0 } = {}) {
  const ac = audio()
  if (!ac) return
  const start = ac.currentTime + delay / 1000
  const frames = Math.max(1, Math.ceil((durationMs / 1000) * ac.sampleRate))
  const buffer = ac.createBuffer(1, frames, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
  const src = ac.createBufferSource()
  src.buffer = buffer
  const band = ac.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = filter
  const amp = ac.createGain()
  amp.gain.setValueAtTime(gain, start)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000)
  src.connect(band).connect(amp).connect(ac.destination)
  src.start(start)
  src.stop(start + durationMs / 1000)
}

export const sfx = {
  tick(n) {
    tone(n === 0 ? 880 : 520, n === 0 ? 420 : 140, { gain: 0.07 })
  },
  go() {
    tone(1046, 220, { gain: 0.1 })
    tone(1568, 300, { gain: 0.07, delay: 60 })
  },
  finish() {
    ;[880, 1108, 1318, 1760].forEach((f, i) => tone(f, 160, { gain: 0.08, delay: i * 90 }))
  },
  fanfare() {
    ;[523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
      tone(f, 220, { type: 'triangle', gain: 0.09, delay: i * 130 }),
    )
  },
  error() {
    tone(200, 180, { type: 'sawtooth', gain: 0.06 })
  },
  skill(kind) {
    if (kind === 'boost') return this.boost()
    if (kind === 'cham') return this.slow()
    this.block()
  },
  cast(kind) {
    if (kind === 'boost') return this.boost()
    tone(660, 70, { type: 'square', gain: 0.05 })
    sweep(1500, 500, 220, { type: 'triangle', gain: 0.05 })
  },
  block() {
    noise(170, { gain: 0.13, filter: 420 })
    sweep(190, 55, 340, { type: 'square', gain: 0.1 })
    tone(98, 260, { type: 'triangle', gain: 0.07, delay: 30 })
  },
  slow() {
    sweep(760, 110, 720, { type: 'sawtooth', gain: 0.07 })
    tone(220, 500, { type: 'triangle', gain: 0.05, delay: 120 })
  },
  boost() {
    sweep(280, 1500, 340, { type: 'triangle', gain: 0.09 })
    tone(1046, 130, { type: 'triangle', gain: 0.07, delay: 250 })
    tone(1568, 170, { type: 'triangle', gain: 0.06, delay: 330 })
    noise(220, { gain: 0.05, filter: 3200, delay: 120 })
  },
}