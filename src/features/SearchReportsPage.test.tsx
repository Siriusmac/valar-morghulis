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
    render(<SearchReportsPage data={structuredClone(defaultData)} user={users[0]} onSaveReport={onSaveReport} onDeleteReport={vi.fn()} onEditMovement={vi.fn()} onDeleteMovement={vi.fn()} />)

    expect(screen.queryByRole('heading', { name: 'Risultati' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Crea report' })).toBeNull()
    fireEvent.change(screen.getByPlaceholderText('Es. vacanza, bolletta, scuola'), { target: { value: 'bolletta' } })
    const counterparty = screen.getByRole('combobox', { name: 'Beneficiario o mittente' })
    fireEvent.change(counterparty, { target: { value: 'Octo' } })
    fireEvent.keyDown(counterparty, { key: 'Enter' })
    expect((screen.getByRole('combobox', { name: 'Beneficiario o mittente' }) as HTMLInputElement).value).toBe('Octopus Energy')
    expect(screen.queryByRole('heading', { name: 'Risultati' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }))
    expect(screen.getByText('1 movimento trovato')).toBeTruthy()
    expect(screen.getByText('Bolletta elettrica')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Crea report' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Crea report' }))
    expect(screen.queryByRole('heading', { name: 'Risultati' })).toBeNull()
    expect(screen.getAllByText('Bolletta elettrica')).toHaveLength(1)
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

  it('collapses the active report when a new search starts and keeps its filters unchanged', () => {
    render(<SearchReportsPage data={structuredClone(defaultData)} user={users[0]} onSaveReport={vi.fn()} onDeleteReport={vi.fn()} onEditMovement={vi.fn()} onDeleteMovement={vi.fn()} />)

    const query = screen.getByPlaceholderText('Es. vacanza, bolletta, scuola')
    fireEvent.change(query, { target: { value: 'bolletta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }))
    fireEvent.click(screen.getByRole('button', { name: 'Crea report' }))

    fireEvent.change(query, { target: { value: 'hotel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }))

    expect(screen.getByRole('heading', { name: 'Report · bolletta' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Espandi report' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Risultati' })).toBeTruthy()
    expect(screen.getByText('Hotel Parigi')).toBeTruthy()
    expect(screen.queryByLabelText('Nome del report')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Espandi report' }))
    expect(screen.queryByRole('heading', { name: 'Risultati' })).toBeNull()
    expect(screen.getByText('Bolletta elettrica')).toBeTruthy()
    expect((screen.getByLabelText('Nome del report') as HTMLInputElement).value).toBe('Report · bolletta')
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
    render(<SearchReportsPage data={data} user={users[0]} onSaveReport={onSaveReport} onDeleteReport={vi.fn()} onEditMovement={vi.fn()} onDeleteMovement={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    expect((screen.getByPlaceholderText('Es. vacanza, bolletta, scuola') as HTMLInputElement).value).toBe('casa')
    fireEvent.change(screen.getByPlaceholderText('Es. vacanza, bolletta, scuola'), { target: { value: 'hotel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }))
    expect(screen.getByRole('heading', { name: 'Spese casa', level: 2 })).toBeTruthy()
    expect(screen.getByText('Hotel Parigi')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Espandi report' }))
    expect(screen.getByText('Spesa per casa')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nome del report'), { target: { value: 'Spese casa aggiornate' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva modifiche' }))

    expect(onSaveReport.mock.calls[0][0]).toMatchObject({ id: 'report-casa', name: 'Spese casa aggiornate', createdAt: report.createdAt })
  })

  it('shows the listed movement total and can remove a movement only from a saved report', () => {
    const report: SearchReport = {
      id: 'report-bolletta',
      ownerId: 'simone',
      name: 'Bolletta',
      filters: { query: 'bolletta', dateFrom: '2026-07-01', dateTo: '2026-08-31', movementType: 'expense' },
      createdAt: '2026-08-31T10:00:00.000Z',
      updatedAt: '2026-08-31T10:00:00.000Z',
    }
    const data = { ...structuredClone(defaultData), searchReports: [report] }
    const onSaveReport = vi.fn()
    const onDeleteMovement = vi.fn()
    render(<SearchReportsPage data={data} user={users[0]} onSaveReport={onSaveReport} onDeleteReport={vi.fn()} onEditMovement={vi.fn()} onDeleteMovement={onDeleteMovement} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    expect(screen.getByText('Totale movimenti elencati')).toBeTruthy()
    expect(screen.getAllByText('Bolletta elettrica')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Azioni per Bolletta elettrica' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Elimina' }))
    fireEvent.click(screen.getByRole('button', { name: /^Elimina solo dal report/ }))

    expect(onDeleteMovement).not.toHaveBeenCalled()
    expect(onSaveReport).toHaveBeenCalledOnce()
    expect(onSaveReport.mock.calls[0][0]).toMatchObject({ id: report.id, excludedMovementIds: ['seed-3'] })
    expect(screen.queryByText('Bolletta elettrica')).toBeNull()
  })

  it('can delete a movement completely or delete the saved report', () => {
    const report: SearchReport = {
      id: 'report-bolletta',
      ownerId: 'simone',
      name: 'Bolletta',
      filters: { query: 'bolletta', dateFrom: '2026-07-01', dateTo: '2026-08-31', movementType: 'expense' },
      createdAt: '2026-08-31T10:00:00.000Z',
      updatedAt: '2026-08-31T10:00:00.000Z',
    }
    const data = { ...structuredClone(defaultData), searchReports: [report] }
    const onDeleteMovement = vi.fn()
    const onDeleteReport = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SearchReportsPage data={data} user={users[0]} onSaveReport={vi.fn()} onDeleteReport={onDeleteReport} onEditMovement={vi.fn()} onDeleteMovement={onDeleteMovement} />)

    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }))
    fireEvent.click(screen.getByRole('button', { name: 'Azioni per Bolletta elettrica' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Elimina' }))
    fireEvent.click(screen.getByRole('button', { name: /^Elimina completamente/ }))
    expect(onDeleteMovement).toHaveBeenCalledWith('seed-3')

    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }))
    expect(onDeleteReport).toHaveBeenCalledWith(report.id)
    vi.restoreAllMocks()
  })
})
