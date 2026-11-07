'use client'

/* eslint-disable @next/next/no-img-element -- previews of image links from the imported file */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Download, FileUp, ImageOff, Loader2, Sparkles, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { apiErrorMessage } from '@/lib/api-error'
import { useAxios } from '@/hooks/use-axios'
import { Button } from '@/components/kit/ui'
import { Drawer } from '@/components/kit/form'
import {
  AI_PROMPT,
  planImport,
  productsToCsv,
  readImportFile,
  updateBody,
  type ImportField,
  type PlannedChange,
} from '@/lib/store/product-csv'
import { ProductServices } from '../inventory/_logics/services'

const download = (text: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  // In the page, or some browsers ignore the click.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const today = () => new Date().toISOString().slice(0, 10)

// ── Export ───────────────────────────────────────────────────────────────────

export const ExportMenu = ({ products }: { products: any[] }) => {
  const missing = products.filter((p) => !String(p.imageUrl ?? '').trim())
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)
  const save = (list: any[], suffix: string) => {
    download(productsToCsv(list), `products-${suffix}-${today()}.csv`)
    toast.success(`Exported ${list.length} product${list.length === 1 ? '' : 's'}`)
  }
  return (
    <>
      <Button variant="secondary" icon={Download} disabled={products.length === 0} onClick={() => setOpen(true)}>
        Export
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Export products"
        description="A CSV file that opens in Excel or Google Sheets. Keep the id column so it can be imported back."
      >
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => save(missing, 'without-photos')}
            disabled={missing.length === 0}
            className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm hover:bg-stone-50 disabled:opacity-50"
          >
            <span>
              <span className="block font-semibold text-stone-900">Products without a photo</span>
              <span className="text-xs text-stone-500">For adding photos with AI</span>
            </span>
            <span className="text-xs font-bold tabular-nums text-stone-500">{missing.length}</span>
          </button>
          <button
            type="button"
            onClick={() => save(products, 'all')}
            className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2.5 text-left text-sm hover:bg-stone-50"
          >
            <span className="font-semibold text-stone-900">All products</span>
            <span className="text-xs font-bold tabular-nums text-stone-500">{products.length}</span>
          </button>
        </div>
        <div className="mt-3 rounded-xl bg-endeavour/[0.06] p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-endeavour">
            <Sparkles className="h-3.5 w-3.5" /> Getting photos with AI
          </p>
          <p className="mt-1 text-xs text-stone-600">
            Attach the file to ChatGPT, Claude or Gemini with this prompt, then import the file it gives back.
          </p>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(AI_PROMPT)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                toast.error('Couldn’t copy — your browser blocked it')
              }
            }}
            className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg bg-endeavour px-3 text-xs font-bold text-white hover:bg-veniceBlue"
          >
            {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy AI prompt'}
          </button>
        </div>
      </Drawer>
    </>
  )
}

// ── Import ───────────────────────────────────────────────────────────────────

type ImageCheck = 'checking' | 'ok' | 'broken'

// Loads each new image link in the browser: AI tools often give links that
// don't exist or point to a web page instead of the picture.
const checkImage = (url: string, timeoutMs = 12000) =>
  new Promise<boolean>((resolve) => {
    const img = new Image()
    const t = setTimeout(() => {
      img.src = ''
      resolve(false)
    }, timeoutMs)
    img.onload = () => {
      clearTimeout(t)
      resolve(img.naturalWidth > 1 && img.naturalHeight > 1)
    }
    img.onerror = () => {
      clearTimeout(t)
      resolve(false)
    }
    img.referrerPolicy = 'no-referrer'
    img.src = url
  })

const FIELD_LABEL: Record<ImportField, string> = { imageUrl: 'Photos', description: 'Descriptions', brand: 'Brands' }

export const ImportProducts = ({ products, onDone }: { products: any[]; onDone: () => void }) => {
  const request = useAxios()
  const fileRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<ReturnType<typeof readImportFile>['rows']>([])
  const [columns, setColumns] = useState<string[]>([])
  const [fields, setFields] = useState<ImportField[]>(['imageUrl'])
  const [checks, setChecks] = useState<Record<string, ImageCheck>>({})
  // Rows the user ticked or unticked themselves; the rest follow their status.
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map())
  const [running, setRunning] = useState<{ done: number; total: number; failed: { line: number; name: string; message: string }[] } | null>(
    null
  )
  const [finished, setFinished] = useState(false)

  const available = (['imageUrl', 'description', 'brand'] as ImportField[]).filter((f) => columns.includes(f))
  const plan = useMemo(() => planImport(rows, products, fields), [rows, products, fields])
  const actionable = plan.filter((p) => !p.problem)

  // Check every new image link (a few at a time), and tick the rows whose photo loads.
  useEffect(() => {
    let alive = true
    const urls = Array.from(new Set(actionable.map((p) => p.changes.imageUrl?.to).filter(Boolean) as string[])).filter((u) => !checks[u])
    if (urls.length === 0) return
    setChecks((c) => ({ ...c, ...Object.fromEntries(urls.map((u) => [u, 'checking' as const])) }))
    const queue = [...urls]
    const worker = async () => {
      while (alive && queue.length) {
        const u = queue.shift()!
        const ok = await checkImage(u)
        if (alive) setChecks((c) => ({ ...c, [u]: ok ? 'ok' : 'broken' }))
      }
    }
    void Promise.all([worker(), worker(), worker(), worker(), worker(), worker()])
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const statusOf = (p: PlannedChange): 'problem' | ImageCheck | 'ready' =>
    p.problem ? 'problem' : p.changes.imageUrl ? (checks[p.changes.imageUrl.to] ?? 'checking') : 'ready'

  // Ticked by default when it will work; broken photos start unticked (they can still be ticked).
  const isPicked = (p: PlannedChange) => {
    if (p.problem) return false
    const status = statusOf(p)
    if (status === 'checking') return false
    return overrides.get(p.line) ?? status !== 'broken'
  }

  const reset = () => {
    setRows([])
    setColumns([])
    setError(null)
    setFileName('')
    setChecks({})
    setOverrides(new Map())
    setRunning(null)
    setFinished(false)
  }

  const take = async (file: File | undefined) => {
    if (!file) return
    reset()
    if (file.size > 5 * 1024 * 1024) return setError('That file is over 5 MB')
    const parsed = readImportFile(await file.text())
    setFileName(file.name)
    if (parsed.error) return setError(parsed.error)
    setRows(parsed.rows)
    setColumns(parsed.columns)
    setFields(
      parsed.columns.includes('imageUrl')
        ? ['imageUrl']
        : (['description', 'brand'] as ImportField[]).filter((f) => parsed.columns.includes(f))
    )
  }

  const apply = async () => {
    const todo = plan.filter(isPicked)
    const failed: { line: number; name: string; message: string }[] = []
    setRunning({ done: 0, total: todo.length, failed })
    let done = 0
    const queue = [...todo]
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift()!
        try {
          await request(ProductServices.Update(p.product.id, updateBody(p.product, p.changes)) as any)
        } catch (err) {
          failed.push({ line: p.line, name: p.product.name, message: apiErrorMessage(err, 'Couldn’t save') })
        }
        done++
        setRunning({ done, total: todo.length, failed: [...failed] })
      }
    }
    // A few at a time: quick, without flooding the server.
    await Promise.all([worker(), worker(), worker()])
    setFinished(true)
    onDone()
    const ok = todo.length - failed.length
    if (ok) toast.success(`Updated ${ok} product${ok === 1 ? '' : 's'}`)
    if (failed.length) toast.error(`${failed.length} couldn’t be saved — see the list`)
  }

  const counts = {
    ok: plan.filter((p) => statusOf(p) === 'ok' || statusOf(p) === 'ready').length,
    checking: plan.filter((p) => statusOf(p) === 'checking').length,
    broken: plan.filter((p) => statusOf(p) === 'broken').length,
    skipped: plan.filter((p) => p.problem).length,
  }
  const toApply = plan.filter(isPicked).length

  return (
    <>
      <Button
        variant="secondary"
        icon={Upload}
        onClick={() => {
          reset()
          setOpen(true)
        }}
      >
        Import
      </Button>
      <Drawer
        open={open}
        onOpenChange={(o) => {
          if (running && !finished) return
          setOpen(o)
        }}
        wide
        title="Import products"
        description="Update photos (and optionally descriptions or brands) from a CSV — e.g. the export after AI filled in the photo links. Nothing is saved until you press Update."
        footer={
          rows.length > 0 && !finished ? (
            <div className="flex w-full items-center justify-between gap-3">
              <p className="text-xs text-stone-500">
                {running ? `Saving ${running.done} of ${running.total}…` : `${toApply} product${toApply === 1 ? '' : 's'} will be updated`}
              </p>
              <Button onClick={() => void apply()} loading={!!running} disabled={toApply === 0 || counts.checking > 0}>
                {counts.checking > 0 ? `Checking photos… ${counts.checking}` : `Update ${toApply}`}
              </Button>
            </div>
          ) : finished ? (
            <Button
              onClick={() => {
                setOpen(false)
                reset()
              }}
            >
              Done
            </Button>
          ) : undefined
        }
      >
        {rows.length === 0 && (
          <div>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void take(e.dataTransfer.files?.[0])
              }}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 px-6 py-12 text-center hover:border-endeavour"
            >
              <FileUp className="h-8 w-8 text-stone-400" />
              <span className="text-sm font-bold text-stone-900">Choose a CSV file</span>
              <span className="text-xs text-stone-500">or drop it here · CSV or JSON, with an id (or name) column</span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.json,text/csv,application/json"
                className="sr-only"
                onChange={(e) => {
                  void take(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            {error && (
              <p role="alert" className="mt-3 text-sm font-semibold text-rose-600">
                {fileName ? `${fileName}: ` : ''}
                {error}
              </p>
            )}
            <ol className="mt-5 space-y-1.5 text-xs text-stone-600">
              <li>1. Export → “Products without a photo”.</li>
              <li>2. Give the file to an AI with the copied prompt (or fill the imageUrl column yourself).</li>
              <li>3. Import the file it returns here. Each photo link is checked before anything is saved.</li>
            </ol>
          </div>
        )}

        {rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-stone-900">{fileName}</span>
              <span className="text-stone-400">·</span>
              <span className="text-stone-500">{rows.length} rows</span>
              {!running && !finished && (
                <button type="button" onClick={reset} className="ml-auto font-semibold text-endeavour hover:underline">
                  Choose another file
                </button>
              )}
            </div>

            {available.length > 1 && !running && (
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1.5 text-xs font-semibold text-stone-700">Update</legend>
                {available.map((f) => (
                  <label
                    key={f}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-stone-200 px-3 text-xs font-semibold"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-endeavour"
                      checked={fields.includes(f)}
                      onChange={(e) => setFields((cur) => (e.target.checked ? [...cur, f] : cur.filter((x) => x !== f)))}
                    />
                    {FIELD_LABEL[f]}
                  </label>
                ))}
              </fieldset>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { n: counts.ok, label: 'Ready', tone: 'text-emerald-700' },
                { n: counts.checking, label: 'Checking photo', tone: 'text-stone-600' },
                { n: counts.broken, label: 'Photo doesn’t load', tone: 'text-rose-600' },
                { n: counts.skipped, label: 'Skipped', tone: 'text-stone-500' },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-stone-200 px-3 py-2">
                  <p className={cn('text-lg font-extrabold tabular-nums', c.tone)}>{c.n}</p>
                  <p className="text-[11px] text-stone-500">{c.label}</p>
                </div>
              ))}
            </div>

            {running && (
              <div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-label="Progress">
                <div
                  className="h-full bg-endeavour transition-all"
                  style={{ width: `${(running.done / Math.max(1, running.total)) * 100}%` }}
                />
              </div>
            )}
            {finished && running && (
              <div
                className={cn(
                  'rounded-xl px-3 py-2.5 text-sm',
                  running.failed.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'
                )}
              >
                Updated {running.total - running.failed.length} of {running.total}.
                {running.failed.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs">
                    {running.failed.map((f) => (
                      <li key={f.line}>
                        Row {f.line}, {f.name}: {f.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
              {plan.map((p) => {
                const status = statusOf(p)
                const img = p.changes.imageUrl
                const selectable = !p.problem && status !== 'checking'
                return (
                  <li key={p.line} className={cn('flex items-center gap-3 px-3 py-2.5', p.problem && 'opacity-60')}>
                    <input
                      type="checkbox"
                      aria-label={`Update ${p.product?.name ?? `row ${p.line}`}`}
                      className="h-4 w-4 flex-shrink-0 accent-endeavour"
                      disabled={!selectable || !!running}
                      checked={isPicked(p)}
                      onChange={(e) => setOverrides((cur) => new Map(cur).set(p.line, e.target.checked))}
                    />
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Thumb src={img?.from || p.product?.imageUrl} />
                      {img && (
                        <>
                          <span className="text-stone-300">→</span>
                          <Thumb src={img.to} broken={status === 'broken'} />
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">{p.product?.name ?? `Row ${p.line}`}</p>
                      <p className="truncate text-xs text-stone-500">
                        {p.problem
                          ? p.problem
                          : [
                              img && (status === 'broken' ? 'Photo link doesn’t load' : img.from ? 'Replaces photo' : 'Adds photo'),
                              p.changes.description && 'New description',
                              p.changes.brand && `Brand: ${p.changes.brand.to}`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                        {p.matchedBy && p.matchedBy !== 'id' && !p.problem ? ` · matched by ${p.matchedBy}` : ''}
                      </p>
                    </div>
                    <span className="flex-shrink-0">
                      {status === 'checking' ? (
                        <Loader2 className="h-4 w-4 animate-spin text-stone-400" aria-label="Checking photo" />
                      ) : status === 'broken' ? (
                        <ImageOff className="h-4 w-4 text-rose-500" aria-label="Photo doesn’t load" />
                      ) : status === 'problem' ? (
                        <AlertTriangle className="h-4 w-4 text-stone-400" aria-label="Skipped" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Ready" />
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
            {counts.broken > 0 && (
              <p className="text-xs text-stone-500">
                Links that don’t load are left out. They’re often made up by the AI, or point to a web page instead of the picture. Ask it
                again for just those products, or paste a link yourself in the product form.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </>
  )
}

const Thumb = ({ src, broken }: { src?: string; broken?: boolean }) =>
  src && !broken ? (
    <img src={src} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-lg bg-stone-100 object-cover" />
  ) : (
    <span
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg',
        broken ? 'bg-rose-50 text-rose-400' : 'bg-stone-100 text-stone-300'
      )}
    >
      <ImageOff className="h-4 w-4" />
    </span>
  )
