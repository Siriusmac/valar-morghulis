// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountSettings } from './AccountSettings'
import type { FamilySession } from './CloudAccess'

const simone = { id: 'simone', name: 'Simone', email: 'simone@example.com', initials: 'S' }
const anna = { id: 'anna', name: 'Anna', email: 'anna@example.com', initials: 'A' }

afterEach(cleanup)

function familySession(overrides: Partial<FamilySession> = {}): FamilySession {
  return {
    familyId: 'family-one',
    familyName: 'Famiglia Uno',
    role: 'admin',
    families: [
      { id: 'family-one', name: 'Famiglia Uno', role: 'admin' },
      { id: 'family-two', name: 'Famiglia Due', role: 'member' },
    ],
    user: simone,
    members: [simone, anna],
    sharedAccounts: [],
    switchFamily: vi.fn().mockResolvedValue(undefined),
    createFamily: vi.fn().mockResolvedValue(undefined),
    renameFamily: vi.fn().mockResolvedValue(undefined),
    inviteMember: vi.fn().mockResolvedValue(undefined),
    updateEmail: vi.fn().mockResolvedValue(undefined),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateSharedAccount: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('AccountSettings', () => {
  it('shows family administration only to an admin and switches family', async () => {
    const cloud = familySession()
    render(<AccountSettings user={simone} cloud={cloud} />)

    expect(screen.getByText('Amministra Famiglia Uno')).toBeTruthy()
    expect(screen.getByLabelText('2 membri')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Famiglia Due/ }))

    await waitFor(() => expect(cloud.switchFamily).toHaveBeenCalledWith('family-two'))
  })

  it('keeps administration actions hidden for a regular member', () => {
    const cloud = familySession({ role: 'member' })
    render(<AccountSettings user={simone} cloud={cloud} />)

    expect(screen.queryByRole('heading', { name: 'Amministra Famiglia Uno' })).toBeNull()
    expect(screen.getByText('Solo un amministratore di questa famiglia può cambiarne il nome o invitare nuovi membri.')).toBeTruthy()
  })
})
