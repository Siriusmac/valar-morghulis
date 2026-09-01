import { debtCompensationAccountId } from './commissioned'
import { saveMovementData } from './movements'
import type { AppData, User, UserId } from '../types'

export function reconcileConfirmedLoanPurchases(data: AppData, userId: UserId, members: User[]) {
  return data.loanRepayments.reduce((current, repayment) => {
    if (repayment.status !== 'confirmed' || repayment.method !== 'purchase') return current
    if (repayment.borrowerId === userId && repayment.payerMovementId && repayment.fromAccountId
      && !current.movements.some((movement) => movement.id === repayment.payerMovementId)) {
      const lender = members.find((member) => member.id === repayment.lenderId)
      const categoryId = `category-loan-repayment-${userId}`
      const beneficiaryId = `beneficiary-contact-${repayment.lenderId}`
      current = saveMovementData(current, {
        id: repayment.payerMovementId,
        type: 'expense', authorId: userId, memberId: userId,
        amount: repayment.amount, date: repayment.date, description: repayment.description,
        categoryId, beneficiaryId, accountId: repayment.fromAccountId,
        shared: false, excludeFromReports: true, createdAt: repayment.confirmedAt ?? new Date().toISOString(),
      }, {
        category: current.categories.some((item) => item.id === categoryId) ? undefined : {
          id: categoryId, name: 'Acquisti per restituzione prestiti', scope: 'personal', ownerId: userId, movementType: 'expense', color: '#687078',
        },
        beneficiary: current.beneficiaries.some((item) => item.id === beneficiaryId) ? undefined : {
          id: beneficiaryId, name: lender?.name ?? 'Prestatore', scope: 'personal', ownerId: userId,
        },
      })
    }
    if (repayment.lenderId === userId && repayment.recipientMovementId && repayment.categoryId
      && !current.movements.some((movement) => movement.id === repayment.recipientMovementId)) {
      const borrower = members.find((member) => member.id === repayment.borrowerId)
      const beneficiaryId = `beneficiary-contact-${repayment.borrowerId}`
      current = saveMovementData(current, {
        id: repayment.recipientMovementId,
        type: 'expense', authorId: userId, memberId: userId,
        amount: repayment.amount, date: repayment.date, description: repayment.description,
        categoryId: repayment.categoryId, beneficiaryId, accountId: debtCompensationAccountId,
        shared: false, affectsAccountBalance: false, paidByUserId: repayment.borrowerId,
        createdAt: repayment.confirmedAt ?? new Date().toISOString(),
      }, {
        beneficiary: current.beneficiaries.some((item) => item.id === beneficiaryId) ? undefined : {
          id: beneficiaryId, name: borrower?.name ?? 'Beneficiario del prestito', scope: 'personal', ownerId: userId,
        },
      })
    }
    return current
  }, data)
}
