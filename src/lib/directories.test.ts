import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { deleteCounterpartyData } from './directories'
import { hydrateData } from './storage'

describe('counterparty deletion', () => {
  it('reassigns beneficiary movements and scheduled payments', () => {
    const data = structuredClone(defaultData)
    const updated = deleteCounterpartyData(data, 'beneficiary', 'amazon', 'lidl')

    expect(updated.beneficiaries.some((item) => item.id === 'amazon')).toBe(false)
    expect(updated.movements.find((item) => item.id === 'seed-installment-1')?.beneficiaryId).toBe('lidl')
    expect(updated.scheduledPayments.every((item) => item.beneficiaryId === 'lidl')).toBe(true)
  })

  it('leaves movements without a beneficiary when no replacement is selected', () => {
    const data = structuredClone(defaultData)
    const updated = deleteCounterpartyData(data, 'beneficiary', 'lidl')

    expect(updated.movements.find((item) => item.id === 'seed-1')?.beneficiaryId).toBeUndefined()
  })

  it('keeps a deleted starter beneficiary removed after hydration', () => {
    const updated = deleteCounterpartyData(structuredClone(defaultData), 'beneficiary', 'lidl')
    const hydrated = hydrateData(updated, structuredClone(defaultData))

    expect(hydrated.beneficiaries.some((item) => item.id === 'lidl')).toBe(false)
  })

  it('reassigns or clears senders without changing beneficiaries', () => {
    const data = structuredClone(defaultData)
    const reassigned = deleteCounterpartyData(data, 'sender', 'datore-lavoro', 'inps')
    const cleared = deleteCounterpartyData(data, 'sender', 'datore-lavoro')

    expect(reassigned.movements.find((item) => item.id === 'seed-4')?.senderId).toBe('inps')
    expect(cleared.movements.find((item) => item.id === 'seed-4')?.senderId).toBeUndefined()
    expect(reassigned.movements.find((item) => item.id === 'seed-1')?.beneficiaryId).toBe('lidl')
  })
})
