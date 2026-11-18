'use client'

// Little sounds, no audio files: Web Audio tones. Best-effort everywhere.
//   ok   — a bright two-note "ding": come in!
//   no   — a low double buzz: stop.
//   tick — the prize wheel's peg.
//   win  — a short fanfare.

let ctx: AudioContext | null = null

const tone = (freq: number, at: number, length: number, type: OscillatorType = 'sine', volume = 0.22) => {
  const o = ctx!.createOscillator()
  const g = ctx!.createGain()
  o.type = type
  o.frequency.value = freq
  const t = ctx!.currentTime + at
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(volume, t + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t + length)
  o.connect(g).connect(ctx!.destination)
  o.start(t)
  o.stop(t + length + 0.02)
}

export const sound = (kind: 'ok' | 'no' | 'tick' | 'win') => {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    if (kind === 'ok') {
      tone(880, 0, 0.18)
      tone(1320, 0.12, 0.3)
    } else if (kind === 'no') {
      tone(180, 0, 0.18, 'square', 0.12)
      tone(150, 0.22, 0.28, 'square', 0.12)
    } else if (kind === 'tick') {
      tone(1600, 0, 0.03, 'triangle', 0.08)
    } else {
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, i === 3 ? 0.5 : 0.16, 'triangle', 0.2))
    }
  } catch {
    // no audio
  }
}

export const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not supported
  }
}
