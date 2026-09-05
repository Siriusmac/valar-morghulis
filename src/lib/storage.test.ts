import { describe, expect, it, vi } from 'vitest'
import { createStarterData } from './seed'
import { hasMeaningfulUserData, hydrateData, loadData, mergeAppData, mergePendingAppData } from './storage'
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
  it('migra la cache del nome precedente senza perdere i movimenti', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    localStorage.setItem('valar-morghulis:v3', JSON.stringify({
      ...createStarterData('user-1', [sharedAccount]),
      movements: [movement],
    }))

    expect(loadData().movements).toContainEqual(movement)
    vi.unstubAllGlobals()
  })

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

  it('mantiene lo stato remoto confermato durante l’importazione della cache locale', () => {
    const fallback = createStarterData('user-1', [sharedAccount])
    const pending = {
      id: 'reimbursement-1',
      fromId: 'user-1',
      toId: 'user-2',
      amount: 20,
      date: '2026-07-28',
      authorId: 'user-1',
      fromAccountId: 'user-1-cash',
      toAccountId: 'user-2-cash',
      status: 'pending' as const,
    }
    const confirmed = {
      ...pending,
      status: 'confirmed' as const,
      confirmedBy: 'user-2',
      confirmedAt: '2026-07-28T09:00:00.000Z',
    }
    const localOnly = { ...pending, id: 'reimbursement-local-only', amount: 5 }

    const merged = mergeAppData(
      { ...fallback, reimbursements: [confirmed] },
      { ...fallback, reimbursements: [pending, localOnly] },
      fallback,
    )

    expect(merged.reimbursements).toContainEqual(confirmed)
    expect(merged.reimbursements).toContainEqual(localOnly)
    expect(merged.reimbursements).toHaveLength(2)
  })

  it('completa uno snapshot cloud parziale con i dati iniziali necessari', () => {
    const fallback = createStarterData('user-1', [sharedAccount])
    const hydrated = hydrateData({ version: 3, movements: [movement] }, fallback)

    expect(hydrated.movements).toEqual([movement])
    expect(hydrated.accounts.some((account) => account.id === 'user-1-cash')).toBe(true)
    expect(hydrated.categories.length).toBeGreaterThan(0)
  })

  it('non resuscita una cancellazione locale ancora da sincronizzare', () => {
    const fallback = createStarterData('user-1', [sharedAccount])
    const otherMovement = { ...movement, id: 'movement-2', authorId: 'user-2', memberId: 'user-2' }
    const local = { ...fallback, movements: [] }
    const remote = { ...fallback, movements: [movement, otherMovement] }

    const merged = mergePendingAppData(remote, local, fallback, 'user-1')

    expect(merged.movements).toEqual([otherMovement])
  })
})
