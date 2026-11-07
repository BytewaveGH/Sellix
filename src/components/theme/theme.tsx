'use client'

// Light, dark or the device's setting, remembered per browser. Colours come
// from src/lib/theme/palette.ts; this only sets `class="dark"` on <html>.

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ThemeProvider as NextThemes, useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ThemeChoice = 'light' | 'dark' | 'system'

// Customer-facing pages wear the business's own brand (storefront themes,
// landlord sites, the lobby leaderboard), so they always stay light.
const LIGHT_ONLY = /^\/(en|fr)\/(eat|rentals|amusement\/board)(\/|$)/

export const isLightOnly = (pathname: string | null | undefined) => LIGHT_ONLY.test(pathname ?? '')

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="sellix-theme"
      forcedTheme={isLightOnly(pathname) ? 'light' : undefined}
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  )
}

const CHOICES: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

// The saved choice, once known (the server can't know it, so nothing is
// selected on the first render).
export const useThemeChoice = () => {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return {
    choice: mounted ? ((theme as ThemeChoice) ?? 'system') : null,
    resolved: mounted ? (resolvedTheme as 'light' | 'dark' | undefined) : undefined,
    setChoice: (c: ThemeChoice) => setTheme(c),
  }
}

// Three-way switch. `compact` shows icons only (top bar); otherwise labels too.
export const ThemeSwitch = ({ compact, className }: { compact?: boolean; className?: string }) => {
  const { choice, setChoice } = useThemeChoice()
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex rounded-full bg-stone-100 p-1', className)}>
      {CHOICES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          aria-label={compact ? label : undefined}
          title={label}
          onClick={() => setChoice(value)}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-endeavour/40',
            compact ? 'h-7 w-7' : 'h-9 px-3.5 text-xs',
            choice === value ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-400' : 'text-stone-500 hover:text-stone-800'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {!compact && label}
        </button>
      ))}
    </div>
  )
}
