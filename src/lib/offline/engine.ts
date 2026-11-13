// Working offline: cached reads and the outbox of changes waiting to be sent.
//
// Everything is kept per "scope" (business + user), so two people signed in on
// the same computer never see each other's data or send each other's changes.
//
// Safety of sending later: a change is only kept here when it was never sent
// (the connection was already known to be down). If a send gets no answer, the
// change may have arrived; one that would be recorded twice (a new sale or
// order the server can't recognise as a repeat) is set aside for a person to
// check instead of being sent again automatically.

import { apiErrorMessage, apiStatus } from '../api-error'
import { isUnreachableError } from '../network'
import { offlineStore } from './store'
import {
  applyToList,
  BATCH_SIZE,
  batchFor,
  batchResults,
  describeWrite,
  mergeRows,
  refusalMessage,
  listIn,
  listsCollection,
  methodOf,
  newTempId,
  readKey,
  replaceId,
  rowIn,
  tempIdsIn,
  withList,
  writeShape,
  type Change,
  type RequestLike,
} from './rules'

export type OpStatus = 'waiting' | 'failed' | 'check'

export type Op = {
  id: string
  scope: string
  createdAt: string
  label: string
  method: string
  url: string
  params?: Record<string, unknown>
  data?: unknown
  timeout?: number
  // The temporary id the row made by this change shows under until it's sent.
  tempId?: number
  // Safe to send again after a send that got no answer (the server ignores repeats).
  safeToRepeat: boolean
  status: OpStatus
  error?: string
  // The server's refusal code, when it gave one (e.g. "product_unit_deleted").
  code?: string
  // Names saved on the till, by id, for the server's refusal messages.
  names?: Record<string, string>
}

// What a caller can say about a write (on the axios config as `offline`).
export type OfflineOptions = {
  // The row to show until the server's answer (default: the body with a temporary id).
  result?: (tempId: number) => Record<string, unknown>
  // The list the new row belongs to, when it isn't the path posted to.
  appendTo?: string
  label?: string
  safeToRepeat?: boolean
  // What to send later, when it differs from the live request (e.g. a till
  // sale made offline also carries the prices the customer paid).
  // Built only if the write is kept.
  body?: () => unknown
  names?: Record<string, string>
  // Further changes to cached answers (e.g. stock going down after a sale).
  adjust?: (key: string, body: unknown) => unknown | undefined
  // Which kept answers `adjust` looks at (by key), so the rest aren't read.
  adjusts?: (key: string) => boolean
  // On a slow connection: if the server hasn't answered in this many ms, keep
  // the change and answer at once; the request carries on and, if it lands,
  // the kept copy is dropped. Only for writes the server recognises when they
  // come twice (a clientId).
  waitMs?: number
}

type Cached = { body: unknown; at: string }

const readPrefix = (scope: string) => `r:${scope}|`
const opPrefix = (scope: string) => `o:${scope}|`

// ── Reads ────────────────────────────────────────────────────────────────────

// Adapters see the server's raw text (axios parses JSON afterwards); keep it
// parsed, so changes made offline can be shown in it.
const parsed = (body: unknown) => {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return body
  }
}

export const saveRead = (scope: string, req: RequestLike, body: unknown) =>
  offlineStore()
    .set(readPrefix(scope) + readKey(req), { body: parsed(body), at: new Date().toISOString() } satisfies Cached)
    .catch(() => undefined)

export const cachedRead = async (scope: string, req: RequestLike): Promise<Cached | undefined> => {
  try {
    return await offlineStore().get<Cached>(readPrefix(scope) + readKey(req))
  } catch {
    return undefined
  }
}

// Rewrite every cached answer in the scope that `fn` changes.
// `match` picks the answers by key first, so only those are read from disk
// (the kept product catalogue alone can be megabytes).
const patchReads = async (scope: string, fn: (key: string, body: unknown) => unknown | undefined, match: (key: string) => boolean = () => true) => {
  const store = offlineStore()
  const prefix = readPrefix(scope)
  for (const k of await store.keys(prefix)) {
    const key = k.slice(prefix.length)
    if (!match(key)) continue
    const v = await store.get<Cached>(k)
    if (!v) continue
    const next = fn(key, v.body)
    if (next !== undefined && next !== v.body) await store.set(k, { ...v, body: next })
  }
}

// Show a change in the cached answers it affects.
const showInReads = async (scope: string, req: RequestLike, change: Change, collection: string) => {
  const one = change.kind === 'create' ? null : `${collection}/${change.id}`
  await patchReads(scope, (key, body) => {
    if (listsCollection(key, collection)) {
      const rows = listIn(body)
      return rows ? withList(body, applyToList(rows, change)) : undefined
    }
    if (one && change.kind === 'update' && key === one) {
      const row = rowIn(body)
      if (!row) return undefined
      const merged = { ...row, ...change.patch, id: row.id }
      return body && typeof body === 'object' && 'data' in (body as object) ? { ...(body as object), data: merged } : merged
    }
    return undefined
  }, (key) => listsCollection(key, collection) || key === one)
}

// ── The outbox ───────────────────────────────────────────────────────────────

let seq = 0
const opId = () => `${Date.now().toString(36).padStart(9, '0')}-${(seq++).toString(36).padStart(4, '0')}`

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
export const subscribeOutbox = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export const listOps = async (scope: string): Promise<Op[]> => {
  try {
    return (await offlineStore().entries<Op>(opPrefix(scope))).map(([, op]) => op)
  } catch {
    return []
  }
}

const saveOp = (op: Op) => offlineStore().set(opPrefix(op.scope) + op.id, op)
const dropOp = (op: Op) => offlineStore().delete(opPrefix(op.scope) + op.id)

// Keep a write for later and answer as the server would have.
export const queueWrite = async (scope: string, req: RequestLike & { timeout?: number }, opts: OfflineOptions = {}) => {
  const shape = writeShape(req)
  const body = (req.data && typeof req.data === 'object' ? req.data : {}) as Record<string, unknown>
  const tempId = shape.kind === 'create' ? newTempId() : undefined
  const op: Op = {
    id: opId(),
    scope,
    createdAt: new Date().toISOString(),
    label: opts.label ?? describeWrite(req),
    method: methodOf(req),
    url: req.url ?? '',
    params: req.params,
    data: opts.body ? opts.body() : req.data,
    timeout: req.timeout,
    tempId,
    safeToRepeat: opts.safeToRepeat ?? methodOf(req) !== 'POST',
    status: 'waiting',
    names: opts.names,
  }
  await saveOp(op)

  let row: Record<string, unknown> = body
  try {
    if (shape.kind === 'create') {
      row = { ...body, ...(opts.result?.(tempId!) ?? {}), id: tempId }
      await showInReads(scope, req, { kind: 'create', row }, opts.appendTo ?? shape.collection)
    } else if (shape.kind === 'update') {
      row = { ...body, id: shape.id }
      await showInReads(scope, req, { kind: 'update', id: shape.id, patch: body }, shape.collection)
    } else if (shape.kind === 'delete') {
      await showInReads(scope, req, { kind: 'delete', id: shape.id }, shape.collection)
    }
    if (opts.adjust) await patchReads(scope, opts.adjust, opts.adjusts)
  } catch {
    // The change is safe in the outbox; only the early preview failed.
  }
  emit()
  return { op, body: { status: true, data: row, message: 'Saved on this device — it will be sent when the connection is back.' } }
}

export const discardOp = async (scope: string, id: string) => {
  const ops = await listOps(scope)
  const op = ops.find((o) => o.id === id)
  if (!op) return
  // Changes to a row that will now never exist go with it.
  const gone = new Set(op.tempId !== undefined ? [op.tempId] : [])
  for (const o of ops) {
    if (o === op || tempIdsIn(o).some((t) => gone.has(t))) {
      await dropOp(o)
      if (o.tempId !== undefined) gone.add(o.tempId)
    }
  }
  emit()
}

// "Send again": a failed change, or one a person checked wasn't recorded.
export const retryOp = async (scope: string, id: string) => {
  const op = (await listOps(scope)).find((o) => o.id === id)
  if (!op) return
  await saveOp({ ...op, status: 'waiting', error: undefined, safeToRepeat: op.status === 'check' ? true : op.safeToRepeat })
  emit()
}

// ── Sending ──────────────────────────────────────────────────────────────────

export type SendRequest = Pick<Op, 'method' | 'url' | 'params' | 'data' | 'timeout'> & { headers?: Record<string, string> }
export type Send = (req: SendRequest) => Promise<{ data: unknown }>
export type SyncResult = { sent: number; failed: number; stopped: boolean }

const syncing = new Map<string, Promise<SyncResult>>()
export const isSyncing = (scope: string) => syncing.has(scope)

const browserOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

const codeOf = (err: unknown) => {
  const c = (err as { response?: { data?: { code?: unknown } } })?.response?.data?.code
  return typeof c === 'string' ? c : undefined
}

const refused = (op: Op, err: unknown): Op => {
  const code = codeOf(err)
  const message = apiErrorMessage(err, `Refused by the server (error ${apiStatus(err) ?? '?'})`)
  return { ...op, status: 'failed', code, error: refusalMessage(code, message, op.names) }
}

// Later changes to a row made offline now use its real id.
const swapTempId = async (scope: string, tempId: number, realId: number) => {
  for (const o of await listOps(scope)) if (tempIdsIn(o).includes(tempId)) await saveOp(replaceId(o, tempId, realId))
}

// Batch endpoints the server turned out not to have (an older backend):
// those changes go one by one instead.
const noBatchEndpoint = new Set<string>()

// Send waiting changes in the order they were made. Stops at the first one
// that can't reach the server; a refused one is marked and the rest go on.
// Till sales and counter orders in a row go up together (§13.2).
export const syncOutbox = (scope: string, send: Send): Promise<SyncResult> => {
  const running = syncing.get(scope)
  if (running) return running
  const run = (async (): Promise<SyncResult> => {
    let sent = 0
    let failed = 0
    let ops = await listOps(scope)
    // Sent in a batch this round: not again until the next round.
    const tried = new Set<string>()
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i]
      if (op.status !== 'waiting' || tried.has(op.id)) continue
      // Waits for a row made offline that hasn't been sent yet.
      if (tempIdsIn(op).some((t) => t !== op.tempId)) continue

      const batch = batchFor(op)
      if (batch && !noBatchEndpoint.has(batch.url)) {
        // This change and the same kind that follow it, up to the next other change.
        const group: Op[] = []
        for (let j = i; j < ops.length && group.length < BATCH_SIZE; j++) {
          if (ops[j].status !== 'waiting' || tried.has(ops[j].id)) continue
          if (batchFor(ops[j])?.url !== batch.url) break
          group.push(ops[j])
        }
        group.forEach((o) => tried.add(o.id))
        let res: { data: unknown }
        try {
          res = await send({
            method: 'POST',
            url: batch.url,
            data: { [batch.key]: group.map((o) => o.data) },
            timeout: 60_000,
            headers: { 'X-Device-Id': String((op.data as { deviceId?: unknown })?.deviceId ?? '') },
          })
        } catch (err) {
          const status = apiStatus(err)
          if (status === 404 || status === 405) {
            noBatchEndpoint.add(batch.url)
            group.forEach((o) => tried.delete(o.id))
            i--
            continue
          }
          // No answer, too many requests, or a server error: the same batch
          // goes again later — what was recorded comes back as a duplicate.
          if (isUnreachableError(err) || status === 429 || (status ?? 0) >= 500) {
            emit()
            return { sent, failed, stopped: true }
          }
          // The batch as a whole was refused (e.g. invalid_payload): mark each.
          for (const o of group) await saveOp(refused(o, err))
          failed += group.length
          emit()
          continue
        }
        const results = new Map(batchResults(res?.data).map((r) => [r.clientId, r]))
        let madeRows = false
        for (const o of group) {
          const r = results.get(String((o.data as { clientId?: unknown }).clientId))
          if (!r) continue // not answered for: stays waiting for next time
          if (r.status === 'rejected') {
            failed++
            await saveOp({ ...o, status: 'failed', code: r.code, error: refusalMessage(r.code, r.message ?? 'Refused by the server', o.names) })
            continue
          }
          await dropOp(o)
          sent++
          if (o.tempId !== undefined && Number(r.id) > 0) {
            await swapTempId(scope, o.tempId, Number(r.id))
            madeRows = true
          }
        }
        emit()
        ops = await listOps(scope)
        // Anything waiting on these rows can go now: start over.
        i = madeRows ? -1 : ops.findIndex((o) => o.id > group[group.length - 1].id) - 1
        if (i < -1) break
        continue
      }

      try {
        const res = await send(op)
        await dropOp(op)
        sent++
        const realId = Number(rowIn(res?.data)?.id)
        if (op.tempId !== undefined && Number.isFinite(realId) && realId > 0) {
          await swapTempId(scope, op.tempId, realId)
          ops = await listOps(scope)
          i = -1
        }
      } catch (err) {
        if (isUnreachableError(err)) {
          // No answer. If it may have arrived and a repeat would count twice, ask.
          if (!op.safeToRepeat && !browserOffline()) {
            await saveOp({
              ...op,
              status: 'check',
              error: 'The connection dropped while this was being sent, so it may already be recorded. Check, then send it again or discard it.',
            })
          }
          emit()
          return { sent, failed, stopped: true }
        }
        if (op.method === 'DELETE' && apiStatus(err) === 404) {
          // Already gone.
          await dropOp(op)
          sent++
          continue
        }
        if (apiStatus(err) === 429) {
          emit()
          return { sent, failed, stopped: true }
        }
        failed++
        await saveOp(refused(op, err))
      }
      emit()
    }
    emit()
    return { sent, failed, stopped: false }
  })()
  syncing.set(scope, run)
  emit()
  return run.finally(() => {
    syncing.delete(scope)
    emit()
  })
}

// ── Server changes (§13.3) ───────────────────────────────────────────────────

// Fold rows the server changed into every kept list of `collection`.
export const mergeIntoReads = (scope: string, collection: string, changed: Record<string, unknown>[], deleted: (row: Record<string, unknown>) => boolean) =>
  patchReads(scope, (key, body) => {
    if (!listsCollection(key, collection)) return undefined
    const rows = listIn(body)
    return rows ? withList(body, mergeRows(key, rows, changed, deleted)) : undefined
  }, (key) => listsCollection(key, collection))

// Any other change to the kept answers (e.g. stock levels inside products).
export const patchKeptReads = (scope: string, fn: (key: string, body: unknown) => unknown | undefined, match?: (key: string) => boolean) =>
  patchReads(scope, fn, match)

// The server answered a write that was also kept (it was slow, `waitMs`):
// the kept copy isn't needed, unless it's already being sent.
export const settleKept = async (scope: string, id: string) => {
  const op = (await listOps(scope)).find((o) => o.id === id)
  if (op && op.status === 'waiting' && !isSyncing(scope)) {
    await dropOp(op)
    emit()
  }
}

// Small values kept per scope (e.g. a sync cursor).
export const getKept = <T>(scope: string, name: string) => offlineStore().get<T>(`k:${scope}|${name}`).catch(() => undefined)
export const setKept = (scope: string, name: string, value: unknown) =>
  value === undefined ? offlineStore().delete(`k:${scope}|${name}`) : offlineStore().set(`k:${scope}|${name}`, value)

// Signed out on purpose: this person's cached answers go (waiting changes stay,
// to be sent next time they sign in).
export const forgetReads = async (scope: string) => {
  const store = offlineStore()
  try {
    for (const [k] of await store.entries(readPrefix(scope))) await store.delete(k)
  } catch {
    // nothing to forget
  }
}
