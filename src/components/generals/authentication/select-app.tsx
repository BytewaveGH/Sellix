'use client'

import { SellixLogo } from '@/components/brand/sellix-logo'
import * as z from 'zod'
import React, { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useParams } from 'next/navigation'

import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import InputsTemplate from '@/components/templates/inputs'
import ToastTemplate from '@/components/templates/toast'
import { ROOT_DOMAIN, buildTenantUrl, slugify } from '@/lib/tenant'
import { TenantServices } from '@/lib/tenant-services'

const formSchema = z.object({
  appName: z.string().min(1, 'Enter the name of the business you want to reach'),
})

type FormType = z.infer<typeof formSchema>

export default function SelectApp() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'

  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormType>({
    resolver: zodResolver(formSchema),
    defaultValues: { appName: '' },
  })

  const previewSlug = slugify(form.watch('appName') || '')

  const onSubmit = async (data: FormType) => {
    setError('')
    const slug = slugify(data.appName)
    if (!slug) {
      setError('That name has no usable characters — try again')
      return
    }
    setIsLoading(true)
    try {
      const { exists } = await TenantServices.Resolve(slug)
      if (!exists) {
        setError("We couldn't find that business — check the name and try again")
        return
      }
      // Crossing subdomains needs a full navigation, not the Next.js client router.
      window.location.href = buildTenantUrl(slug, `/${locale}`, window.location.protocol.replace(':', ''))
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full px-12 flex justify-center">
      <ToastTemplate position="top-right" />

      <div className="flex flex-col justify-center items-center h-svh py-10 w-full">
        <div className="flex justify-center w-full">
          <h1>
            <SellixLogo size={48} />
          </h1>
        </div>
        <div className="w-full flex justify-center">
          <div className="grid items-center gap-1.5 mt-40 ml-6 w-[500px]">
            <div className="bytewave-heading font-mulish-regular text-gray-700 mb-1">Find your business</div>
            <p className="bytewave-paragraph text-gray-500 mb-3">Enter the name of the business you want to access</p>
            {error && <p className="text-center bytewave-sub-heading text-red-500 font-mulish-regular italic">{error}</p>}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <InputsTemplate control={form.control} name="appName" label="Business name" placeholder="e.g. Acme Retail" autoFocus />
                {previewSlug && (
                  <p className="text-[11px] text-gray-400 pl-1 mt-1.5">
                    You'll land at:{' '}
                    <span className="font-semibold text-stone-600">
                      {previewSlug}.{ROOT_DOMAIN || 'yourdomain.com'}
                    </span>
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-endeavour text-white text-xs w-full mt-5 hover:bg-veniceBlue h-9 disabled:opacity-60"
                >
                  {isLoading ? 'Looking...' : 'Continue'}
                </Button>
              </form>
            </Form>
            <p className="text-center bytewave-paragraph text-gray-400 mt-6">
              Platform admin?{' '}
              <Link href={`/${locale}/super-admin/login`} className="text-endeavour hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
