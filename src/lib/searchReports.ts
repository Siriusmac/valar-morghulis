import { movementAllocations, visibleMovements } from './calculations'
import type { AppData, Movement, SearchReportFilters, UserId } from '../types'

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('it-IT')
  .trim()

function allocationMatchesFilters(movement: Movement, filters: SearchReportFilters) {
  return movementAllocations(movement).filter((allocation) => {
    if (filters.categoryId && allocation.categoryId !== filters.categoryId) return false
    if (filters.tagId && !allocation.tagIds.includes(filters.tagId)) return false
    if (filters.counterpartyType === 'beneficiary' && filters.counterpartyId && allocation.beneficiaryId !== filters.counterpartyId) return false
    return true
  })
}

export function searchMovements(data: AppData, userId: UserId, filters: SearchReportFilters) {
  const query = normalizeSearch(filters.query)
  return visibleMovements(data, userId)
    .filter((movement) => !filters.dateFrom || movement.date >= filters.dateFrom)
    .filter((movement) => !filters.dateTo || movement.date <= filters.dateTo)
    .filter((movement) => filters.movementType === 'all' || movement.type === filters.movementType)
    .filter((movement) => {
      if (!filters.counterpartyId) return true
      if (filters.counterpartyType === 'sender') return movement.type === 'income' && movement.senderId === filters.counterpartyId
      return movement.type === 'expense' && allocationMatchesFilters(movement, filters).length > 0
    })
    .filter((movement) => !filters.categoryId || allocationMatchesFilters(movement, filters).length > 0)
    .filter((movement) => !filters.tagId || allocationMatchesFilters(movement, filters).length > 0)
    .filter((movement) => {
      if (!query) return true
      const searchable = [
        movement.description,
        movement.comments ?? '',
        ...movementAllocations(movement).flatMap((allocation) => [allocation.description ?? '', allocation.comments ?? '']),
      ].join(' ')
      return normalizeSearch(searchable).includes(query)
    })
    .toSorted((left, right) => right.date.localeCompare(left.date))
}

function monthsBetween(dateFrom: string, dateTo: string) {
  if (!dateFrom || !dateTo || dateFrom > dateTo) return []
  const [startYear, startMonth] = dateFrom.slice(0, 7).split('-').map(Number)
  const [endYear, endMonth] = dateTo.slice(0, 7).split('-').map(Number)
  const months: string[] = []
  let year = startYear
  let month = startMonth
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month === 13) { year += 1; month = 1 }
  }
  return months
}

export function monthlyExpenseReport(data: AppData, movements: Movement[], filters: SearchReportFilters) {
  const totals = new Map(monthsBetween(filters.dateFrom, filters.dateTo).map((month) => [month, 0]))
  for (const movement of movements) {
    if (movement.type !== 'expense' || movement.excludeFromReports) continue
    const amount = allocationMatchesFilters(movement, filters)
      .filter((allocation) => !allocation.excludeFromReports)
      .reduce((sum, allocation) => sum + allocation.amount, 0)
    const month = movement.date.slice(0, 7)
    totals.set(month, Math.round(((totals.get(month) ?? 0) + amount) * 100) / 100)
  }
  return [...totals.entries()].map(([month, total]) => ({ month, total }))
}
