'use client'

// Shared presentation kit — buttons, cards, stat tiles, badges, avatars,
// empty/loading states and a single-series bar chart. Used by the real-estate
// module and the super-admin console so they share one design language.

import React, { useState } from 'react'
import { AlertTriangle, Check, Copy, Loader2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?'

export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}) => (
  <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6">
    <div className="min-w-0">
      {eyebrow && <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-endeavour/80 mb-1.5">{eyebrow}</p>}
      <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-stone-900 leading-tight">{title}</h1>
      {description && <p className="text-sm text-stone-500 mt-1.5 max-w-2xl">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
  </header>
)

export const Card = ({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('bg-white rounded-2xl border border-stone-200/80 shadow-[0_1px_2px_rgba(28,25,23,0.04)]', className)} {...rest}>
    {children}
  </div>
)

export const SectionTitle = ({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) => (
  <div className="flex items-end justify-between gap-3 mb-3">
    <div>
      <h2 className="text-[15px] font-bold text-stone-900">{title}</h2>
      {hint && <p className="text-xs text-stone-500 mt-0.5">{hint}</p>}
    </div>
    {action}
  </div>
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: LucideIcon
  loading?: boolean
}

export const Button = ({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) => (
  <button
    type="button"
    disabled={disabled || loading}
    className={cn(
      'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-endeavour/40 focus-visible:ring-offset-1',
      size === 'sm' ? 'h-9 px-3 text-xs' : 'h-10 px-4 text-sm',
      variant === 'primary' && 'bg-endeavour text-white hover:bg-veniceBlue shadow-sm shadow-endeavour/20',
      variant === 'secondary' && 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300',
      variant === 'ghost' && 'text-stone-600 hover:bg-stone-100',
      variant === 'danger' && 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50',
      className
    )}
    {...rest}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
    {children}
  </button>
)

export const TONES = {
  blue: 'bg-endeavour/10 text-endeavour',
  green: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  stone: 'bg-stone-100 text-stone-600',
} as const

export const StatCard = ({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'blue',
  footer,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  tone?: keyof typeof TONES
  footer?: React.ReactNode
}) => (
  <Card className="p-4 sm:p-5 flex flex-col">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-semibold text-stone-500">{label}</p>
      <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0', TONES[tone])}>
        <Icon className="h-4 w-4" />
      </span>
    </div>
    <p className="text-[26px] font-extrabold tracking-tight text-stone-900 tabular-nums mt-1 leading-none">{value}</p>
    {hint && <p className="text-xs text-stone-500 mt-2">{hint}</p>}
    {footer && <div className="mt-3 pt-3 border-t border-stone-100">{footer}</div>}
  </Card>
)

export type BadgeSpec = { label: string; icon: LucideIcon; className: string; dot: string }

export const Badge = ({ spec, className, label }: { spec: BadgeSpec; className?: string; label?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap',
      spec.className,
      className
    )}
  >
    <spec.icon className="h-3 w-3" />
    {label ?? spec.label}
  </span>
)

export const Ring = ({
  value,
  size = 64,
  stroke = 7,
  children,
}: {
  value: number
  size?: number
  stroke?: number
  children?: React.ReactNode
}) => {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-stone-100" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0865AC"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  )
}

export const AVATAR_TINTS = [
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700',
]

export const Avatar = ({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) => {
  const tint = AVATAR_TINTS[name.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_TINTS.length]
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold flex-shrink-0',
        tint,
        size === 'sm' ? 'h-7 w-7 text-[10px]' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-9 w-9 text-xs'
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}

// Photo if provided, otherwise a calm architectural placeholder.

export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) => (
  <Card className="flex flex-col items-center text-center px-6 py-12 border-dashed">
    <span className="h-12 w-12 rounded-2xl bg-endeavour/10 text-endeavour flex items-center justify-center mb-4">
      <Icon className="h-6 w-6" />
    </span>
    <p className="text-base font-bold text-stone-900">{title}</p>
    {description && <p className="text-sm text-stone-500 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </Card>
)

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-2xl bg-stone-100', className)} />
)

export const LoadingGrid = ({ count = 4, className }: { count?: number; className?: string }) => (
  <div className={cn('grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4', className)}>
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className="h-32" />
    ))}
  </div>
)

export const ErrorNote = ({ message }: { message: string }) => (
  <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 mb-4">
    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
    {message}
  </div>
)

// Single series → no legend; every bar has a hover/focus tooltip and an
// accessible label. `format` renders values (axis + tooltip).
export const BarChart = ({
  data,
  format = (n: number) => n.toLocaleString(),
  height = 160,
  ariaLabel,
}: {
  data: { key: string; label: string; value: number; detail?: string }[]
  format?: (n: number, opts?: { compact?: boolean }) => string
  height?: number
  ariaLabel?: string
}) => {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const nice = (() => {
    const pow = 10 ** Math.floor(Math.log10(max))
    return Math.ceil(max / pow) * pow
  })()
  return (
    <div className="relative" role="img" aria-label={ariaLabel}>
      <div className="relative" style={{ height }}>
        {[0, 0.5, 1].map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-stone-200" style={{ bottom: t * height }}>
            <span className="absolute -top-2.5 left-0 text-[10px] text-stone-400 bg-white pr-1 tabular-nums">
              {format(nice * t, { compact: true })}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 pl-12 flex items-end gap-1.5 sm:gap-3">
          {data.map((d, i) => (
            <div
              key={d.key}
              className="relative flex-1 h-full flex items-end justify-center cursor-default focus:outline-none"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${format(d.value)}`}
            >
              <div
                className={cn('w-full max-w-[40px] rounded-t-[4px] transition-colors', hover === i ? 'bg-veniceBlue' : 'bg-endeavour')}
                style={{ height: `${(d.value / nice) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }}
              />
              {hover === i && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 rounded-lg bg-stone-900 text-white px-2.5 py-1.5 shadow-lg whitespace-nowrap pointer-events-none">
                  <p className="text-[10px] text-white/60">{d.detail ?? d.label}</p>
                  <p className="text-xs font-bold tabular-nums">{format(d.value)}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="pl-12 flex gap-1.5 sm:gap-3 mt-2">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[11px] font-medium text-stone-500 truncate">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export const CopyButton = ({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) => {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          // Clipboard blocked (e.g. insecure context) — nothing to do.
        }
      }}
      aria-label={done ? 'Copied' : label}
      title={done ? 'Copied' : label}
      className={cn(
        'h-7 w-7 rounded-lg inline-flex items-center justify-center text-stone-400 hover:text-endeavour hover:bg-stone-100 transition-colors',
        className
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}
