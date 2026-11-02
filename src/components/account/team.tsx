'use client'

// Team — the business's staff accounts, the same page in every module.
// Permissions are shown in the module's own words (lib/staff-roles.ts).

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Ban, KeyRound, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, Users, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SheetTemplate } from '@/components/templates/sheet'
import { Button, Card, CopyButton, EmptyState, PageHeader, Skeleton } from '@/components/kit/ui'
import { ConfirmDialog, Drawer, Field, Input } from '@/components/kit/form'
import { Avatar } from '@/components/kit/ui'
import { useFetchData } from '@/hooks/use-fetch'
import { useAxios } from '@/hooks/use-axios'
import { IGeneric } from '@/types/interfaces'
import { matchingPreset, staffModule } from '@/lib/staff-roles'
import { canAddStaff, staffLimit } from '@/lib/subscription/access'
import { useBilling } from '@/lib/subscription/client'
import {
  EmployeeServices,
  generatePassword,
  isSuspended,
  matchesSearch,
  passwordProblems,
  TeamServices,
  type TeamMember,
} from '@/lib/account'
import EmployeeForm from './employee-form'

type Staff = ReturnType<typeof staffModule>

// Shaped like an API error so the dialogs show its message.
const serverIgnored = (what: string) => ({
  response: { data: { error: `${what} isn’t switched on yet on the server. Ask Bytewave support to enable it.` } },
})

const MemberCard = ({
  m,
  staff,
  isSelf,
  onEdit,
  onReset,
  onToggle,
  onRemove,
}: {
  m: TeamMember
  staff: Staff
  isSelf: boolean
  onEdit: () => void
  onReset: () => void
  onToggle: () => void
  onRemove: () => void
}) => {
  const suspended = isSuspended(m)
  const granted = staff.permissions.filter((p) => m[p.key])
  const role = matchingPreset(staff, m as any)?.label ?? (granted.length ? 'Custom' : 'No access')
  return (
    <Card className={cn('p-4 flex flex-col gap-3', suspended && 'bg-stone-50')}>
      <div className="flex items-start gap-3">
        <Avatar name={m.name || m.email} />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-bold truncate', suspended ? 'text-stone-500' : 'text-stone-900')}>
            {m.name}
            {isSelf && <span className="ml-1.5 text-[11px] font-semibold text-stone-400">(you)</span>}
          </p>
          <p className="text-xs text-stone-500 truncate">{m.email}</p>
          {m.phone && <p className="text-xs text-stone-400 truncate">{m.phone}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="rounded-full bg-endeavour/10 px-2 py-0.5 text-[11px] font-bold text-endeavour">{role}</span>
          {suspended && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-inset ring-rose-200">
              Suspended
            </span>
          )}
        </div>
      </div>

      <ul className="flex flex-wrap gap-1" aria-label={`${m.name}'s permissions`}>
        {granted.length ? (
          granted.map((p) => (
            <li key={p.key} className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', p.color)}>
              {p.label}
            </li>
          ))
        ) : (
          <li className="text-xs italic text-stone-400">No permissions yet</li>
        )}
      </ul>

      <div className="flex flex-wrap gap-1 border-t border-stone-100 pt-2 -mb-1">
        <Button variant="ghost" size="sm" icon={Pencil} onClick={onEdit} aria-label={`Edit ${m.name}`}>
          Edit
        </Button>
        <Button variant="ghost" size="sm" icon={KeyRound} onClick={onReset} aria-label={`Reset ${m.name}'s password`}>
          Reset password
        </Button>
        {!isSelf && (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={suspended ? RotateCcw : Ban}
              onClick={onToggle}
              aria-label={`${suspended ? 'Reactivate' : 'Suspend'} ${m.name}`}
            >
              {suspended ? 'Reactivate' : 'Suspend'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={onRemove}
              aria-label={`Remove ${m.name}`}
              className="text-rose-600 hover:bg-rose-50 ml-auto"
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </Card>
  )
}

// Set a new password for someone; shown once so it can be passed on.
const ResetPasswordDrawer = ({ member, onClose }: { member: TeamMember | null; onClose: () => void }) => {
  const request = useAxios()
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<{ message: string } | null>(null)
  const [done, setDone] = useState(false)
  const [lastId, setLastId] = useState<number | null>(null)

  // A fresh suggestion each time the drawer opens for someone.
  if (member && member.id !== lastId) {
    setLastId(member.id)
    setPassword(generatePassword())
    setDone(false)
    setError(null)
  }

  const problem = passwordProblems({ next: password, confirm: password }, false).next

  const save = async () => {
    if (!member || problem) return
    setSaving(true)
    setError(null)
    try {
      await request(TeamServices.ResetPassword(member.id, password))
      setDone(true)
    } catch (err: any) {
      setError({ message: err?.response?.data?.error ?? err?.response?.data?.message ?? 'Couldn’t reset the password. Try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={!!member}
      onOpenChange={(o) => !o && onClose()}
      title={member ? `Reset ${member.name}'s password` : 'Reset password'}
      description="They’ll need the new password next time they sign in."
      error={error}
      footer={
        done ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button icon={KeyRound} loading={saving} disabled={!!problem} onClick={() => void save()}>
              Set new password
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div role="status" className="flex flex-col gap-3">
          <p className="text-sm text-stone-700">
            Password changed. Give it to {member?.name} privately — they can change it in <b>My account</b> once signed in.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
            <code className="flex-1 text-base font-bold tracking-wide text-stone-900">{password}</code>
            <CopyButton value={password} label="Copy password" />
          </div>
          <p className="text-xs text-stone-500">Sign-in email: {member?.email}</p>
        </div>
      ) : (
        <Field label="New password" htmlFor="reset-pw" error={problem}>
          <div className="flex gap-2">
            <Input
              id="reset-pw"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              spellCheck={false}
            />
            <Button variant="secondary" icon={Wand2} onClick={() => setPassword(generatePassword())} aria-label="Suggest another password">
              New
            </Button>
          </div>
        </Field>
      )}
    </Drawer>
  )
}

export const Team = () => {
  const request = useAxios()
  const { data: session } = useSession()
  const appType = session?.user?.appType
  const staff = staffModule(appType)
  const selfId = session?.user?.accountType === 'employee' ? Number(session.user.userId) : null

  const { data, isLoading, refetch } = useFetchData('employees', EmployeeServices.FetchAll({ limit: 500 }) as unknown as IGeneric)
  const members = ((data as TeamMember[] | undefined) ?? []).slice()
  const [query, setQuery] = useState('')
  const shown = useMemo(
    () =>
      members
        .filter((m) => matchesSearch(m, query))
        .sort((a, b) => Number(isSuspended(a)) - Number(isSuspended(b)) || (a.name ?? '').localeCompare(b.name ?? '')),
    [members, query]
  )

  const [form, setForm] = useState<{ open: boolean; member: TeamMember | null }>({ open: false, member: null })
  const [resetting, setResetting] = useState<TeamMember | null>(null)
  const [toggling, setToggling] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const { access, isOwner } = useBilling()
  const seatLimit = staffLimit(access)
  const seatsFull = !isLoading && !canAddStaff(access, members.length)
  const activeCount = members.filter((m) => !isSuspended(m)).length

  const toggle = async (m: TeamMember) => {
    const next = isSuspended(m) ? 'active' : 'suspended'
    const res = await request(TeamServices.SetStatus(m.id, next))
    const saved = res?.data?.data?.status
    if (saved !== undefined && saved !== next) throw serverIgnored(next === 'suspended' ? 'Suspending staff' : 'Reactivating staff')
    await refetch()
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        eyebrow="Account"
        title="Team"
        description="Who can sign in to your business, and what each person can do."
        actions={
          <Button icon={Plus} disabled={seatsFull} onClick={() => setForm({ open: true, member: null })}>
            Add staff
          </Button>
        }
      />

      {seatsFull && (
        <div
          role="status"
          className="mb-4 flex flex-col sm:flex-row sm:items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <span className="flex-1">
            All {seatLimit} staff seats on the {access.plan?.name} plan are in use (suspended staff count too).{' '}
            {isOwner ? 'Remove someone or upgrade to add more people.' : 'Ask the owner to upgrade to add more people.'}
          </span>
          {isOwner && (
            <Link href="/en/billing" className="font-semibold hover:underline whitespace-nowrap">
              See plans
            </Link>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-stone-600 flex items-center gap-2">
          <Users className="h-4 w-4 text-stone-400" />
          {isLoading
            ? 'Loading…'
            : `${activeCount} active${members.length > activeCount ? ` · ${members.length - activeCount} suspended` : ''}`}
          {seatLimit !== null && !isLoading && (
            <span className="text-stone-400">
              · {members.length} of {seatLimit} seats
            </span>
          )}
        </p>
        {members.length > 4 && (
          <div className="relative sm:ml-auto sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              aria-label="Search staff"
              placeholder="Search by name, email or phone"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No staff yet"
          description="Add the people who work with you. Each gets their own sign-in and only the access you give them."
          action={
            <Button icon={Plus} disabled={seatsFull} onClick={() => setForm({ open: true, member: null })}>
              Add your first staff member
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone-500">No one matches “{query}”.</p>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((m) => (
            <MemberCard
              key={m.id}
              m={m}
              staff={staff}
              isSelf={m.id === selfId}
              onEdit={() => setForm({ open: true, member: m })}
              onReset={() => setResetting(m)}
              onToggle={() => setToggling(m)}
              onRemove={() => setRemoving(m)}
            />
          ))}
        </div>
      )}

      <SheetTemplate
        open={form.open}
        handleOpen={() => setForm((f) => ({ ...f, open: true }))}
        handleClose={() => setForm({ open: false, member: null })}
        title={form.member ? `Edit ${form.member.name}` : 'Add staff'}
        contentBodyClassName="flex flex-col"
        contentClassName="md:min-w-[40rem]"
        content={
          <EmployeeForm
            appType={appType}
            mode={form.member ? 'update' : 'create'}
            employeeId={form.member?.id}
            initialData={(form.member as any) ?? undefined}
            onSuccess={() => {
              void refetch()
              setForm({ open: false, member: null })
            }}
          />
        }
      />

      <ResetPasswordDrawer member={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling && isSuspended(toggling) ? `Reactivate ${toggling.name}?` : `Suspend ${toggling?.name}?`}
        description={
          toggling && isSuspended(toggling)
            ? 'They can sign in again with their current password and get back the access they had.'
            : 'They’re signed out straight away and can’t sign in until you reactivate them. Their sales history stays. A suspended account still uses a staff seat.'
        }
        confirmLabel={toggling && isSuspended(toggling) ? 'Reactivate' : 'Suspend'}
        onConfirm={() => (toggling ? toggle(toggling) : undefined)}
      />

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="Their account is deleted and the seat is freed. This can’t be undone — to stop someone signing in for a while, suspend them instead."
        confirmLabel="Remove"
        onConfirm={() =>
          removing
            ? request(EmployeeServices.Delete(removing.id)).then(() => {
                void refetch()
              })
            : undefined
        }
      />
    </div>
  )
}
