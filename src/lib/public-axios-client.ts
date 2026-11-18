'use client'
import axios from 'axios'
import { clientTenantSlug } from './tenant'

// For pages that must work with NO login (e.g. a public leaderboard display).
// `apiClient` (axios-client.ts) only attaches X-Tenant-Domain when a NextAuth
// session exists — an anonymous visitor has none, so that client would silently
// omit the header and the request would fall back to the backend's default
// database instead of this tenant's data. Here the tenant is resolved from the
// subdomain itself (classifyHost), which needs no session at all.
export const publicApiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
})

publicApiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    // The subdomain, or on the desktop app the business the till is set up for.
    const slug = clientTenantSlug()
    if (slug) config.headers['X-Tenant-Domain'] = slug
  }
  return config
})
