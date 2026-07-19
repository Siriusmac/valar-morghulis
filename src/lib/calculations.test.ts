import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { accountBalance, sharedBalance } from './calculations'
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
})
