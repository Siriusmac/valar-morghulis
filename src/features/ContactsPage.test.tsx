// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { ContactsPage } from './ContactsPage'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('ContactsPage invitations', () => {
  it('keeps the movement disclosure inside the contact name row', () => {
    render(<ContactsPage
      data={structuredClone(defaultData)}
      user={users[0]}
      contacts={[{ id: users[1].id, name: users[1].name, email: users[1].email, initials: users[1].initials, source: 'family', familyNames: ['Famiglia Miotto'] }]}
      invitations={[]}
      purchases={[]}
      onInvite={vi.fn().mockResolvedValue(undefined)}
      onWithdrawInvitation={vi.fn().mockResolvedValue(undefined)}
      onRemove={vi.fn().mockResolvedValue(undefined)}
      onRespond={vi.fn().mockResolvedValue(undefined)}
      onShowMovements={vi.fn()}
    />)

    const contactButton = screen.getByRole('button', { name: /Anna/ })
    expect(contactButton.querySelector('.contact-row__disclosure')).toBeTruthy()
    expect(contactButton.children).toHaveLength(3)
  })

  it('withdraws a pending contact invitation after confirmation', async () => {
    const onWithdrawInvitation = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<ContactsPage
      data={structuredClone(defaultData)}
      user={users[0]}
      contacts={[]}
      invitations={[{
        id: 'invite-one',
        email: 'amica@example.com',
        status: 'pending',
        createdAt: '2026-08-29T10:00:00Z',
        expiresAt: '2026-09-05T10:00:00Z',
      }]}
      purchases={[]}
      onInvite={vi.fn().mockResolvedValue(undefined)}
      onWithdrawInvitation={onWithdrawInvitation}
      onRemove={vi.fn().mockResolvedValue(undefined)}
      onRespond={vi.fn().mockResolvedValue(undefined)}
      onShowMovements={vi.fn()}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Ritira invito' }))

    await waitFor(() => expect(onWithdrawInvitation).toHaveBeenCalledWith('invite-one'))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('amica@example.com'))
  })
})
