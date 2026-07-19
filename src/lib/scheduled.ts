import type { AppData, Movement } from '../types'

export function materializeDuePayments(data: AppData, today: string): AppData {
  const existingIds = new Set(data.movements.map((item) => item.id))
  const dueMovements: Movement[] = []
  const scheduledPayments = data.scheduledPayments.map((payment) => {
    if (payment.status === 'paid' || payment.dueDate > today) return payment
    const movementId = payment.paidMovementId ?? `installment-${payment.id}`
    if (!existingIds.has(movementId)) {
      dueMovements.push({
        id: movementId,
        type: 'expense',
        authorId: payment.authorId,
        memberId: payment.memberId,
        amount: payment.amount,
        date: payment.dueDate,
        description: `${payment.description} · rata ${payment.installmentNumber}/${payment.installmentCount}`,
        categoryId: payment.categoryId,
        beneficiaryId: payment.beneficiaryId,
        accountId: payment.accountId,
        tagId: payment.tagId,
        comments: payment.comments,
        shared: payment.shared,
        installmentPlanId: payment.planId,
        installmentProvider: payment.provider,
        installmentNumber: payment.installmentNumber,
        installmentCount: payment.installmentCount,
        sharedSettlementAmount: payment.shared ? 0 : undefined,
        createdAt: `${payment.dueDate}T08:00:00.000Z`,
      })
      existingIds.add(movementId)
    }
    return { ...payment, status: 'paid' as const, paidMovementId: movementId }
  })
  if (!dueMovements.length && scheduledPayments.every((item, index) => item === data.scheduledPayments[index])) return data
  return { ...data, movements: [...dueMovements, ...data.movements], scheduledPayments }
}
