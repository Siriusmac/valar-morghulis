// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MovementForm } from './MovementForm'
import { defaultData, users } from '../lib/seed'
import { accountBalance } from '../lib/calculations'
import { saveMovementData } from '../lib/movements'
import { materializeDuePayments } from '../lib/scheduled'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MovementForm', () => {
  it('offers fund transfer as the third choice only for a new movement', () => {
    const onSelectTransfer = vi.fn()
    const data = structuredClone(defaultData)
    const { rerender } = render(<MovementForm data={data} user={users[0]} onSave={vi.fn()} onCancel={vi.fn()} onSelectTransfer={onSelectTransfer} />)

    fireEvent.click(screen.getByRole('button', { name: 'Giro fondi' }))
    expect(onSelectTransfer).toHaveBeenCalledOnce()

    const existing = data.movements[0]
    rerender(<MovementForm data={data} user={users[0]} initial={existing} onSave={vi.fn()} onCancel={vi.fn()} onSelectTransfer={onSelectTransfer} />)
    expect(screen.queryByRole('button', { name: 'Giro fondi' })).toBeNull()
  })

  it('asks how a movement before the opening balance date affects the account', () => {
    const data = structuredClone(defaultData)
    data.accounts = data.accounts.map((account) => account.id === 'simone-bank'
      ? { ...account, openingBalanceDate: '2026-07-20' }
      : account)

    render(
      <MovementForm
        data={data}
        user={users[0]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-07-10' } })

    expect(screen.getByText('Questo movimento è precedente al saldo iniziale del conto')).toBeTruthy()
    expect((screen.getByLabelText(/Solo statistiche/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/Includi nel saldo/) as HTMLInputElement).checked).toBe(false)
  })

  it('creates and selects a new beneficiary from the movement form', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Nuovo negozio' } })
    expect(screen.getByRole('option', { name: 'Crea “Nuovo negozio”' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement, additions] = onSave.mock.calls[0]
    expect(additions.beneficiary.name).toBe('Nuovo negozio')
    expect(movement.beneficiaryId).toBe(additions.beneficiary.id)
  })

  it('filters categories while typing and offers to create a missing one', () => {
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={vi.fn()} onCancel={vi.fn()} />)

    const input = screen.getByLabelText('Categoria') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Inserisci categoria')

    fireEvent.change(input, { target: { value: 'Alim' } })
    expect(screen.getByRole('option', { name: 'Alimentari' })).toBeTruthy()

    fireEvent.change(input, { target: { value: 'Categoria speciale' } })
    expect(screen.getByRole('option', { name: 'Crea “Categoria speciale”' })).toBeTruthy()
  })

  it('hides the beneficiary for an income and creates a selectable sender', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrata' }))

    expect(screen.queryByLabelText('Beneficiario')).toBeNull()
    expect(screen.getByLabelText('Mittente')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Stipendio' } })
    fireEvent.change(screen.getByLabelText('Mittente'), { target: { value: 'Cliente prova' } })
    expect(screen.getByRole('option', { name: 'Crea “Cliente prova”' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement, additions] = onSave.mock.calls[0]
    expect(movement.beneficiaryId).toBe('beneficiary-user-simone')
    expect(movement.senderId).toBe(additions.sender.id)
    expect(additions.sender.name).toBe('Cliente prova')
    expect(additions.beneficiary).toMatchObject({
      id: 'beneficiary-user-simone',
      name: 'Simone',
      scope: 'personal',
      ownerId: 'simone',
    })
  })

  it('can add a sender while editing a historical income without one', () => {
    const onSave = vi.fn()
    const historicalIncome = {
      ...defaultData.movements.find((movement) => movement.id === 'seed-4')!,
      senderId: undefined,
    }
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={historicalIncome} onSave={onSave} onCancel={vi.fn()} />)

    expect((screen.getByLabelText('Mittente') as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('Mittente'), { target: { value: 'Datore di lavoro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSave).toHaveBeenCalledOnce()
    expect(onSave.mock.calls[0][0]).toMatchObject({
      id: historicalIncome.id,
      senderId: 'datore-lavoro',
    })
  })

  it('keeps new movements private in the personal-only workspace', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} personalOnly onSave={onSave} onCancel={vi.fn()} />)
    expect(screen.getByText('In questa vista i movimenti restano privati e non partecipano a saldi familiari.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Lidl' } })
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))
    expect(onSave.mock.calls[0][0].shared).toBe(false)
  })

  it('preserves installment metadata when an existing movement is edited', () => {
    const onSave = vi.fn()
    const initial = defaultData.movements.find((movement) => movement.id === 'seed-installment-1')!
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Accessori aggiornati · rata 1/3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    const [movement] = onSave.mock.calls[0]
    expect(movement.installmentPlanId).toBe('seed-plan')
    expect(movement.installmentNumber).toBe(1)
    expect(movement.installmentCount).toBe(3)
  })

  it('ricalcola il totale condiviso usando il nuovo importo della prima rata', () => {
    const onSave = vi.fn()
    const data = structuredClone(defaultData)
    const initial = { ...data.movements.find((movement) => movement.id === 'seed-installment-1')!, shared: true, sharedSettlementAmount: 120 }
    data.movements = data.movements.map((movement) => movement.id === initial.id ? initial : movement)
    data.scheduledPayments = data.scheduledPayments.map((payment) => ({ ...payment, shared: true }))
    render(<MovementForm data={data} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSave.mock.calls[0][0].sharedSettlementAmount).toBe(130)
  })

  it('non conta due volte una rata già materializzata', () => {
    const onSave = vi.fn()
    const data = structuredClone(defaultData)
    const initial = { ...data.movements.find((movement) => movement.id === 'seed-installment-1')!, shared: true, sharedSettlementAmount: 120 }
    const paid = { ...data.scheduledPayments[0], shared: true, status: 'paid' as const, paidMovementId: 'installment-paid' }
    data.movements = [
      ...data.movements.map((movement) => movement.id === initial.id ? initial : movement),
      { ...initial, id: 'installment-paid', amount: 40, installmentNumber: 2, sharedSettlementAmount: 0, createdAt: '2026-08-18T08:00:00.000Z' },
    ]
    data.scheduledPayments = [paid, { ...data.scheduledPayments[1], shared: true }]
    render(<MovementForm data={data} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))
    expect(onSave.mock.calls[0][0].sharedSettlementAmount).toBe(120)
  })

  it('non conta un duplicato importato della prima rata con ID diverso', () => {
    const onSave = vi.fn()
    const data = structuredClone(defaultData)
    const initial = { ...data.movements.find((movement) => movement.id === 'seed-installment-1')!, shared: true, sharedSettlementAmount: 120 }
    data.movements = [
      ...data.movements.map((movement) => movement.id === initial.id ? initial : movement),
      { ...initial, id: 'duplicato-importato' },
    ]
    data.scheduledPayments = data.scheduledPayments.map((payment) => ({ ...payment, shared: true }))
    render(<MovementForm data={data} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSave.mock.calls[0][0].sharedSettlementAmount).toBe(120)
  })

  it('mantiene le rate antecedenti al saldo iniziale fuori dal saldo del conto', () => {
    let savedData = structuredClone(defaultData)
    savedData.movements = []
    savedData.scheduledPayments = []
    savedData.accounts = savedData.accounts.map((account) => account.id === 'simone-bank'
      ? { ...account, openingBalanceDate: '2026-10-20' }
      : account)
    const openingBalance = savedData.accounts.find((account) => account.id === 'simone-bank')!.openingBalance
    const onSave = vi.fn((movement, additions) => {
      savedData = saveMovementData(savedData, movement, additions)
    })
    render(<MovementForm data={savedData} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-07-10' } })
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '90' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Lidl' } })
    fireEvent.click(screen.getByRole('button', { name: /Pagamento a rate/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(savedData.scheduledPayments.map((payment) => payment.affectsAccountBalance)).toEqual([false, false])
    savedData = materializeDuePayments(savedData, '2026-09-10')
    expect(accountBalance(savedData, 'simone-bank')).toBe(openingBalance)
  })

  it('preserva il totale della prima rata quando cambia un campo non economico', () => {
    const onSave = vi.fn()
    const data = structuredClone(defaultData)
    const initial = { ...data.movements.find((movement) => movement.id === 'seed-installment-1')!, shared: true, sharedSettlementAmount: 120 }
    data.movements = data.movements.map((movement) => movement.id === initial.id ? initial : movement)
    data.scheduledPayments = data.scheduledPayments.map((payment) => ({ ...payment, shared: true }))
    render(<MovementForm data={data} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Descrizione aggiornata' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))
    expect(onSave.mock.calls[0][0].sharedSettlementAmount).toBe(120)
  })

  it('keeps the original identity and submits the edited movement values', () => {
    const onSave = vi.fn()
    const initial = defaultData.movements.find((movement) => movement.id === 'seed-1')!
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '42,50' } })
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Spesa corretta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement] = onSave.mock.calls[0]
    expect(movement).toMatchObject({
      id: initial.id,
      createdAt: initial.createdAt,
      amount: 42.5,
      description: 'Spesa corretta',
    })
  })

  it('can make an existing personal movement shared', () => {
    const onSave = vi.fn()
    const initial = defaultData.movements.find((movement) => movement.id === 'seed-5')!
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Condivisione del movimento'), { target: { value: 'family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSave.mock.calls[0][0].shared).toBe(true)
  })

  it('can make an existing shared movement personal', () => {
    const onSave = vi.fn()
    const initial = defaultData.movements.find((movement) => movement.id === 'seed-1')!
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Condivisione del movimento'), { target: { value: 'personal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSave.mock.calls[0][0].shared).toBe(false)
  })

  it('deletes an existing movement from the edit form after confirmation', () => {
    const onDelete = vi.fn()
    const onSave = vi.fn()
    const initial = defaultData.movements.find((movement) => movement.id === 'seed-1')!
    vi.stubGlobal('confirm', vi.fn(() => true))
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onDelete={onDelete} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Elimina movimento' }))

    expect(onDelete).toHaveBeenCalledWith(initial.id)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('adds category partials with an independent shared setting', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Lidl' } })
    fireEvent.change(screen.getByLabelText('Tipo di acquisto'), { target: { value: 'multiple' } })
    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Categoria parziale 1'), { target: { value: 'Accessori casa' } })
    fireEvent.change(screen.getByLabelText('Tipo di spesa parziale 1'), { target: { value: 'shared' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement] = onSave.mock.calls[0]
    expect(movement).toMatchObject({
      amount: 100,
      categoryId: 'alimentari',
      splits: [{ amount: 30, categoryId: 'accessori-casa', shared: true }],
    })
  })

  it('separates purchase type from expense type and only shows the family for shared expenses', () => {
    render(<MovementForm
      data={structuredClone(defaultData)}
      user={users[0]}
      familyName="Famiglia Miotto"
      onSave={vi.fn()}
      onCancel={vi.fn()}
    />)

    expect((screen.getByLabelText('Tipo di acquisto') as HTMLSelectElement).value).toBe('single')
    const expenseType = screen.getByLabelText('Tipo di spesa') as HTMLSelectElement
    expect(expenseType.value).toBe('shared')
    const family = screen.getByLabelText('Spesa condivisa con') as HTMLSelectElement
    expect(family.textContent).toContain('Famiglia Miotto')
    expect(family.textContent).not.toContain('personale')

    fireEvent.change(expenseType, { target: { value: 'personal' } })

    expect(screen.queryByLabelText('Spesa condivisa con')).toBeNull()
  })

  it('creates a missing split category and reuses the common beneficiary', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '60' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Lidl' } })
    fireEvent.change(screen.getByLabelText('Tipo di acquisto'), { target: { value: 'multiple' } })
    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Categoria parziale 1'), { target: { value: 'Prodotti animali' } })
    expect(screen.getByRole('option', { name: 'Crea “Prodotti animali”' })).toBeTruthy()
    expect(screen.queryByLabelText('Beneficiario parziale 1')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    const [movement, additions] = onSave.mock.calls[0]
    expect(additions.categories[0].name).toBe('Prodotti animali')
    expect(movement.splits[0]).toMatchObject({
      categoryId: additions.categories[0].id,
      beneficiaryId: movement.beneficiaryId,
    })
  })

  it('keeps category splits when an expense is paid in installments', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Lidl' } })
    fireEvent.change(screen.getByLabelText('Tipo di acquisto'), { target: { value: 'multiple' } })
    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Categoria parziale 1'), { target: { value: 'Accessori casa' } })
    fireEvent.change(screen.getByLabelText('Tipo di spesa parziale 1'), { target: { value: 'shared' } })
    fireEvent.click(screen.getByRole('button', { name: /Pagamento a rate/ }))

    expect(screen.getByLabelText('Importo parziale 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    const [movement, additions] = onSave.mock.calls[0]
    expect(movement.amount).toBe(33.33)
    expect(movement.splits[0]).toMatchObject({ categoryId: 'accessori-casa', amount: 10 })
    expect(additions.scheduledPayments.map((payment: { splits?: Array<{ amount: number }> }) => payment.splits?.[0].amount)).toEqual([10, 10])
    expect(movement.sharedSettlementAmount).toBe(100)
  })

  it('keeps split partials editable on an existing movement', () => {
    const onSave = vi.fn()
    const initial = {
      ...defaultData.movements.find((movement) => movement.id === 'seed-1')!,
      splits: [{ id: 'split-existing', amount: 10, categoryId: 'accessori-casa', shared: false }],
    }
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '12,50' } })
    fireEvent.change(screen.getByLabelText('Tipo di spesa parziale 1'), { target: { value: 'shared' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    const [movement] = onSave.mock.calls[0]
    expect(movement.id).toBe(initial.id)
    expect(movement.splits).toEqual([
      expect.objectContaining({ id: 'split-existing', amount: 12.5, categoryId: 'accessori-casa', shared: true }),
    ])
  })

  it('creates a mixed purchase with a commissioned partial and keeps the total for installments', async () => {
    const onSave = vi.fn()
    const onCommissionedPurchase = vi.fn().mockResolvedValue(undefined)
    render(<MovementForm
      data={structuredClone(defaultData)}
      user={users[0]}
      contacts={[{ id: users[1].id, name: users[1].name, email: users[1].email, initials: users[1].initials, source: 'family' }]}
      onCommissionedPurchase={onCommissionedPurchase}
      onSave={onSave}
      onCancel={vi.fn()}
    />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: 'Lidl' } })
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Spesa mista' } })
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'Alimentari' } })
    fireEvent.click(screen.getByRole('button', { name: /Pagamento a rate/ }))
    fireEvent.change(screen.getByLabelText('Tipo di acquisto'), { target: { value: 'multiple' } })
    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Tipo di spesa parziale 1'), { target: { value: 'commissioned' } })
    fireEvent.change(screen.getByLabelText('Committente'), { target: { value: users[1].id } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onCommissionedPurchase).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: users[1].id,
      amount: 30,
      description: 'Spesa mista',
    }))
    const [movement, additions] = onSave.mock.calls[0]
    expect(movement.amount).toBe(33.33)
    expect(movement.splits[0]).toMatchObject({
      commissionedPurchaseId: expect.any(String),
      excludeFromReports: true,
      shared: false,
    })
    expect(additions.scheduledPayments).toHaveLength(2)
    expect([movement, ...additions.scheduledPayments].reduce((sum, item) => sum + item.amount, 0)).toBe(100)
  })

  it('uses a single purchase as a reimbursement toward an eligible family member', async () => {
    const onSave = vi.fn()
    const onCommissionedPurchase = vi.fn().mockResolvedValue(undefined)
    render(<MovementForm
      data={structuredClone(defaultData)}
      user={users[0]}
      members={users}
      contacts={[{ id: users[1].id, name: users[1].name, email: users[1].email, initials: users[1].initials, source: 'family' }]}
      onCommissionedPurchase={onCommissionedPurchase}
      onSave={onSave}
      onCancel={vi.fn()}
    />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Scarpe per Anna' } })
    fireEvent.change(screen.getByLabelText('Tipo di spesa'), { target: { value: 'reimbursement' } })
    expect((screen.getByLabelText('Rimborso a') as HTMLSelectElement).value).toBe(users[1].id)
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onCommissionedPurchase).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: users[1].id,
      amount: 20,
      reimbursementId: expect.any(String),
      accountId: 'simone-bank',
    }))
    expect(onSave.mock.calls[0][0]).toMatchObject({
      amount: 20,
      shared: false,
      excludeFromReports: true,
      commissionedPurchaseId: expect.any(String),
    })
  })

  it('offers reimbursement through purchase on every row of a multiple purchase', async () => {
    const onSave = vi.fn()
    const onCommissionedPurchase = vi.fn().mockResolvedValue(undefined)
    render(<MovementForm
      data={structuredClone(defaultData)}
      user={users[0]}
      members={users}
      onCommissionedPurchase={onCommissionedPurchase}
      onSave={onSave}
      onCancel={vi.fn()}
    />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Descrizione'), { target: { value: 'Acquisto in compensazione' } })
    fireEvent.change(screen.getByLabelText('Tipo di acquisto'), { target: { value: 'multiple' } })
    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Tipo di spesa parziale 1'), { target: { value: 'reimbursement' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onCommissionedPurchase).toHaveBeenCalledWith(expect.objectContaining({
      recipientId: users[1].id,
      amount: 30,
      reimbursementId: expect.any(String),
      splitId: expect.any(String),
    }))
    expect(onSave.mock.calls[0][0].splits[0]).toMatchObject({
      amount: 30,
      shared: false,
      excludeFromReports: true,
      commissionedPurchaseId: expect.any(String),
    })
  })
})
