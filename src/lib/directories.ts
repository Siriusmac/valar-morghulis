import type { AppData } from '../types'

export type CounterpartyKind = 'beneficiary' | 'sender'

export function deleteCounterpartyData(
  data: AppData,
  kind: CounterpartyKind,
  itemId: string,
  replacementId?: string,
): AppData {
  if (kind === 'sender') {
    return {
      ...data,
      senders: data.senders.filter((item) => item.id !== itemId),
      deletedSenderIds: [...new Set([...(data.deletedSenderIds ?? []), itemId])],
      movements: data.movements.map((movement) => movement.senderId === itemId
        ? { ...movement, senderId: replacementId }
        : movement),
    }
  }

  return {
    ...data,
    beneficiaries: data.beneficiaries.filter((item) => item.id !== itemId),
    deletedBeneficiaryIds: [...new Set([...(data.deletedBeneficiaryIds ?? []), itemId])],
    movements: data.movements.map((movement) => movement.beneficiaryId === itemId
      ? { ...movement, beneficiaryId: replacementId }
      : movement),
    scheduledPayments: data.scheduledPayments.map((payment) => payment.beneficiaryId === itemId
      ? { ...payment, beneficiaryId: replacementId }
      : payment),
  }
}
