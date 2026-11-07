'use client'

/* eslint-disable @next/next/no-img-element -- owner-uploaded photos */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'
import { BedDouble, Building, CalendarClock, ExternalLink, Eye, EyeOff, Globe, ImagePlus, KeyRound, Printer, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CopyButton } from '@/components/kit/ui'
import { Drawer, Field, FormGrid, Input, Textarea, Toggle } from '@/components/kit/form'
import { useDataSource, usePortfolio, useRealEstateActions, useSiteSettings } from '../_logics/hooks'
import { todayISO } from '../_logics/calc'
import { DATA_SOURCE_KIND } from '../_logics/data-source'
import {
  ACCENTS,
  DEFAULT_SITE,
  directoryPath,
  isListed,
  MAX_PHOTOS,
  propertyPhotos,
  siteCounts,
  sitePath,
  type SiteSettings,
} from '../_logics/site'
import { whatsAppLink } from '../_logics/share'
import { plural } from '../_logics/format'
import { propertyTypeLabel } from '../_logics/constants'
import type { Property, Unit } from '../_logics/types'
import { Button, Card, EmptyState, PageHeader, PropertyCover, SectionTitle, Skeleton } from '../_components/ui'
import { NoAccess } from '../_components/load-state'
import { PhotoGrid } from '../_components/site-photos'
import { useLocaleHref } from '../_components/module-frame'
import { ImageField } from '@/app/[locale]/(eatery)/eatery/_components/image-field'
import { initialsOf } from '@/app/[locale]/(real-estate-public)/rentals/_components/site'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

// Drop the id: the API's update takes the record without it.
const body = <T extends { id: number }>(row: T): Omit<T, 'id'> => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = row
  return rest
}

export default function WebsitePage() {
  const params = useParams()
  const locale = (params?.locale as string) || 'en'
  const href = useLocaleHref()
  const p = usePortfolio()
  const { scope } = useDataSource()
  const siteQ = useSiteSettings()
  const actions = useRealEstateActions()
  const today = todayISO()

  const [draft, setDraft] = useState<SiteSettings>(DEFAULT_SITE)
  const [saving, setSaving] = useState(false)
  const [photosFor, setPhotosFor] = useState<number | null>(null)
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  useEffect(() => {
    if (siteQ.data) setDraft(siteQ.data)
  }, [siteQ.data])

  const saved = siteQ.data ?? DEFAULT_SITE
  const dirty = JSON.stringify({ ...draft, published: saved.published }) !== JSON.stringify(saved)
  const canEdit = p.can.write('catalog')
  const url = origin ? `${origin}${sitePath(locale, scope)}` : ''
  const counts = useMemo(() => siteCounts(p, today), [p, today])
  const listedProps = p.properties.filter(isListed)
  const requests = p.bookings.filter((b) => b.status === 'inquiry' && b.channel === 'direct' && b.notes?.includes('website'))
  const set = <K extends keyof SiteSettings>(k: K, v: SiteSettings[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const save = async (next: SiteSettings) => {
    setSaving(true)
    try {
      await actions.saveSite(next)
    } catch {
      // Toasted.
    } finally {
      setSaving(false)
    }
  }
  const publish = (on: boolean) => {
    setDraft((d) => ({ ...d, published: on }))
    void save({ ...saved, published: on })
  }

  if (!p.can.read('catalog')) return <NoAccess />

  const editing = p.properties.find((x) => x.id === photosFor)
  const rentable = p.properties.filter((x) => x.type !== 'land')

  return (
    <>
      <PageHeader
        eyebrow="Real estate"
        title="Website"
        description="A public page that shows your vacant rooms and short stays, with photos and prices. Share the link on WhatsApp, social media or a poster."
        actions={
          url && saved.published ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-endeavour px-4 text-sm font-semibold text-white hover:bg-veniceBlue"
            >
              <ExternalLink className="h-4 w-4" /> View website
            </a>
          ) : undefined
        }
      />

      {siteQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
          {/* ── Status & link ── */}
          <Card className="p-5">
            <div className="flex items-start gap-4">
              <span
                className={cn(
                  'flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl',
                  saved.published ? 'bg-emerald-50 text-emerald-600' : 'bg-stone-100 text-stone-500'
                )}
              >
                <Globe className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-stone-900">{saved.published ? 'Your website is live' : 'Your website is off'}</p>
                <p className="mt-0.5 text-sm text-stone-500">
                  {saved.published
                    ? 'Anyone with the link can see what’s available. It updates by itself as tenants move in and out.'
                    : 'Turn it on when your photos and details are ready. Nobody can see it until then.'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={saved.published}
                aria-label="Website on"
                disabled={!canEdit || saving}
                onClick={() => publish(!saved.published)}
                className={cn(
                  'relative mt-1 h-7 w-12 flex-shrink-0 rounded-full transition-colors disabled:opacity-60',
                  saved.published ? 'bg-emerald-500' : 'bg-stone-300'
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow dark:bg-[#e7e5e4] transition-transform',
                    saved.published ? 'translate-x-[22px]' : 'translate-x-0.5'
                  )}
                />
              </button>
            </div>

            {url && (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
                <p className="min-w-0 flex-1 truncate font-mono text-xs text-stone-600" title={url}>
                  {url}
                </p>
                <CopyButton value={url} label="Copy link" />
              </div>
            )}
            {saved.published && url && (
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={whatsAppLink(`${saved.name || 'We have'} rooms available — see photos and prices:\n${url}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50"
                >
                  <Share2 className="h-3.5 w-3.5" /> Share on WhatsApp
                </a>
                <PosterButton url={url} name={saved.name} />
              </div>
            )}
            {DATA_SOURCE_KIND === 'local' && (
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                While your data is saved on this device only, the link works in this browser only. Others will see it once the Sellix
                backend for real estate is live.
              </p>
            )}

            <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-stone-100 pt-4 text-center">
              {[
                { icon: KeyRound, n: counts.now, label: 'free now' },
                { icon: CalendarClock, n: counts.soon, label: 'free soon' },
                { icon: BedDouble, n: counts.stays, label: 'short stays' },
              ].map((s) => (
                <div key={s.label}>
                  <dt className="flex items-center justify-center gap-1 text-[11px] font-semibold text-stone-500">
                    <s.icon className="h-3.5 w-3.5" /> {s.label}
                  </dt>
                  <dd className="text-2xl font-extrabold text-stone-900">{s.n}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-center text-xs text-stone-400">
              From {plural(listedProps.length, 'property', 'properties')} shown on the website
            </p>
            {saved.published && saved.showInDirectory && (
              <a
                href={directoryPath(locale)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 block text-center text-xs font-semibold text-endeavour hover:underline"
              >
                Also listed on Sellix Homes →
              </a>
            )}
            {requests.length > 0 && (
              <Link
                href={href('/bookings')}
                className="mt-4 flex items-center justify-between rounded-xl bg-endeavour/[0.06] px-3 py-2.5 text-sm font-semibold text-endeavour hover:bg-endeavour/10"
              >
                {plural(requests.length, 'booking request')} from the website
                <span aria-hidden>→</span>
              </Link>
            )}
          </Card>

          {/* ── Details ── */}
          <Card className="p-5">
            <SectionTitle title="Your details" hint="Shown at the top of the website and on every listing" />
            <fieldset disabled={!canEdit} className="mt-4 space-y-4">
              <Field label="Business name" htmlFor="s-name">
                <Input id="s-name" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Asante Properties" />
              </Field>
              <Field label="Headline" htmlFor="s-tagline">
                <Input id="s-tagline" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} />
              </Field>
              <FormGrid>
                <Field label="Phone" htmlFor="s-phone">
                  <Input
                    id="s-phone"
                    type="tel"
                    value={draft.phone}
                    onChange={(e) => set('phone', e.target.value)}
                    placeholder="024 123 4567"
                  />
                </Field>
                <Field label="WhatsApp" htmlFor="s-wa" hint="If different from the phone">
                  <Input id="s-wa" type="tel" value={draft.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} />
                </Field>
              </FormGrid>
              <Field label="Email" htmlFor="s-email">
                <Input id="s-email" type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} />
              </Field>
              <Field label="Rent terms" htmlFor="s-terms" hint="Shown on long-term rooms">
                <Input
                  id="s-terms"
                  value={draft.rentTerms}
                  onChange={(e) => set('rentTerms', e.target.value)}
                  placeholder="e.g. 1 year advance · 1 month deposit"
                />
              </Field>
              <Field label="About" htmlFor="s-about">
                <Textarea
                  id="s-about"
                  value={draft.about}
                  onChange={(e) => set('about', e.target.value)}
                  placeholder="Who you are, the areas you cover, how viewings work…"
                />
              </Field>
              <div className="grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2">
                <ImageField
                  kind="logo"
                  label="Logo"
                  hint="Square works best · also the browser-tab icon"
                  value={draft.logoUrl}
                  onChange={(logoUrl) => set('logoUrl', logoUrl)}
                  upload={(file) => actions.uploadImage(file, 'logo')}
                  fallback={
                    <span
                      className="flex h-full w-full items-center justify-center text-lg font-extrabold text-white"
                      style={{ background: draft.accent }}
                    >
                      {initialsOf(draft.name) || 'R'}
                    </span>
                  }
                />
                <ImageField
                  kind="cover"
                  label="Cover photo"
                  hint="Wide photo for the top of the site"
                  value={draft.coverUrl}
                  onChange={(coverUrl) => set('coverUrl', coverUrl)}
                  upload={(file) => actions.uploadImage(file, 'cover')}
                  fallback={
                    <span className="block h-full w-full" style={{ background: `linear-gradient(120deg, ${draft.accent}, #1c1917)` }} />
                  }
                />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-stone-700">Colour</p>
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                  {ACCENTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={draft.accent === c}
                      aria-label={c}
                      onClick={() => set('accent', c)}
                      className={cn(
                        'h-9 w-9 rounded-full ring-offset-2 transition',
                        draft.accent === c ? 'ring-2 ring-stone-900' : 'hover:scale-110'
                      )}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-3 border-t border-stone-100 pt-4">
                <Toggle
                  checked={draft.showPrices}
                  onChange={(v) => set('showPrices', v)}
                  label="Show prices"
                  hint="Off: visitors ask for the price"
                />
                <Toggle
                  checked={draft.showSoon}
                  onChange={(v) => set('showSoon', v)}
                  label="Show rooms that will be free soon"
                  hint="Let rooms whose tenant leaves within 3 months, as “Available from …”"
                />
                <Toggle
                  checked={draft.showAddress}
                  onChange={(v) => set('showAddress', v)}
                  label="Show street addresses"
                  hint="Off: only the area and city — share the address when you arrange a viewing"
                />
                <Toggle
                  checked={draft.showInDirectory}
                  onChange={(v) => set('showInDirectory', v)}
                  label="List my rooms on Sellix Homes"
                  hint="Sellix Homes is where people search every landlord’s free rooms at once. Off: only people with your link see them"
                />
              </div>
            </fieldset>
            {canEdit && (
              <div className="mt-5 flex items-center justify-end gap-2">
                {dirty && (
                  <Button variant="ghost" onClick={() => setDraft(saved)}>
                    Discard
                  </Button>
                )}
                <Button onClick={() => void save({ ...draft, published: saved.published })} loading={saving} disabled={!dirty}>
                  Save details
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Properties ── */}
      <section className="mt-8" aria-labelledby="props-title">
        <h2 id="props-title" className="text-lg font-bold text-stone-900">
          What’s on the website
        </h2>
        <p className="mt-0.5 text-sm text-stone-500">
          Turn on the properties to show. Their free rooms appear by themselves — rooms set to Maintenance or Unlisted never do.
        </p>
        {rentable.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Building}
              title="No properties to show yet"
              description="Add a property with its rooms first."
              action={
                <Link href={href('/properties')} className="text-sm font-bold text-endeavour">
                  Go to Properties →
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rentable.map((prop) => {
              const units = p.units.filter((u) => u.propertyId === prop.id)
              const photos = propertyPhotos(prop)
              return (
                <li key={prop.id}>
                  <Card className="overflow-hidden">
                    <div className="relative">
                      <PropertyCover src={photos[0]} name={prop.name} className="h-32 w-full" />
                      <span
                        className={cn(
                          'absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold',
                          prop.listed ? 'bg-emerald-500 text-white' : 'bg-black/55 text-white'
                        )}
                      >
                        {prop.listed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {prop.listed ? 'On website' : 'Hidden'}
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="font-bold text-stone-900">{prop.name}</p>
                      <p className="text-xs text-stone-500">
                        {propertyTypeLabel(prop.type)} · {prop.city} · {plural(units.length, 'unit')} · {plural(photos.length, 'photo')}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={ImagePlus}
                          onClick={() => setPhotosFor(prop.id)}
                          disabled={!canEdit}
                          className="flex-1"
                        >
                          Photos
                        </Button>
                        <Button
                          size="sm"
                          variant={prop.listed ? 'secondary' : 'primary'}
                          icon={prop.listed ? EyeOff : Eye}
                          disabled={!canEdit}
                          onClick={() =>
                            void actions.update('properties', prop.id, { ...body(prop), listed: !prop.listed }).catch(() => {})
                          }
                          className="flex-1"
                        >
                          {prop.listed ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                      {prop.listed && photos.length === 0 && (
                        <p className="mt-2 text-xs text-amber-700">Listings with photos get far more enquiries — add a few.</p>
                      )}
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {editing && (
        <PhotosDrawer
          property={editing}
          units={p.units.filter((u) => u.propertyId === editing.id && u.availability === 'available')}
          onClose={() => setPhotosFor(null)}
        />
      )}
    </>
  )
}

const PhotosDrawer = ({ property, units, onClose }: { property: Property; units: Unit[]; onClose: () => void }) => {
  const actions = useRealEstateActions()
  const upload = (f: File) => actions.uploadImage(f)
  const sorted = [...units].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Photos · ${property.name}`}
      description="The first photo is the cover. Photos are resized before they’re saved."
      wide
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        <PhotoGrid
          label="The building"
          photos={propertyPhotos(property)}
          max={MAX_PHOTOS.property}
          upload={upload}
          // An older cover link becomes part of the gallery.
          onChange={(photos) => actions.update('properties', property.id, { ...body(property), photos, coverImageUrl: undefined })}
        />
        {sorted.length > 0 && (
          <div className="border-t border-stone-100 pt-5">
            <p className="text-sm font-bold text-stone-900">Rooms</p>
            <p className="text-xs text-stone-500">Optional — a room without its own photos shows the building’s.</p>
            <div className="mt-4 space-y-5">
              {sorted.map((u) => (
                <PhotoGrid
                  key={u.id}
                  compact
                  label={u.name}
                  photos={u.photos ?? []}
                  max={MAX_PHOTOS.unit}
                  upload={upload}
                  onChange={(photos) => actions.update('units', u.id, { ...body(u), photos })}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  )
}

// A printable A4 poster with the QR code, for a gate or notice board.
const PosterButton = ({ url, name }: { url: string; name: string }) => {
  const print = async () => {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    const w = window.open('', '_blank', 'width=800,height=1000')
    if (!w) return
    w.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(name || 'Rooms available')}</title><style>body{font-family:system-ui,sans-serif;text-align:center;margin:48px}h1{font-size:56px;margin:0 0 8px}p{font-size:22px;color:#333;margin:0}.qr{width:60%;margin:36px auto}.qr svg{width:100%;height:auto}.u{font-family:monospace;font-size:16px;word-break:break-all}</style></head><body><h1>Rooms available</h1><p>${escapeHtml(name)}</p><div class="qr">${svg}</div><p>Scan to see photos, prices and what’s free</p><p class="u">${escapeHtml(url)}</p><script>window.onload=()=>window.print()</script></body></html>`
    )
    w.document.close()
  }
  return (
    <button
      type="button"
      onClick={() => void print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 hover:bg-stone-50"
    >
      <Printer className="h-3.5 w-3.5" /> Print QR poster
    </button>
  )
}
