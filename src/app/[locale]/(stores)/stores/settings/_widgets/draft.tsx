'use client'

// Shared by Store settings and Payment: an editable copy of the settings,
// saved together, plus the note that they live on this device for now.

import React, { useEffect, useState } from 'react'
import { CheckCircle2, MonitorSmartphone, Save } from 'lucide-react'
import { Button } from '@/components/kit/ui'
import { settingsProblems, useStoreSettings, type StoreSettings } from '@/lib/store/settings'

export const useSettingsDraft = () => {
  const { settings, save, loaded } = useStoreSettings()
  const [draft, setDraft] = useState<StoreSettings>(settings)
  const [saved, setSaved] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (loaded) setDraft(settings)
  }, [loaded, settings])

  const update = <K extends keyof StoreSettings>(section: K, patch: Partial<StoreSettings[K]>) => {
    setDraft((d) => ({ ...d, [section]: { ...d[section], ...patch } }))
    setSaved(false)
  }
  const problems = settingsProblems(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings)
  const submit = () => {
    setTried(true)
    if (Object.keys(problems).length) return
    save(draft)
    setSaved(true)
  }
  return { draft, update, problems: tried ? problems : {}, dirty, saved, submit, loaded }
}

export const DeviceNote = () => (
  <p className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900">
    <MonitorSmartphone className="h-4 w-4 flex-shrink-0 text-sky-600" />
    These settings are saved on this device for now. Set them once on each till until they sync to all your devices.
  </p>
)

export const SaveBar = ({ dirty, saved, onSave, error }: { dirty: boolean; saved: boolean; onSave: () => void; error?: string }) => (
  <div className="sticky bottom-0 z-10 -mx-3 md:-mx-4 mt-6 flex items-center justify-end gap-3 border-t border-stone-200 bg-white/95 px-3 md:px-4 py-3 backdrop-blur">
    {error ? (
      <p role="alert" className="mr-auto text-sm font-semibold text-rose-600">
        {error}
      </p>
    ) : saved && !dirty ? (
      <p role="status" className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Saved
      </p>
    ) : dirty ? (
      <p className="mr-auto text-sm text-stone-500">You have unsaved changes</p>
    ) : null}
    <Button icon={Save} onClick={onSave} disabled={!dirty}>
      Save changes
    </Button>
  </div>
)
