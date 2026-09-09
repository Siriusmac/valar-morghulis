import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { accountHasReciprocalOperations, accountReplacementCreatesInvalidTransfer, deleteAccountData } from './accounts'

describe('deleteAccountData', () => {
  it('can retain linked operations as historical records', () => {
    const data = structuredClone(defaultData)
    const result = deleteAccountData(data, 'simone-bank', 'keep')

    expect(result.accounts.some((account) => account.id === 'simone-bank')).toBe(false)
    expect(result.movements.some((movement) => movement.accountId === 'simone-bank')).toBe(true)
  })

  it('can delete every linked accounting operation', () => {
    const data = structuredClone(defaultData)
    data.reimbursements.push({ id: 'linked', fromId: 'simone', toId: 'anna', authorId: 'simone', amount: 10, date: '2026-09-01', fromAccountId: 'simone-bank' })
    const result = deleteAccountData(data, 'simone-bank', 'delete')

    expect(result.movements.some((movement) => movement.accountId === 'simone-bank')).toBe(false)
    expect(result.transfers.some((transfer) => transfer.fromAccountId === 'simone-bank' || transfer.toAccountId === 'simone-bank')).toBe(false)
    expect(result.reimbursements.some((reimbursement) => reimbursement.fromAccountId === 'simone-bank')).toBe(false)
  })

  it('can reassign all references and the default account preference', () => {
    const data = structuredClone(defaultData)
    data.defaultMovementAccountIds = { workspace: 'simone-bank' }
    const result = deleteAccountData(data, 'simone-bank', 'reassign', 'simone-cash')

    expect(result.movements.some((movement) => movement.accountId === 'simone-bank')).toBe(false)
    expect(result.movements.some((movement) => movement.accountId === 'simone-cash')).toBe(true)
    expect(result.defaultMovementAccountIds?.workspace).toBe('simone-cash')
  })

  it('detects a replacement that would create a transfer to the same account', () => {
    const data = structuredClone(defaultData)
    data.transfers = [{ id: 'transfer', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'simone-cash', amount: 10, date: '2026-09-01', description: 'Giro fondi' }]
    expect(accountReplacementCreatesInvalidTransfer(data, 'simone-bank', 'simone-cash')).toBe(true)
  })

  it('detects reciprocal operations that must not be changed unilaterally', () => {
    const data = structuredClone(defaultData)
    data.reimbursements.push({ id: 'linked', fromId: 'simone', toId: 'anna', authorId: 'simone', amount: 10, date: '2026-09-01', fromAccountId: 'simone-bank' })

    expect(accountHasReciprocalOperations(data, 'simone-bank')).toBe(true)
    expect(accountHasReciprocalOperations(data, 'simone-cash')).toBe(false)
  })
})
