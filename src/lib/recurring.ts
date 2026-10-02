import { addDaysISO, addMonthsISO, makeId } from './format'
import type { Movement, RecurringFrequency, RecurringMovement } from '../types'

const monthIntervals: Partial<Record<RecurringFrequency, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
}

export function nextRecurringDate(value: string, frequency: RecurringFrequency, anchorDay?: number) {
  if (frequency === 'weekly') return addDaysISO(value, 7)
  const anchoredValue = anchorDay ? `${value.slice(0, 8)}${String(anchorDay).padStart(2, '0')}` : value
  return addMonthsISO(anchoredValue, monthIntervals[frequency] ?? 1)
}

export function recurringIsDueSoon(item: RecurringMovement, today: string, noticeDays = 3) {
  return item.status === 'active' && item.nextDate <= addDaysISO(today, noticeDays)
}

export function advanceRecurringMovement(item: RecurringMovement): RecurringMovement {
  return { ...item, nextDate: nextRecurringDate(item.nextDate, item.frequency, item.anchorDay) }
}

export function recurringMovementDraft(item: RecurringMovement): Movement {
  return {
    id: makeId('movement'),
    type: item.type,
    authorId: item.authorId,
    memberId: item.memberId,
    amount: item.amount,
    date: item.nextDate,
    description: item.description,
    categoryId: item.categoryId,
    beneficiaryId: item.beneficiaryId,
    senderId: item.senderId,
    accountId: item.accountId,
    tagId: item.tagId,
    tagIds: item.tagIds,
    comments: item.comments,
    shared: item.shared,
    createdAt: new Date().toISOString(),
  }
}

export const recurringFrequencyLabels: Record<RecurringFrequency, string> = {
  weekly: 'Ogni settimana',
  monthly: 'Ogni mese',
  bimonthly: 'Ogni 2 mesi',
  quarterly: 'Ogni 3 mesi',
  semiannual: 'Ogni 6 mesi',
  yearly: 'Ogni anno',
}
