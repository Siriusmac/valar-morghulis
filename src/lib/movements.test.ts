import { describe, expect, it } from 'vitest'
import { accountBalance, sharedBalance } from './calculations'
import { deleteMovementData, saveMovementData } from './movements'
import { defaultData } from './seed'

describe('movement mutations', () => {
  it('recalculates account and shared balances after editing a movement', () => {
    const data = structuredClone(defaultData)
    const original = data.movements.find((movement) => movement.id === 'seed-1')!
    data.movements = [original]
    data.transfers = []
    data.reimbursements = []
    data.scheduledPayments = []

    const updated = saveMovementData(data, { ...original, amount: 50, accountId: 'simone-cash' }, {})

    expect(accountBalance(updated, 'simone-bank')).toBe(2450)
    expect(accountBalance(updated, 'simone-cash')).toBe(130)
    expect(sharedBalance(updated, 'simone')).toBe(25)
  })

  it('restores dependent balances after deleting a movement', () => {
    const data = structuredClone(defaultData)
    const original = data.movements.find((movement) => movement.id === 'seed-1')!
    data.movements = [original]
    data.transfers = []
    data.reimbursements = []
    data.scheduledPayments = []

    const updated = deleteMovementData(data, original.id)

    expect(accountBalance(updated, 'simone-bank')).toBe(2450)
    expect(sharedBalance(updated, 'simone')).toBe(0)
  })

  it('removes an installment plan when its first movement is deleted', () => {
    const data = structuredClone(defaultData)
    const updated = deleteMovementData(data, 'seed-installment-1')

    expect(updated.movements.some((movement) => movement.installmentPlanId === 'seed-plan')).toBe(false)
    expect(updated.scheduledPayments.some((payment) => payment.planId === 'seed-plan')).toBe(false)
  })

  it('propagates edits from the first installment to unpaid scheduled payments', () => {
    const data = structuredClone(defaultData)
    const original = data.movements.find((movement) => movement.id === 'seed-installment-1')!
    const updated = saveMovementData(data, {
      ...original,
      description: 'Nuovi accessori · rata 1/3',
      categoryId: 'alimentari',
      beneficiaryId: 'lidl',
      accountId: 'simone-bank',
      comments: 'Corretto',
      shared: true,
    }, {})

    expect(updated.scheduledPayments.filter((payment) => payment.planId === 'seed-plan')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Nuovi accessori',
          categoryId: 'alimentari',
          beneficiaryId: 'lidl',
          accountId: 'simone-bank',
          comments: 'Corretto',
          shared: true,
        }),
      ]),
    )
  })
})
