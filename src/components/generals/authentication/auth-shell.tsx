'use client'

// The sign-in layout every module shares: its picture on the left (larger
// screens), the form on the right, and "Powered by Sellix" underneath.

import React from 'react'
import { asAuthModule, ModulePanel, ModuleStrip, PoweredBySellix } from './module-art'

export const AuthShell = ({ appType, children }: { appType?: string | null; children: React.ReactNode }) => {
  const module = asAuthModule(appType)
  return (
    <main className="flex min-h-svh bg-white">
      <aside className="sticky top-0 hidden h-svh p-4 md:block md:w-1/2 lg:w-[55%]">
        <ModulePanel module={module} />
      </aside>
      <section className="flex min-h-svh min-w-0 flex-1 flex-col px-6 sm:px-10">
        <div className="pt-6">
          <ModuleStrip module={module} />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
        <footer className="flex justify-center pb-6">
          <PoweredBySellix />
        </footer>
      </section>
    </main>
  )
}
