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


describe('tag deletion', () => {
  it('removes legacy and multiple tags from movements, partials, installments and recurrences without deleting money', () => {
    const data = structuredClone(defaultData)
    const tagged = { tagId: 'casa-2026', tagIds: ['casa-2026', 'vacanza-parigi'] }
    Object.assign(data.movements[0], tagged, { splits: [{ id: 'partial', amount: 10, categoryId: 'alimentari', shared: false, ...tagged }] })
    Object.assign(data.scheduledPayments[0], tagged, { splits: [{ id: 'future-partial', amount: 5, categoryId: 'alimentari', shared: false, ...tagged }] })
    data.recurringMovements = [{ ...data.movements[0], frequency: 'monthly', nextDate: '2099-01-01', amountMode: 'fixed', status: 'active', ...tagged }]
    data.searchReports = [{ id: 'report', ownerId: 'simone', name: 'Casa', filters: { query: '', dateFrom: '', dateTo: '', movementType: 'all', tagId: 'casa-2026' }, createdAt: '', updatedAt: '' }]
    const updated = deleteDirectoryData(data, 'tag', 'casa-2026')
    for (const item of [updated.movements[0], updated.movements[0].splits![0], updated.scheduledPayments[0], updated.scheduledPayments[0].splits![0], updated.recurringMovements[0]]) {
      expect(item.tagId).toBe('vacanza-parigi')
      expect(item.tagIds).toEqual(['vacanza-parigi'])
    }
    expect(updated.movements.map((item) => [item.id, item.amount, item.accountId])).toEqual(data.movements.map((item) => [item.id, item.amount, item.accountId]))
    expect(updated.tags.some((item) => item.id === 'casa-2026')).toBe(false)
    expect(updated.tagReportIds).not.toContain('casa-2026')
    expect(updated.searchReports).toEqual(data.searchReports)
    expect(data.movements[0].tagId).toBe('casa-2026')
  })

  it('does not restore a deleted starter tag on reload and clears a sole legacy tag', () => {
    const updated = deleteDirectoryData(structuredClone(defaultData), 'tag', 'casa-2026')
    const hydrated = hydrateData(updated, structuredClone(defaultData))
    expect(hydrated.tags.some((item) => item.id === 'casa-2026')).toBe(false)
    expect(hydrated.tagReportIds).not.toContain('casa-2026')
    expect(hydrated.movements.find((item) => item.id === 'seed-3')).toMatchObject({ tagIds: [] })
    expect(hydrated.movements.find((item) => item.id === 'seed-3')?.tagId).toBeUndefined()
  })
})
