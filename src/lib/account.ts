// Account and team rules shared by every module: password checks, the
// requests behind "change password", "forgot password" and staff management,
// and what to tell the user when the server says no.
//
// Owners sign in through the account service (/auth/*), staff through
// /employees/*. See BACKEND_REQUIREMENTS.md §10 for the endpoints still to ship.

import type { AxiosRequestConfig } from 'axios'
import { apiErrorMessage, apiStatus } from './api-error'

export const PASSWORD_MIN = 8

// Problems with a new password, keyed by field.
export const passwordProblems = (p: { current?: string; next: string; confirm: string }, needsCurrent: boolean) => {
  const problems: Partial<Record<'current' | 'next' | 'confirm', string>> = {}
  if (needsCurrent && !p.current) problems.current = 'Enter your current password'
  if (p.next.length < PASSWORD_MIN) problems.next = `Use at least ${PASSWORD_MIN} characters`
  else if (!/[A-Za-z]/.test(p.next) || !/[0-9]/.test(p.next)) problems.next = 'Use letters and at least one number'
  else if (needsCurrent && p.current && p.next === p.current) problems.next = 'Choose a password different from the current one'
  if (p.confirm !== p.next) problems.confirm = 'The passwords don’t match'
  return problems
}

// A password staff can read out or type: no look-alike characters (0/O, 1/l/I).
export const generatePassword = (length = 10, random: (n: number) => number = secureRandom) => {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  const chars = Array.from(
    { length },
    (_, i) => (i === 1 ? digits : i === 0 ? letters : all)[random(i === 1 ? digits.length : i === 0 ? letters.length : all.length)]
  )
  return chars.join('')
}

function secureRandom(n: number) {
  const buf = new Uint32Array(1)
  globalThis.crypto.getRandomValues(buf)
  return buf[0] % n
}

export type AccountKind = 'owner' | 'staff'

export const accountKind = (accountType: unknown): AccountKind => (accountType === 'employee' ? 'staff' : 'owner')

// ── Requests ─────────────────────────────────────────────────────────────────

export const AccountServices = {
  // Owner: account service. Staff: their own record (§10.1).
  // A wrong current password must never sign the user out: no 401 refresh.
  ChangePassword: (kind: AccountKind, currentPassword: string, newPassword: string): AxiosRequestConfig & { skipAuthRefresh: true } =>
    kind === 'owner'
      ? {
          method: 'PUT',
          url: '/auth/update-password',
          data: { currentPassword, newPassword, confirmNewPassword: newPassword },
          skipAuthRefresh: true,
        }
      : { method: 'PUT', url: '/employees/me/password', data: { currentPassword, newPassword }, skipAuthRefresh: true },

  // Owner "forgot password" (§10.3). The account service picks the account
  // type from X-Tenant-Domain; "admin" is the business owner.
  SendResetCode: (email: string): AxiosRequestConfig => ({
    method: 'POST',
    url: '/auth/send-otp',
    data: { email },
    headers: { 'X-Tenant-Domain': 'admin' },
  }),
  ResetPassword: (email: string, otp: string, newPassword: string): AxiosRequestConfig => ({
    method: 'PUT',
    url: '/auth/reset-password',
    data: { email, otp, newPassword, confirmNewPassword: newPassword },
    headers: { 'X-Tenant-Domain': 'admin' },
  }),
}

export const EmployeeServices = {
  FetchAll: (params?: any): AxiosRequestConfig => ({ method: 'GET', url: '/employees/', params }),
  FetchOne: (id: number): AxiosRequestConfig => ({ method: 'GET', url: `/employees/${id}` }),
  Create: (payload: any): AxiosRequestConfig => ({ method: 'POST', url: '/employees/', data: payload }),
  Update: (id: number, payload: any): AxiosRequestConfig => ({ method: 'PUT', url: `/employees/${id}`, data: payload }),
  Delete: (id: number): AxiosRequestConfig => ({ method: 'DELETE', url: `/employees/${id}` }),
}

export const TeamServices = {
  ResetPassword: (id: number, password: string): AxiosRequestConfig => ({ method: 'PUT', url: `/employees/${id}`, data: { password } }),
  // §10.2: until the server accepts `status`, it answers 200 and ignores it.
  SetStatus: (id: number, status: 'active' | 'suspended'): AxiosRequestConfig => ({
    method: 'PUT',
    url: `/employees/${id}`,
    data: { status },
  }),
}

// ── Errors ───────────────────────────────────────────────────────────────────

// The endpoint isn't there yet: missing route, not implemented, or a stub
// that crashes (the account service's handlers panic until §10 ships).
export const notAvailable = (err: unknown) => [404, 405, 500, 501].includes(apiStatus(err) ?? 0)

export const changePasswordError = (err: unknown, kind: AccountKind) => {
  const status = apiStatus(err)
  if (status === 400 || status === 401 || status === 403) {
    const msg = apiErrorMessage(err, '')
    return /current|invalid|incorrect|wrong|credential/i.test(msg) || status === 401
      ? 'Your current password isn’t right'
      : msg || 'Check the passwords and try again'
  }
  if (notAvailable(err))
    return kind === 'staff'
      ? 'Changing your own password isn’t switched on yet. Ask the owner or a manager to reset it for you from Team.'
      : 'Changing your password isn’t available yet. Contact Bytewave support and we’ll reset it for you.'
  return apiErrorMessage(err, 'We couldn’t change your password. Please try again.')
}

export const resetError = (err: unknown) => {
  const status = apiStatus(err)
  if (status === 429) return 'Too many tries. Wait a few minutes and try again.'
  if (status === 400 || status === 401) return 'That code is wrong or has expired. Request a new one.'
  if (notAvailable(err)) return 'Password reset by email isn’t available yet. Contact Bytewave support and we’ll reset it for you.'
  return apiErrorMessage(err, 'Something went wrong. Please try again.')
}

// ── Team ─────────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: number
  name: string
  email: string
  phone?: string
  status?: 'active' | 'suspended' | string
  createdAt?: string
  [permission: string]: unknown
}

export const isSuspended = (m: Pick<TeamMember, 'status'>) => m.status === 'suspended'

export const matchesSearch = (m: TeamMember, q: string) => {
  const s = q.trim().toLowerCase()
  return !s || [m.name, m.email, m.phone].some((v) => typeof v === 'string' && v.toLowerCase().includes(s))
}
