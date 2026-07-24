import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { accountBalance, sharedBalance } from './calculations'
import { addMonthsISO, splitAmount } from './format'
import { materializeDuePayments } from './scheduled'
import type { AppData, Movement } from '../types'

const expense = (id: string, memberId: 'simone' | 'anna', amount: number, accountId: string): Movement => ({
  id, type: 'expense', authorId: memberId, memberId, amount, accountId,
  date: '2026-07-18', description: id, categoryId: 'alimentari', beneficiaryId: 'lidl', shared: true, createdAt: '2026-07-18T10:00:00Z',
})

const cleanData = (): AppData => ({ ...structuredClone(defaultData), movements: [], transfers: [], reimbursements: [] })

describe('sharedBalance', () => {
  it('splits shared expenses 50/50', () => {
    const data = cleanData()
    data.movements = [expense('a', 'simone', 30, 'simone-bank'), expense('b', 'anna', 50, 'anna-bank')]
    expect(sharedBalance(data, 'simone')).toBe(-10)
    expect(sharedBalance(data, 'anna')).toBe(10)
  })

  it('splits shared expenses equally among three members', () => {
    const data = cleanData()
    data.movements = [expense('three-members', 'simone', 90, 'simone-bank')]
    expect(sharedBalance(data, 'simone', 3)).toBe(60)
    expect(sharedBalance(data, 'anna', 3)).toBe(-30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(-30)
  })

  it('ignores movements paid from a family account', () => {
    const data = cleanData()
    data.movements = [expense('family', 'simone', 200, 'family-bank')]
    expect(sharedBalance(data, 'simone')).toBe(0)
    expect(sharedBalance(data, 'anna')).toBe(0)
  })

  it('treats a shared income as money owed to the other member', () => {
    const data = cleanData()
    data.movements = [{ ...expense('income', 'simone', 100, 'simone-bank'), type: 'income', categoryId: 'stipendio' }]
    expect(sharedBalance(data, 'simone')).toBe(-50)
    expect(sharedBalance(data, 'anna')).toBe(50)
  })

  it('returns to zero after a reimbursement', () => {
    const data = cleanData()
    data.movements = [expense('a', 'simone', 30, 'simone-bank'), expense('b', 'anna', 50, 'anna-bank')]
    data.reimbursements = [{ id: 'r1', fromId: 'simone', toId: 'anna', amount: 10, date: '2026-07-18', authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-bank' }]
    expect(sharedBalance(data, 'simone')).toBe(0)
    expect(sharedBalance(data, 'anna')).toBe(0)
  })

  it('counts only half of a reimbursement paid into a shared account', () => {
    const data = cleanData()
    data.reimbursements = [{ id: 'r-family', fromId: 'simone', toId: 'anna', amount: 100, date: '2026-07-18', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank' }]
    expect(sharedBalance(data, 'simone')).toBe(50)
    expect(sharedBalance(data, 'anna')).toBe(-50)
  })

  it('distributes a reimbursement into a shared account among three members', () => {
    const data = cleanData()
    data.reimbursements = [{ id: 'r-family-three', fromId: 'simone', toId: 'anna', amount: 90, date: '2026-07-18', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank' }]
    expect(sharedBalance(data, 'simone', 3)).toBe(60)
    expect(sharedBalance(data, 'anna', 3)).toBe(-30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(-30)
  })

  it('creates a half-amount debt when funds move from a shared account to a personal account', () => {
    const data = cleanData()
    data.transfers = [{ id: 'family-to-personal', authorId: 'simone', fromAccountId: 'family-bank', toAccountId: 'simone-bank', amount: 100, date: '2026-07-18', description: 'Prelievo dal conto famiglia' }]
    expect(sharedBalance(data, 'simone')).toBe(-50)
    expect(sharedBalance(data, 'anna')).toBe(50)
  })

  it('distributes a transfer from a shared account among three members', () => {
    const data = cleanData()
    data.transfers = [{ id: 'family-to-personal-three', authorId: 'simone', fromAccountId: 'family-bank', toAccountId: 'simone-bank', amount: 90, date: '2026-07-18', description: 'Prelievo dal conto famiglia' }]
    expect(sharedBalance(data, 'simone', 3)).toBe(-60)
    expect(sharedBalance(data, 'anna', 3)).toBe(30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(30)
  })

  it('settles a shared installment purchase immediately, without counting later installments twice', () => {
    const data = cleanData()
    data.movements = [
      { ...expense('first', 'simone', 40, 'simone-card'), sharedSettlementAmount: 120, installmentPlanId: 'plan' },
      { ...expense('second', 'simone', 40, 'simone-card'), sharedSettlementAmount: 0, installmentPlanId: 'plan' },
    ]
    expect(sharedBalance(data, 'simone')).toBe(60)
    expect(sharedBalance(data, 'anna')).toBe(-60)
  })
})

describe('scheduled installments', () => {
  it('splits cents exactly and keeps the day where the next month allows it', () => {
    expect(splitAmount(100, 3)).toEqual([33.33, 33.33, 33.34])
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('posts only installments whose due date has arrived', () => {
    const data = cleanData()
    data.scheduledPayments = [
      { id: 'due', planId: 'plan', authorId: 'simone', memberId: 'simone', amount: 20, dueDate: '2026-07-18', description: 'Acquisto', categoryId: 'alimentari', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, installmentNumber: 2, installmentCount: 3, status: 'scheduled' },
      { id: 'future', planId: 'plan', authorId: 'simone', memberId: 'simone', amount: 20, dueDate: '2026-08-18', description: 'Acquisto', categoryId: 'alimentari', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, installmentNumber: 3, installmentCount: 3, status: 'scheduled' },
    ]
    const updated = materializeDuePayments(data, '2026-07-18')
    expect(updated.movements).toHaveLength(1)
    expect(updated.movements[0].amount).toBe(20)
    expect(updated.scheduledPayments.map((item) => item.status)).toEqual(['paid', 'scheduled'])
  })
})

describe('accountBalance', () => {
  it('includes income, expenses, transfers and reimbursements', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    data.movements = [expense('out', 'simone', 100, 'simone-bank'), { ...expense('in', 'simone', 250, 'simone-bank'), type: 'income', categoryId: 'stipendio' }]
    data.transfers = [{ id: 't', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'simone-cash', amount: 50, date: '2026-07-18', description: 'Prelievo' }]
    data.reimbursements = [{ id: 'r', fromId: 'simone', toId: 'anna', amount: 10, date: '2026-07-18', authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-bank' }]
    expect(accountBalance(data, 'simone-bank')).toBe(base - 100 + 250 - 50 - 10)
  })

  it('credits a reimbursement to the selected destination account', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'anna-cash')!.openingBalance
    data.reimbursements = [{ id: 'r', fromId: 'simone', toId: 'anna', amount: 25, date: '2026-07-18', authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-cash' }]
    expect(accountBalance(data, 'anna-cash')).toBe(base + 25)
  })

  it('keeps a statistics-only movement out of the calculated account balance', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    data.movements = [{ ...expense('historic', 'simone', 100, 'simone-bank'), affectsAccountBalance: false }]
    expect(accountBalance(data, 'simone-bank')).toBe(base)
    expect(data.movements).toHaveLength(1)
  })
})
