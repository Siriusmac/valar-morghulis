// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MovementForm } from './MovementForm'
import { defaultData, users } from '../lib/seed'

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
})
