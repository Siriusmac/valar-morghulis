import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { monthlyExpenseReport, searchMovements, searchReportMovementAmount } from './searchReports'
import type { SearchReportFilters } from '../types'

const baseFilters: SearchReportFilters = {
  query: '',
  dateFrom: '2026-07-01',
  dateTo: '2026-08-31',
  movementType: 'all',
}

describe('searchMovements', () => {
  it('searches descriptions and comments, including split content', () => {
    const data = structuredClone(defaultData)
    data.movements[0].comments = 'Pagata durante la vacanza'
    data.movements[1].splits = [{ id: 'split-note', amount: 10, categoryId: 'alimentari', description: 'Pane speciale', comments: 'Senza glutine', shared: true }]

    expect(searchMovements(data, 'simone', { ...baseFilters, query: 'VACANZA' }).map((item) => item.id)).toEqual(['seed-1'])
    expect(searchMovements(data, 'simone', { ...baseFilters, query: 'glutine' }).map((item) => item.id)).toEqual(['seed-2'])
  })

  it('combines type, counterparty, category and tag filters', () => {
    const filters: SearchReportFilters = {
      ...baseFilters,
      movementType: 'expense',
      counterpartyType: 'beneficiary',
      counterpartyId: 'hotel-paris',
      categoryId: 'ristorante',
      tagId: 'vacanza-parigi',
    }
    expect(searchMovements(defaultData, 'simone', filters).map((item) => item.id)).toEqual(['seed-6'])
  })
})

describe('monthlyExpenseReport', () => {
  it('includes zero months and sums only allocations matching the active filters', () => {
    const filters = { ...baseFilters, movementType: 'expense' as const, categoryId: 'alimentari' }
    const results = searchMovements(defaultData, 'simone', filters)
    expect(monthlyExpenseReport(defaultData, results, filters)).toEqual([
      { month: '2026-07', total: 80 },
      { month: '2026-08', total: 0 },
    ])
  })

  it('calculates the filtered amount displayed in the report movement list', () => {
    const movement = structuredClone(defaultData.movements[1])
    movement.splits = [
      { id: 'split-food', amount: 20, categoryId: 'alimentari', tagIds: ['vacanza-parigi'], shared: true },
      { id: 'split-other', amount: 30, categoryId: 'ristorante', tagIds: [], shared: true },
    ]
    expect(searchReportMovementAmount(movement, { ...baseFilters, categoryId: 'alimentari', tagId: 'vacanza-parigi' })).toBe(20)
  })
})
