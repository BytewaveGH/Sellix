'use client'

// Store (retail) settings: business details for receipts, POS defaults and
// accepted payment methods.
//
// There's no settings endpoint yet (BACKEND_REQUIREMENTS §11.1), so settings
// are kept in this browser, per business. Each till needs them set once until
// the endpoint ships; the pages say so.

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

export type MomoNetwork = 'mtn' | 'telecel' | 'airteltigo'

export interface StoreSettings {
  business: {
    name: string
    phone: string
    email: string
    address: string
    // e.g. "TIN C0012345678"
    taxId: string
    // Printed at the top of receipts (a small data URL or a link).
    logoUrl?: string
  }
  receipt: {
    footer: string
    showCashier: boolean
    // Print automatically when a sale is recorded at the POS.
    autoPrint: boolean
  }
  pos: {
    defaultWarehouseId: number | null
    defaultCustomerType: 'retail' | 'wholesale'
  }
  payments: {
    cash: boolean
    momo: boolean
    momoNetwork: MomoNetwork
    momoNumber: string
    momoName: string
    // Merchant / till ID for MoMo Pay, if the business has one.
    momoMerchantId: string
  }
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  business: { name: '', phone: '', email: '', address: '', taxId: '' },
  receipt: { footer: 'Thank you for shopping with us!', showCashier: true, autoPrint: false },
  pos: { defaultWarehouseId: null, defaultCustomerType: 'retail' },
  payments: { cash: true, momo: true, momoNetwork: 'mtn', momoNumber: '', momoName: '', momoMerchantId: '' },
}

export const MOMO_NETWORKS: { value: MomoNetwork; label: string }[] = [
  { value: 'mtn', label: 'MTN MoMo' },
  { value: 'telecel', label: 'Telecel Cash' },
  { value: 'airteltigo', label: 'AirtelTigo Money' },
]

const KEY = (tenant: string) => `sellix-store:settings:${tenant || 'default'}`
const CHANGED = 'sellix-store:settings-changed'

// Fills missing fields from defaults, so older saved settings keep working.
export const withDefaults = (raw: unknown): StoreSettings => {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<StoreSettings>
  return {
    business: { ...DEFAULT_STORE_SETTINGS.business, ...r.business },
    receipt: { ...DEFAULT_STORE_SETTINGS.receipt, ...r.receipt },
    pos: { ...DEFAULT_STORE_SETTINGS.pos, ...r.pos },
    payments: { ...DEFAULT_STORE_SETTINGS.payments, ...r.payments },
  }
}

export const readStoreSettings = (tenant: string): StoreSettings => {
  try {
    const raw = localStorage.getItem(KEY(tenant))
    return withDefaults(raw ? JSON.parse(raw) : null)
  } catch {
    return withDefaults(null)
  }
}

export const writeStoreSettings = (tenant: string, s: StoreSettings) => {
  localStorage.setItem(KEY(tenant), JSON.stringify(s))
  window.dispatchEvent(new Event(CHANGED))
}

// Problems that block saving, keyed by a short field path.
export const settingsProblems = (s: StoreSettings) => {
  const p: Record<string, string> = {}
  if (!s.payments.cash && !s.payments.momo) p['payments.methods'] = 'Accept at least one payment method'
  if (s.payments.momo && s.payments.momoNumber && !/^0\d{9}$/.test(s.payments.momoNumber.replace(/\s/g, '')))
    p['payments.momoNumber'] = 'Enter a 10-digit number starting with 0, e.g. 024 123 4567'
  if (s.business.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.business.email)) p['business.email'] = 'Enter a valid email'
  return p
}

export const formatPhone = (n: string) => {
  const d = n.replace(/\D/g, '')
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : n
}

export const useStoreSettings = () => {
  const { data: session } = useSession()
  const tenant = session?.user?.tenant ?? ''
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const load = () => {
      setSettings(readStoreSettings(tenant))
      setLoaded(true)
    }
    load()
    window.addEventListener(CHANGED, load)
    window.addEventListener('storage', load)
    return () => {
      window.removeEventListener(CHANGED, load)
      window.removeEventListener('storage', load)
    }
  }, [tenant])

  const save = useCallback((s: StoreSettings) => writeStoreSettings(tenant, s), [tenant])
  return { settings, save, loaded, tenant }
}
