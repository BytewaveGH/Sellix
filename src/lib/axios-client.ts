'use client'
import axios, { AxiosRequestConfig } from 'axios'
import { getSession } from 'next-auth/react'
import { apiErrorMessage, isSessionRebindError } from './api-error'
import { forceLogout } from './force-logout'
import { BILLING_CHANGED_EVENT } from './subscription/events'

let isRefreshing = false
let refreshQueue: Array<(token: string) => void> = []

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
})

// Real-estate screens show "tenant mismatch" as an error panel instead of
// signing out (their error contract: a 403 never refreshes or logs out).
const isRealEstateUrl = (url?: string) => /(^|\/)real-estate\//.test(url ?? '')

apiClient.interceptors.request.use(async (config) => {
  const session = await getSession()
  if (session?.user?.accessToken) {
    // A retry after a refresh already carries the new token; the session may still hold the old one.
    if (!(config as { _retry?: boolean })._retry) config.headers['Authorization'] = `Bearer ${session.user.accessToken}`
    config.headers['X-Tenant-Domain'] = session.user.tenant
    config.headers['Cache-Control'] = 'no-cache'
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Old (pre tenant-binding) token or tenant mismatch — refreshing can't help.
    if (isSessionRebindError(error) && !(isRealEstateUrl(error.config?.url) && /tenant mismatch/i.test(apiErrorMessage(error, '')))) {
      void forceLogout('rebind')
      return Promise.reject(error)
    }

    // 402: the plan doesn't allow this (BACKEND_REQUIREMENTS §8.4). Reload billing
    // now so the dashboard shows the lock or upgrade screen instead of a failed page.
    if (error.response?.status === 402 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(BILLING_CHANGED_EVENT))
    }

    // Only a 401 refreshes — never a 403 — and only once per request. A request
    // marked `skipAuthRefresh` (e.g. checking a typed-in password) gets its 401 as is.
    const original = error.config as AxiosRequestConfig & { _retry?: boolean; skipAuthRefresh?: boolean }
    if (error.response?.status !== 401 || !original || original.skipAuthRefresh) {
      return Promise.reject(error)
    }
    if (original._retry) {
      // Still 401 with a fresh token: the session is dead.
      void forceLogout('expired')
      return Promise.reject(error)
    }
    original._retry = true

    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push((newToken: string) => {
          if (original.headers) original.headers['Authorization'] = `Bearer ${newToken}`
          resolve(apiClient(original))
        })
      })
    }

    isRefreshing = true
    try {
      const session = await getSession()
      if (!session?.user?.refreshToken) throw new Error('no refresh token')

      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        {},
        {
          headers: {
            'X-Refresh-Token': session.user.refreshToken,
            'X-Tenant-Domain': session.user.tenant,
          },
        }
      )
      const newToken: string = data.data.accessToken

      refreshQueue.forEach((cb) => cb(newToken))
      refreshQueue = []

      if (original.headers) original.headers['Authorization'] = `Bearer ${newToken}`
      return apiClient(original)
    } catch {
      refreshQueue = []
      // No refresh token (employees) or refresh rejected (e.g. suspended
      // employee): the session is dead, so log out instead of failing silently.
      void forceLogout('expired')
      return Promise.reject(error)
    } finally {
      isRefreshing = false
    }
  }
)
