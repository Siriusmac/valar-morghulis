import type { AppData, UserId } from '../types'

export function sharedBalance(data: AppData, userId: UserId) {
  let net = 0
  for (const expense of data.expenses) {
    if (!expense.shared) continue
    const half = expense.amount / 2
    net += expense.payerId === userId ? half : -half
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
  const outgoings = data.expenses
    .filter((item) => item.accountId === accountId)
    .reduce((total, item) => total + item.amount, 0)
  return account.openingBalance - outgoings
}
