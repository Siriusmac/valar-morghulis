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

    for (const section of ['Entrate', 'Condivise', 'Spese']) {
      fireEvent.click(screen.getByRole('button', { name: section }))
      expect((screen.getByLabelText('Mese') as HTMLSelectElement).value).toBe('2025-12')
    }
  })
})
