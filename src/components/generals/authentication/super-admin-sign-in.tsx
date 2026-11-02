'use client'

import { SellixLogo } from '@/components/brand/sellix-logo'
import * as z from 'zod'
import React, { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Eye, EyeOff } from 'lucide-react'
import { Button as KitButton } from '@/components/kit/ui'
import { Field, Input } from '@/components/kit/form'

const formSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormType = z.infer<typeof formSchema>

export default function SuperAdminSignInForm() {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<FormType>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: FormType) => {
    setError('')
    setIsLoading(true)
    try {
      const result = await signIn('super-admin-credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid email or password')
      } else {
        router.push(`/${locale}/super-admin`)
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const errors = form.formState.errors

  return (
    <div className="min-h-svh grid lg:grid-cols-2 bg-white">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-endeavour via-[#0A5795] to-veniceBlue p-12 text-white">
        <svg className="absolute inset-0 h-full w-full opacity-[0.08]" aria-hidden>
          <defs>
            <pattern id="sa-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0V32" fill="none" stroke="white" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sa-grid)" />
        </svg>
        <div className="relative flex items-center gap-3">
          <SellixLogo size={40} tone="white" />
        </div>
        <div className="relative max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Platform console</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">Every business on Sellix, in one place.</h1>
          <p className="mt-4 text-white/75 leading-relaxed">
            Register apps, manage owners and staff access, and keep an eye on how each business is doing.
          </p>
        </div>
        <p className="relative text-xs text-white/50">Restricted to platform operators.</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <SellixLogo size={36} />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight text-stone-900">Super admin sign in</h2>
          <p className="text-sm text-stone-500 mt-1.5">Manage the businesses running on the platform.</p>

          {error && (
            <div role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4" noValidate>
            <Field label="Email" htmlFor="sa-email" error={errors.email?.message}>
              <Input
                id="sa-email"
                type="email"
                autoComplete="username"
                autoFocus
                placeholder="you@bytewave.dev"
                {...form.register('email')}
              />
            </Field>
            <Field label="Password" htmlFor="sa-password" error={errors.password?.message}>
              <div className="relative">
                <Input
                  id="sa-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-10"
                  {...form.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg flex items-center justify-center text-stone-400 hover:text-stone-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <KitButton type="submit" loading={isLoading} className="w-full h-11 mt-2">
              {isLoading ? 'Signing in…' : 'Sign in'}
            </KitButton>
          </form>
        </div>
      </div>
    </div>
  )
}
