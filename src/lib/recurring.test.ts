import { describe, expect, it } from 'vitest'
import { advanceRecurringMovement, nextRecurringDate, recurringIsDueSoon, recurringMovementDraft } from './recurring'
import type { RecurringMovement } from '../types'

const recurring: RecurringMovement = {
  id: 'rent', authorId: 'simone', memberId: 'simone', type: 'expense', amount: 800,
  amountMode: 'variable', nextDate: '2026-01-31', frequency: 'monthly', anchorDay: 31, description: 'Affitto',
  categoryId: 'casa', beneficiaryId: 'proprietario', accountId: 'bank', shared: false,
  status: 'active', createdAt: '2026-01-01T00:00:00.000Z',
}

describe('recurring movements', () => {
  it('preserves the calendar rule and clamps short months', () => {
    expect(nextRecurringDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(nextRecurringDate('2026-02-28', 'weekly')).toBe('2026-03-07')
    const february = advanceRecurringMovement(recurring)
    expect(february.nextDate).toBe('2026-02-28')
    expect(advanceRecurringMovement(february).nextDate).toBe('2026-03-31')
  })

  it('notifies three days before and creates an editable movement draft', () => {
    expect(recurringIsDueSoon({ ...recurring, nextDate: '2026-10-05' }, '2026-10-02')).toBe(true)
    expect(recurringIsDueSoon({ ...recurring, nextDate: '2026-10-06' }, '2026-10-02')).toBe(false)
    expect(recurringMovementDraft(recurring)).toMatchObject({ type: 'expense', amount: 800, date: '2026-01-31', description: 'Affitto' })
  })
})
