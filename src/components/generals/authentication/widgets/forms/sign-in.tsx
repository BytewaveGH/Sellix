'use client'

import * as z from 'zod'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useParams } from 'next/navigation'
import { signIn, getSession } from 'next-auth/react'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'
import { UpdateStates } from '@/lib/functions/update-states'
import { classifyHost, redirectPathForAppType } from '@/lib/tenant'
import { decodeBusinessChoice, ownerLoginErrorMessage, type OwnerBusiness } from '@/lib/owner-login'
import { verticalMeta } from '@/lib/verticals'
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react'
import ToastTemplate from '@/components/templates/toast'
import InputsTemplate from '@/components/templates/inputs'
import { CheckboxTemplate } from '@/components/templates/checkbox'
import { logoutReasonFromSearch } from '@/lib/force-logout'

interface PassStateTypes {
  showPassword: 'text' | 'password'
  isLoading: boolean
}

const formSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormType = z.infer<typeof formSchema>

export default function SignInForm() {
  const signInText = useTranslations('Authentication')
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  const [error, setError] = useState('')
  // Why the user was signed out (e.g. tenant-bound tokens after an update).
  // Read from window instead of useSearchParams to keep the page statically renderable.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => setNotice(logoutReasonFromSearch(window.location.search)), [])
  const [states, setStates] = useState<PassStateTypes>({
    showPassword: 'password',
    isLoading: false,
  })

  const form = useForm<FormType>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  // Set when the password matches several of this owner's businesses (409).
  // Email and password stay only in this component's form state.
  const [choices, setChoices] = useState<OwnerBusiness[] | null>(null)
  const [signingInto, setSigningInto] = useState<string | null>(null)
  const [hostSlug, setHostSlug] = useState<string | null>(null)
  useEffect(() => setHostSlug(classifyHost(window.location.host).slug), [])

  const attemptSignIn = async (tenant?: string) => {
    const { email, password } = form.getValues()
    const result = await signIn('credentials', { email, password, ...(tenant ? { tenant } : {}), redirect: false })
    if (result?.error) {
      const businesses = decodeBusinessChoice(result.code)
      if (businesses && !tenant) {
        setChoices(businesses)
        return
      }
      setError(ownerLoginErrorMessage(result.code))
      return
    }
    const session = await getSession()
    router.push(redirectPathForAppType(session?.user?.appType, locale))
  }

  const onSubmit = async () => {
    setError('')
    UpdateStates(setStates, 'isLoading', true)
    try {
      await attemptSignIn()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      UpdateStates(setStates, 'isLoading', false)
    }
  }

  const chooseBusiness = async (slug: string) => {
    setError('')
    setSigningInto(slug)
    try {
      await attemptSignIn(slug)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSigningInto(null)
    }
  }

  const backToForm = () => {
    setChoices(null)
    setError('')
  }

  // The business for the subdomain you're on (if any) goes first.
  const orderedChoices = choices ? [...choices].sort((a, b) => Number(b.slug === hostSlug) - Number(a.slug === hostSlug)) : null

  return (
    // Laid out by AuthShell (the module's picture and "Powered by Sellix").
    <div className="grid items-center gap-1.5 w-full">
      <ToastTemplate position="top-right" />
      <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">{signInText('logIn')}</h1>
      <p className="bytewave-paragraph text-gray-400 mb-4">Welcome back — sign in to your business.</p>
      {notice && !error && (
        <p className="text-center bytewave-paragraph text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-center bytewave-sub-heading text-red-500 font-mulish-regular italic">
          {error}
        </p>
      )}
      {orderedChoices ? (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-base font-bold text-stone-900">Choose a business</p>
            <p className="text-sm text-stone-500 mt-0.5">{form.getValues('email')} signs in to several businesses with this password.</p>
          </div>
          <ul className="flex flex-col gap-2" aria-label="Your businesses">
            {orderedChoices.map((b) => {
              const meta = verticalMeta(b.appType)
              const Icon = meta.icon
              const busy = signingInto === b.slug
              return (
                <li key={b.slug}>
                  <button
                    type="button"
                    onClick={() => void chooseBusiness(b.slug)}
                    disabled={!!signingInto}
                    className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition-colors hover:border-endeavour/50 hover:bg-endeavour/[0.03] disabled:opacity-60"
                  >
                    <span
                      className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                      style={{ background: meta.color }}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-stone-900 truncate">{b.name}</span>
                      <span className="block text-xs text-stone-500 truncate">
                        {meta.label} · {b.slug}
                      </span>
                    </span>
                    {b.slug === hostSlug && (
                      <span className="text-[10px] font-bold uppercase tracking-wide rounded-full bg-endeavour/10 text-endeavour px-2 py-0.5">
                        This site
                      </span>
                    )}
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-endeavour" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-stone-300" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={backToForm}
            className="self-start inline-flex items-center gap-1.5 text-sm font-semibold text-endeavour hover:underline mt-1"
          >
            <ArrowLeft className="h-4 w-4" /> Use a different email or password
          </button>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <InputsTemplate control={form.control} name="email" label="Email" placeholder="Enter your email" />
            <InputsTemplate
              control={form.control}
              isPassword
              name="password"
              inputType={states.showPassword}
              label={`${signInText('password')}`}
              parentClassname="mt-4"
              placeholder="XXXXXXXXX"
            />
            <div className="mt-4 ml-1">
              <CheckboxTemplate
                handleValueChange={(e) => {
                  UpdateStates(setStates, 'showPassword', e ? 'text' : 'password')
                }}
                label={`${signInText('showPassword')}`}
                className=""
              />
            </div>
            <div className="text-right bytewave-paragraph mt-6 hover:cursor-pointer hover:underline text-endeavour">
              <Link href={`/${locale}/forgot-password`}>{`${signInText('forgotPassword')}`}</Link>
            </div>
            <Button
              type="submit"
              disabled={states.isLoading}
              className="bg-endeavour text-white text-xs w-full mt-5 hover:bg-veniceBlue h-9 disabled:opacity-60"
            >
              {states.isLoading ? 'Signing in...' : `${signInText('login')}`}
            </Button>
          </form>
        </Form>
      )}
    </div>
  )
}
