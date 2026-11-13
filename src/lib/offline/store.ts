// On-device storage for working offline: the last answer to every read, and
// the changes waiting to be sent. IndexedDB in the browser (localStorage is
// far too small for a product catalogue); a plain Map where there is none
// (tests, server render, private windows that block it).

export interface OfflineStore {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  // Every [key, value] whose key starts with `prefix`, in key order.
  entries<T>(prefix: string): Promise<[string, T][]>
  // Just the keys: cheap, nothing is read from disk.
  keys(prefix: string): Promise<string[]>
}

export const memoryStore = (): OfflineStore => {
  const map = new Map<string, unknown>()
  const copy = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
  return {
    get: async (k) => copy(map.get(k) as any),
    set: async (k, v) => void map.set(k, copy(v)),
    delete: async (k) => void map.delete(k),
    entries: async <T>(prefix: string) =>
      Array.from(map.entries())
        .filter(([k]) => k.startsWith(prefix))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, copy(v)] as [string, T]),
    keys: async (prefix) =>
      Array.from(map.keys())
        .filter((k) => k.startsWith(prefix))
        .sort(),
  }
}

const DB_NAME = 'sellix-offline'
const STORE = 'kv'

const idbStore = (): OfflineStore => {
  let opening: Promise<IDBDatabase> | null = null
  const db = () =>
    (opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    }))
  const run = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> => {
    const d = await db()
    return new Promise<T>((resolve, reject) => {
      const tx = d.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req.result as T)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    set: (k, v) => run('readwrite', (s) => s.put(v, k)),
    delete: (k) => run('readwrite', (s) => s.delete(k)),
    entries: async <T>(prefix: string) => {
      // Keys from `prefix` up to `prefix` + the highest character.
      const range = IDBKeyRange.bound(prefix, prefix + '￿')
      const [keys, values] = await Promise.all([
        run<IDBValidKey[]>('readonly', (s) => s.getAllKeys(range)),
        run<T[]>('readonly', (s) => s.getAll(range)),
      ])
      return keys.map((k, i) => [String(k), values[i]] as [string, T])
    },
    keys: async (prefix) =>
      (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿')))).map(String),
  }
}

// IndexedDB if it opens; otherwise memory, so the app still works this session.
const fallbackOnError = (primary: OfflineStore): OfflineStore => {
  const memory = memoryStore()
  let broken = false
  const use =
    <K extends keyof OfflineStore>(name: K) =>
    async (...args: unknown[]) => {
      if (!broken) {
        try {
          return await (primary[name] as (...a: unknown[]) => Promise<unknown>)(...args)
        } catch {
          broken = true
        }
      }
      return (memory[name] as (...a: unknown[]) => Promise<unknown>)(...args)
    }
  return { get: use('get'), set: use('set'), delete: use('delete'), entries: use('entries'), keys: use('keys') } as OfflineStore
}

let shared: OfflineStore | null = null

export const offlineStore = (): OfflineStore =>
  (shared ??= typeof indexedDB === 'undefined' ? memoryStore() : fallbackOnError(idbStore()))

// Tests swap in their own.
export const setOfflineStore = (s: OfflineStore | null) => {
  shared = s
}
