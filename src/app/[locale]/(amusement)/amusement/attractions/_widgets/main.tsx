'use client'

// Attractions as cards: each ride's colour, price, capacity, today's guests,
// and its status changed in one tap (open / maintenance / closed) — the ticket
// counter stops selling it straight away.

import React, { useState } from 'react'
import { Pencil, Plus, Sparkles, Trash2, Users } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, EmptyState, LoadingGrid, PageHeader } from '@/components/kit/ui'
import { ConfirmDialog } from '@/components/kit/form'
import { SheetTemplate } from '@/components/templates/sheet'
import { useAxios } from '@/hooks/use-axios'
import { apiErrorMessage } from '@/lib/api-error'
import { cn } from '@/lib/utils'
import { money, type Attraction } from '@/lib/amusement/park'
import CreateAttraction from './_forms/create-attraction'
import { AttractionServices } from '../_logics/services'
import { attractionGradient, attractionTypeIcon, attractionTypeLabel } from '../_logics/attraction-types'
import { STATUS, useAttractions, useTickets } from '../../_components/park'

const STATUSES: Attraction['status'][] = ['active', 'maintenance', 'closed']

const Main = () => {
  const request = useAxios()
  const qc = useQueryClient()
  const { attractions, isLoading, refetch } = useAttractions()
  const { tickets } = useTickets()
  const [editing, setEditing] = useState<Attraction | null | 'new'>(null)
  const [removing, setRemoving] = useState<Attraction | null>(null)
  const [error, setError] = useState('')

  const today = new Date().toDateString()
  const guestsToday = (id: number) =>
    tickets.filter((t) => t.attractionId === id && t.createdAt && new Date(t.createdAt).toDateString() === today).reduce((n, t) => n + t.quantity, 0)

  const setStatus = async (a: Attraction, status: Attraction['status']) => {
    if (a.status === status) return
    setError('')
    // Show it at once; put it back if the server says no.
    qc.setQueryData(['attractions'], (old: unknown) => (Array.isArray(old) ? old.map((x: Attraction) => (x.id === a.id ? { ...x, status } : x)) : old))
    try {
      await request(AttractionServices.Update(a.id, { status }))
    } catch (err) {
      setError(`${a.name}: ${apiErrorMessage(err, 'the change wasn’t saved')}`)
      void refetch()
    }
  }

  const remove = async () => {
    if (!removing) return
    try {
      await request(AttractionServices.Delete(removing.id))
      void refetch()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t delete it.'))
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <SheetTemplate
        open={editing !== null}
        handleOpen={() => undefined}
        handleClose={() => setEditing(null)}
        title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'Add an attraction'}
        contentBodyClassName="flex flex-col"
        content={
          <CreateAttraction
            mode={editing && editing !== 'new' ? 'update' : 'create'}
            attractionId={editing && editing !== 'new' ? editing.id : undefined}
            initialData={editing && editing !== 'new' ? (editing as React.ComponentProps<typeof CreateAttraction>['initialData']) : undefined}
            onSuccess={() => {
              void refetch()
              setEditing(null)
            }}
          />
        }
      />

      <PageHeader
        eyebrow="Amusement"
        title="Attractions"
        description="Your rides and games. Change a status in one tap — the ticket counter follows straight away."
        actions={
          <Button icon={Plus} onClick={() => setEditing('new')} className="bg-violet-600 hover:bg-violet-700">
            Add attraction
          </Button>
        }
      />

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {isLoading && !attractions.length ? (
        <LoadingGrid count={6} />
      ) : !attractions.length ? (
        <EmptyState
          icon={Sparkles}
          title="No attractions yet"
          description="Add go-karts, trampolines, an arcade… then sell tickets for them at the counter."
          action={
            <Button icon={Plus} onClick={() => setEditing('new')}>
              Add your first attraction
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {attractions.map((a) => {
            const Icon = attractionTypeIcon(a.type)
            const guests = guestsToday(a.id)
            return (
              <Card key={a.id} className="overflow-hidden">
                <div className="relative h-28 overflow-hidden p-4 text-white" style={{ backgroundImage: attractionGradient(a.type) }}>
                  <Icon className="absolute -bottom-6 -right-4 h-32 w-32 text-white/15" strokeWidth={1.4} aria-hidden />
                  <span className="inline-flex items-center rounded-full bg-black/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                    {attractionTypeLabel(a.type)}
                  </span>
                  <p className="relative mt-2 text-xl font-black leading-tight">{a.name}</p>
                  <span className={cn('absolute right-4 top-4 h-3 w-3 rounded-full ring-2 ring-white', STATUS[a.status]?.dot)} aria-hidden />
                </div>
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-extrabold tabular-nums text-stone-900">{money(a.ticketPrice)}</p>
                      <p className="text-[11px] text-stone-500">per ticket</p>
                    </div>
                    <div>
                      <p className="text-lg font-extrabold tabular-nums text-stone-900">{a.capacity}</p>
                      <p className="text-[11px] text-stone-500">at a time</p>
                    </div>
                    <div>
                      <p className="flex items-center justify-center gap-1 text-lg font-extrabold tabular-nums text-stone-900">
                        <Users className="h-4 w-4 text-stone-400" />
                        {guests}
                      </p>
                      <p className="text-[11px] text-stone-500">today</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1" role="radiogroup" aria-label={`${a.name} status`}>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={a.status === s}
                        onClick={() => void setStatus(a, s)}
                        className={cn(
                          'flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition',
                          a.status === s ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
                        )}
                      >
                        <span className={cn('h-2 w-2 rounded-full', STATUS[s].dot)} aria-hidden />
                        {STATUS[s].label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(a)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(a)} className="text-rose-600 hover:bg-rose-50">
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete ${removing?.name ?? 'this attraction'}?`}
        description="It disappears from the counter and the leaderboard. Tickets already sold keep working."
        confirmLabel="Delete"
        onConfirm={remove}
      />
    </div>
  )
}

export default Main
