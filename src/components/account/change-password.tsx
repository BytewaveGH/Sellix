'use client'

import React, { useState } from 'react'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { useAxios } from '@/hooks/use-axios'
import { Button, Card, SectionTitle } from '@/components/kit/ui'
import { AccountServices, changePasswordError, PASSWORD_MIN, passwordProblems, type AccountKind } from '@/lib/account'
import { PasswordField } from './password-field'

const EMPTY = { current: '', next: '', confirm: '' }

export const ChangePassword = ({ kind }: { kind: AccountKind }) => {
  const request = useAxios()
  const [values, setValues] = useState(EMPTY)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const problems = passwordProblems(values, true)
  const set = (k: keyof typeof EMPTY) => (v: string) => {
    setValues((s) => ({ ...s, [k]: v }))
    setDone(false)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (Object.keys(problems).length) return
    setSaving(true)
    try {
      await request(AccountServices.ChangePassword(kind, values.current, values.next))
      setValues(EMPTY)
      setTried(false)
      setDone(true)
    } catch (err) {
      setError(changePasswordError(err, kind))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle title="Change password" hint={`At least ${PASSWORD_MIN} characters, with letters and a number.`} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 max-w-md" aria-label="Change password">
        <PasswordField
          id="pw-current"
          label="Current password"
          value={values.current}
          onChange={set('current')}
          error={tried ? problems.current : undefined}
          autoComplete="current-password"
        />
        <PasswordField
          id="pw-new"
          label="New password"
          value={values.next}
          onChange={set('next')}
          error={tried ? problems.next : undefined}
          autoComplete="new-password"
        />
        <PasswordField
          id="pw-confirm"
          label="Confirm new password"
          value={values.confirm}
          onChange={set('confirm')}
          error={tried ? problems.confirm : undefined}
          autoComplete="new-password"
        />
        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {done && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4" /> Password changed. Use the new one next time you sign in.
          </p>
        )}
        <div>
          <Button type="submit" icon={KeyRound} loading={saving}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  )
}
