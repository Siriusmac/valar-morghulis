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
      familyId: 'family', reimbursementId: 'purchase-reimbursement', payerMovementId: 'payer-movement',
      amount: 20, purchaseDate: '2026-08-29', description: 'Farmaci', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    const onRespond = vi.fn().mockResolvedValue(undefined)
    const onRespondPurchase = vi.fn().mockResolvedValue(undefined)
    render(<ReimbursementsPage data={data} user={users[0]} members={users} purchases={[purchase]} onRespond={onRespond} onRespondPurchase={onRespondPurchase} />)
    expect(screen.getByText('Compensazione debito')).toBeTruthy()
    expect(screen.queryByLabelText('Conto personale')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e cataloga' }))
    await waitFor(() => expect(onRespondPurchase).toHaveBeenCalledWith(purchase, true, expect.any(String), undefined, undefined))
    expect(onRespond).not.toHaveBeenCalled()
  })

  it('does not offer purchase actions when the linked reimbursement is already confirmed', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{
      id: 'purchase-reimbursement', fromId: users[1].id, toId: users[0].id,
      amount: 20, date: '2026-08-29', authorId: users[1].id, status: 'confirmed',
      settlementMethod: 'purchase', commissionedPurchaseId: 'purchase-linked',
    }]
    const purchase = {
      id: 'purchase-linked', payerId: users[1].id, recipientId: users[0].id,
      familyId: 'family', reimbursementId: 'purchase-reimbursement', payerMovementId: 'payer-movement',
      amount: 20, purchaseDate: '2026-08-29', description: 'Farmaci', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    render(<ReimbursementsPage data={data} user={users[0]} members={users} purchases={[purchase]} onRespondPurchase={vi.fn()} />)
    expect(screen.getByText('Rimborso confermato')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Conferma e cataloga' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rifiuta' })).toBeNull()
  })

  it('submits a confirmed reimbursement correction for reciprocal approval', async () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{ id: 'confirmed-reimbursement', fromId: users[1].id, toId: users[0].id, amount: 20, date: '2026-08-29', authorId: users[1].id, status: 'confirmed' }]
    const onRequestChange = vi.fn().mockResolvedValue(undefined)
    render(<ReimbursementsPage data={data} user={users[0]} members={users} onRequestChange={onRequestChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    fireEvent.change(screen.getByLabelText('Importo corretto'), { target: { value: '18,50' } })
    fireEvent.change(screen.getByLabelText('Data corretta'), { target: { value: '2026-08-28' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invia modifica' }))
    await waitFor(() => expect(onRequestChange).toHaveBeenCalledWith('confirmed-reimbursement', expect.objectContaining({ kind: 'update', amount: 18.5, date: '2026-08-28' })))
  })

  it('lets only the other party approve or reject a pending correction', async () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{
      id: 'confirmed-reimbursement', fromId: users[1].id, toId: users[0].id, amount: 20,
      date: '2026-08-29', authorId: users[1].id, status: 'confirmed',
      changeRequest: { id: 'change-one', kind: 'delete', requestedBy: users[1].id, requestedAt: '2026-08-30T08:00:00Z' },
    }]
    const onRespondChange = vi.fn().mockResolvedValue(undefined)
    render(<ReimbursementsPage data={data} user={users[0]} members={users} onRespondChange={onRespondChange} />)
    expect(screen.getByText('Annullamento richiesto')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approva rettifica' }))
    await waitFor(() => expect(onRespondChange).toHaveBeenCalledWith('change-one', true))
  })

  it('allows the requester to withdraw a pending correction', async () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{
      id: 'confirmed-reimbursement', fromId: users[1].id, toId: users[0].id, amount: 20,
      date: '2026-08-29', authorId: users[1].id, status: 'confirmed',
      changeRequest: { id: 'change-one', kind: 'update', requestedBy: users[0].id, requestedAt: '2026-08-30T08:00:00Z', amount: 18.5, date: '2026-08-28' },
    }]
    const onWithdrawChange = vi.fn().mockResolvedValue(undefined)
    render(<ReimbursementsPage data={data} user={users[0]} members={users} onWithdrawChange={onWithdrawChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ritira richiesta' }))
    await waitFor(() => expect(onWithdrawChange).toHaveBeenCalledWith('change-one'))
  })

  it('keeps an approved cancellation in history without further actions', () => {
    const data = structuredClone(defaultData)
    data.reimbursements = [{ id: 'cancelled-reimbursement', fromId: users[1].id, toId: users[0].id, amount: 20, date: '2026-08-29', authorId: users[1].id, status: 'cancelled' }]
    render(<ReimbursementsPage data={data} user={users[0]} members={users} onRequestChange={vi.fn()} />)
    expect(screen.getByText('Rimborso annullato')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Modifica' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Elimina' })).toBeNull()
  })

  it('shows the cloud error when purchase cataloguing fails', async () => {
    const data = structuredClone(defaultData)
    data.categories.push({ id: 'personal-category', name: 'Personale', scope: 'personal', ownerId: users[0].id, movementType: 'expense', color: '#c64e2f' })
    data.reimbursements = [{
      id: 'purchase-reimbursement', fromId: users[1].id, toId: users[0].id, amount: 20,
      date: '2026-08-29', authorId: users[1].id, status: 'pending', settlementMethod: 'purchase', commissionedPurchaseId: 'purchase-linked',
    }]
    const purchase = {
      id: 'purchase-linked', payerId: users[1].id, recipientId: users[0].id, familyId: 'family', reimbursementId: 'purchase-reimbursement',
      payerMovementId: 'payer-movement', amount: 20, purchaseDate: '2026-08-29', description: 'Farmaci', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    render(<ReimbursementsPage data={data} user={users[0]} members={users} purchases={[purchase]} onRespondPurchase={vi.fn().mockRejectedValue({ message: 'purchase_catalog_required', code: 'P0001' })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e cataloga' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Scegli la categoria')
  })

  it('offers to add a missing category while cataloguing a purchase', async () => {
    const data = structuredClone(defaultData)
    const purchase = {
      id: 'ordinary-purchase', payerId: users[1].id, recipientId: users[0].id, payerMovementId: 'payer-movement',
      amount: 35, purchaseDate: '2026-08-29', description: 'Cena', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    const onRespondPurchase = vi.fn().mockResolvedValue(undefined)
    render(<ReimbursementsPage data={data} user={users[0]} members={users} purchases={[purchase]} onRespondPurchase={onRespondPurchase} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dovuti' }))
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Cene occasionali' } })
    expect(screen.getByRole('option', { name: 'Aggiungi “Cene occasionali”' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e cataloga' }))
    await waitFor(() => expect(onRespondPurchase).toHaveBeenCalledWith(purchase, true, expect.any(String), undefined, expect.objectContaining({ name: 'Cene occasionali' })))
  })

  it('shows ordinary commissioned purchases among expected and owed reimbursements', () => {
    const purchase = {
      id: 'ordinary-purchase', payerId: users[0].id, recipientId: users[1].id, payerMovementId: 'payer-movement',
      amount: 35, purchaseDate: '2026-08-29', description: 'Farmaci', status: 'pending' as const, createdAt: '2026-08-29T10:00:00Z',
    }
    const { rerender } = render(<ReimbursementsPage data={structuredClone(defaultData)} user={users[0]} members={users} purchases={[purchase]} />)
    expect(screen.getByText('Farmaci')).toBeTruthy()
    expect(screen.getByText(/In attesa di conferma/)).toBeTruthy()
    rerender(<ReimbursementsPage data={structuredClone(defaultData)} user={users[1]} members={users} purchases={[purchase]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dovuti' }))
    expect(screen.getByRole('button', { name: 'Conferma e cataloga' })).toBeTruthy()
    expect(screen.queryByLabelText('Conto personale')).toBeNull()
  })

  it('asks the recipient to issue and the payer to confirm an ordinary reimbursement', async () => {
    const data = structuredClone(defaultData)
    const receivedPurchase = {
      id: 'ordinary-purchase', payerId: users[0].id, recipientId: users[1].id, payerMovementId: 'payer-movement',
      recipientMovementId: 'recipient-movement', recipientCategoryId: 'food',
      amount: 35, purchaseDate: '2026-08-29', description: 'Farmaci', status: 'confirmed' as const,
      reimbursementStatus: 'not_issued' as const, createdAt: '2026-08-29T10:00:00Z', resolvedAt: '2026-08-29T11:00:00Z',
    }
    const onIssue = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<ReimbursementsPage data={data} user={users[1]} members={users} purchases={[receivedPurchase]} onIssuePurchaseReimbursement={onIssue} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Dovuti' }))
    fireEvent.click(screen.getByRole('button', { name: 'Emetti rimborso' }))
    await waitFor(() => expect(onIssue).toHaveBeenCalledWith(receivedPurchase, expect.any(String)))

    const issuedPurchase = { ...receivedPurchase, reimbursementStatus: 'pending' as const, reimbursementSourceAccountId: 'anna-bank', reimbursementIssuedAt: '2026-08-30T09:00:00Z' }
    const onRespond = vi.fn().mockResolvedValue(undefined)
    rerender(<ReimbursementsPage data={data} user={users[0]} members={users} purchases={[issuedPurchase]} onRespondPurchaseReimbursement={onRespond} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Attesi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Conferma ricezione' }))
    await waitFor(() => expect(onRespond).toHaveBeenCalledWith(issuedPurchase, true, expect.any(String)))
  })

  it('labels a cancelled reimbursement and shows its latest interaction', () => {
    const purchase = {
      id: 'cancelled-purchase', payerId: users[0].id, recipientId: users[1].id, payerMovementId: 'payer-movement',
      amount: 35, purchaseDate: '2026-08-29', description: 'Farmaci', status: 'confirmed' as const,
      reimbursementStatus: 'cancelled' as const, reimbursementCancelledAt: '2026-09-05T12:30:00Z', createdAt: '2026-08-29T10:00:00Z',
    }
    render(<ReimbursementsPage data={structuredClone(defaultData)} user={users[0]} members={users} purchases={[purchase]} />)
    expect(screen.getByText(/Annullato/)).toBeTruthy()
    expect(screen.getByText(/Ultima interazione: 05 set 2026/)).toBeTruthy()
  })
})

describe('ReimbursementsPage loans', () => {
  it('creates a loan draft from the dedicated section', async () => {
    const onCreateLoan = vi.fn().mockResolvedValue(undefined)
    render(<ReimbursementsPage data={structuredClone(defaultData)} user={users[0]} members={users} onCreateLoan={onCreateLoan} />)

    fireEvent.click(screen.getByRole('button', { name: 'Nuovo prestito' }))
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '100,50' } })
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Anticipo spese' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invia per conferma' }))

    await waitFor(() => expect(onCreateLoan).toHaveBeenCalledWith(expect.objectContaining({
      borrowerId: 'anna', amount: 100.5, description: 'Anticipo spese', lenderAccountId: 'simone-bank',
    })))
  })

  it('shows the exact residual after a confirmed partial repayment', () => {
    const data = structuredClone(defaultData)
    data.loans = [{
      id: 'loan-1', lenderId: 'simone', borrowerId: 'anna', amount: 100,
      date: '2026-09-01', description: 'Prestito test', authorId: 'simone',
      lenderAccountId: 'simone-bank', borrowerAccountId: 'anna-bank', status: 'confirmed',
    }]
    data.loanRepayments = [{
      id: 'repayment-1', loanId: 'loan-1', lenderId: 'simone', borrowerId: 'anna', amount: 35,
      date: '2026-09-02', description: 'Prima parte', authorId: 'anna', method: 'money',
      fromAccountId: 'anna-bank', toAccountId: 'simone-bank', status: 'confirmed',
    }]
    render(<ReimbursementsPage data={data} user={users[0]} members={users} />)

    expect(screen.getByText('Prestito test')).toBeTruthy()
    expect(screen.getByText(/65,00/)).toBeTruthy()
  })
})
