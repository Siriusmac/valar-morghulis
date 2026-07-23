import { describe, expect, it } from 'vitest'
import { createStarterData } from './seed'

describe('dati iniziali di una famiglia cloud', () => {
  it('rende disponibile il conto condiviso e crea solo i conti personali del nuovo utente', () => {
    const data = createStarterData('utente-1', [{
      id: 'conto-famiglia',
      name: 'Conto famiglia',
      institution: 'Banca',
      type: 'bank',
      scope: 'family',
      openingBalance: 100,
    }])

    expect(data.accounts.find((account) => account.id === 'conto-famiglia')?.scope).toBe('family')
    expect(data.accounts.filter((account) => account.scope === 'personal')).toHaveLength(1)
    expect(data.accounts.filter((account) => account.scope === 'personal').every((account) => account.ownerId === 'utente-1')).toBe(true)
    expect(data.accounts.find((account) => account.scope === 'personal')?.type).toBe('cash')
    expect(data.movements).toEqual([])
  })
})
