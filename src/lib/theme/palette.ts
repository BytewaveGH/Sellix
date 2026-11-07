// Light and dark colours for every Tailwind colour class, as CSS variables.
//
// The dashboards use plain classes (`bg-white`, `text-stone-900`,
// `bg-amber-50 text-amber-800`…) everywhere. Rather than add a `dark:` twin to
// thousands of them, each class reads a variable, and `.dark` swaps the values:
//
// - text, borders, rings (`colors`): flipped — dark text becomes light,
//   hairline borders become dark hairlines, deep tints become pale ones;
// - backgrounds and gradients (`backgroundColor`): white and pale surfaces
//   become dark surfaces, pale tints become deep tints, and strong colours
//   (buttons, badges with white text) stay as they are so white text on them
//   still reads.
//
// Light values are Tailwind's own, so the light theme is unchanged.

import colors from 'tailwindcss/colors'

type Scale = Record<string, string>

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const NEUTRALS = ['stone', 'gray', 'slate', 'zinc', 'neutral'] as const
const CHROMATIC = [
  'amber',
  'emerald',
  'rose',
  'red',
  'green',
  'blue',
  'sky',
  'indigo',
  'violet',
  'purple',
  'orange',
  'yellow',
  'teal',
  'cyan',
  'lime',
  'pink',
  'fuchsia',
] as const

// Brand colours (single values), and how they read as text on dark.
const BRAND: Record<string, { light: string; darkText: string }> = {
  veniceBlue: { light: '#054B81', darkText: '#8CC6F2' },
  endeavour: { light: '#0865AC', darkText: '#5AA9E6' },
  cornflowerBlue: { light: '#59B0F2', darkText: '#7CC2F5' },
  burningOrange: { light: '#FF7433', darkText: '#FF8F5C' },
  doveGray: { light: '#686868', darkText: '#A3A3A3' },
}

// ── colour maths ─────────────────────────────────────────────────────────────

const rgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16
  )
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
// "r g b", the form `rgb(var(--x) / <alpha-value>)` needs.
export const channels = (hex: string) => rgb(hex).join(' ')
// `t` of the way from a to b.
export const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)]
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v + (y[i] - v) * t)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

// ── dark surfaces ────────────────────────────────────────────────────────────

const s = colors.stone as Scale
// Page behind everything, and cards (`bg-white`) on it.
export const DARK_PAGE = mix(s['950'], s['900'], 0.55)
export const DARK_CARD = mix(s['900'], s['800'], 0.3)

// ── dark mappings ────────────────────────────────────────────────────────────

const neutralText = (p: Scale): Scale => ({
  '50': mix(p['900'], p['800'], 0.5),
  '100': mix(p['900'], p['800'], 0.75),
  '200': p['800'],
  '300': p['700'],
  '400': mix(p['500'], p['400'], 0.35),
  '500': p['400'],
  '600': p['300'],
  '700': p['200'],
  '800': p['100'],
  '900': p['50'],
  '950': '#ffffff',
})

const neutralBg = (p: Scale): Scale => ({
  '50': mix(DARK_CARD, p['950'], 0.35),
  // Chips, hovers and tracks on a card: a step above it.
  '100': p['800'],
  '200': mix(p['800'], p['700'], 0.35),
  '300': mix(p['800'], p['700'], 0.65),
  '400': p['600'],
  '500': p['500'],
  // Dark fills carry white text: kept dark, but lifted off the page so they still stand out.
  '600': p['600'],
  '700': mix(p['600'], p['700'], 0.3),
  '800': mix(p['600'], p['700'], 0.5),
  '900': mix(p['600'], p['700'], 0.7),
  '950': p['950'],
})

const tint = (p: Scale, t: number) => mix(DARK_CARD, p['500'], t)

const chromaticText = (p: Scale): Scale => ({
  '50': tint(p, 0.12),
  '100': tint(p, 0.22),
  '200': tint(p, 0.34),
  '300': tint(p, 0.5),
  '400': p['400'],
  '500': p['400'],
  '600': p['400'],
  '700': p['300'],
  '800': p['200'],
  '900': p['100'],
  '950': p['50'],
})

const chromaticBg = (p: Scale): Scale => ({
  ...Object.fromEntries(SHADES.map((k) => [k, p[k]])),
  '50': tint(p, 0.1),
  '100': tint(p, 0.17),
  '200': tint(p, 0.26),
  '300': tint(p, 0.4),
})

// ── output ───────────────────────────────────────────────────────────────────

type Vars = Record<string, string>
const light: Vars = {}
const dark: Vars = {}
const textColors: Record<string, string | Scale> = {}
const bgColors: Record<string, string | Scale> = {}

const ref = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

const addFamily = (family: string, textDark: Scale, bgDark: Scale) => {
  const p = (colors as unknown as Record<string, Scale>)[family]
  const text: Scale = {}
  const bg: Scale = {}
  for (const k of SHADES) {
    light[`--tc-${family}-${k}`] = channels(p[k])
    light[`--bc-${family}-${k}`] = channels(p[k])
    dark[`--tc-${family}-${k}`] = channels(textDark[k])
    dark[`--bc-${family}-${k}`] = channels(bgDark[k])
    text[k] = ref(`tc-${family}-${k}`)
    bg[k] = ref(`bc-${family}-${k}`)
  }
  textColors[family] = text
  bgColors[family] = bg
}

for (const f of NEUTRALS) {
  const p = (colors as unknown as Record<string, Scale>)[f]
  addFamily(f, neutralText(p), neutralBg(p))
}
for (const f of CHROMATIC) {
  const p = (colors as unknown as Record<string, Scale>)[f]
  addFamily(f, chromaticText(p), chromaticBg(p))
}
for (const [name, c] of Object.entries(BRAND)) {
  light[`--tc-${name}`] = channels(c.light)
  dark[`--tc-${name}`] = channels(c.darkText)
  textColors[name] = ref(`tc-${name}`)
  // Brand fills (buttons with white text) keep their colour in both themes.
  bgColors[name] = c.light
}

// `bg-white` is a card; `text-white` stays white (it sits on strong fills).
light['--bc-white'] = channels('#ffffff')
dark['--bc-white'] = channels(DARK_CARD)
// Behind the page (globals.css).
light['--page'] = channels('#ffffff')
dark['--page'] = channels(DARK_PAGE)
bgColors.white = ref('bc-white')

export const themeColors = {
  // For text, borders, rings, fills, placeholders…
  text: textColors,
  // For backgrounds and gradient stops.
  background: bgColors,
  vars: { light, dark },
}
