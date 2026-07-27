// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MovementForm } from './MovementForm'
import { defaultData, users } from '../lib/seed'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MovementForm', () => {
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

    fireEvent.change(screen.getByLabelText('Beneficiario'), { target: { value: '__new' } })
    expect((screen.getByLabelText('Nome nuovo beneficiario') as HTMLInputElement).value).toBe('')
    fireEvent.change(screen.getByLabelText('Nome nuovo beneficiario'), { target: { value: 'Nuovo negozio' } })
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement, additions] = onSave.mock.calls[0]
    expect(additions.beneficiary.name).toBe('Nuovo negozio')
    expect(movement.beneficiaryId).toBe(additions.beneficiary.id)
  })

  it('opens a new category field empty and uses example text as a placeholder', () => {
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={vi.fn()} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '__new' } })

    const input = screen.getByLabelText('Nome nuova categoria') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Es. Alimentari, ristorante')
  })

  it('hides the beneficiary for an income and assigns the current user automatically', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Entrata' }))

    expect(screen.queryByLabelText('Beneficiario')).toBeNull()
    expect(screen.queryByLabelText('Nome nuovo beneficiario')).toBeNull()

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '1200' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement, additions] = onSave.mock.calls[0]
    expect(movement.beneficiaryId).toBe('beneficiary-user-simone')
    expect(additions.beneficiary).toMatchObject({
      id: 'beneficiary-user-simone',
      name: 'Simone',
      scope: 'personal',
      ownerId: 'simone',
    })
  })

  it('keeps new movements private in the personal-only workspace', () => {
    const onSave = vi.fn()
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} personalOnly onSave={onSave} onCancel={vi.fn()} />)
    expect(screen.getByText('In questa vista i movimenti restano privati e non partecipano a saldi familiari.')).toBeTruthy()
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
    fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'alimentari' } })
    fireEvent.change(screen.getByLabelText('Suddivisione per categorie'), { target: { value: 'split' } })
    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Categoria parziale 1'), { target: { value: 'accessori-casa' } })
    fireEvent.change(screen.getByLabelText('Contabilità parziale 1'), { target: { value: 'family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva movimento' }))

    expect(onSave).toHaveBeenCalledOnce()
    const [movement] = onSave.mock.calls[0]
    expect(movement).toMatchObject({
      amount: 100,
      categoryId: 'alimentari',
      splits: [{ amount: 30, categoryId: 'accessori-casa', shared: true }],
    })
  })

  it('keeps split partials editable on an existing movement', () => {
    const onSave = vi.fn()
    const initial = {
      ...defaultData.movements.find((movement) => movement.id === 'seed-1')!,
      splits: [{ id: 'split-existing', amount: 10, categoryId: 'accessori-casa', shared: false }],
    }
    render(<MovementForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo parziale 1'), { target: { value: '12,50' } })
    fireEvent.change(screen.getByLabelText('Contabilità parziale 1'), { target: { value: 'family' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    const [movement] = onSave.mock.calls[0]
    expect(movement.id).toBe(initial.id)
    expect(movement.splits).toEqual([
      { id: 'split-existing', amount: 12.5, categoryId: 'accessori-casa', shared: true },
    ])
  })
})
