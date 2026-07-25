import { describe, expect, it } from 'vitest'
import { createStarterData } from './seed'
import { hasMeaningfulUserData, hydrateData, mergeAppData } from './storage'
import type { Account, Movement } from '../types'

const sharedAccount: Account = {
  id: 'family-account',
  name: 'Conto famiglia',
  institution: 'Banca',
  type: 'bank',
  scope: 'family',
  openingBalance: 100,
}

const movement: Movement = {
  id: 'movement-1',
  type: 'expense',
  authorId: 'user-1',
  memberId: 'user-1',
  amount: 25,
  date: '2026-07-25',
  description: 'Spesa',
  categoryId: 'alimentari',
  beneficiaryId: 'negozio',
  accountId: 'user-1-cash',
  shared: false,
  createdAt: '2026-07-25T10:00:00.000Z',
}

describe('persistenza dei dati operativi', () => {
  it('riconosce come significativi conti aggiunti e movimenti locali', () => {
    const starter = createStarterData('user-1', [sharedAccount])
    expect(hasMeaningfulUserData(starter, 'user-1')).toBe(false)

    const withAccount = {
      ...starter,
      accounts: [...starter.accounts, {
        id: 'personal-bank',
        ownerId: 'user-1',
        name: 'Conto corrente',
        institution: 'Banca',
        type: 'bank' as const,
        scope: 'personal' as const,
        openingBalance: 0,
      }],
    }
    expect(hasMeaningfulUserData(withAccount, 'user-1')).toBe(true)
    expect(hasMeaningfulUserData({ ...starter, movements: [movement] }, 'user-1')).toBe(true)
  })

  it('importa i dati locali senza perdere quelli già presenti nel cloud', () => {
    const fallback = createStarterData('user-1', [sharedAccount])
    const remoteMovement = { ...movement, id: 'remote-movement', description: 'Dal cloud' }
    const local = {
      ...fallback,
      movements: [movement],
      beneficiaries: [{ id: 'negozio', name: 'Negozio', scope: 'personal' as const, ownerId: 'user-1' }],
    }

    const merged = mergeAppData({ ...fallback, movements: [remoteMovement] }, local, fallback)

    expect(merged.movements.map((item) => item.id)).toEqual(['movement-1', 'remote-movement'])
    expect(merged.beneficiaries.some((item) => item.id === 'negozio')).toBe(true)
  })

  it('completa uno snapshot cloud parziale con i dati iniziali necessari', () => {
    const fallback = createStarterData('user-1', [sharedAccount])
    const hydrated = hydrateData({ version: 3, movements: [movement] }, fallback)

    expect(hydrated.movements).toEqual([movement])
    expect(hydrated.accounts.some((account) => account.id === 'user-1-cash')).toBe(true)
    expect(hydrated.categories.length).toBeGreaterThan(0)
  })
})
