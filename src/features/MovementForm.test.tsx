// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MovementForm } from './MovementForm'
import { defaultData, users } from '../lib/seed'

afterEach(cleanup)

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
})
