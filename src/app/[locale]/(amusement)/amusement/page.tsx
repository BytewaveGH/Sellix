'use client'

// The park today: who's here, what's selling, which rides are running and
// who's coming — at a glance, with the counter, gate and Hall of Fame one tap away.

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { CalendarCheck, DoorOpen, ExternalLink, PartyPopper, ScanLine, Sparkles, Ticket, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react'
import { BarChart, Card, EmptyState, LoadingGrid, Ring, SectionTitle, StatCard } from '@/components/kit/ui'
import { cn } from '@/lib/utils'
import { hourLabel, money, parkDay, trend } from '@/lib/amusement/park'
import { useParkSettings } from '@/lib/amusement/settings'
import { AttractionBadge, STATUS, useAttractions, useBookings, useTickets } from './_components/park'

const greeting = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')

const useNow = (ms = 30_000) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

const QuickAction = ({ href, icon: Icon, label, hint, external }: { href: string; icon: React.ElementType; label: string; hint: string; external?: boolean }) => (
  <Link
    href={href}
    target={external ? '_blank' : undefined}
    className="group flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
  >
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet-700 shadow-sm transition group-hover:scale-105">
      <Icon className="h-5 w-5" />
    </span>
    <span className="min-w-0">
      <span className="flex items-center gap-1 text-sm font-bold text-white">
        {label} {external && <ExternalLink className="h-3 w-3 opacity-70" />}
      </span>
      <span className="block truncate text-xs text-white/70">{hint}</span>
    </span>
  </Link>
)

export default function ParkOverview() {
  const locale = (useParams()?.locale as string) || 'en'
  const { data: session } = useSession()
  const canSell = session?.user?.accountType !== 'employee' || !!(session?.user as { canManageSales?: boolean })?.canManageSales
  const now = useNow()
  const { settings } = useParkSettings()
  const { attractions, isLoading: loadingA } = useAttractions()
  const { tickets, isLoading: loadingT } = useTickets()
  const { bookings } = useBookings()
  const day = useMemo(() => parkDay(tickets, attractions, bookings, now, settings.admissionPrice), [tickets, attractions, bookings, now, settings.admissionPrice])
  const change = trend(day.sold, day.soldYesterdaySoFar)
  const loading = (loadingA && !attractions.length) || (loadingT && !tickets.length)
  const peopleByRide = new Map(day.byAttraction.map((a) => [a.id, a.people]))

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* Hero */}
      <section
        className="relative mb-6 overflow-hidden rounded-3xl p-6 text-white sm:p-8"
        style={{ backgroundImage: 'linear-gradient(135deg, #2E1065 0%, #6D28D9 55%, #DB2777 100%)' }}
      >
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          aria-hidden
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
              {now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              {greeting(now.getHours())}
              {settings.parkName ? `, ${settings.parkName}` : ''}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/80">
              {day.sold > 0
                ? `${day.sold.toLocaleString()} guest${day.sold === 1 ? '' : 's'} so far today — ${day.status.active} ride${day.status.active === 1 ? '' : 's'} running.`
                : 'No tickets yet today. The counter is ready when you are.'}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:w-[560px]">
            {canSell && <QuickAction href={`/${locale}/amusement/counter`} icon={Ticket} label="Sell tickets" hint="The ticket counter" />}
            {canSell && <QuickAction href={`/${locale}/amusement/gate`} icon={ScanLine} label="Gate check-in" hint="Scan tickets at the entrance" />}
            {canSell && <QuickAction href={`/${locale}/amusement/wheel`} icon={PartyPopper} label="Prize wheel" hint="Spin to win, for promos" />}
            <QuickAction href={`/${locale}/amusement/board`} icon={Sparkles} label="Hall of Fame" hint="For the lobby screen" external />
          </div>
        </div>
      </section>

      {loading ? (
        <LoadingGrid count={4} />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Guests today"
              value={day.sold.toLocaleString()}
              icon={Users}
              tone="blue"
              hint={
                change === null ? (
                  'Tickets sold today'
                ) : (
                  <span className={cn('inline-flex items-center gap-1 font-semibold', change >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                    {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {Math.abs(change) > 100
                      ? `${day.sold - day.soldYesterdaySoFar >= 0 ? '+' : '−'}${Math.abs(day.sold - day.soldYesterdaySoFar)} guests on yesterday by now`
                      : `${change >= 0 ? '+' : ''}${change}% on yesterday by now`}
                  </span>
                )
              }
            />
            <Card className="flex items-center gap-4 p-4 sm:p-5">
              <Ring value={day.sold ? day.admitted / day.sold : 0} size={68}>
                <span className="text-sm font-extrabold tabular-nums text-stone-900">{day.sold ? Math.round((day.admitted / day.sold) * 100) : 0}%</span>
              </Ring>
              <div>
                <p className="text-xs font-semibold text-stone-500">Through the gate</p>
                <p className="text-[26px] font-extrabold leading-none tracking-tight text-stone-900 tabular-nums">{day.admitted.toLocaleString()}</p>
                <p className="mt-1.5 text-xs text-stone-500">of {day.sold.toLocaleString()} with tickets</p>
              </div>
            </Card>
            <StatCard
              label="Takings today"
              value={money(day.takings)}
              icon={Wallet}
              tone="green"
              hint={settings.admissionPrice ? 'At today’s ticket prices' : 'At ride prices · set general admission on the counter'}
            />
            <StatCard
              label="Group visits today"
              value={day.bookingsToday.length.toLocaleString()}
              icon={CalendarCheck}
              tone="amber"
              hint={day.guestsBookedToday ? `${day.guestsBookedToday} guests booked` : 'No groups booked for today'}
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <SectionTitle title="Tickets sold, hour by hour" hint="Guests per hour today" />
              {day.sold ? (
                <BarChart
                  data={day.hourly.map((h) => ({ key: String(h.hour), label: hourLabel(h.hour), value: h.people, detail: `${hourLabel(h.hour)} – ${hourLabel((h.hour + 1) % 24)}` }))}
                  format={(n) => `${Math.round(n)}`}
                  ariaLabel="Guests per hour today"
                />
              ) : (
                <EmptyState icon={Ticket} title="No sales yet today" description="Sales show here hour by hour as the counter sells tickets." />
              )}
            </Card>
            <Card className="p-5">
              <SectionTitle title="Most popular today" hint="Guests per attraction" />
              {day.byAttraction.length ? (
                <ul className="flex flex-col gap-3">
                  {day.byAttraction.slice(0, 6).map((a) => (
                    <li key={a.id ?? 'general'} className="flex items-center gap-3">
                      <AttractionBadge type={a.type} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-stone-800">{a.name}</p>
                          <p className="text-sm font-bold tabular-nums text-stone-900">{a.people}</p>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${(a.people / day.byAttraction[0].people) * 100}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-stone-500">Nothing sold yet.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <SectionTitle
                title="Ride status"
                hint={`${day.status.active} open · ${day.status.maintenance} in maintenance · ${day.status.closed} closed`}
                action={
                  <Link href={`/${locale}/amusement/attractions`} className="text-xs font-semibold text-violet-700 hover:underline">
                    Manage
                  </Link>
                }
              />
              {attractions.length ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {attractions.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl border border-stone-100 p-3">
                      <AttractionBadge type={a.type} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-800">{a.name}</p>
                        <p className="flex items-center gap-1.5 text-xs text-stone-500">
                          <span className={cn('h-2 w-2 rounded-full', STATUS[a.status]?.dot ?? 'bg-stone-300')} aria-hidden />
                          {STATUS[a.status]?.label ?? a.status} · {peopleByRide.get(a.id) ?? 0} today
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="No attractions yet"
                  description="Add your rides and games to start selling tickets for them."
                />
              )}
            </Card>
            <Card className="p-5">
              <SectionTitle title="Coming up" hint="Group visits today and this week" />
              {day.bookingsToday.length + day.upcoming.length ? (
                <ul className="flex flex-col divide-y divide-stone-100">
                  {[...day.bookingsToday, ...day.upcoming].slice(0, 6).map((b) => {
                    const ride = attractions.find((a) => a.id === b.attractionId)
                    const isToday = day.bookingsToday.includes(b)
                    return (
                      <li key={b.id} className="flex items-center gap-3 py-2.5">
                        <span
                          className={cn(
                            'flex h-11 w-11 flex-shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none',
                            isToday ? 'bg-violet-600 text-white' : 'bg-violet-50 text-violet-700'
                          )}
                        >
                          <span className="text-[10px] font-bold uppercase">{new Date(b.date).toLocaleDateString(undefined, { month: 'short' })}</span>
                          <span className="text-base font-black">{new Date(b.date).getDate()}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-800">{b.customerName}</p>
                          <p className="truncate text-xs text-stone-500">
                            {b.partySize} guests · {ride ? ride.name : 'General visit'}
                            {b.status === 'pending' && <span className="font-semibold text-amber-700"> · to confirm</span>}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="text-sm text-stone-500">No group visits in the next week.</p>
              )}
              <Link
                href={`/${locale}/amusement/bookings`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 hover:underline"
              >
                <DoorOpen className="h-3.5 w-3.5" /> All bookings
              </Link>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
