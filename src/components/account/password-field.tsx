'use client'

import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Field, Input } from '@/components/kit/form'

// A password input with a show/hide toggle, as a labelled kit Field.
export const PasswordField = ({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  hint?: string
  autoComplete: 'current-password' | 'new-password'
}) => {
  const [shown, setShown] = useState(false)
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={!!error}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-9 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
        >
          {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  )
}
