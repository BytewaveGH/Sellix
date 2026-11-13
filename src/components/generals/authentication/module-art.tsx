'use client'

// The picture beside each sign-in form: a scene for the business's module
// (shop counter, kitchen pass, Ferris wheel, apartment block), in the
// module's colour. Drawn as SVG — sharp at any size, nothing to download.

import React, { useId } from 'react'
import { Building2, FerrisWheel, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SellixLogo } from '@/components/brand/sellix-logo'

export type AuthModule = 'retail' | 'eatery' | 'amusement' | 'real-estate' | 'all'

export const asAuthModule = (appType?: string | null): AuthModule =>
  appType === 'retail' || appType === 'eatery' || appType === 'amusement' || appType === 'real-estate' ? appType : 'all'

type Spec = {
  label: string
  icon: React.ElementType
  color: string
  // Panel background, deep to light.
  from: string
  via: string
  to: string
  headline: string
  sub: string
  // A glimpse of the product, floating over the scene; `top` keeps it clear of the drawing.
  chip?: { title: string; value: string; tone: string; top: string }
}

export const MODULES: Record<AuthModule, Spec> = {
  retail: {
    label: 'Retail & POS',
    icon: ShoppingBag,
    color: '#0865AC',
    from: '#06305A',
    via: '#0865AC',
    to: '#2A9DF4',
    headline: 'Every sale, every shelf — in one place.',
    sub: 'Ring up sales in seconds, keep stock honest and see your day at a glance.',
    chip: { title: 'Today’s sales', value: '₵4,820  ▲ 12%', tone: '#16A34A', top: '8%' },
  },
  eatery: {
    label: 'Eatery',
    icon: UtensilsCrossed,
    color: '#D97706',
    from: '#7C2D12',
    via: '#C2410C',
    to: '#F59E0B',
    headline: 'From the counter to the kitchen, in step.',
    sub: 'Take orders fast, run the kitchen board and know what every plate costs.',
    chip: { title: 'Order #A7K2', value: 'Ready to serve', tone: '#16A34A', top: '40%' },
  },
  amusement: {
    label: 'Amusement Park',
    icon: FerrisWheel,
    color: '#7C3AED',
    from: '#2E1065',
    via: '#6D28D9',
    to: '#C084FC',
    headline: 'More rides. Shorter queues.',
    sub: 'Sell tickets, run attractions and fill every slot of the day.',
    chip: { title: 'Tickets today', value: '312 sold', tone: '#DB2777', top: '8%' },
  },
  'real-estate': {
    label: 'Real Estate',
    icon: Building2,
    color: '#0D9488',
    from: '#042F2E',
    via: '#0F766E',
    to: '#2DD4BF',
    headline: 'Every unit, tenant and cedi accounted for.',
    sub: 'Leases, rent, short stays and a listings site for your vacancies.',
    chip: { title: 'Rent collected', value: '94% this month', tone: '#0D9488', top: '8%' },
  },
  all: {
    label: 'Business suite',
    icon: ShoppingBag,
    color: '#7C3AED',
    from: '#1E1B4B',
    via: '#4338CA',
    to: '#06B6D4',
    headline: 'One suite for the way you do business.',
    sub: 'Shops, eateries, parks and property — sign in to yours.',
  },
}

// ── Scenes (viewBox 0 0 480 400) ─────────────────────────────────────────────

const RetailScene = ({ id }: { id: string }) => (
  <>
    <defs>
      <linearGradient id={`${id}-screen`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#0F172A" />
        <stop offset="1" stopColor="#1E293B" />
      </linearGradient>
    </defs>
    {/* Shelves */}
    <rect x="40" y="36" width="400" height="190" rx="18" fill="#fff" opacity=".1" />
    {[96, 156, 216].map((y) => (
      <rect key={y} x="56" y={y} width="368" height="6" rx="3" fill="#fff" opacity=".28" />
    ))}
    {[
      [70, 56, 26, 40, '#FBBF24'],
      [102, 64, 22, 32, '#F87171'],
      [130, 52, 30, 44, '#fff'],
      [168, 60, 24, 36, '#34D399'],
      [200, 66, 20, 30, '#FBBF24'],
      [250, 56, 34, 40, '#93C5FD'],
      [292, 62, 22, 34, '#fff'],
      [322, 54, 28, 42, '#F472B6'],
      [358, 64, 24, 32, '#34D399'],
      [390, 58, 22, 38, '#FBBF24'],
      [74, 120, 30, 36, '#fff'],
      [112, 126, 22, 30, '#93C5FD'],
      [142, 116, 28, 40, '#F87171'],
      [178, 124, 24, 32, '#FBBF24'],
      [214, 118, 30, 38, '#fff'],
      [300, 122, 26, 34, '#34D399'],
      [334, 116, 30, 40, '#FBBF24'],
      [372, 126, 22, 30, '#F472B6'],
      [400, 120, 22, 36, '#fff'],
      [80, 180, 26, 36, '#F472B6'],
      [116, 186, 30, 30, '#FBBF24'],
      [356, 182, 28, 34, '#93C5FD'],
      [392, 178, 26, 38, '#fff'],
    ].map(([x, y, w, h, c], i) => (
      <rect key={i} x={x as number} y={y as number} width={w as number} height={h as number} rx="5" fill={c as string} opacity=".9" />
    ))}
    {/* Counter */}
    <rect x="20" y="276" width="440" height="110" rx="22" fill="#fff" />
    <rect x="20" y="276" width="440" height="22" rx="11" fill="#E2E8F0" />
    <rect x="44" y="318" width="120" height="10" rx="5" fill="#E2E8F0" />
    <rect x="44" y="338" width="80" height="10" rx="5" fill="#E2E8F0" />
    {/* Till */}
    <rect x="232" y="268" width="56" height="14" rx="5" fill="#CBD5E1" />
    <rect x="252" y="214" width="16" height="58" rx="6" fill="#94A3B8" />
    <rect x="186" y="150" width="148" height="96" rx="12" fill={`url(#${id}-screen)`} />
    <rect x="198" y="164" width="60" height="8" rx="4" fill="#38BDF8" />
    <rect x="198" y="180" width="40" height="6" rx="3" fill="#475569" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <rect
        key={i}
        x={204 + i * 20}
        y={232 - [22, 34, 18, 40, 28, 48][i]}
        width="12"
        height={[22, 34, 18, 40, 28, 48][i]}
        rx="3"
        fill={i === 5 ? '#FBBF24' : '#38BDF8'}
      />
    ))}
    {/* Receipt printing */}
    <rect x="352" y="246" width="70" height="34" rx="8" fill="#334155" />
    <path d="M362 248 h50 v-80 l-6 5 -6 -5 -6 5 -6 -5 -7 5 -6 -5 -7 5 -6 -5 z" fill="#fff" />
    {[182, 194, 206, 218].map((y, i) => (
      <rect key={y} x="370" y={y} width={i === 3 ? 22 : 34} height="5" rx="2.5" fill="#CBD5E1" />
    ))}
    <rect x="370" y="230" width="34" height="7" rx="3" fill="#0F172A" />
    {/* Shopping bag */}
    <path d="M70 230 h66 l6 50 h-78 z" fill="#FBBF24" />
    <path d="M86 232 v-10 a17 17 0 0 1 34 0 v10" fill="none" stroke="#B45309" strokeWidth="5" strokeLinecap="round" />
    <rect x="80" y="246" width="46" height="6" rx="3" fill="#fff" opacity=".7" />
  </>
)

const EateryScene = ({ id }: { id: string }) => (
  <>
    <defs>
      <radialGradient id={`${id}-food`} cx=".5" cy=".3" r=".8">
        <stop offset="0" stopColor="#FB923C" />
        <stop offset="1" stopColor="#C2410C" />
      </radialGradient>
    </defs>
    {/* Ticket rail with orders */}
    <rect x="40" y="40" width="400" height="10" rx="5" fill="#fff" opacity=".45" />
    {[
      [64, -4, 'A7K2'],
      [170, 3, 'B3QF'],
      [276, -2, 'C9MT'],
      [362, 4, 'D4XP'],
    ].map(([x, r, code], i) => (
      <g key={i} transform={`rotate(${r} ${(x as number) + 40} 50)`}>
        <rect x={x as number} y="44" width="80" height="104" rx="6" fill="#FFFBEB" />
        <rect x={(x as number) + 10} y="58" width="44" height="9" rx="4" fill="#78350F" opacity=".8" />
        <text x={(x as number) + 10} y="88" fontSize="13" fontWeight="800" fill="#7C2D12" fontFamily="system-ui, sans-serif">
          #{code as string}
        </text>
        {[98, 110, 122].map((y, j) => (
          <rect key={y} x={(x as number) + 10} y={y} width={[56, 42, 50][j]} height="6" rx="3" fill="#FED7AA" />
        ))}
        {i === 0 && <rect x={(x as number) + 10} y="132" width="34" height="9" rx="4" fill="#16A34A" />}
      </g>
    ))}
    {/* Steam */}
    {[200, 236, 272].map((x, i) => (
      <path
        key={x}
        d={`M${x} ${226 - i * 6} c-14 -16 14 -26 0 -42 c-14 -16 14 -26 0 -42`}
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        opacity=".55"
      />
    ))}
    {/* Pass counter */}
    <rect x="20" y="300" width="440" height="86" rx="22" fill="#fff" />
    <rect x="20" y="300" width="440" height="20" rx="10" fill="#FFEDD5" />
    {/* Bowl of jollof */}
    <ellipse cx="236" cy="252" rx="94" ry="26" fill={`url(#${id}-food)`} />
    {[
      [196, 244],
      [228, 238],
      [262, 246],
      [212, 256],
      [250, 258],
    ].map(([x, y], i) => (
      <circle key={i} cx={x} cy={y} r="6" fill="#16A34A" />
    ))}
    <path d="M136 252 a100 58 0 0 0 200 0 z" fill="#fff" />
    <path d="M148 262 a88 44 0 0 0 176 0" fill="none" stroke="#FDBA74" strokeWidth="6" />
    <rect x="200" y="300" width="72" height="10" rx="5" fill="#E7E5E4" />
    {/* Cup */}
    <path d="M362 238 h64 l-8 62 h-48 z" fill="#FFFBEB" />
    <path d="M426 252 h10 a14 14 0 0 1 0 28 h-12" fill="none" stroke="#FFFBEB" strokeWidth="7" />
    <rect x="368" y="254" width="52" height="10" fill="#B45309" opacity=".8" />
    <path d="M394 228 c-10 -10 10 -18 0 -30" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".55" />
    {/* Service bell */}
    <path d="M58 296 a36 36 0 0 1 72 0 z" fill="#FDE68A" />
    <rect x="50" y="294" width="88" height="8" rx="4" fill="#B45309" />
    <circle cx="94" cy="256" r="6" fill="#B45309" />
  </>
)

const AmusementScene = ({ id }: { id: string }) => {
  const cx = 236
  const cy = 168
  const r = 128
  const cars = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2)
  const colors = ['#F472B6', '#FDE047', '#34D399', '#60A5FA', '#FB923C']
  return (
    <>
      <defs>
        <radialGradient id={`${id}-glow`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r + 40} fill={`url(#${id}-glow)`} />
      {/* Stars */}
      {[
        [56, 58],
        [420, 44],
        [404, 132],
        [70, 196],
        [452, 236],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 8} l2.4 5.6 5.6 2.4 -5.6 2.4 -2.4 5.6 -2.4 -5.6 -5.6 -2.4 5.6 -2.4 z`} fill="#FDE047" />
      ))}
      {/* Legs */}
      <path
        d={`M${cx} ${cy} L${cx - 84} 330 M${cx} ${cy} L${cx + 84} 330`}
        stroke="#fff"
        strokeWidth="10"
        strokeLinecap="round"
        opacity=".85"
      />
      {/* Wheel */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth="8" />
      <circle cx={cx} cy={cy} r={r - 22} fill="none" stroke="#fff" strokeWidth="3" opacity=".5" />
      {cars.map((a, i) => (
        <line
          key={`s${i}`}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(a) * r}
          y2={cy + Math.sin(a) * r}
          stroke="#fff"
          strokeWidth="3"
          opacity=".7"
        />
      ))}
      {cars.map((a, i) => {
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        return (
          <g key={`c${i}`}>
            <line x1={x} y1={y} x2={x} y2={y + 12} stroke="#fff" strokeWidth="3" />
            <rect x={x - 16} y={y + 10} width="32" height="22" rx="7" fill={colors[i % colors.length]} />
            <rect x={x - 11} y={y + 14} width="22" height="7" rx="3" fill="#fff" opacity=".7" />
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r="16" fill="#FDE047" />
      <circle cx={cx} cy={cy} r="6" fill="#7C3AED" />
      {/* Ground */}
      <rect x="20" y="326" width="440" height="60" rx="22" fill="#fff" opacity=".95" />
      {/* Ticket */}
      <g transform="rotate(-10 120 330)">
        <path d="M44 300 h150 a10 10 0 0 0 0 20 v12 a10 10 0 0 0 0 20 h-150 a10 10 0 0 0 0 -20 v-12 a10 10 0 0 0 0 -20 z" fill="#FDE047" />
        <line x1="150" y1="304" x2="150" y2="348" stroke="#A16207" strokeWidth="2" strokeDasharray="4 4" />
        <text x="58" y="324" fontSize="12" fontWeight="900" fill="#713F12" fontFamily="system-ui, sans-serif" letterSpacing="1.5">
          ADMIT
        </text>
        <text x="58" y="341" fontSize="12" fontWeight="900" fill="#713F12" fontFamily="system-ui, sans-serif" letterSpacing="1.5">
          ONE
        </text>
        <circle cx="172" cy="326" r="8" fill="#DB2777" />
      </g>
      {/* Confetti */}
      {[
        [330, 352, '#F472B6'],
        [372, 342, '#7C3AED'],
        [404, 360, '#34D399'],
        [300, 366, '#FB923C'],
      ].map(([x, y, c], i) => (
        <rect
          key={i}
          x={x as number}
          y={y as number}
          width="10"
          height="5"
          rx="2"
          fill={c as string}
          transform={`rotate(${i * 35} ${x} ${y})`}
        />
      ))}
    </>
  )
}

const RealEstateScene = ({ id }: { id: string }) => (
  <>
    <defs>
      <linearGradient id={`${id}-block`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" />
        <stop offset="1" stopColor="#E2E8F0" />
      </linearGradient>
    </defs>
    {/* Sun / moon */}
    <circle cx="98" cy="54" r="26" fill="#FDE68A" opacity=".9" />
    {/* Back block */}
    <rect x="60" y="92" width="118" height="234" rx="8" fill="#fff" opacity=".25" />
    {/* Apartment block */}
    <rect x="150" y="56" width="150" height="270" rx="10" fill={`url(#${id}-block)`} />
    <rect x="150" y="56" width="150" height="18" rx="9" fill="#CBD5E1" />
    {Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 3 }, (_, col) => {
        const lit = (row * 3 + col) % 4 === 1 || (row + col) % 5 === 0
        return (
          <rect
            key={`${row}-${col}`}
            x={168 + col * 44}
            y={88 + row * 36}
            width="26"
            height="22"
            rx="4"
            fill={lit ? '#FDE68A' : '#94A3B8'}
            opacity={lit ? 1 : 0.55}
          />
        )
      })
    )}
    <rect x="210" y="290" width="30" height="36" rx="4" fill="#0F766E" />
    {/* House */}
    <path d="M300 214 l62 -50 62 50 z" fill="#0F766E" />
    <rect x="314" y="212" width="96" height="114" rx="6" fill="#fff" />
    <rect x="330" y="232" width="26" height="24" rx="4" fill="#FDE68A" />
    <rect x="368" y="232" width="26" height="24" rx="4" fill="#94A3B8" opacity=".55" />
    <rect x="348" y="276" width="28" height="50" rx="4" fill="#115E59" />
    {/* Tree */}
    <rect x="102" y="270" width="10" height="56" rx="4" fill="#115E59" />
    <circle cx="107" cy="256" r="30" fill="#34D399" />
    <circle cx="90" cy="268" r="20" fill="#10B981" />
    {/* Ground */}
    <rect x="20" y="322" width="440" height="64" rx="22" fill="#fff" />
    {/* For rent sign */}
    <rect x="432" y="268" width="6" height="58" rx="3" fill="#115E59" />
    <rect x="386" y="262" width="74" height="30" rx="6" fill="#F59E0B" />
    <text x="396" y="282" fontSize="11" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif" letterSpacing="1">
      FOR RENT
    </text>
    {/* Key with tag */}
    <g transform="rotate(-18 120 352)">
      <circle cx="70" cy="352" r="16" fill="none" stroke="#F59E0B" strokeWidth="8" />
      <rect x="84" y="348" width="76" height="9" rx="4" fill="#F59E0B" />
      <rect x="140" y="356" width="8" height="12" rx="2" fill="#F59E0B" />
      <rect x="152" y="356" width="8" height="9" rx="2" fill="#F59E0B" />
    </g>
    <g transform="rotate(8 196 352)">
      <rect x="172" y="336" width="58" height="28" rx="6" fill="#ECFEFF" stroke="#0D9488" strokeWidth="2" />
      <text x="181" y="355" fontSize="12" fontWeight="800" fill="#0F766E" fontFamily="system-ui, sans-serif">
        Unit 4B
      </text>
    </g>
  </>
)

// Every module side by side, for the main site where the business isn't known.
const AllScene = () => {
  const tiles: [AuthModule, number, number][] = [
    ['retail', 70, 70],
    ['eatery', 250, 70],
    ['amusement', 70, 220],
    ['real-estate', 250, 220],
  ]
  return (
    <>
      {tiles.map(([m, x, y]) => {
        const spec = MODULES[m]
        return (
          <g key={m}>
            <rect x={x} y={y} width="160" height="130" rx="22" fill="#fff" opacity=".14" />
            <rect x={x + 18} y={y + 18} width="48" height="48" rx="14" fill={spec.color} />
            <foreignObject x={x + 30} y={y + 30} width="24" height="24">
              <spec.icon color="#fff" size={24} strokeWidth={1.8} />
            </foreignObject>
            <text x={x + 18} y={y + 96} fontSize="15" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
              {spec.label}
            </text>
            <rect x={x + 18} y={y + 106} width="70" height="6" rx="3" fill="#fff" opacity=".45" />
          </g>
        )
      })}
    </>
  )
}

const SCENES: Record<AuthModule, React.FC<{ id: string }>> = {
  retail: RetailScene,
  eatery: EateryScene,
  amusement: AmusementScene,
  'real-estate': RealEstateScene,
  all: AllScene,
}

// The tall panel beside the form (larger screens).
export const ModulePanel = ({ module, className }: { module: AuthModule; className?: string }) => {
  const id = useId().replace(/:/g, '')
  const spec = MODULES[module]
  const Scene = SCENES[module]
  return (
    <div
      className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-[28px] p-10 text-white', className)}
      style={{ backgroundImage: `linear-gradient(150deg, ${spec.from} 0%, ${spec.via} 55%, ${spec.to} 100%)` }}
    >
      {/* Soft light and a fine dot grid */}
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-black/20 blur-3xl" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        aria-hidden
      />

      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
          <spec.icon className="h-5 w-5" strokeWidth={1.9} />
        </span>
        <span className="text-sm font-bold uppercase tracking-[0.18em] text-white/85">{spec.label}</span>
      </div>

      <div className="relative flex flex-1 items-center justify-center py-6">
        <div className="relative w-full max-w-[520px]">
          <svg viewBox="0 0 480 400" className="h-auto w-full drop-shadow-[0_24px_40px_rgba(0,0,0,0.25)]" role="img" aria-hidden>
            <Scene id={id} />
          </svg>
          {/* A glimpse of the product */}
          {spec.chip && (
            <div
              className="absolute -right-2 hidden rounded-2xl bg-white/95 px-4 py-3 text-stone-900 shadow-xl lg:block"
              style={{ top: spec.chip.top }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{spec.chip.title}</p>
              <p className="mt-0.5 flex items-center gap-2 text-sm font-extrabold">
                <span className="h-2 w-2 rounded-full" style={{ background: spec.chip.tone }} aria-hidden />
                {spec.chip.value}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-black leading-tight tracking-tight xl:text-4xl">{spec.headline}</h2>
        <p className="mt-3 text-base text-white/80">{spec.sub}</p>
      </div>
    </div>
  )
}

// Small strip above the form on phones, where the panel is hidden.
export const ModuleStrip = ({ module }: { module: AuthModule }) => {
  const spec = MODULES[module]
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-white md:hidden"
      style={{ backgroundImage: `linear-gradient(120deg, ${spec.from}, ${spec.via} 60%, ${spec.to})` }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
        <spec.icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold uppercase tracking-[0.16em] text-white/80">{spec.label}</span>
        <span className="block truncate text-sm font-semibold">{spec.headline}</span>
      </span>
    </div>
  )
}

export const PoweredBySellix = ({ className }: { className?: string }) => (
  <p className={cn('inline-flex items-center gap-2 text-xs font-medium text-stone-400', className)}>
    Powered by <SellixLogo size={20} />
  </p>
)
