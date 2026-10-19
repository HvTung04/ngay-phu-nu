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
}