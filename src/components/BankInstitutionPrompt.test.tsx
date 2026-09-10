// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BankInstitutionPrompt } from './BankInstitutionPrompt'

afterEach(cleanup)

const account = {
  id: 'bank-without-institution', ownerId: 'simone', name: 'Conto principale', institution: '',
  type: 'bank' as const, scope: 'personal' as const, openingBalance: 0,
}

describe('BankInstitutionPrompt', () => {
  it('spiega perché serve l’istituto e richiede un valore', () => {
    const onConfirm = vi.fn()
    render(<BankInstitutionPrompt account={account} onConfirm={onConfirm} onCancel={vi.fn()} />)

    expect(screen.getByText(/classificare le eventuali spese bancarie/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Salva e continua' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText('Inserisci il nome dell’istituto.')).toBeTruthy()
  })

  it('restituisce l’istituto ripulito', () => {
    const onConfirm = vi.fn()
    render(<BankInstitutionPrompt account={account} onConfirm={onConfirm} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Istituto'), { target: { value: '  Unicredit  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva e continua' }))

    expect(onConfirm).toHaveBeenCalledWith('Unicredit')
  })
})
