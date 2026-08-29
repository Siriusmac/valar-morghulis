import { describe, expect, it } from 'vitest'
import { reconcileConfirmedCommissionedIncomes, reconcilePurchaseReimbursementMovements } from './commissioned'
import { defaultData, users } from './seed'

describe('commissioned purchase reimbursements', () => {
  it('creates one personal income after the recipient confirms', () => {
    const data = structuredClone(defaultData)
    const payerMovement = data.movements.find((item) => item.authorId === users[0].id)!
    const purchase = {
      id: 'purchase-confirmed', payerId: users[0].id, recipientId: users[1].id,
      payerMovementId: payerMovement.id, amount: 35, purchaseDate: '2026-08-29',
      description: 'Farmaci', status: 'confirmed' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    const contacts = [{ ...users[1], source: 'family' as const }]

    const first = reconcileConfirmedCommissionedIncomes(data, [purchase], users[0].id, contacts)
    const second = reconcileConfirmedCommissionedIncomes(first, [purchase], users[0].id, contacts)
    const incomes = second.movements.filter((item) => item.id === `commissioned-reimbursement-${purchase.id}`)

    expect(incomes).toHaveLength(1)
    expect(incomes[0]).toMatchObject({
      type: 'income', amount: 35, accountId: payerMovement.accountId, shared: false,
    })
    expect(second.categories.find((item) => item.id === `category-commissioned-reimbursement-${users[0].id}`)?.movementType).toBe('income')
  })

  it('does not create an income for a purchase used to compensate a family reimbursement', () => {
    const data = structuredClone(defaultData)
    const payerMovement = data.movements.find((item) => item.authorId === users[0].id)!
    const purchase = {
      id: 'purchase-compensation', payerId: users[0].id, recipientId: users[1].id,
      reimbursementId: 'family-reimbursement', payerMovementId: payerMovement.id,
      amount: 35, purchaseDate: '2026-08-29', description: 'Farmaci',
      status: 'confirmed' as const, createdAt: '2026-08-29T10:00:00Z',
    }

    expect(reconcileConfirmedCommissionedIncomes(data, [purchase], users[0].id, [])).toBe(data)
  })

  it('updates the recipient statistics after an approved correction', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{
      id: 'family-reimbursement', fromId: users[0].id, toId: users[1].id,
      authorId: users[0].id, amount: 42, date: '2026-08-30', status: 'confirmed',
      settlementMethod: 'purchase', commissionedPurchaseId: 'purchase-compensation',
    }]
    data.movements = [{
      ...data.movements[0], id: 'recipient-statistics', authorId: users[1].id, memberId: users[1].id,
      amount: 35, date: '2026-08-29', commissionedPurchaseId: 'purchase-compensation', paidByUserId: users[0].id,
      affectsAccountBalance: false,
    }]

    const reconciled = reconcilePurchaseReimbursementMovements(data)
    expect(reconciled.movements[0]).toMatchObject({ amount: 42, date: '2026-08-30' })
  })

  it('removes the recipient statistics after an approved cancellation', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{
      id: 'family-reimbursement', fromId: users[0].id, toId: users[1].id,
      authorId: users[0].id, amount: 35, date: '2026-08-29', status: 'cancelled',
      settlementMethod: 'purchase', commissionedPurchaseId: 'purchase-compensation',
    }]
    data.movements = [{
      ...data.movements[0], id: 'recipient-statistics', authorId: users[1].id, memberId: users[1].id,
      commissionedPurchaseId: 'purchase-compensation', paidByUserId: users[0].id, affectsAccountBalance: false,
    }]

    expect(reconcilePurchaseReimbursementMovements(data).movements).toEqual([])
  })
})
