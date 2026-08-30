import { describe, expect, it } from 'vitest'
import { buildCloudPersistence, mergeCloudPersistence, mergePrivateCloudData, type SharedRecord } from './cloudData'
import { createStarterData, defaultData } from './seed'
import type { AppData, Movement } from '../types'

function asDatabaseRecords(payload: ReturnType<typeof buildCloudPersistence>): SharedRecord[] {
  return payload.sharedRecords.map((item) => ({
    record_type: item.type,
    record_id: item.id,
    data: item.data,
  }))
}

describe('family cloud persistence', () => {
  it('shares family movements with another member without exposing personal movements', () => {
    const data = structuredClone(defaultData)
    const simone = buildCloudPersistence(data, 'simone')
    const anna = buildCloudPersistence(data, 'anna')
    const fallback = createStarterData('anna', data.accounts.filter((item) => item.scope === 'family'))
    const merged = mergeCloudPersistence(
      mergePrivateCloudData(anna.privateData, anna.familyPrivateData),
      asDatabaseRecords(simone),
      fallback,
    )

    expect(merged.movements.some((item) => item.id === 'seed-1')).toBe(true)
    expect(merged.movements.some((item) => item.id === 'seed-3')).toBe(true)
    expect(merged.movements.some((item) => item.id === 'seed-5')).toBe(false)
    expect(merged.movements.some((item) => item.id === 'seed-2')).toBe(true)
  })

  it('publishes only the shared portion of a mixed movement', () => {
    const data: AppData = structuredClone(defaultData)
    const movement: Movement = {
      id: 'mixed',
      type: 'expense',
      authorId: 'simone',
      memberId: 'simone',
      amount: 100,
      date: '2026-07-26',
      description: 'Scontrino misto',
      categoryId: 'alimentari',
      beneficiaryId: 'lidl',
      accountId: 'simone-bank',
      shared: false,
      splits: [{ id: 'shared-home', amount: 30, categoryId: 'accessori-casa', shared: true }],
      createdAt: '2026-07-26T10:00:00Z',
    }
    data.movements = [movement]

    const payload = buildCloudPersistence(data, 'simone')
    const sharedMovement = payload.sharedRecords.find((item) => item.type === 'movement')?.data as Movement

    expect(sharedMovement.amount).toBe(30)
    expect(sharedMovement.categoryId).toBe('accessori-casa')
    expect(sharedMovement.shared).toBe(true)
    expect(sharedMovement.splits).toEqual([])
    expect(payload.privateData.movements).toEqual([])
    expect(payload.familyPrivateData.movements[0]).toEqual(movement)
  })

  it('keeps the full future installment private to its author', () => {
    const data = structuredClone(defaultData)
    data.scheduledPayments = [{
      ...data.scheduledPayments[0],
      amount: 30,
      shared: false,
      splits: [{ id: 'future-shared', amount: 10, categoryId: 'accessori-casa', beneficiaryId: 'eurospar', shared: true }],
    }]

    const payload = buildCloudPersistence(data, 'simone')
    expect(payload.sharedRecords.some((item) => item.type === 'scheduled_payment')).toBe(false)
    expect(payload.familyPrivateData.scheduledPayments[0]).toMatchObject({
      amount: 30,
      splits: [{ amount: 10, categoryId: 'accessori-casa', beneficiaryId: 'eurospar', shared: true }],
    })
    expect(payload.ownedKeys.some((item) => item.type === 'scheduled_payment')).toBe(false)
  })

  it('keeps the author full copy when private and shared records have the same id', () => {
    const data = structuredClone(defaultData)
    const payload = buildCloudPersistence(data, 'simone')
    const sharedRecords = asDatabaseRecords(payload)
    const fallback = createStarterData('simone', data.accounts.filter((item) => item.scope === 'family'))
    const merged = mergeCloudPersistence(
      mergePrivateCloudData(payload.privateData, payload.familyPrivateData),
      sharedRecords,
      fallback,
    )

    expect(merged.movements.find((item) => item.id === 'seed-1')).toEqual(
      payload.familyPrivateData.movements.find((item) => item.id === 'seed-1'),
    )
  })

  it('uses the confirmed family reimbursement instead of the author pending copy', () => {
    const fallback = structuredClone(defaultData)
    const pending = {
      id: 'reimbursement-approved-by-anna',
      fromId: 'simone',
      toId: 'anna',
      amount: 25,
      date: '2026-07-28',
      authorId: 'simone',
      fromAccountId: 'simone-bank',
      toAccountId: 'anna-bank',
      status: 'pending' as const,
    }
    const confirmed = {
      ...pending,
      status: 'confirmed' as const,
      confirmedBy: 'anna',
      confirmedAt: '2026-07-28T09:00:00.000Z',
    }
    const merged = mergeCloudPersistence(
      { ...fallback, reimbursements: [pending] },
      [{ record_type: 'reimbursement', record_id: confirmed.id, data: confirmed }],
      fallback,
    )

    expect(merged.reimbursements).toContainEqual(confirmed)
    expect(merged.reimbursements).toHaveLength(1)
  })

  it('keeps shared author copies out of the global personal snapshot', () => {
    const payload = buildCloudPersistence(structuredClone(defaultData), 'simone')

    expect(payload.privateData.movements.some((item) => item.id === 'seed-1')).toBe(false)
    expect(payload.privateData.movements.some((item) => item.id === 'seed-5')).toBe(true)
    expect(payload.familyPrivateData.movements.some((item) => item.id === 'seed-1')).toBe(true)
  })

  it('does not resurrect a deleted shared movement from another member private snapshot', () => {
    const staleForeignMovement = structuredClone(defaultData.movements.find((item) => item.id === 'seed-1')!)
    const privateData = mergePrivateCloudData(
      { movements: [staleForeignMovement] },
      { movements: [staleForeignMovement] },
      'anna',
    )
    const fallback = createStarterData('anna', defaultData.accounts.filter((item) => item.scope === 'family'))
    const merged = mergeCloudPersistence(privateData, [], fallback)

    expect(privateData?.movements).toEqual([])
    expect(merged.movements.some((item) => item.id === staleForeignMovement.id)).toBe(false)
  })

  it('shares a sender referenced by a family income', () => {
    const data = structuredClone(defaultData)
    const payload = buildCloudPersistence(data, 'anna')
    const senderRecord = payload.sharedRecords.find((item) => item.type === 'sender' && item.id === 'inps')
    const fallback = createStarterData('simone', data.accounts.filter((item) => item.scope === 'family'))
    const merged = mergeCloudPersistence(null, asDatabaseRecords(payload), fallback)

    expect(senderRecord?.data).toMatchObject({ id: 'inps', name: 'INPS', scope: 'family' })
    expect(merged.senders).toContainEqual(expect.objectContaining({ id: 'inps', name: 'INPS' }))
    expect(merged.movements.find((item) => item.id === 'seed-7')?.senderId).toBe('inps')
  })

  it('applies a family directory deletion to private author copies too', () => {
    const data = structuredClone(defaultData)
    const payload = buildCloudPersistence(data, 'simone')
    const records: SharedRecord[] = [
      ...asDatabaseRecords(payload),
      {
        record_type: 'directory_redirect',
        record_id: 'beneficiary:lidl',
        data: { kind: 'beneficiary', oldId: 'lidl', replacementId: 'eurospar' },
      },
    ]
    const fallback = createStarterData('simone', data.accounts.filter((item) => item.scope === 'family'))
    const merged = mergeCloudPersistence(
      mergePrivateCloudData(payload.privateData, payload.familyPrivateData),
      records,
      fallback,
    )

    expect(merged.beneficiaries.some((item) => item.id === 'lidl')).toBe(false)
    expect(merged.movements.find((item) => item.id === 'seed-1')?.beneficiaryId).toBe('eurospar')
  })

  it('resolves chained directory deletions to the final empty value', () => {
    const records: SharedRecord[] = [
      {
        record_type: 'directory_redirect',
        record_id: 'sender:datore-lavoro',
        data: { kind: 'sender', oldId: 'datore-lavoro', replacementId: 'inps' },
      },
      {
        record_type: 'directory_redirect',
        record_id: 'sender:inps',
        data: { kind: 'sender', oldId: 'inps' },
      },
    ]
    const merged = mergeCloudPersistence(structuredClone(defaultData), records, structuredClone(defaultData))

    expect(merged.senders.some((item) => item.id === 'datore-lavoro')).toBe(false)
    expect(merged.senders.some((item) => item.id === 'inps')).toBe(false)
    expect(merged.movements.find((item) => item.id === 'seed-4')?.senderId).toBeUndefined()
  })
})
