import { describe, expect, it } from 'vitest'
import { buildCloudPersistence, mergeCloudPersistence, type SharedRecord } from './cloudData'
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
    const merged = mergeCloudPersistence(anna.privateData, asDatabaseRecords(simone), fallback)

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
    expect(payload.privateData.movements[0]).toEqual(movement)
  })

  it('keeps the author full copy when private and shared records have the same id', () => {
    const data = structuredClone(defaultData)
    const payload = buildCloudPersistence(data, 'simone')
    const sharedRecords = asDatabaseRecords(payload)
    const fallback = createStarterData('simone', data.accounts.filter((item) => item.scope === 'family'))
    const merged = mergeCloudPersistence(payload.privateData, sharedRecords, fallback)

    expect(merged.movements.find((item) => item.id === 'seed-1')).toEqual(
      payload.privateData.movements.find((item) => item.id === 'seed-1'),
    )
  })
})
