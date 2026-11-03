// Real-estate domain. Field names match the API contract in
// BACKEND_REQUIREMENTS.md §6 (ids are numbers, dates are YYYY-MM-DD strings).

export type PropertyType = 'compound-house' | 'apartment-building' | 'short-stay' | 'single-family' | 'commercial' | 'mixed-use' | 'land'

export type LandSizeUnit = 'plots' | 'acres' | 'hectares' | 'sqm' | 'sqft'
// Where a piece of land is in its life — drives what the owner sees next.
export type LandStage = 'bare' | 'fenced' | 'under-construction' | 'completed'
// Ghanaian land paperwork, from weakest to strongest.
export type LandTitleStatus = 'none' | 'allocation-note' | 'indenture' | 'site-plan' | 'registered' | 'title-certificate'

export interface LandDetails {
  size: number
  sizeUnit: LandSizeUnit
  stage: LandStage
  titleStatus: LandTitleStatus
  // GhanaPost GPS digital address, e.g. "AK-485-9323"
  gpsAddress?: string
}

// long-term = monthly rent with a lease; short-stay = nightly bookings (Airbnb style)
export type RentalMode = 'long-term' | 'short-stay'

// Stored unit flag. Occupancy itself is derived from leases/bookings, never stored.
export type UnitAvailability = 'available' | 'maintenance' | 'unlisted'

export interface Property {
  id: number
  name: string
  type: PropertyType
  address: string
  city: string
  region?: string
  description?: string
  coverImageUrl?: string
  // What it cost to acquire — the start of "total invested".
  purchasePrice?: number
  purchaseDate?: string
  seller?: string
  // Only for type 'land'.
  land?: LandDetails
  // Shown on the public website (site.ts). Off until the owner turns it on.
  listed?: boolean
  // Website gallery, cover first. Uploaded links (data URLs in local mode).
  photos?: string[]
  createdAt?: string
}

// Facilities a room type can have, and whether the occupant has them to
// themselves, shares them with other units, or doesn't have them at all.
export type FacilityKey = 'bathroom' | 'toilet' | 'kitchen' | 'electricity' | 'water'
export type FacilityAccess = 'private' | 'shared' | 'none'

// Owner-defined room type, shared across all their properties — e.g.
// "Single room (shared facilities)" or "Chamber & hall (self-contained)".
export interface UnitType {
  id: number
  name: string
  description?: string
  bedrooms: number
  // "halls" / sitting rooms — a chamber & hall has 1 bedroom + 1 hall
  livingRooms: number
  facilities: Record<FacilityKey, FacilityAccess>
  // Free-form extras: porch, wardrobe, ceiling fan, parking…
  amenities: string[]
  // Defaults for new units of this type; each unit keeps its own price.
  rentalMode: RentalMode
  defaultMonthlyRent: number
  defaultNightlyRate: number
  maxGuests: number
}

export interface Unit {
  id: number
  propertyId: number
  // Room type (UnitType.id). null only for units whose type was deleted/never set.
  unitTypeId: number | null
  name: string
  rentalMode: RentalMode
  // long-term — the unit's own listed rent (a lease carries the agreed rent)
  monthlyRent: number
  // short-stay
  nightlyRate: number
  maxGuests: number
  availability: UnitAvailability
  // Website photos of this unit; the property's gallery is used when empty.
  photos?: string[]
  notes?: string
}

export interface Tenant {
  id: number
  fullName: string
  phone: string
  email?: string
  idType?: 'ghana-card' | 'passport' | 'voter-id' | 'drivers-license' | 'other'
  idNumber?: string
  occupation?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  notes?: string
}

export interface Lease {
  id: number
  unitId: number
  tenantId: number
  startDate: string
  // Agreed end of the term (Ghana: usually 1–2 years). Optional for open-ended.
  endDate?: string
  monthlyRent: number
  // How many months are paid at a time (advance), e.g. 12 or 24.
  billingCycleMonths: number
  securityDeposit: number
  // Set on move-out; the lease no longer counts as active after this date.
  terminatedOn?: string
  notes?: string
}

export type PaymentMethod = 'cash' | 'momo' | 'bank'

export interface RentPayment {
  id: number
  leaseId: number
  amount: number
  paidOn: string
  method: PaymentMethod
  reference?: string
  note?: string
}

export type BookingStatus = 'inquiry' | 'confirmed' | 'checked-in' | 'checked-out' | 'cancelled'
export type BookingChannel = 'direct' | 'airbnb' | 'booking-com' | 'other'

export interface Booking {
  id: number
  unitId: number
  guestName: string
  guestPhone?: string
  guests: number
  checkIn: string
  // Departure day (exclusive night).
  checkOut: string
  nightlyRate: number
  cleaningFee: number
  amountPaid: number
  channel: BookingChannel
  status: BookingStatus
  notes?: string
}

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent'
export type MaintenanceStatus = 'open' | 'in-progress' | 'resolved'

export interface MaintenanceRequest {
  id: number
  propertyId: number
  unitId?: number | null
  title: string
  description?: string
  priority: MaintenancePriority
  status: MaintenanceStatus
  cost: number
  reportedOn: string
  resolvedOn?: string
}

// ── Development (building projects) ──────────────────────────────────────────

export type ProjectStatus = 'planning' | 'in-progress' | 'on-hold' | 'completed'
export type PhaseStatus = 'not-started' | 'in-progress' | 'done'
export type ExpenseCategory = 'land' | 'materials' | 'labour' | 'equipment' | 'transport' | 'permits' | 'professional' | 'other'

// A building/renovation project on a property, e.g. "4-bedroom house".
export interface Project {
  id: number
  propertyId: number
  name: string
  description?: string
  status: ProjectStatus
  startDate?: string
  targetEndDate?: string
  budget: number
}

export interface ProjectPhase {
  id: number
  projectId: number
  name: string
  // Display order (1, 2, 3…)
  position: number
  status: PhaseStatus
  startDate?: string
  endDate?: string
  budget: number
  notes?: string
}

// Money spent on a property — optionally inside a project phase. For
// materials, quantity × unitCost = amount (e.g. 200 bags of cement × ₵95).
export interface Expense {
  id: number
  propertyId: number
  projectId?: number | null
  phaseId?: number | null
  category: ExpenseCategory
  description: string
  quantity?: number
  unit?: string
  unitCost?: number
  amount: number
  date: string
  supplier?: string
  // Receipt / invoice in Documents
  documentId?: number | null
}

// ── Documents ────────────────────────────────────────────────────────────────

export type DocumentCategory =
  | 'indenture'
  | 'site-plan'
  | 'land-title'
  | 'building-permit'
  | 'tenancy-agreement'
  | 'receipt'
  | 'id-document'
  | 'photo'
  | 'other'

// Metadata; the file itself is stored separately (IndexedDB locally, object
// storage on the server).
export interface DocumentRecord {
  id: number
  title: string
  category: DocumentCategory
  fileName: string
  mimeType: string
  size: number
  uploadedAt: string
  propertyId?: number | null
  unitId?: number | null
  tenantId?: number | null
  leaseId?: number | null
  projectId?: number | null
  notes?: string
}

export type ResourceMap = {
  unitTypes: UnitType
  properties: Property
  units: Unit
  tenants: Tenant
  leases: Lease
  payments: RentPayment
  bookings: Booking
  maintenance: MaintenanceRequest
  projects: Project
  phases: ProjectPhase
  expenses: Expense
  documents: DocumentRecord
}

export type ResourceName = keyof ResourceMap
