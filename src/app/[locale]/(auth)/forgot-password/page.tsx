'use client'

// Owner "forgot password": a code by email, then a new password
// (BACKEND_REQUIREMENTS §10.3). Staff ask the owner or a manager instead —
// they reset it from Team.

import React, { useState } from 'react'
import Link from 'next/link'
import axios from 'axios'
import { useParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import { Button } from '@/components/kit/ui'
import { Field, Input } from '@/components/kit/form'
import { PasswordField } from '@/components/account/password-field'
import { AccountServices, PASSWORD_MIN, passwordProblems, resetError } from '@/lib/account'

const api = axios.create({ baseURL: process.env.NEXT_PUBLIC_API_URL })

type Step = 'email' | 'code' | 'done'

export default function ForgotPasswordPage() {
  const locale = (useParams()?.locale as string) || 'en'
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState({ next: '', confirm: '' })
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const problems = passwordProblems(pw, false)
  const codeOk = /^\d{6}$/.test(code.trim())

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setTried(true)
    setError(null)
    if (!emailOk) return
    setBusy(true)
    try {
      await api(AccountServices.SendResetCode(email.trim()))
      setStep('code')
      setTried(false)
    } catch (err) {
      setError(resetError(err))
    } finally {
      setBusy(false)
    }
  }

  const reset = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
    setError(null)
    if (!codeOk || Object.keys(problems).length) return
    setBusy(true)
    try {
      await api(AccountServices.ResetPassword(email.trim(), code.trim(), pw.next))
      setStep('done')
    } catch (err) {
      setError(resetError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-svh flex items-center justify-center px-4 py-10 bg-stone-50">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-extrabold text-stone-900">
          {step === 'done' ? 'Password changed' : step === 'code' ? 'Check your email' : 'Forgot your password?'}
        </h1>

        {step === 'email' && (
          <form onSubmit={sendCode} noValidate className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-stone-600">Enter the email you sign in with. We’ll send you a 6-digit code to set a new password.</p>
            <Field label="Email" htmlFor="fp-email" error={tried && !emailOk ? 'Enter a valid email' : undefined}>
              <Input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" icon={Mail} loading={busy}>
              Send code
            </Button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={reset} noValidate className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-stone-600">
              If <b>{email.trim()}</b> has an account, a code is on its way. It expires in 15 minutes.
            </p>
            <Field label="6-digit code" htmlFor="fp-code" error={tried && !codeOk ? 'Enter the 6 digits from the email' : undefined}>
              <Input
                id="fp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="tracking-[0.4em] font-bold"
              />
            </Field>
            <PasswordField
              id="fp-new"
              label="New password"
              hint={`At least ${PASSWORD_MIN} characters, with letters and a number`}
              value={pw.next}
              onChange={(v) => setPw((p) => ({ ...p, next: v }))}
              error={tried ? problems.next : undefined}
              autoComplete="new-password"
            />
            <PasswordField
              id="fp-confirm"
              label="Confirm new password"
              value={pw.confirm}
              onChange={(v) => setPw((p) => ({ ...p, confirm: v }))}
              error={tried ? problems.confirm : undefined}
              autoComplete="new-password"
            />
            {error && (
              <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy}>
              Set new password
            </Button>
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={busy}
              className="self-start text-sm font-semibold text-endeavour hover:underline disabled:opacity-50"
            >
              Send a new code
            </button>
          </form>
        )}

        {step === 'done' && (
          <div role="status" className="mt-4 flex flex-col gap-4">
            <p className="flex items-start gap-2 text-sm text-stone-700">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" /> Your password has been changed. Sign in with the new one.
            </p>
            <Link
              href={`/${locale}`}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-endeavour px-4 text-sm font-semibold text-white"
            >
              Go to sign in
            </Link>
          </div>
        )}

        <div className="mt-6 border-t border-stone-100 pt-4 flex flex-col gap-2 text-sm">
          {step !== 'done' && (
            <Link href={`/${locale}`} className="inline-flex items-center gap-1.5 font-semibold text-endeavour hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          )}
          <p className="text-stone-500">Staff member? Ask the owner or a manager to reset your password from Team.</p>
        </div>
      </div>
    </main>
  )
}
