import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { changeInstallmentAccount, installmentAccounts, materializeDuePayments } from './scheduled'
import { accountBalance, sharedBalance } from './calculations'
import { saveMovementData } from './movements'
import { hydrateData } from './storage'

describe('single installment account changes', () => {
  it('changes only the selected pending installment without altering current balances or history', () => {
    const data = structuredClone(defaultData)
    const updated = changeInstallmentAccount(data, 'seed-payment-2', 'simone-bank', 'simone')
    expect(updated.scheduledPayments[0]).toEqual({ ...data.scheduledPayments[0], accountId: 'simone-bank', accountOverridden: true })
    expect(updated.scheduledPayments[1]).toBe(data.scheduledPayments[1])
    expect(updated.movements).toBe(data.movements)
    expect(data.scheduledPayments[0].accountId).toBe('simone-card')
    expect(accountBalance(updated, 'simone-bank')).toBe(accountBalance(data, 'simone-bank'))
    expect(sharedBalance(updated, 'simone')).toBe(sharedBalance(data, 'simone'))
    const due = materializeDuePayments(updated, '2026-08-12')
    expect(due.movements.find((item) => item.id === 'installment-seed-payment-2')?.accountId).toBe('simone-bank')
    expect(accountBalance(due, 'simone-bank')).toBe(accountBalance(data, 'simone-bank') - 40)
    expect(accountBalance(due, 'simone-card')).toBe(accountBalance(data, 'simone-card'))
    expect(sharedBalance(due, 'simone')).toBe(sharedBalance(data, 'simone'))
  })

  it('rejects other authors, paid installments, missing and incompatible accounts', () => {
    const data = structuredClone(defaultData)
    for (const accountId of ['anna-bank', 'family-bank', 'missing']) {
      expect(changeInstallmentAccount(data, 'seed-payment-2', accountId, 'simone')).toBe(data)
    }
    expect(changeInstallmentAccount(data, 'seed-payment-2', 'simone-bank', 'anna')).toBe(data)
    data.scheduledPayments[0].status = 'paid'
    expect(changeInstallmentAccount(data, 'seed-payment-2', 'simone-bank', 'simone')).toBe(data)
  })

  it('restricts shared-account installments to shared accounts and excludes Wellfare', () => {
    const data = structuredClone(defaultData)
    const payment = data.scheduledPayments[0]
    data.accounts.push({ ...data.accounts[0], id: 'welfare', type: 'welfare' })
    expect(installmentAccounts(data, payment, 'simone').map((account) => account.id)).not.toContain('welfare')
    expect(changeInstallmentAccount(data, payment.id, 'welfare', 'simone')).toBe(data)
    payment.accountId = 'family-bank'
    payment.shared = true
    data.accounts.push({ ...data.accounts.find((item) => item.id === 'family-bank')!, id: 'family-card', type: 'credit' })
    expect(changeInstallmentAccount(data, payment.id, 'simone-bank', 'simone')).toBe(data)
    expect(changeInstallmentAccount(data, payment.id, 'family-card', 'simone').scheduledPayments[0].accountId).toBe('family-card')
  })

  it('preserves individual account choices when editing or regenerating the plan', () => {
    const data = changeInstallmentAccount(structuredClone(defaultData), 'seed-payment-2', 'simone-bank', 'simone')
    const first = data.movements.find((item) => item.id === 'seed-installment-1')!
    const edited = { ...first, description: 'Corretto · rata 1/3', accountId: 'simone-paypal' }
    for (const additions of [{}, { scheduledPayments: defaultData.scheduledPayments.map((payment) => ({ ...payment, id: `new-${payment.id}`, accountId: 'simone-paypal' })) }]) {
      const updated = saveMovementData(data, edited, additions)
      expect(updated.scheduledPayments[0]).toMatchObject({ accountId: 'simone-bank', accountOverridden: true, description: 'Corretto' })
      expect(updated.scheduledPayments[1].accountId).toBe('simone-paypal')
    }
  })

  it('preserves split classifications and the full shared settlement after storage round trips', () => {
    const data = structuredClone(defaultData)
    const first = data.movements.find((item) => item.id === 'seed-installment-1')!
    first.shared = true
    first.sharedSettlementAmount = 120
    data.scheduledPayments[0].shared = true
    data.scheduledPayments[0].splits = [{ id: 'split', amount: 40, categoryId: 'alimentari', shared: true }]
    data.scheduledPayments[0].dueDate = '2099-08-12'
    data.scheduledPayments[1].dueDate = '2099-09-12'
    const updated = changeInstallmentAccount(data, 'seed-payment-2', 'simone-bank', 'simone')
    const restored = hydrateData(JSON.parse(JSON.stringify(updated)), data)
    expect(restored.scheduledPayments[0]).toMatchObject({ accountId: 'simone-bank', accountOverridden: true, splits: data.scheduledPayments[0].splits })
    const due = materializeDuePayments(restored, '2099-08-12')
    expect(due.movements.find((item) => item.id === 'installment-seed-payment-2')).toMatchObject({ accountId: 'simone-bank', sharedSettlementAmount: 0, splits: data.scheduledPayments[0].splits })
    expect(sharedBalance(due, 'simone')).toBe(sharedBalance(data, 'simone'))
  })
})
