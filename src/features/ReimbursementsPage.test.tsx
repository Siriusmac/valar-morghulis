// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { ReimbursementsPage } from './ReimbursementsPage'

afterEach(cleanup)

describe('ReimbursementsPage', () => {
  it('separates expected reimbursements from owed reimbursements', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [
      { id: 'expected', fromId: users[1].id, toId: users[0].id, amount: 25, date: '2026-08-15', authorId: users[1].id, status: 'confirmed' },
      { id: 'owed', fromId: users[0].id, toId: users[1].id, amount: 40, date: '2026-08-14', authorId: users[0].id, status: 'confirmed' },
    ]

    render(<ReimbursementsPage data={data} user={users[0]} members={users} />)

    expect(screen.getByText(/25,00/)).toBeTruthy()
    expect(screen.queryByText(/40,00/)).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Dovuti' }))
    expect(screen.getByText(/40,00/)).toBeTruthy()
    expect(screen.queryByText(/25,00/)).toBeNull()
  })

  it('confirms a purchase reimbursement through cataloguing instead of the money RPC', async () => {
    const data = structuredClone(defaultData)
    data.categories.push({ id: 'personal-category', name: 'Personale', scope: 'personal', ownerId: users[0].id, movementType: 'expense', color: '#c64e2f' })
    data.reimbursements = [{
      id: 'purchase-reimbursement', fromId: users[1].id, toId: users[0].id,
      amount: 20, date: '2026-08-29', authorId: users[1].id, status: 'pending',
      settlementMethod: 'purchase', commissionedPurchaseId: 'purchase-linked',
    }]
    const purchase = {
      id: 'purchase-linked', payerId: users[1].id, recipientId: users[0].id,
      familyId: 'family', reimbursementId: 'purchase-reimbursement',
      payerMovementId: 'payer-movement', amount: 20, purchaseDate: '2026-08-29',
      description: 'Farmaci', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    const onRespond = vi.fn().mockResolvedValue(undefined)
    const onRespondPurchase = vi.fn().mockResolvedValue(undefined)

    render(<ReimbursementsPage data={data} user={users[0]} members={users} purchases={[purchase]} onRespond={onRespond} onRespondPurchase={onRespondPurchase} />)
    expect(screen.getByText('Compensazione debito')).toBeTruthy()
    expect(screen.queryByLabelText('Conto personale')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e cataloga' }))

    await waitFor(() => expect(onRespondPurchase).toHaveBeenCalledWith(purchase, true, expect.any(String), undefined))
    expect(onRespond).not.toHaveBeenCalled()
  })

  it('shows ordinary commissioned purchases among expected and owed reimbursements', () => {
    const purchase = {
      id: 'ordinary-purchase', payerId: users[0].id, recipientId: users[1].id,
      payerMovementId: 'payer-movement', amount: 35, purchaseDate: '2026-08-29',
      description: 'Farmaci', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    const { rerender } = render(<ReimbursementsPage data={structuredClone(defaultData)} user={users[0]} members={users} purchases={[purchase]} />)
    expect(screen.getByText('Farmaci')).toBeTruthy()
    expect(screen.getByText(/In attesa di conferma/)).toBeTruthy()

    rerender(<ReimbursementsPage data={structuredClone(defaultData)} user={users[1]} members={users} purchases={[purchase]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dovuti' }))
    expect(screen.getByRole('button', { name: 'Conferma e cataloga' })).toBeTruthy()
    expect(screen.getByLabelText('Conto personale')).toBeTruthy()
  })
})
