import { describe, expect, it } from 'vitest'
import { defaultData } from './seed'
import { accountBalance, loanAvailableToRepay, loanOutstanding, movementAllocations, reimbursementPlan, sharedBalance, sharedExpensesByMember, totalsByCategory } from './calculations'
import { addMonthsISO, splitAllocationsAcrossInstallments, splitAmount } from './format'
import { materializeDuePayments } from './scheduled'
import type { AppData, Movement } from '../types'

const expense = (id: string, memberId: 'simone' | 'anna', amount: number, accountId: string): Movement => ({
  id, type: 'expense', authorId: memberId, memberId, amount, accountId,
  date: '2026-07-18', description: id, categoryId: 'alimentari', beneficiaryId: 'lidl', shared: true, createdAt: '2026-07-18T10:00:00Z',
})

const cleanData = (): AppData => ({ ...structuredClone(defaultData), movements: [], transfers: [], reimbursements: [] })

describe('sharedBalance', () => {
  it('splits shared expenses 50/50', () => {
    const data = cleanData()
    data.movements = [expense('a', 'simone', 30, 'simone-bank'), expense('b', 'anna', 50, 'anna-bank')]
    expect(sharedBalance(data, 'simone')).toBe(-10)
    expect(sharedBalance(data, 'anna')).toBe(10)
  })

  it('splits shared expenses equally among three members', () => {
    const data = cleanData()
    data.movements = [expense('three-members', 'simone', 90, 'simone-bank')]
    expect(sharedBalance(data, 'simone', 3)).toBe(60)
    expect(sharedBalance(data, 'anna', 3)).toBe(-30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(-30)
  })

  it('ignores movements paid from a family account', () => {
    const data = cleanData()
    data.movements = [expense('family', 'simone', 200, 'family-bank')]
    expect(sharedBalance(data, 'simone')).toBe(0)
    expect(sharedBalance(data, 'anna')).toBe(0)
  })

  it('treats a shared income as money owed to the other member', () => {
    const data = cleanData()
    data.movements = [{ ...expense('income', 'simone', 100, 'simone-bank'), type: 'income', categoryId: 'stipendio' }]
    expect(sharedBalance(data, 'simone')).toBe(-50)
    expect(sharedBalance(data, 'anna')).toBe(50)
  })

  it('returns to zero after a reimbursement', () => {
    const data = cleanData()
    data.movements = [expense('a', 'simone', 30, 'simone-bank'), expense('b', 'anna', 50, 'anna-bank')]
    data.reimbursements = [{ id: 'r1', fromId: 'simone', toId: 'anna', amount: 10, date: '2026-07-18', authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-bank' }]
    expect(sharedBalance(data, 'simone')).toBe(0)
    expect(sharedBalance(data, 'anna')).toBe(0)
  })

  it('does not change the shared balance until a reimbursement is confirmed', () => {
    const data = cleanData()
    data.movements = [expense('a', 'simone', 30, 'simone-bank'), expense('b', 'anna', 50, 'anna-bank')]
    data.reimbursements = [{
      id: 'pending', fromId: 'simone', toId: 'anna', amount: 10, date: '2026-07-18',
      authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-bank', status: 'pending',
    }]
    expect(sharedBalance(data, 'simone')).toBe(-10)
    data.reimbursements[0].status = 'confirmed'
    expect(sharedBalance(data, 'simone')).toBe(0)
  })

  it('counts only half of a reimbursement paid into a shared account', () => {
    const data = cleanData()
    data.reimbursements = [{ id: 'r-family', fromId: 'simone', toId: 'anna', amount: 100, date: '2026-07-18', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank' }]
    expect(sharedBalance(data, 'simone')).toBe(50)
    expect(sharedBalance(data, 'anna')).toBe(-50)
  })

  it('distributes a reimbursement into a shared account among three members', () => {
    const data = cleanData()
    data.reimbursements = [{ id: 'r-family-three', fromId: 'simone', toId: 'anna', amount: 90, date: '2026-07-18', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank' }]
    expect(sharedBalance(data, 'simone', 3)).toBe(60)
    expect(sharedBalance(data, 'anna', 3)).toBe(-30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(-30)
  })

  it('creates a half-amount debt when funds move from a shared account to a personal account', () => {
    const data = cleanData()
    data.transfers = [{ id: 'family-to-personal', authorId: 'simone', fromAccountId: 'family-bank', toAccountId: 'simone-bank', amount: 100, date: '2026-07-18', description: 'Prelievo dal conto famiglia' }]
    expect(sharedBalance(data, 'simone')).toBe(-50)
    expect(sharedBalance(data, 'anna')).toBe(50)
  })

  it('distributes a transfer from a shared account among three members', () => {
    const data = cleanData()
    data.transfers = [{ id: 'family-to-personal-three', authorId: 'simone', fromAccountId: 'family-bank', toAccountId: 'simone-bank', amount: 90, date: '2026-07-18', description: 'Prelievo dal conto famiglia' }]
    expect(sharedBalance(data, 'simone', 3)).toBe(-60)
    expect(sharedBalance(data, 'anna', 3)).toBe(30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(30)
  })

  it('uses the transfer author when another member cannot load the personal destination account', () => {
    const data = cleanData()
    data.accounts = data.accounts.filter((account) => account.id !== 'simone-bank')
    data.transfers = [{ id: 'family-to-hidden-personal', authorId: 'simone', fromAccountId: 'family-bank', toAccountId: 'simone-bank', amount: 100, date: '2026-07-18', description: 'Prelievo dal conto famiglia' }]
    expect(sharedBalance(data, 'anna')).toBe(50)
  })

  it('reduces family debt when funds move from a personal account to a shared account', () => {
    const data = cleanData()
    data.transfers = [{ id: 'personal-to-family', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank', amount: 100, date: '2026-07-18', description: 'Versamento nel conto famiglia' }]
    expect(sharedBalance(data, 'simone')).toBe(50)
    expect(sharedBalance(data, 'anna')).toBe(-50)
  })

  it('does not count bank fees as family credit', () => {
    const data = cleanData()
    data.transfers = [{ id: 'personal-to-family-with-fee', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank', amount: 100, feeAmount: 5, date: '2026-09-04', description: 'Versamento nel conto famiglia' }]
    expect(sharedBalance(data, 'simone')).toBe(50)
    expect(sharedBalance(data, 'anna')).toBe(-50)
  })

  it('subtracts a personal-to-family transfer from an existing family debt', () => {
    const data = cleanData()
    data.movements = [expense('paid-by-anna', 'anna', 100, 'anna-bank')]
    data.transfers = [{ id: 'partial-family-settlement', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank', amount: 40, date: '2026-07-18', description: 'Versamento parziale' }]
    expect(sharedBalance(data, 'simone')).toBe(-30)
    expect(sharedBalance(data, 'anna')).toBe(30)
  })

  it('credits the other members share when personal funds move into a three-member family account', () => {
    const data = cleanData()
    data.transfers = [{ id: 'personal-to-family-three', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank', amount: 90, date: '2026-07-18', description: 'Versamento nel conto famiglia' }]
    expect(sharedBalance(data, 'simone', 3)).toBe(60)
    expect(sharedBalance(data, 'anna', 3)).toBe(-30)
    expect(sharedBalance(data, 'terzo-membro', 3)).toBe(-30)
  })

  it('uses the transfer author when another member cannot load the personal source account', () => {
    const data = cleanData()
    data.accounts = data.accounts.filter((account) => account.id !== 'simone-bank')
    data.transfers = [{ id: 'hidden-personal-to-family', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'family-bank', amount: 100, date: '2026-07-18', description: 'Versamento nel conto famiglia' }]
    expect(sharedBalance(data, 'anna')).toBe(-50)
  })

  it('settles a shared installment purchase immediately, without counting later installments twice', () => {
    const data = cleanData()
    data.movements = [
      { ...expense('first', 'simone', 40, 'simone-card'), sharedSettlementAmount: 120, installmentPlanId: 'plan' },
      { ...expense('second', 'simone', 40, 'simone-card'), sharedSettlementAmount: 0, installmentPlanId: 'plan' },
    ]
    expect(sharedBalance(data, 'simone')).toBe(60)
    expect(sharedBalance(data, 'anna')).toBe(-60)
  })

  it('counts only the shared partial of a split movement', () => {
    const data = cleanData()
    data.movements = [{
      ...expense('split-partial', 'simone', 100, 'simone-bank'),
      shared: false,
      splits: [{ id: 'home', amount: 30, categoryId: 'accessori-casa', shared: true }],
    }]
    expect(sharedBalance(data, 'simone')).toBe(15)
    expect(sharedBalance(data, 'anna')).toBe(-15)
  })

  it('keeps the main remainder shared when a partial is personal', () => {
    const data = cleanData()
    data.movements = [{
      ...expense('split-remainder', 'simone', 100, 'simone-bank'),
      splits: [{ id: 'personal', amount: 30, categoryId: 'accessori-casa', shared: false }],
    }]
    expect(sharedBalance(data, 'simone')).toBe(35)
    expect(sharedBalance(data, 'anna')).toBe(-35)
  })
})

describe('reimbursementPlan', () => {
  it('splits a multi-member debt across current creditors', () => {
    const data = cleanData()
    data.movements = [
      expense('paid-by-simone', 'simone', 90, 'simone-bank'),
      expense('paid-by-anna', 'anna', 60, 'anna-bank'),
    ]

    expect(reimbursementPlan(data, 'terzo-membro', ['simone', 'anna', 'terzo-membro'])).toEqual([
      { memberId: 'simone', availableCredit: 40, suggestedAmount: 40 },
      { memberId: 'anna', availableCredit: 10, suggestedAmount: 10 },
    ])
  })

  it('reserves credit and debt already covered by pending reimbursements', () => {
    const data = cleanData()
    data.movements = [
      expense('paid-by-simone', 'simone', 90, 'simone-bank'),
      expense('paid-by-anna', 'anna', 60, 'anna-bank'),
    ]
    data.reimbursements = [{
      id: 'pending-third-simone', fromId: 'terzo-membro', toId: 'simone', amount: 15,
      date: '2026-08-15', authorId: 'terzo-membro', status: 'pending',
    }]

    expect(reimbursementPlan(data, 'terzo-membro', ['simone', 'anna', 'terzo-membro'])).toEqual([
      { memberId: 'simone', availableCredit: 25, suggestedAmount: 25 },
      { memberId: 'anna', availableCredit: 10, suggestedAmount: 10 },
    ])
  })
})

describe('loans', () => {
  it('moves principal only after confirmation and tracks partial repayments', () => {
    const data = cleanData()
    const simoneOpening = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    const annaOpening = data.accounts.find((item) => item.id === 'anna-bank')!.openingBalance
    data.loans = [{
      id: 'loan-1', lenderId: 'simone', borrowerId: 'anna', amount: 100,
      date: '2026-09-01', description: 'Anticipo', authorId: 'simone',
      lenderAccountId: 'simone-bank', borrowerAccountId: 'anna-bank', status: 'pending',
    }]
    expect(accountBalance(data, 'simone-bank')).toBe(simoneOpening)
    data.loans[0].status = 'confirmed'
    expect(accountBalance(data, 'simone-bank')).toBe(simoneOpening - 100)
    expect(accountBalance(data, 'anna-bank')).toBe(annaOpening + 100)

    data.loanRepayments = [{
      id: 'repayment-1', loanId: 'loan-1', lenderId: 'simone', borrowerId: 'anna',
      amount: 40, date: '2026-09-02', description: 'Prima parte', authorId: 'anna',
      method: 'money', fromAccountId: 'anna-bank', toAccountId: 'simone-bank', status: 'confirmed',
    }, {
      id: 'repayment-pending', loanId: 'loan-1', lenderId: 'simone', borrowerId: 'anna',
      amount: 10, date: '2026-09-03', description: 'Seconda parte', authorId: 'anna',
      method: 'money', fromAccountId: 'anna-bank', status: 'pending',
    }]
    expect(loanOutstanding(data, data.loans[0])).toBe(60)
    expect(loanAvailableToRepay(data, data.loans[0])).toBe(50)
    expect(accountBalance(data, 'simone-bank')).toBe(simoneOpening - 60)
    expect(accountBalance(data, 'anna-bank')).toBe(annaOpening + 60)
  })

  it('uses family credit without moving either personal account', () => {
    const data = cleanData()
    data.movements = [expense('credit-for-simone', 'simone', 400, 'simone-bank')]
    data.loanRepayments = [{
      id: 'credit-repayment', loanId: 'loan-1', lenderId: 'anna', borrowerId: 'simone',
      amount: 100, date: '2026-09-02', description: 'Compensazione', authorId: 'simone',
      method: 'family_credit', status: 'confirmed',
    }]
    expect(sharedBalance(data, 'simone')).toBe(100)
    expect(sharedBalance(data, 'anna')).toBe(-100)
  })
})

describe('movement category splits', () => {
  it('subtracts partials from the main category and reports each category total', () => {
    const data = cleanData()
    const movement = {
      ...expense('split-categories', 'simone', 100, 'simone-bank'),
      splits: [{ id: 'home', amount: 30, categoryId: 'accessori-casa', shared: false }],
    }
    expect(movementAllocations(movement)).toEqual([
      { categoryId: 'alimentari', beneficiaryId: 'lidl', tagId: undefined, tagIds: [], amount: 70, shared: true, excludeFromReports: false },
      { categoryId: 'accessori-casa', beneficiaryId: undefined, tagId: undefined, tagIds: [], amount: 30, shared: false, excludeFromReports: false },
    ])
    expect(totalsByCategory(data, [movement]).map((item) => [item.category?.id, item.total])).toEqual([
      ['alimentari', 70],
      ['accessori-casa', 30],
    ])
  })

  it('uses only shared allocations in shared charts', () => {
    const data = cleanData()
    const movement = {
      ...expense('shared-chart', 'simone', 100, 'simone-bank'),
      shared: false,
      splits: [{ id: 'home', amount: 30, categoryId: 'accessori-casa', shared: true }],
    }
    expect(totalsByCategory(data, [movement], true).map((item) => [item.category?.id, item.total])).toEqual([
      ['accessori-casa', 30],
    ])
  })

  it('keeps a commissioned partial out of reports and family balances', () => {
    const data = cleanData()
    const movement = {
      ...expense('mixed-commission', 'simone', 100, 'simone-bank'),
      splits: [
        { id: 'friend', amount: 30, categoryId: 'accessori-casa', shared: false, commissionedPurchaseId: 'purchase-friend', excludeFromReports: true },
      ],
    }
    data.movements = [movement]

    expect(totalsByCategory(data, [movement]).map((item) => [item.category?.id, item.total])).toEqual([
      ['alimentari', 70],
    ])
    expect(sharedBalance(data, 'simone')).toBe(35)
  })

  it('distributes every category across installments without losing cents', () => {
    const rows = splitAllocationsAcrossInstallments([70, 30], splitAmount(100, 3))
    expect(rows.map((row) => Math.round(row.reduce((sum, amount) => sum + amount, 0) * 100) / 100)).toEqual([33.33, 33.33, 33.34])
    expect(rows[0][0] + rows[1][0] + rows[2][0]).toBe(70)
    expect(rows[0][1] + rows[1][1] + rows[2][1]).toBe(30)
  })

  it('does not retain an installment settlement after every shared flag is removed', () => {
    const movement = {
      ...expense('private-installment', 'simone', 30, 'simone-bank'),
      shared: false,
      sharedSettlementAmount: 90,
      splits: [{ id: 'private', amount: 10, categoryId: 'accessori-casa', shared: false }],
    }
    expect(sharedBalance({ ...cleanData(), movements: [movement] }, 'simone')).toBe(0)
  })
})

describe('sharedExpensesByMember', () => {
  it('reports the monthly shared expenses advanced by each family member', () => {
    const data = cleanData()
    data.movements = [
      expense('simone-shared', 'simone', 30, 'simone-bank'),
      expense('anna-shared', 'anna', 50, 'anna-bank'),
      { ...expense('simone-partial', 'simone', 100, 'simone-bank'), shared: false, splits: [{ id: 'shared', amount: 20, categoryId: 'accessori-casa', shared: true }] },
      expense('family-account', 'simone', 90, 'family-bank'),
      { ...expense('income', 'anna', 500, 'anna-bank'), type: 'income', categoryId: 'stipendio' },
      { ...expense('other-month', 'anna', 70, 'anna-bank'), date: '2026-08-01' },
    ]

    expect(sharedExpensesByMember(data, ['simone', 'anna', 'third'], '2026-07')).toEqual([
      { memberId: 'simone', total: 50 },
      { memberId: 'anna', total: 50 },
      { memberId: 'third', total: 0 },
    ])
  })
})

describe('scheduled installments', () => {
  it('splits cents exactly and keeps the day where the next month allows it', () => {
    expect(splitAmount(100, 3)).toEqual([33.33, 33.33, 33.34])
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsISO('2026-01-31', 2)).toBe('2026-03-31')
  })

  it('posts only installments whose due date has arrived', () => {
    const data = cleanData()
    data.scheduledPayments = [
      { id: 'due', planId: 'plan', authorId: 'simone', memberId: 'simone', amount: 20, dueDate: '2026-07-18', description: 'Acquisto', categoryId: 'alimentari', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, installmentNumber: 2, installmentCount: 3, status: 'scheduled' },
      { id: 'future', planId: 'plan', authorId: 'simone', memberId: 'simone', amount: 20, dueDate: '2026-08-18', description: 'Acquisto', categoryId: 'alimentari', beneficiaryId: 'amazon', accountId: 'simone-card', shared: false, installmentNumber: 3, installmentCount: 3, status: 'scheduled' },
    ]
    const updated = materializeDuePayments(data, '2026-07-18')
    expect(updated.movements).toHaveLength(1)
    expect(updated.movements[0].amount).toBe(20)
    expect(updated.scheduledPayments.map((item) => item.status)).toEqual(['paid', 'scheduled'])
  })

  it.each([false, true])('preserva affectsAccountBalance=%s nella materializzazione', (affectsAccountBalance) => {
    const data = cleanData()
    data.scheduledPayments = [{
      id: 'due', planId: 'plan', authorId: 'simone', memberId: 'simone', amount: 20, dueDate: '2026-07-18',
      description: 'Acquisto', categoryId: 'alimentari', accountId: 'simone-card', shared: false,
      installmentNumber: 2, installmentCount: 3, status: 'scheduled', affectsAccountBalance,
    }]
    expect(materializeDuePayments(data, '2026-07-18').movements[0].affectsAccountBalance).toBe(affectsAccountBalance)
  })

  it('mantiene il comportamento predefinito quando affectsAccountBalance manca', () => {
    const data = cleanData()
    data.scheduledPayments = [{
      id: 'due', planId: 'plan', authorId: 'simone', memberId: 'simone', amount: 20, dueDate: '2026-07-18',
      description: 'Acquisto', categoryId: 'alimentari', accountId: 'simone-card', shared: false,
      installmentNumber: 2, installmentCount: 3, status: 'scheduled',
    }]
    expect(Object.hasOwn(materializeDuePayments(data, '2026-07-18').movements[0], 'affectsAccountBalance')).toBe(false)
  })
})

describe('accountBalance', () => {
  it('includes income, expenses, transfers and reimbursements', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    data.movements = [expense('out', 'simone', 100, 'simone-bank'), { ...expense('in', 'simone', 250, 'simone-bank'), type: 'income', categoryId: 'stipendio' }]
    data.transfers = [{ id: 't', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'simone-cash', amount: 50, date: '2026-07-18', description: 'Prelievo' }]
    data.reimbursements = [{ id: 'r', fromId: 'simone', toId: 'anna', amount: 10, date: '2026-07-18', authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-bank' }]
    expect(accountBalance(data, 'simone-bank')).toBe(base - 100 + 250 - 50 - 10)
  })

  it('charges transfer fees only to the source account', () => {
    const data = cleanData()
    const sourceBase = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    const destinationBase = data.accounts.find((item) => item.id === 'simone-cash')!.openingBalance
    data.transfers = [{ id: 'with-fee', authorId: 'simone', fromAccountId: 'simone-bank', toAccountId: 'simone-cash', amount: 100, feeAmount: 2.5, date: '2026-09-04', description: 'Bonifico' }]

    expect(accountBalance(data, 'simone-bank')).toBe(sourceBase - 102.5)
    expect(accountBalance(data, 'simone-cash')).toBe(destinationBase + 100)
  })

  it('credits a reimbursement to the selected destination account', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'anna-cash')!.openingBalance
    data.reimbursements = [{ id: 'r', fromId: 'simone', toId: 'anna', amount: 25, date: '2026-07-18', authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-cash' }]
    expect(accountBalance(data, 'anna-cash')).toBe(base + 25)
  })

  it('does not move money between accounts for a pending, rejected or cancelled reimbursement', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    data.reimbursements = [{
      id: 'pending', fromId: 'simone', toId: 'anna', amount: 25, date: '2026-07-18',
      authorId: 'anna', fromAccountId: 'simone-bank', toAccountId: 'anna-cash', status: 'pending',
    }]
    expect(accountBalance(data, 'simone-bank')).toBe(base)
    data.reimbursements[0].status = 'rejected'
    expect(accountBalance(data, 'simone-bank')).toBe(base)
    data.reimbursements[0].status = 'cancelled'
    expect(accountBalance(data, 'simone-bank')).toBe(base)
  })

  it('keeps a statistics-only movement out of the calculated account balance', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    data.movements = [{ ...expense('historic', 'simone', 100, 'simone-bank'), affectsAccountBalance: false }]
    expect(accountBalance(data, 'simone-bank')).toBe(base)
    expect(data.movements).toHaveLength(1)
  })

  it('charges a commissioned purchase once and does not charge its linked reimbursement again', () => {
    const data = cleanData()
    const base = data.accounts.find((item) => item.id === 'simone-bank')!.openingBalance
    data.movements = [{
      ...expense('commissioned', 'simone', 75, 'simone-bank'),
      shared: false, commissionedPurchaseId: 'purchase-1', excludeFromReports: true,
    }]
    data.reimbursements = [{
      id: 'purchase-reimbursement', fromId: 'simone', toId: 'anna', amount: 75,
      date: '2026-07-18', authorId: 'simone', fromAccountId: 'simone-bank',
      settlementMethod: 'purchase', commissionedPurchaseId: 'purchase-1', status: 'confirmed',
    }]
    expect(accountBalance(data, 'simone-bank')).toBe(base - 75)
    expect(totalsByCategory(data, data.movements)).toEqual([])
  })

  it('settles the full purchase reimbursement with its counterparty in a three-member family', () => {
    const data = cleanData()
    data.movements = []
    data.reimbursements = [{
      id: 'purchase-settlement', fromId: 'simone', toId: 'anna', amount: 50,
      date: '2026-08-29', authorId: 'simone', fromAccountId: 'simone-bank',
      settlementMethod: 'purchase', commissionedPurchaseId: 'cosmetics', status: 'confirmed',
    }]

    expect(sharedBalance(data, 'simone', 3)).toBe(50)
    expect(sharedBalance(data, 'anna', 3)).toBe(-50)
  })

  it('removes an approved reimbursement cancellation from the family balance', () => {
    const data = cleanData()
    data.movements = []
    data.reimbursements = [{
      id: 'cancelled-settlement', fromId: 'simone', toId: 'anna', amount: 50,
      date: '2026-08-29', authorId: 'simone', fromAccountId: 'simone-bank',
      toAccountId: 'anna-bank', status: 'cancelled',
    }]

    expect(sharedBalance(data, 'simone')).toBe(0)
    expect(sharedBalance(data, 'anna')).toBe(0)
  })
})
