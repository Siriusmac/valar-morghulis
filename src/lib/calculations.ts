import type { AppData, Movement, MovementType, UserId } from '../types'

export function sharedBalance(data: AppData, userId: UserId) {
  let net = 0
  for (const movement of data.movements) {
    if (!movement.shared) continue
    const account = data.accounts.find((item) => item.id === movement.accountId)
    if (account?.scope === 'family') continue
    const half = (movement.sharedSettlementAmount ?? movement.amount) / 2
    const direction = movement.type === 'expense' ? 1 : -1
    net += movement.memberId === userId ? half * direction : -half * direction
  }
  for (const item of data.reimbursements) {
    if (item.toId === userId) net -= item.amount
    if (item.fromId === userId) net += item.amount
  }
  return Math.round(net * 100) / 100
}

export function accountBalance(data: AppData, accountId: string) {
  const account = data.accounts.find((item) => item.id === accountId)
  if (!account) return 0
  let balance = account.openingBalance
  for (const movement of data.movements) {
    if (movement.accountId !== accountId) continue
    balance += movement.type === 'income' ? movement.amount : -movement.amount
  }
  for (const transfer of data.transfers) {
    if (transfer.fromAccountId === accountId) balance -= transfer.amount
    if (transfer.toAccountId === accountId) balance += transfer.amount
  }
  for (const reimbursement of data.reimbursements) {
    if (reimbursement.fromAccountId === accountId) balance -= reimbursement.amount
    if (reimbursement.toAccountId === accountId) balance += reimbursement.amount
  }
  return Math.round(balance * 100) / 100
}

export function visibleMovements(data: AppData, userId: UserId) {
  const familyAccountIds = new Set(data.accounts.filter((item) => item.scope === 'family').map((item) => item.id))
  return data.movements.filter((item) => item.shared || item.authorId === userId || familyAccountIds.has(item.accountId))
}

export function movementsForMonth(movements: Movement[], month: string, type?: MovementType) {
  return movements.filter((item) => item.date.startsWith(month) && (!type || item.type === type))
}

export function totalsByCategory(data: AppData, movements: Movement[]) {
  const totals = new Map<string, number>()
  for (const movement of movements) totals.set(movement.categoryId, (totals.get(movement.categoryId) ?? 0) + movement.amount)
  return [...totals.entries()]
    .map(([categoryId, total]) => ({ category: data.categories.find((item) => item.id === categoryId), total }))
    .filter((item) => item.category)
    .toSorted((a, b) => b.total - a.total)
}
