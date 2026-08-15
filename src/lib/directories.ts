import type { AppData } from '../types'

export type DirectoryDeletionKind = 'category' | 'beneficiary' | 'sender'
export type CounterpartyKind = Exclude<DirectoryDeletionKind, 'category'>

export function deleteDirectoryData(
  data: AppData,
  kind: DirectoryDeletionKind,
  itemId: string,
  replacementId?: string,
): AppData {
  if (kind === 'category') {
    return {
      ...data,
      categories: data.categories.filter((item) => item.id !== itemId),
      deletedCategoryIds: [...new Set([...(data.deletedCategoryIds ?? []), itemId])],
      movements: data.movements.map((movement) => ({
        ...movement,
        categoryId: movement.categoryId === itemId ? replacementId ?? '' : movement.categoryId,
        splits: movement.splits?.map((split) => split.categoryId === itemId
          ? { ...split, categoryId: replacementId ?? '' }
          : split),
      })),
      scheduledPayments: data.scheduledPayments.map((payment) => ({
        ...payment,
        categoryId: payment.categoryId === itemId ? replacementId ?? '' : payment.categoryId,
        splits: payment.splits?.map((split) => split.categoryId === itemId
          ? { ...split, categoryId: replacementId ?? '' }
          : split),
      })),
    }
  }
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
    movements: data.movements.map((movement) => ({
      ...movement,
      beneficiaryId: movement.beneficiaryId === itemId ? replacementId : movement.beneficiaryId,
      splits: movement.splits?.map((split) => split.beneficiaryId === itemId ? { ...split, beneficiaryId: replacementId } : split),
    })),
    scheduledPayments: data.scheduledPayments.map((payment) => ({
      ...payment,
      beneficiaryId: payment.beneficiaryId === itemId ? replacementId : payment.beneficiaryId,
      splits: payment.splits?.map((split) => split.beneficiaryId === itemId ? { ...split, beneficiaryId: replacementId } : split),
    })),
  }
}

export const deleteCounterpartyData = deleteDirectoryData
