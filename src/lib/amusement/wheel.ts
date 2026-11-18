// The prize wheel: slices sized by their chance (so the wheel is honest about
// the odds), a fair random pick, and the angle that lands the pointer on it.

export type Prize = { id: string; label: string; color: string; weight: number }

export const DEFAULT_PRIZES: Prize[] = [
  { id: 'free-ride', label: 'Free ride', color: '#7C3AED', weight: 1 },
  { id: '10-off', label: '10% off', color: '#F472B6', weight: 3 },
  { id: 'try-again', label: 'Spin again', color: '#22D3EE', weight: 2 },
  { id: 'sweet', label: 'Sweet treat', color: '#FACC15', weight: 3 },
  { id: '20-off', label: '20% off', color: '#FB923C', weight: 1 },
  { id: 'sticker', label: 'Sticker', color: '#34D399', weight: 3 },
]

export const PRIZE_COLORS = ['#7C3AED', '#F472B6', '#22D3EE', '#FACC15', '#FB923C', '#34D399', '#60A5FA', '#F87171']

// Each slice's start and end angle, in degrees clockwise from the top.
export const slices = (prizes: Prize[]) => {
  const total = prizes.reduce((n, p) => n + Math.max(0, p.weight), 0) || 1
  let at = 0
  return prizes.map((p) => {
    const size = (Math.max(0, p.weight) / total) * 360
    const s = { prize: p, start: at, end: at + size }
    at += size
    return s
  })
}

// A weighted pick. `random` is in [0, 1); crypto-strength in the browser.
export const pickPrize = (prizes: Prize[], random: number = secureRandom()): number => {
  const total = prizes.reduce((n, p) => n + Math.max(0, p.weight), 0)
  if (total <= 0) return 0
  let r = random * total
  for (let i = 0; i < prizes.length; i++) {
    r -= Math.max(0, prizes[i].weight)
    if (r < 0) return i
  }
  return prizes.length - 1
}

// The wheel's final rotation (degrees) to stop with the fixed top pointer
// inside slice `index`, after `turns` full turns from `from`. `jitter` in
// [0,1) picks where inside the slice, so it never looks rigged to the centre.
export const landingRotation = (prizes: Prize[], index: number, from: number, turns = 6, jitter = 0.5) => {
  const s = slices(prizes)[index]
  const margin = (s.end - s.start) * 0.15
  const target = s.start + margin + (s.end - s.start - 2 * margin) * jitter
  // Rotating the wheel by R puts the wheel's angle (360 - R mod 360) under the pointer.
  const base = from - (from % 360)
  return base + turns * 360 + (360 - target)
}

export const secureRandom = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const a = new Uint32Array(1)
    crypto.getRandomValues(a)
    return a[0] / 2 ** 32
  }
  return Math.random()
}
