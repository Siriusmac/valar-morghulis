export type UserId = 'simone' | 'anna'
export type PageId = 'dashboard' | 'expenses' | 'accounts' | 'categories' | 'beneficiaries'

export interface User {
  id: UserId
  name: string
  email: string
  initials: string
}

export interface Account {
  id: string
  ownerId: UserId
  name: string
  institution: string
  type: 'bank' | 'credit' | 'cash'
  openingBalance: number
}

export interface Category {
  id: string
  name: string
  scope: 'family' | 'personal'
  ownerId?: UserId
  color: string
}

export interface Beneficiary {
  id: string
  name: string
  scope: 'family' | 'personal'
  ownerId?: UserId
}

export interface Expense {
  id: string
  authorId: UserId
  payerId: UserId
  amount: number
  date: string
  description: string
  categoryId: string
  beneficiaryId: string
  accountId: string
  shared: boolean
  createdAt: string
}

export interface Reimbursement {
  id: string
  fromId: UserId
  toId: UserId
  amount: number
  date: string
  authorId: UserId
}

export interface AppData {
  version: 1
  accounts: Account[]
  categories: Category[]
  beneficiaries: Beneficiary[]
  expenses: Expense[]
  reimbursements: Reimbursement[]
}
