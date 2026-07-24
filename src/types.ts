export type UserId = string
export type PageId = 'dashboard' | 'movements' | 'scheduled' | 'accounts' | 'categories' | 'beneficiaries' | 'tags' | 'account'
export type MovementType = 'expense' | 'income'
export type Scope = 'family' | 'personal'

export interface User {
  id: UserId
  name: string
  email: string
  initials: string
}

export interface Account {
  id: string
  ownerId?: UserId
  name: string
  institution: string
  type: 'bank' | 'credit' | 'cash' | 'paypal'
  scope: Scope
  openingBalance: number
  openingBalanceDate?: string
}

export interface Category {
  id: string
  name: string
  scope: Scope
  ownerId?: UserId
  movementType: MovementType
  color: string
}

export interface Beneficiary {
  id: string
  name: string
  scope: Scope
  ownerId?: UserId
}

export interface Tag {
  id: string
  name: string
  scope: Scope
  ownerId?: UserId
  color: string
}

export interface Movement {
  id: string
  type: MovementType
  authorId: UserId
  memberId: UserId
  amount: number
  date: string
  description: string
  categoryId: string
  beneficiaryId: string
  accountId: string
  tagId?: string
  comments?: string
  shared: boolean
  installmentPlanId?: string
  installmentProvider?: string
  installmentNumber?: number
  installmentCount?: number
  sharedSettlementAmount?: number
  affectsAccountBalance?: boolean
  createdAt: string
}

export interface ScheduledPayment {
  id: string
  planId: string
  authorId: UserId
  memberId: UserId
  amount: number
  dueDate: string
  description: string
  categoryId: string
  beneficiaryId: string
  accountId: string
  tagId?: string
  comments?: string
  shared: boolean
  provider?: string
  installmentNumber: number
  installmentCount: number
  status: 'scheduled' | 'paid'
  paidMovementId?: string
}

export interface Transfer {
  id: string
  authorId: UserId
  fromAccountId: string
  toAccountId: string
  amount: number
  date: string
  description: string
}

export interface Reimbursement {
  id: string
  fromId: UserId
  toId: UserId
  amount: number
  date: string
  authorId: UserId
  fromAccountId: string
  toAccountId: string
}

export interface AppData {
  version: 3
  accounts: Account[]
  categories: Category[]
  beneficiaries: Beneficiary[]
  tags: Tag[]
  tagReportIds: string[]
  movements: Movement[]
  scheduledPayments: ScheduledPayment[]
  transfers: Transfer[]
  reimbursements: Reimbursement[]
}
