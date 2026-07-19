import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { sharedBalance } from './calculations'

describe('sharedBalance', () => {
  it('splits shared expenses 50/50', () => {
    expect(sharedBalance(defaultData, 'simone')).toBe(-10)
    expect(sharedBalance(defaultData, 'anna')).toBe(10)
  })

  it('returns to zero after the debtor reimburses the creditor', () => {
    const settled = {
      ...defaultData,
      reimbursements: [{
        id: 'r1', fromId: 'simone' as const, toId: 'anna' as const,
        amount: 10, date: '2026-07-18', authorId: 'simone' as const,
      }],
    }
    expect(sharedBalance(settled, 'simone')).toBe(0)
    expect(sharedBalance(settled, 'anna')).toBe(0)
  })
})
