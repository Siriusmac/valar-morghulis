// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import { MovementsPage } from './MovementsPage'

afterEach(() => { cleanup(); vi.useRealTimers() })

function renderPage() {
  render(<MovementsPage data={structuredClone(defaultData)} user={users[0]} onEdit={vi.fn()} onDelete={vi.fn()} />)
  return screen.getByLabelText('Mese') as HTMLSelectElement
}

describe('MovementsPage', () => {
  it('inizializza il filtro sul mese locale corrente', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 31, 23, 30))
    expect(renderPage().value).toBe('2026-07')
  })

  it('gestisce il cambio di anno', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2027, 0, 1, 0, 5))
    expect(renderPage().value).toBe('2027-01')
  })

  it('usa un menu non editabile e mantiene il mese nelle tre sezioni', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 31))
    const select = renderPage()
    expect(select.tagName).toBe('SELECT')
    fireEvent.change(select, { target: { value: '2025-12' } })
    expect(select.value).toBe('2025-12')

    for (const section of ['Entrate', 'Condivise', 'Giri fondi', 'Spese']) {
      fireEvent.click(screen.getByRole('button', { name: section }))
      expect((screen.getByLabelText('Mese') as HTMLSelectElement).value).toBe('2025-12')
    }
  })

  it('mostra i giri fondi registrati con conto di origine e destinazione', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 6, 31))
    const data = structuredClone(defaultData)
    data.transfers.push({
      id: 'transfer-visible', authorId: users[0].id,
      fromAccountId: 'simone-bank', toAccountId: 'simone-card',
      amount: 42.5, date: '2026-07-31', description: 'Ricarica carta',
    })
    render(<MovementsPage data={data} user={users[0]} onEdit={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Giri fondi' }))

    expect(screen.getByText('Ricarica carta')).toBeTruthy()
    expect(screen.getByText('Conto corrente')).toBeTruthy()
    expect(screen.getByText('Carta di credito')).toBeTruthy()
    expect(screen.getAllByText('42,50 €').length).toBeGreaterThan(0)
  })
})
