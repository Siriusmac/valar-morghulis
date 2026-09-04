// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { TransferForm } from './TransferForm'

afterEach(cleanup)

function submitAmount(amount: string) {
  const onSubmit = vi.fn()
  const { container } = render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)
  fireEvent.change(container.querySelector('input[inputmode="decimal"]')!, { target: { value: amount } })
  fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))
  cleanup()
  return onSubmit
}

describe('TransferForm', () => {
  it('shows only the transfer fields after the movement choice', () => {
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Giro fondi' })).toBeNull()
    expect(screen.getByLabelText('Dal conto')).toBeTruthy()
  })

  it.each(['NaN', 'Infinity'])('rifiuta un importo non finito: %s', (amount) => {
    expect(submitAmount(amount)).not.toHaveBeenCalled()
  })

  it.each(['0', '-1'])('rifiuta zero e importi negativi: %s', (amount) => {
    expect(submitAmount(amount)).not.toHaveBeenCalled()
  })

  it('accetta un importo numerico positivo', () => {
    const onSubmit = submitAmount('12,50')
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0][0].amount).toBe(12.5)
  })

  it('registra le spese bancarie separatamente dall’importo trasferito', () => {
    const onSubmit = vi.fn()
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Spese bancarie'), { target: { value: '1,75' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ amount: 100, feeAmount: 1.75 }))
  })

  it('rifiuta spese bancarie negative', () => {
    const onSubmit = vi.fn()
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('Spese bancarie'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('non possono essere negative')
  })

  it('spiega perché non può spostare denaro verso lo stesso conto', () => {
    const onSubmit = vi.fn()
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Al conto'), { target: { value: 'simone-bank' } })
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Scegli due conti diversi')
  })

  it('spiega quando è disponibile un solo conto', () => {
    const onSubmit = vi.fn()
    const data = structuredClone(defaultData)
    data.accounts = data.accounts.filter((account) => account.id === 'simone-bank')
    render(<TransferForm data={data} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('almeno due conti')
  })

  it('mostra un errore quando il salvataggio non riesce', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Cloud non raggiungibile'))
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} onSubmit={onSubmit} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma giro fondi' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cloud non raggiungibile'))
    expect(screen.getByRole('button', { name: 'Conferma giro fondi' })).toBeTruthy()
  })

  it('precompila e aggiorna un giro fondi mantenendone identità e autore', () => {
    const initial = {
      id: 'transfer-edit', authorId: users[0].id,
      fromAccountId: 'simone-bank', toAccountId: 'simone-card',
      amount: 25.5, feeAmount: 1.2, date: '2026-07-20', description: 'Ricarica carta',
    }
    const onSubmit = vi.fn()
    render(<TransferForm data={structuredClone(defaultData)} user={users[0]} initial={initial} onSubmit={onSubmit} onCancel={vi.fn()} />)

    expect((screen.getByLabelText('Importo') as HTMLInputElement).value).toBe('25,50')
    expect((screen.getByLabelText('Spese bancarie') as HTMLInputElement).value).toBe('1,20')
    expect((screen.getByLabelText('Descrizione') as HTMLInputElement).value).toBe('Ricarica carta')
    fireEvent.change(screen.getByLabelText('Importo'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: initial.id, authorId: initial.authorId, amount: 30 }))
  })
})
