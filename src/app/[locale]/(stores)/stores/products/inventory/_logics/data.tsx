import { InventoryTabsTypes } from './interface'

// Orders, customers and returns live in their own pages (Sales in the menu).
export const InventoryTabs: InventoryTabsTypes[] = [
  { key: 'Products', id: '1', label: 'Products' },
  { key: 'Transactions', id: '8', label: 'Transactions' },
  { key: 'Stocks', id: '4', label: 'Stocks' },
  { key: 'Operations', id: '3', label: 'Operations' },
  { key: 'Invoices', id: '9', label: 'Invoices' },
  { key: 'Transfers', id: '11', label: 'Transfers' },
]
