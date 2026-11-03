// What each staff permission means in each module, and quick role presets.
//
// The backend has one set of permission keys for every module; each module
// reads only some of them (see the sidebars in layouts/logics/data.tsx, the
// route guard in middleware.ts and real-estate/_logics/access.ts). The staff
// form shows only the keys the business's module uses, in its own words.

import {
  BarChart2,
  Building,
  Building2,
  ChefHat,
  Compass,
  FileText,
  Hammer,
  Package,
  Palette,
  Settings2,
  ShoppingCart,
  Ticket,
  Users,
  Wallet,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import type { EmployeePermissions } from '@/types/next-auth'
import type { AppType } from '@/lib/app-type'

export type PermissionKey = keyof EmployeePermissions

export const PERMISSION_KEYS: PermissionKey[] = [
  'canViewReports',
  'canManageProducts',
  'canManageStock',
  'canManageSales',
  'canManageInvoices',
  'canManageOperations',
  'canManageWarehouses',
  'canManageEmployees',
]

export interface StaffPermission {
  key: PermissionKey
  label: string
  description: string
  icon: LucideIcon
  color: string
}

export interface RolePreset {
  label: string
  description: string
  color: string
  // Only the keys this module uses; the rest are always off.
  grants: PermissionKey[]
}

interface StaffModule {
  permissions: StaffPermission[]
  presets: RolePreset[]
}

const EMPLOYEES: StaffPermission = {
  key: 'canManageEmployees',
  label: 'Manage staff',
  description: 'Add staff and set what they can do',
  icon: Users,
  color: 'bg-indigo-100 text-indigo-700',
}

const PRESET_COLORS = {
  admin: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  manager: 'bg-purple-100 text-purple-700 border-purple-200',
  green: 'bg-green-100 text-green-700 border-green-200',
  amber: 'bg-amber-100 text-amber-700 border-amber-200',
  sky: 'bg-sky-100 text-sky-700 border-sky-200',
}

// Admin = everything the module uses; Manager = all but staff.
const leads = (permissions: StaffPermission[]): RolePreset[] => {
  const all = permissions.map((p) => p.key)
  return [
    { label: 'Admin', description: 'Everything', color: PRESET_COLORS.admin, grants: all },
    { label: 'Manager', description: 'All but staff', color: PRESET_COLORS.manager, grants: all.filter((k) => k !== 'canManageEmployees') },
  ]
}

const defineModule = (permissions: StaffPermission[], roles: RolePreset[]): StaffModule => ({
  permissions,
  presets: [...leads(permissions), ...roles],
})

export const STAFF_MODULES: Record<AppType, StaffModule> = {
  retail: defineModule(
    [
      {
        key: 'canManageSales',
        label: 'Sell at the POS',
        description: 'POS, orders and customers',
        icon: ShoppingCart,
        color: 'bg-green-100 text-green-700',
      },
      {
        key: 'canViewReports',
        label: 'See reports',
        description: 'Overview and analytics',
        icon: BarChart2,
        color: 'bg-blue-100 text-blue-700',
      },
      {
        key: 'canManageProducts',
        label: 'Manage products',
        description: 'Add and edit products and prices',
        icon: Package,
        color: 'bg-purple-100 text-purple-700',
      },
      {
        key: 'canManageStock',
        label: 'Manage inventory',
        description: 'Stock levels, adjustments and transfers',
        icon: Warehouse,
        color: 'bg-amber-100 text-amber-700',
      },
      {
        key: 'canManageInvoices',
        label: 'Manage invoices',
        description: 'Supplier invoices for stock',
        icon: FileText,
        color: 'bg-cyan-100 text-cyan-700',
      },
      {
        key: 'canManageWarehouses',
        label: 'Manage warehouses',
        description: 'Warehouses, categories and units',
        icon: Building2,
        color: 'bg-rose-100 text-rose-700',
      },
      {
        key: 'canManageOperations',
        label: 'Store settings',
        description: 'Store and payment settings',
        icon: Settings2,
        color: 'bg-orange-100 text-orange-700',
      },
      EMPLOYEES,
    ],
    [
      { label: 'Cashier', description: 'Sales only', color: PRESET_COLORS.green, grants: ['canManageSales'] },
      {
        label: 'Stock keeper',
        description: 'Stock and warehouses',
        color: PRESET_COLORS.amber,
        grants: ['canManageStock', 'canManageInvoices', 'canManageWarehouses'],
      },
    ]
  ),
  eatery: defineModule(
    [
      {
        key: 'canManageSales',
        label: 'Take orders',
        description: 'Counter (POS) and live orders',
        icon: ShoppingCart,
        color: 'bg-green-100 text-green-700',
      },
      {
        key: 'canViewReports',
        label: 'See sales & profit',
        description: 'Overview and sales history',
        icon: BarChart2,
        color: 'bg-blue-100 text-blue-700',
      },
      {
        key: 'canManageProducts',
        label: 'Edit menu & brand',
        description: 'Menu, deals, storefront look',
        icon: Palette,
        color: 'bg-purple-100 text-purple-700',
      },
      {
        key: 'canManageStock',
        label: 'Manage ingredients',
        description: 'Stock, purchases, waste and costs',
        icon: ChefHat,
        color: 'bg-amber-100 text-amber-700',
      },
      {
        key: 'canManageOperations',
        label: 'Restaurant settings',
        description: 'Hours, delivery, payments, tables',
        icon: Settings2,
        color: 'bg-orange-100 text-orange-700',
      },
      EMPLOYEES,
    ],
    [
      { label: 'Cashier / waiter', description: 'Takes orders', color: PRESET_COLORS.green, grants: ['canManageSales'] },
      { label: 'Kitchen', description: 'Orders and ingredients', color: PRESET_COLORS.amber, grants: ['canManageSales', 'canManageStock'] },
    ]
  ),
  'real-estate': defineModule(
    [
      {
        key: 'canManageSales',
        label: 'Manage tenants & rent',
        description: 'Tenants, leases, payments and short stays',
        icon: Wallet,
        color: 'bg-green-100 text-green-700',
      },
      {
        key: 'canManageProducts',
        label: 'Manage properties',
        description: 'Properties, units, room types, projects, documents',
        icon: Building,
        color: 'bg-purple-100 text-purple-700',
      },
      {
        key: 'canManageOperations',
        label: 'Manage repairs',
        description: 'Maintenance requests and costs',
        icon: Hammer,
        color: 'bg-orange-100 text-orange-700',
      },
      {
        key: 'canViewReports',
        label: 'View everything',
        description: 'Portfolio dashboard; read-only access to rent, repairs and projects',
        icon: BarChart2,
        color: 'bg-blue-100 text-blue-700',
      },
      EMPLOYEES,
    ],
    [
      { label: 'Rent collector', description: 'Tenants and rent', color: PRESET_COLORS.green, grants: ['canManageSales'] },
      { label: 'Caretaker', description: 'Repairs', color: PRESET_COLORS.amber, grants: ['canManageOperations'] },
      { label: 'Accountant', description: 'Read-only', color: PRESET_COLORS.sky, grants: ['canViewReports'] },
    ]
  ),
  amusement: defineModule(
    [
      {
        key: 'canManageSales',
        label: 'Sell tickets & bookings',
        description: 'Tickets, bookings and the leaderboard',
        icon: Ticket,
        color: 'bg-green-100 text-green-700',
      },
      {
        key: 'canManageProducts',
        label: 'Manage attractions',
        description: 'Rides, games and prices',
        icon: Compass,
        color: 'bg-purple-100 text-purple-700',
      },
      {
        key: 'canViewReports',
        label: 'See the overview',
        description: 'Park dashboard',
        icon: BarChart2,
        color: 'bg-blue-100 text-blue-700',
      },
      EMPLOYEES,
    ],
    [{ label: 'Ticket desk', description: 'Tickets and bookings', color: PRESET_COLORS.green, grants: ['canManageSales'] }]
  ),
}

export const staffModule = (appType: unknown): StaffModule => STAFF_MODULES[appType as AppType] ?? STAFF_MODULES.retail

// Every key set: granted ones on, the rest (including keys this module doesn't use) off.
export const presetValues = (preset: RolePreset): EmployeePermissions =>
  Object.fromEntries(PERMISSION_KEYS.map((k) => [k, preset.grants.includes(k)])) as unknown as EmployeePermissions

// The preset the current toggles match, if any (compared on the module's keys).
export const matchingPreset = (mod: StaffModule, values: Partial<EmployeePermissions>) =>
  mod.presets.find((p) => mod.permissions.every((perm) => !!values[perm.key] === p.grants.includes(perm.key))) ?? null
