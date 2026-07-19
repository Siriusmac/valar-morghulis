export type UserId = 'simone' | 'anna'
export type PageId = 'dashboard' | 'movements' | 'accounts' | 'categories' | 'beneficiaries' | 'tags'
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
  type: 'bank' | 'credit' | 'cash'
  scope: Scope
  openingBalance: number
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
  shared: boolean
  createdAt: string
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
  toAccountId?: string
}

export interface AppData {
  version: 2
  accounts: Account[]
  categories: Category[]
  beneficiaries: Beneficiary[]
  tags: Tag[]
  movements: Movement[]
  transfers: Transfer[]
  reimbursements: Reimbursement[]
}
