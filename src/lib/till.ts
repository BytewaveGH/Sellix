// This till's identity for sales made here: a device id (kept per browser) and
// receipt numbers it can print before the server has seen the sale
// (BACKEND_REQUIREMENTS §13.1: `deviceId`, `receiptNo`, `soldAt`).

const DEVICE_KEY = 'sellix:device-id'
const SEQ_KEY = 'sellix:receipt-seq'

const random = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('')

// One per sale or order, kept when it's sent again: the server records it once.
export const newClientId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

let memoryDevice: string | null = null
let memorySeq = 0

// "till-7d3f9a2c": made once, then the same on this browser.
export const deviceId = (): string => {
  try {
    const kept = localStorage.getItem(DEVICE_KEY)
    if (kept) return kept
    const made = `till-${random(8)}`
    localStorage.setItem(DEVICE_KEY, made)
    return made
  } catch {
    return (memoryDevice ??= `till-${random(8)}`)
  }
}

// "7D3F-0042": the device's last four characters and a running number.
export const nextReceiptNo = (): string => {
  let seq: number
  try {
    seq = (Number(localStorage.getItem(SEQ_KEY)) || 0) + 1
    localStorage.setItem(SEQ_KEY, String(seq))
  } catch {
    seq = ++memorySeq
  }
  return `${deviceId().slice(-4).toUpperCase()}-${String(seq).padStart(4, '0')}`
}

// What every till sale or counter order carries. `soldAt` is when it happened,
// which may be long before it reaches the server.
export const tillFields = (receiptNo: string, at = new Date()) => ({
  receiptNo,
  deviceId: deviceId(),
  soldAt: at.toISOString(),
})
