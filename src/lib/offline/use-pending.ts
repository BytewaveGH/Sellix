'use client'

// Rows made local-first (a till's counter orders) that the server doesn't
// have yet, for a screen to show with what it loaded — straight from the
// outbox, so nothing has to reload when one is made.

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { sessionScope } from '../axios-client'
import { pendingRows, subscribeOutbox, type PendingRow } from './engine'

export const usePendingRows = (collection: string, enabled = true): PendingRow[] => {
  const { data: session } = useSession()
  const scope = sessionScope(session?.user)
  const [rows, setRows] = useState<PendingRow[]>([])
  useEffect(() => {
    if (!scope || !enabled) return setRows([])
    let live = true
    const load = () => void pendingRows(scope, collection).then((r) => live && setRows(r))
    load()
    const stop = subscribeOutbox(load)
    return () => {
      live = false
      stop()
    }
  }, [scope, collection, enabled])
  return rows
}
