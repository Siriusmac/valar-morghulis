import type { AppData, Loan, Movement, MovementSplit, MovementType, Reimbursement, UserId } from '../types'

export interface MovementAllocation {
  categoryId: string
  beneficiaryId?: string
  tagId?: string
  tagIds: string[]
  amount: number
  shared: boolean
  excludeFromReports: boolean
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

interface AllocationSource {
  amount: number
  categoryId: string
  beneficiaryId?: string
  tagId?: string
  tagIds?: string[]
  shared: boolean
  splits?: MovementSplit[]
  commissionedPurchaseId?: string
  excludeFromReports?: boolean
}

export function movementTagIds(value: { tagId?: string; tagIds?: string[] }) {
  return [...new Set([...(value.tagIds ?? []), ...(value.tagId ? [value.tagId] : [])])]
    .filter(Boolean)
    .slice(0, 3)
}

export function movementAllocations(movement: AllocationSource): MovementAllocation[] {
  // A commissioned allocation changes the payer's account once, but belongs to
  // the recipient's personal bookkeeping and must not enter the payer's reports.
  const splits = (movement.splits ?? [])
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0)
    .map((item) => ({
      categoryId: item.categoryId,
      beneficiaryId: item.beneficiaryId,
      tagId: item.tagId,
      tagIds: movementTagIds(item),
      amount: roundMoney(item.amount),
      shared: item.shared,
      excludeFromReports: Boolean(item.excludeFromReports || item.commissionedPurchaseId),
    }))
  const splitTotal = splits.reduce((sum, item) => sum + item.amount, 0)
  const remainder = roundMoney(Math.max(0, movement.amount - splitTotal))
  return [
    ...(remainder > 0 ? [{
      categoryId: movement.categoryId,
      beneficiaryId: movement.beneficiaryId,
      tagId: movement.tagId,
      tagIds: movementTagIds(movement),
      amount: remainder,
      shared: movement.shared,
      excludeFromReports: Boolean(movement.excludeFromReports || movement.commissionedPurchaseId),
    }] : []),
    ...splits,
  ]
}

export function sharedMovementAmount(movement: Movement) {
  if (movement.sharedSettlementAmount !== undefined) {
    return movement.shared || movement.splits?.some((item) => item.shared) ? movement.sharedSettlementAmount : 0
  }
  return roundMoney(movementAllocations(movement)
    .filter((item) => item.shared && !item.excludeFromReports)
    .reduce((sum, item) => sum + item.amount, 0))
}

export function movementHasSharedPortion(data: AppData, movement: Movement) {
  const account = data.accounts.find((item) => item.id === movement.accountId)
  return account?.scope === 'family' || sharedMovementAmount(movement) > 0
}

export function reimbursementIsConfirmed(reimbursement: Reimbursement) {
  return reimbursement.status === undefined || reimbursement.status === 'confirmed'
}

export function sharedBalance(data: AppData, userId: UserId, memberCount = 2) {
  if (memberCount < 2) return 0
  let net = 0
  const personalShare = 1 / memberCount
  const otherMembersShare = (memberCount - 1) / memberCount
  for (const movement of data.movements) {
    const account = data.accounts.find((item) => item.id === movement.accountId)
    if (account?.scope === 'family') continue
    const settlementAmount = sharedMovementAmount(movement)
    if (settlementAmount <= 0) continue
    const direction = movement.type === 'expense' ? 1 : -1
    net += movement.memberId === userId
      ? settlementAmount * otherMembersShare * direction
      : -settlementAmount * personalShare * direction
  }
  for (const item of data.reimbursements) {
    if (!reimbursementIsConfirmed(item)) continue
    const destination = data.accounts.find((account) => account.id === item.toAccountId)
    if (destination?.scope === 'family') {
      net += item.fromId === userId
        ? item.amount * otherMembersShare
        : -item.amount * personalShare
    } else {
      if (item.toId === userId) net -= item.amount
      if (item.fromId === userId) net += item.amount
    }
  }
  for (const repayment of data.loanRepayments) {
    if (repayment.status !== 'confirmed' || repayment.method !== 'family_credit') continue
    if (repayment.borrowerId === userId) net -= repayment.amount
    if (repayment.lenderId === userId) net += repayment.amount
  }
  for (const transfer of data.transfers) {
    const source = data.accounts.find((account) => account.id === transfer.fromAccountId)
    const destination = data.accounts.find((account) => account.id === transfer.toAccountId)
    const sourceIsFamily = source?.scope === 'family'
    const destinationIsFamily = destination?.scope === 'family'
    if (sourceIsFamily === destinationIsFamily) continue
    if (sourceIsFamily) {
      const destinationOwnerId = destination?.ownerId ?? transfer.authorId
      net += destinationOwnerId === userId
        ? -transfer.amount * otherMembersShare
        : transfer.amount * personalShare
    } else {
      // Il conto personale può non essere visibile agli altri membri: in quel
      // caso l'autore del girofondi identifica comunque chi ha versato.
      const sourceOwnerId = source?.ownerId ?? transfer.authorId
      net += sourceOwnerId === userId
        ? transfer.amount * otherMembersShare
        : -transfer.amount * personalShare
    }
  }
  return Math.round(net * 100) / 100
}

export interface ReimbursementPlanItem {
  memberId: UserId
  availableCredit: number
  suggestedAmount: number
}

export function reimbursementPlan(data: AppData, userId: UserId, memberIds: UserId[]): ReimbursementPlanItem[] {
  const memberCount = memberIds.length
  if (memberCount < 2) return []
  const ownDebt = Math.max(0, -sharedBalance(data, userId, memberCount))
  const pendingPersonal = data.reimbursements.filter((item) => {
    if (item.status !== 'pending') return false
    const destination = data.accounts.find((account) => account.id === item.toAccountId)
    return destination?.scope !== 'family'
  })
  const pendingOutbound = pendingPersonal
    .filter((item) => item.fromId === userId)
    .reduce((sum, item) => sum + item.amount, 0)
  let remainingDebt = roundMoney(Math.max(0, ownDebt - pendingOutbound))

  return memberIds
    .filter((memberId) => memberId !== userId)
    .map((memberId) => {
      const credit = Math.max(0, sharedBalance(data, memberId, memberCount))
      const pendingIncoming = pendingPersonal
        .filter((item) => item.toId === memberId)
        .reduce((sum, item) => sum + item.amount, 0)
      return { memberId, availableCredit: roundMoney(Math.max(0, credit - pendingIncoming)) }
    })
    .filter((item) => item.availableCredit > 0)
    .toSorted((a, b) => b.availableCredit - a.availableCredit || a.memberId.localeCompare(b.memberId))
    .map((item) => {
      const suggestedAmount = roundMoney(Math.min(remainingDebt, item.availableCredit))
      remainingDebt = roundMoney(remainingDebt - suggestedAmount)
      return { ...item, suggestedAmount }
    })
    .filter((item) => item.suggestedAmount > 0)
}

export function accountBalance(data: AppData, accountId: string) {
  const account = data.accounts.find((item) => item.id === accountId)
  if (!account) return 0
  let balance = account.openingBalance
  for (const movement of data.movements) {
    if (movement.accountId !== accountId || movement.affectsAccountBalance === false) continue
    balance += movement.type === 'income' ? movement.amount : -movement.amount
  }
  for (const transfer of data.transfers) {
    if (transfer.fromAccountId === accountId) balance -= transfer.amount + (transfer.feeAmount ?? 0)
    if (transfer.toAccountId === accountId) balance += transfer.amount
  }
  for (const reimbursement of data.reimbursements) {
    if (!reimbursementIsConfirmed(reimbursement) || reimbursement.settlementMethod === 'purchase') continue
    if (reimbursement.fromAccountId === accountId) balance -= reimbursement.amount
    if (reimbursement.toAccountId === accountId) balance += reimbursement.amount
  }
  for (const loan of data.loans) {
    if (loan.status !== 'confirmed') continue
    if (loan.lenderAccountId === accountId) balance -= loan.amount
    if (loan.borrowerAccountId === accountId) balance += loan.amount
  }
  for (const repayment of data.loanRepayments) {
    if (repayment.status !== 'confirmed' || repayment.method !== 'money') continue
    if (repayment.fromAccountId === accountId) balance -= repayment.amount
    if (repayment.toAccountId === accountId) balance += repayment.amount
  }
  return Math.round(balance * 100) / 100
}

export function loanOutstanding(data: AppData, loan: Loan) {
  const repaid = data.loanRepayments
    .filter((item) => item.loanId === loan.id && item.status === 'confirmed')
    .reduce((sum, item) => sum + item.amount, 0)
  return roundMoney(Math.max(0, loan.amount - repaid))
}

export function loanAvailableToRepay(data: AppData, loan: Loan) {
  const reserved = data.loanRepayments
    .filter((item) => item.loanId === loan.id && item.status === 'pending')
    .reduce((sum, item) => sum + item.amount, 0)
  return roundMoney(Math.max(0, loanOutstanding(data, loan) - reserved))
}

export function visibleMovements(data: AppData, userId: UserId) {
  return data.movements.filter((item) => movementHasSharedPortion(data, item) || item.authorId === userId)
}

export function movementsForMonth(movements: Movement[], month: string, type?: MovementType) {
  return movements.filter((item) => !item.excludeFromReports && item.date.startsWith(month) && (!type || item.type === type))
}

export function sharedExpensesByMember(data: AppData, memberIds: UserId[], month: string) {
  const totals = new Map(memberIds.map((memberId) => [memberId, 0]))
  for (const movement of data.movements) {
    if (movement.excludeFromReports || movement.type !== 'expense' || !movement.date.startsWith(month)) continue
    const account = data.accounts.find((item) => item.id === movement.accountId)
    if (account?.scope === 'family' || !totals.has(movement.memberId)) continue
    const amount = sharedMovementAmount(movement)
    if (amount <= 0) continue
    totals.set(movement.memberId, roundMoney((totals.get(movement.memberId) ?? 0) + amount))
  }
  return memberIds.map((memberId) => ({ memberId, total: totals.get(memberId) ?? 0 }))
}

export function totalsByCategory(data: AppData, movements: Movement[], sharedOnly = false) {
  const totals = new Map<string, number>()
  for (const movement of movements) {
    if (movement.excludeFromReports) continue
    const account = data.accounts.find((item) => item.id === movement.accountId)
    for (const allocation of movementAllocations(movement)) {
      if (allocation.excludeFromReports) continue
      if (sharedOnly && account?.scope !== 'family' && !allocation.shared) continue
      totals.set(allocation.categoryId, (totals.get(allocation.categoryId) ?? 0) + allocation.amount)
    }
  }
  return [...totals.entries()]
    .map(([categoryId, total]) => ({ category: data.categories.find((item) => item.id === categoryId), total }))
    .filter((item) => item.category)
    .toSorted((a, b) => b.total - a.total)
}
