// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultData, users } from '../lib/seed'
import type { SearchReport } from '../types'
import { SearchReportsPage } from './SearchReportsPage'

afterEach(cleanup)

describe('SearchReportsPage', () => {
  it('filters descriptions and saves the report definition', () => {
    const onSaveReport = vi.fn()
    render(<SearchReportsPage data={structuredClone(defaultData)} user={users[0]} onSaveReport={onSaveReport} />)

    fireEvent.change(screen.getByPlaceholderText('Es. vacanza, bolletta, scuola'), { target: { value: 'bolletta' } })
    const counterparty = screen.getByRole('combobox', { name: 'Beneficiario o mittente' })
    fireEvent.change(counterparty, { target: { value: 'Octo' } })
    fireEvent.keyDown(counterparty, { key: 'Enter' })
    expect((screen.getByRole('combobox', { name: 'Beneficiario o mittente' }) as HTMLInputElement).value).toBe('Octopus Energy')
    expect(screen.getByText('1 movimento trovato')).toBeTruthy()
    expect(screen.getByText('Bolletta elettrica')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Crea report' }))
    const name = screen.getByLabelText('Nome del report')
    expect((name as HTMLInputElement).value).toBe('Report · bolletta')
    fireEvent.click(screen.getByRole('button', { name: 'Salva report' }))

    expect(onSaveReport).toHaveBeenCalledOnce()
    expect(onSaveReport.mock.calls[0][0]).toMatchObject({
      ownerId: 'simone',
      name: 'Report · bolletta',
      filters: { query: 'bolletta' },
    })
  })

  it('reopens a saved report and updates it without changing its identity', () => {
    const report: SearchReport = {
      id: 'report-casa',
      ownerId: 'simone',
      name: 'Spese casa',
      filters: { query: 'casa', dateFrom: '2026-07-01', dateTo: '2026-07-31', movementType: 'expense' },
      createdAt: '2026-07-31T10:00:00.000Z',
      updatedAt: '2026-07-31T10:00:00.000Z',
    }
    const data = { ...structuredClone(defaultData), searchReports: [report] }
    const onSaveReport = vi.fn()
    render(<SearchReportsPage data={data} user={users[0]} onSaveReport={onSaveReport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    expect((screen.getByPlaceholderText('Es. vacanza, bolletta, scuola') as HTMLInputElement).value).toBe('casa')
    fireEvent.change(screen.getByLabelText('Nome del report'), { target: { value: 'Spese casa aggiornate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSaveReport.mock.calls[0][0]).toMatchObject({ id: 'report-casa', name: 'Spese casa aggiornate', createdAt: report.createdAt })
  })
})
