import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { deleteCounterpartyData, deleteDirectoryData } from './directories'
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

  it('reassigns beneficiaries used by movement and scheduled-payment partials', () => {
    const data = structuredClone(defaultData)
    data.movements[0].splits = [{ id: 'partial', amount: 10, categoryId: 'alimentari', beneficiaryId: 'amazon', shared: true }]
    data.scheduledPayments[0].splits = [{ id: 'future-partial', amount: 5, categoryId: 'alimentari', beneficiaryId: 'amazon', shared: true }]

    const updated = deleteCounterpartyData(data, 'beneficiary', 'amazon', 'lidl')

    expect(updated.movements[0].splits?.[0].beneficiaryId).toBe('lidl')
    expect(updated.scheduledPayments[0].splits?.[0].beneficiaryId).toBe('lidl')
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

describe('category deletion', () => {
  it('reassigns the main category and partials in movements and future installments', () => {
    const data = structuredClone(defaultData)
    data.movements[0].splits = [{ id: 'partial', amount: 10, categoryId: 'alimentari', shared: true }]
    data.scheduledPayments[0].categoryId = 'alimentari'
    data.scheduledPayments[0].splits = [{ id: 'future-partial', amount: 5, categoryId: 'alimentari', shared: true }]

    const updated = deleteDirectoryData(data, 'category', 'alimentari', 'casa')

    expect(updated.categories.some((item) => item.id === 'alimentari')).toBe(false)
    expect(updated.movements[0].categoryId).toBe('casa')
    expect(updated.movements[0].splits?.[0].categoryId).toBe('casa')
    expect(updated.scheduledPayments[0].categoryId).toBe('casa')
    expect(updated.scheduledPayments[0].splits?.[0].categoryId).toBe('casa')
  })

  it('keeps deleted categories unassigned after hydration', () => {
    const updated = deleteDirectoryData(structuredClone(defaultData), 'category', 'alimentari')
    const hydrated = hydrateData(updated, structuredClone(defaultData))

    expect(hydrated.categories.some((item) => item.id === 'alimentari')).toBe(false)
    expect(hydrated.movements.find((item) => item.id === 'seed-1')?.categoryId).toBe('')
  })
})
