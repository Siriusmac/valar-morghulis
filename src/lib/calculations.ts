import type { AppData, Movement, MovementType, UserId } from '../types'

export interface MovementAllocation {
  categoryId: string
  amount: number
  shared: boolean
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export function movementAllocations(movement: Movement): MovementAllocation[] {
  const splits = (movement.splits ?? [])
    .filter((item) => Number.isFinite(item.amount) && item.amount > 0 && item.categoryId)
    .map((item) => ({ categoryId: item.categoryId, amount: roundMoney(item.amount), shared: item.shared }))
  const splitTotal = splits.reduce((sum, item) => sum + item.amount, 0)
  const remainder = roundMoney(Math.max(0, movement.amount - splitTotal))
  return [
    ...(remainder > 0 ? [{ categoryId: movement.categoryId, amount: remainder, shared: movement.shared }] : []),
    ...splits,
  ]
}

export function sharedMovementAmount(movement: Movement) {
  if (!movement.splits?.length && movement.sharedSettlementAmount !== undefined) {
    return movement.shared ? movement.sharedSettlementAmount : 0
  }
  return roundMoney(movementAllocations(movement)
    .filter((item) => item.shared)
    .reduce((sum, item) => sum + item.amount, 0))
}

export function movementHasSharedPortion(data: AppData, movement: Movement) {
  const account = data.accounts.find((item) => item.id === movement.accountId)
  return account?.scope === 'family' || sharedMovementAmount(movement) > 0
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
  for (const transfer of data.transfers) {
    const source = data.accounts.find((account) => account.id === transfer.fromAccountId)
    const destination = data.accounts.find((account) => account.id === transfer.toAccountId)
    if (source?.scope !== 'family' || destination?.scope !== 'personal' || !destination.ownerId) continue
    net += destination.ownerId === userId
      ? -transfer.amount * otherMembersShare
      : transfer.amount * personalShare
  }
  return Math.round(net * 100) / 100
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
  return data.movements.filter((item) => movementHasSharedPortion(data, item) || item.authorId === userId)
}

export function movementsForMonth(movements: Movement[], month: string, type?: MovementType) {
  return movements.filter((item) => item.date.startsWith(month) && (!type || item.type === type))
}

export function totalsByCategory(data: AppData, movements: Movement[], sharedOnly = false) {
  const totals = new Map<string, number>()
  for (const movement of movements) {
    const account = data.accounts.find((item) => item.id === movement.accountId)
    for (const allocation of movementAllocations(movement)) {
      if (sharedOnly && account?.scope !== 'family' && !allocation.shared) continue
      totals.set(allocation.categoryId, (totals.get(allocation.categoryId) ?? 0) + allocation.amount)
    }
  }
  return [...totals.entries()]
    .map(([categoryId, total]) => ({ category: data.categories.find((item) => item.id === categoryId), total }))
    .filter((item) => item.category)
    .toSorted((a, b) => b.total - a.total)
}
