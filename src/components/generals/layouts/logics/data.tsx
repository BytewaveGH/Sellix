import {
  LayoutDashboard,
  BarChart,
  Package,
  Building2,
  Warehouse,
  ShoppingCart,
  Hourglass,
  CheckCircle,
  Users,
  UserCog,
  Settings,
  CreditCard,
  ScanLine,
  Ticket,
  Compass,
  CalendarCheck,
  Trophy,
  Building,
  Wallet,
  BedDouble,
  Hammer,
  Shapes,
  FileText,
  ClipboardList,
  UtensilsCrossed,
  Palette,
  Receipt,
  Gem,
  CircleUser,
} from 'lucide-react'
import { ITopNavItems } from './interface'

export const topNavItems: ITopNavItems[] = [{ id: 1, label: '', content: '' }]

const retailSidebarItems = [
  {
    title: 'Point of Sale',
    items: [{ label: 'POS', href: '/en/stores/pos', icon: ScanLine, requiredPermission: 'canManageSales' }],
  },
  {
    title: 'Dashboard',
    items: [
      { label: 'Overview', href: '/en/stores/overview', icon: LayoutDashboard, requiredPermission: 'canViewReports' },
      { label: 'Analytics', href: '/en/stores/analytics', icon: BarChart, requiredPermission: 'canViewReports' },
    ],
  },
  {
    title: 'Sales',
    items: [
      { label: 'All orders', href: '/en/stores/orders', icon: ShoppingCart, requiredPermission: 'canManageSales' },
      { label: 'Pending', href: '/en/stores/orders/pending', icon: Hourglass, requiredPermission: 'canManageSales' },
      { label: 'Completed', href: '/en/stores/orders/completed', icon: CheckCircle, requiredPermission: 'canManageSales' },
      { label: 'Customers', href: '/en/stores/customers', icon: Users, requiredPermission: 'canManageSales' },
    ],
  },
  {
    title: 'Products',
    items: [
      { label: 'All products', href: '/en/stores/products', icon: Package, requiredPermission: 'canManageProducts' },
      { label: 'Inventory', href: '/en/stores/products/inventory', icon: Warehouse, requiredPermission: 'canManageStock' },
      { label: 'Warehouses', href: '/en/stores/products/categories', icon: Building2, requiredPermission: 'canManageWarehouses' },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Store settings', href: '/en/stores/settings', icon: Settings, requiredPermission: 'canManageOperations' },
      { label: 'Payment', href: '/en/stores/payment-settings', icon: CreditCard, requiredPermission: 'canManageOperations' },
    ],
  },
]

const amusementSidebarItems = [
  {
    title: 'Dashboard',
    items: [{ label: 'Overview', href: '/en/amusement', icon: LayoutDashboard, requiredPermission: 'canViewReports' }],
  },
  {
    title: 'Ticketing',
    items: [{ label: 'Tickets', href: '/en/amusement/tickets', icon: Ticket, requiredPermission: 'canManageSales' }],
  },
  {
    title: 'Park',
    items: [{ label: 'Attractions', href: '/en/amusement/attractions', icon: Compass, requiredPermission: 'canManageProducts' }],
  },
  {
    title: 'Reservations',
    items: [{ label: 'Bookings', href: '/en/amusement/bookings', icon: CalendarCheck, requiredPermission: 'canManageSales' }],
  },
  {
    title: 'Leaderboard',
    items: [{ label: 'Leaderboard', href: '/en/amusement/leaderboard', icon: Trophy, requiredPermission: 'canManageSales' }],
  },
]

const realEstateSidebarItems = [
  {
    title: 'Dashboard',
    items: [{ label: 'Portfolio', href: '/en/real-estate', icon: LayoutDashboard, requiredPermission: 'canViewReports' }],
  },
  {
    title: 'Properties',
    items: [
      { label: 'Properties', href: '/en/real-estate/properties', icon: Building, requiredPermission: 'canManageProducts' },
      { label: 'Room types', href: '/en/real-estate/room-types', icon: Shapes, requiredPermission: 'canManageProducts' },
      { label: 'Tenants', href: '/en/real-estate/tenants', icon: Users, requiredPermission: ['canManageSales', 'canViewReports'] },
      { label: 'Rent & payments', href: '/en/real-estate/rent', icon: Wallet, requiredPermission: ['canManageSales', 'canViewReports'] },
      {
        label: 'Documents',
        href: '/en/real-estate/documents',
        icon: FileText,
        requiredPermission: ['canManageProducts', 'canViewReports'],
      },
    ],
  },
  {
    title: 'Short stays',
    items: [
      { label: 'Bookings', href: '/en/real-estate/bookings', icon: BedDouble, requiredPermission: ['canManageSales', 'canViewReports'] },
    ],
  },
  {
    title: 'Upkeep',
    items: [
      {
        label: 'Repairs',
        href: '/en/real-estate/maintenance',
        icon: Hammer,
        requiredPermission: ['canManageOperations', 'canViewReports'],
      },
    ],
  },
]

// Eatery has no dedicated modules built yet (see the amusement park build for the
// pattern to follow) — keep it to what already exists so it doesn't dead-end on
// retail-only routes.
const eaterySidebarItems = [
  {
    title: 'Dashboard',
    items: [
      { label: 'Overview', href: '/en/eatery', icon: LayoutDashboard, requiredPermission: 'canViewReports' },
      { label: 'Sales', href: '/en/eatery/sales', icon: Receipt, requiredPermission: 'canViewReports' },
    ],
  },
  {
    title: 'Restaurant',
    items: [
      { label: 'Counter (POS)', href: '/en/eatery/pos', icon: ScanLine, requiredPermission: 'canManageSales' },
      { label: 'Live orders', href: '/en/eatery/orders', icon: ClipboardList, requiredPermission: 'canManageSales' },
      { label: 'Menu', href: '/en/eatery/menu', icon: UtensilsCrossed, requiredPermission: 'canManageProducts' },
      { label: 'Ingredients & costs', href: '/en/eatery/stock', icon: Package, requiredPermission: 'canManageStock' },
      { label: 'Brand & theme', href: '/en/eatery/brand', icon: Palette, requiredPermission: 'canManageProducts' },
      { label: 'Settings', href: '/en/eatery/settings', icon: Settings, requiredPermission: 'canManageOperations' },
    ],
  },
]

export type SidebarGroup = {
  title: string
  // One permission key, or a list of which any one is enough.
  items: {
    label: string
    href: string
    icon: (typeof retailSidebarItems)[number]['items'][number]['icon']
    requiredPermission?: string | string[]
    // Hidden from staff whatever their permissions.
    ownerOnly?: boolean
    // Set by the layout: the page's feature isn't on the business's plan.
    locked?: boolean
  }[]
}

// Every module ends with the same account section: staff management, your
// own account (everyone) and the plan (owner only).
const accountGroup: SidebarGroup = {
  title: 'Account',
  items: [
    { label: 'Team', href: '/en/team', icon: UserCog, requiredPermission: 'canManageEmployees' },
    { label: 'My account', href: '/en/account', icon: CircleUser },
    { label: 'Plan & billing', href: '/en/billing', icon: Gem, ownerOnly: true },
  ],
}

const sidebarItemsByAppType: Record<string, SidebarGroup[]> = {
  retail: retailSidebarItems,
  amusement: amusementSidebarItems,
  eatery: eaterySidebarItems,
  'real-estate': realEstateSidebarItems,
}

export const getSidebarItems = (appType: string | undefined | null): SidebarGroup[] => [
  ...(sidebarItemsByAppType[appType ?? 'retail'] ?? retailSidebarItems),
  accountGroup,
]

// Retail is still the default vertical — keep this export for anything importing the flat list directly.
export const sidebarItems = retailSidebarItems
