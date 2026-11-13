'use client'

import * as z from 'zod'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useParams } from 'next/navigation'
import { getSession, signIn } from 'next-auth/react'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import InputsTemplate from '@/components/templates/inputs'
import { logoutReasonFromSearch } from '@/lib/force-logout'
import { redirectPathForAppType } from '@/lib/tenant'

const formSchema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormType = z.infer<typeof formSchema>

export default function StaffSignInForm() {
  const router = useRouter()
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  const [error, setError] = useState('')
  // Why the user was signed out (e.g. tenant-bound tokens after an update).
  // Read from window instead of useSearchParams to keep the page statically renderable.
  const [notice, setNotice] = useState<string | null>(null)
  useEffect(() => setNotice(logoutReasonFromSearch(window.location.search)), [])
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormType>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: FormType) => {
    setError('')
    setIsLoading(true)
    try {
      const result = await signIn('employee-credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      })
      if (result?.error) {
        setError('Invalid email or password')
      } else {
        // appType comes from the tenant lookup at login. Retail staff start at
        // the POS (middleware redirects to the first allowed route if blocked).
        const session = await getSession()
        const appType = session?.user?.appType ?? 'retail'
        router.push(appType === 'retail' ? `/${locale}/stores/pos` : redirectPathForAppType(appType, locale))
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    // Laid out by AuthShell (the module's picture and "Powered by Sellix").
    <div className="grid items-center gap-1.5 w-full">
      <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Staff sign-in</h1>
      <p className="bytewave-paragraph text-gray-400 mb-4">Sign in with your staff credentials</p>

      {notice && !error && (
        <p className="text-center bytewave-paragraph text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">
          {notice}
        </p>
      )}
      {error && <p className="text-center bytewave-sub-heading text-red-500 font-mulish-regular italic mb-2">{error}</p>}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <InputsTemplate control={form.control} name="email" label="Email" placeholder="Enter your email" inputType="email" />
          <InputsTemplate
            control={form.control}
            isPassword
            name="password"
            label="Password"
            parentClassname="mt-4"
            placeholder="••••••••"
          />
          <p className="bytewave-paragraph text-xs text-gray-400 mt-3">
            Forgot your password? Ask the owner or a manager to reset it for you from Team.
          </p>
          <Button
            type="submit"
            disabled={isLoading}
            className="bg-endeavour text-white text-xs w-full mt-4 hover:bg-veniceBlue h-9 disabled:opacity-60"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Form>

      <p className="text-center bytewave-paragraph text-gray-400 mt-6">
        Store owner?{' '}
        <Link href={`/${locale}`} className="text-endeavour hover:underline">
          Admin login
        </Link>
      </p>
    </div>
  )
}
