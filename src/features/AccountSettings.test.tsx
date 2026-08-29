// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountSettings } from './AccountSettings'
import type { FamilySession } from './CloudAccess'

const simone = { id: 'simone', name: 'Simone', email: 'simone@example.com', initials: 'S' }
const anna = { id: 'anna', name: 'Anna', email: 'anna@example.com', initials: 'A' }

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function familySession(overrides: Partial<FamilySession> = {}): FamilySession {
  return {
    familyId: 'family-one',
    familyName: 'Famiglia Uno',
    role: 'admin',
    personalMode: false,
    families: [
      { id: 'family-one', name: 'Famiglia Uno', role: 'admin' },
      { id: 'family-two', name: 'Famiglia Due', role: 'member' },
    ],
    user: simone,
    members: [simone, anna],
    invitations: [],
    sharedAccounts: [],
    reimbursementAccountReferences: [],
    switchFamily: vi.fn().mockResolvedValue(undefined),
    createFamily: vi.fn().mockResolvedValue(undefined),
    renameFamily: vi.fn().mockResolvedValue(undefined),
    inviteMember: vi.fn().mockResolvedValue(undefined),
    withdrawInvitation: vi.fn().mockResolvedValue(undefined),
    deleteInvitation: vi.fn().mockResolvedValue(undefined),
    deleteFamily: vi.fn().mockResolvedValue(undefined),
    updateProfileName: vi.fn().mockResolvedValue(undefined),
    updateEmail: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    exportAccountData: vi.fn().mockResolvedValue({ exportedAt: '2026-07-27T10:00:00.000Z', profile: simone, personalData: null, families: [] }),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    loadAppData: vi.fn().mockResolvedValue(null),
    saveAppData: vi.fn().mockResolvedValue(undefined),
    createSharedAccount: vi.fn().mockResolvedValue(undefined),
    updateSharedAccount: vi.fn().mockResolvedValue(undefined),
    setReimbursementAccountFamilies: vi.fn().mockResolvedValue(undefined),
    respondToReimbursement: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('AccountSettings', () => {
  it('updates the user first name and last name', async () => {
    const cloud = familySession()
    render(<AccountSettings user={simone} cloud={cloud} />)

    fireEvent.change(screen.getByLabelText('Cognome'), { target: { value: 'Miotto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva dati personali' }))

    await waitFor(() => expect(cloud.updateProfileName).toHaveBeenCalledWith('Simone', 'Miotto'))
    expect(screen.getByRole('status').textContent).toContain('Nome e cognome aggiornati.')
  })

  it('shows family administration only to an admin and switches family', async () => {
    const cloud = familySession()
    render(<AccountSettings user={simone} cloud={cloud} />)

    expect(screen.getByText('Amministra Famiglia Uno')).toBeTruthy()
    expect(screen.getByLabelText('2 membri')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Elimina questa famiglia/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Famiglia Due/ }))

    await waitFor(() => expect(cloud.switchFamily).toHaveBeenCalledWith('family-two'))
  })

  it('keeps administration actions hidden for a regular member', () => {
    const cloud = familySession({ role: 'member' })
    render(<AccountSettings user={simone} cloud={cloud} />)

    expect(screen.queryByRole('heading', { name: 'Amministra Famiglia Uno' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Elimina questa famiglia/ })).toBeNull()
    expect(screen.getByText('Solo un amministratore di questa famiglia può cambiarne il nome o invitare nuovi membri.')).toBeTruthy()
  })

  it('switches to the personal workspace', async () => {
    const cloud = familySession()
    render(<AccountSettings user={simone} cloud={cloud} />)
    fireEvent.click(screen.getByRole('button', { name: /Solo personale/ }))
    await waitFor(() => expect(cloud.switchFamily).toHaveBeenCalledWith('personal'))
  })

  it('shows personal accounting without family administration', () => {
    const cloud = familySession({ familyId: 'personal', familyName: 'Contabilità personale', personalMode: true, members: [simone] })
    render(<AccountSettings user={simone} cloud={cloud} />)
    expect(screen.getByRole('heading', { name: 'Contabilità personale' })).toBeTruthy()
    expect(screen.queryByText('Amministra Famiglia Uno')).toBeNull()
    expect(screen.queryByRole('button', { name: /Elimina questa famiglia/ })).toBeNull()
  })

  it('resends, withdraws pending invitations and removes declined ones', async () => {
    const cloud = familySession({
      invitations: [
        { id: 'pending', email: 'inattesa@example.com', status: 'pending', createdAt: '2026-07-27T10:00:00Z', expiresAt: '2026-08-03T10:00:00Z' },
        { id: 'declined', email: 'rifiutata@example.com', status: 'declined', createdAt: '2026-07-27T10:00:00Z', expiresAt: '2026-08-03T10:00:00Z' },
      ],
    })
    render(<AccountSettings user={simone} cloud={cloud} />)

    fireEvent.click(screen.getByRole('button', { name: /Reinvia invito/ }))
    await waitFor(() => expect(cloud.inviteMember).toHaveBeenCalledWith('inattesa@example.com'))

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /Ritira invito/ }))
    await waitFor(() => expect(cloud.withdrawInvitation).toHaveBeenCalledWith('pending'))

    fireEvent.click(screen.getByRole('button', { name: /Elimina dall’elenco/ }))
    await waitFor(() => expect(cloud.deleteInvitation).toHaveBeenCalledWith('declined'))
  })
})
