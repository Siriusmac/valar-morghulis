import { makeId } from './format'
import type { Account, AppData, BankingOperationType, Category, User } from '../types'

export const bankingOperationLabels: Record<BankingOperationType, string> = {
  bank_transfer: 'Bonifico',
  postal_order: 'Bollettino',
  cbill: 'CBILL',
  f24: 'F24',
  pagopa: 'PagoPA',
}

export function bankFeeCategoryName(account: Account) {
  return `Commissioni ${account.institution.trim() || account.name.trim()}`
}

export function resolveBankFeeCategory(data: AppData, user: User, account: Account): { category: Category; created: boolean } {
  const name = bankFeeCategoryName(account)
  const existing = data.categories.find((item) => item.movementType === 'expense'
    && item.scope === account.scope
    && (item.scope === 'family' || item.ownerId === user.id)
    && item.name.localeCompare(name, 'it-IT', { sensitivity: 'base' }) === 0)
  if (existing) return { category: existing, created: false }
  return {
    category: {
      id: makeId('category-bank-fees'),
      name,
      scope: account.scope,
      ownerId: account.scope === 'personal' ? user.id : undefined,
      movementType: 'expense',
      color: '#a87921',
    },
    created: true,
  }
}
