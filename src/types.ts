export type UserId = string
export type PageId = 'dashboard' | 'movements' | 'scheduled' | 'reimbursements' | 'accounts' | 'categories' | 'beneficiaries' | 'tags' | 'contacts' | 'guide' | 'account'
export type MovementType = 'expense' | 'income'
export type Scope = 'family' | 'personal'

export interface User {
  id: UserId
  name: string
  firstName?: string
  lastName?: string
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

export interface Sender {
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

export interface MovementSplit {
  id: string
  amount: number
  categoryId: string
  beneficiaryId?: string
  tagId?: string
  shared: boolean
  commissionedPurchaseId?: string
  excludeFromReports?: boolean
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
  beneficiaryId?: string
  senderId?: string
  accountId: string
  tagId?: string
  comments?: string
  shared: boolean
  splits?: MovementSplit[]
  installmentPlanId?: string
  installmentProvider?: string
  installmentNumber?: number
  installmentCount?: number
  sharedSettlementAmount?: number
  affectsAccountBalance?: boolean
  commissionedPurchaseId?: string
  paidByUserId?: UserId
  excludeFromReports?: boolean
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
  beneficiaryId?: string
  accountId: string
  tagId?: string
  comments?: string
  shared: boolean
  splits?: MovementSplit[]
  provider?: string
  installmentNumber: number
  installmentCount: number
  status: 'scheduled' | 'paid'
  paidMovementId?: string
  affectsAccountBalance?: boolean
  commissionedPurchaseId?: string
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
  groupId?: string
  fromId: UserId
  toId: UserId
  amount: number
  date: string
  authorId: UserId
  fromAccountId?: string
  toAccountId?: string
  status?: 'pending' | 'confirmed' | 'rejected' | 'cancelled'
  confirmedBy?: UserId
  confirmedAt?: string
  rejectedBy?: UserId
  rejectedAt?: string
  settlementMethod?: 'money' | 'purchase'
  commissionedPurchaseId?: string
  changeRequest?: ReimbursementChangeRequest
  cancelledBy?: UserId
  cancelledAt?: string
}

export interface ReimbursementChangeRequest {
  id: string
  kind: 'update' | 'delete'
  requestedBy: UserId
  requestedAt: string
  amount?: number
  date?: string
  selectedAccountId?: string
}

export interface Contact {
  id: UserId
  name: string
  email: string
  initials: string
  source: 'friend' | 'family'
  familyNames?: string[]
}

export interface ContactInvitation {
  id: string
  email: string
  status: 'pending' | 'expired' | 'declined'
  createdAt: string
  expiresAt: string
}

export interface CommissionedPurchase {
  id: string
  payerId: UserId
  recipientId?: UserId
  invitationId?: string
  familyId?: string
  reimbursementId?: string
  payerMovementId: string
  amount: number
  purchaseDate: string
  description: string
  status: 'pending' | 'confirmed' | 'rejected'
  recipientMovementId?: string
  recipientCategoryId?: string
  recipientAccountId?: string
  createdAt: string
}

export interface ReimbursementAccountReference {
  familyId: string
  ownerId: UserId
  accountId: string
  name: string
}

export interface AppData {
  version: 3
  accounts: Account[]
  categories: Category[]
  deletedCategoryIds?: string[]
  beneficiaries: Beneficiary[]
  senders: Sender[]
  deletedBeneficiaryIds?: string[]
  deletedSenderIds?: string[]
  tags: Tag[]
  tagReportIds: string[]
  movements: Movement[]
  scheduledPayments: ScheduledPayment[]
  transfers: Transfer[]
  reimbursements: Reimbursement[]
}
