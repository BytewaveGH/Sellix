'use client'

// Park settings the API has no place for yet: the name on tickets, the price
// of general admission (tickets without an attraction), a line at the foot of
// each ticket, and the prize wheel. Kept per business on this device, like the
// store's settings (lib/store/settings.ts); BACKEND_REQUIREMENTS §14 asks for
// a server copy so every till shares them.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { DEFAULT_PRIZES, type Prize } from './wheel'

export interface ParkSettings {
  parkName: string
  admissionPrice: number
  ticketNote: string
  prizes: Prize[]
}

export const DEFAULT_PARK_SETTINGS: ParkSettings = {
  parkName: '',
  admissionPrice: 0,
  ticketNote: 'Keep this ticket until you leave. Have fun!',
  prizes: DEFAULT_PRIZES,
}

const KEY = (tenant: string) => `sellix-amusement:settings:${tenant || 'default'}`
const CHANGED = 'sellix-amusement:settings-changed'

export const withDefaults = (raw: unknown): ParkSettings => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ParkSettings>
  return {
    parkName: typeof r.parkName === 'string' ? r.parkName : DEFAULT_PARK_SETTINGS.parkName,
    admissionPrice: Number.isFinite(Number(r.admissionPrice)) ? Math.max(0, Number(r.admissionPrice)) : 0,
    ticketNote: typeof r.ticketNote === 'string' ? r.ticketNote : DEFAULT_PARK_SETTINGS.ticketNote,
    prizes: Array.isArray(r.prizes) && r.prizes.length >= 2 ? r.prizes : DEFAULT_PARK_SETTINGS.prizes,
  }
}

export const readParkSettings = (tenant: string): ParkSettings => {
  try {
    const raw = localStorage.getItem(KEY(tenant))
    return withDefaults(raw ? JSON.parse(raw) : null)
  } catch {
    return withDefaults(null)
  }
}

export const useParkSettings = () => {
  const { data: session } = useSession()
  const tenant = session?.user?.tenant ?? ''
  const [settings, setSettings] = useState<ParkSettings>(DEFAULT_PARK_SETTINGS)
  useEffect(() => {
    const load = () => setSettings(readParkSettings(tenant))
    load()
    window.addEventListener(CHANGED, load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener(CHANGED, load)
      window.removeEventListener('storage', load)
    }
  }, [tenant])
  const save = (next: ParkSettings) => {
    try {
      localStorage.setItem(KEY(tenant), JSON.stringify(next))
    } catch {
      // full or blocked: keep it for this session
    }
    setSettings(next)
    window.dispatchEvent(new Event(CHANGED))
  }
  return { settings, save }
}
