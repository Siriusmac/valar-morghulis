import type { AppData } from '../types'
import { movementTagIds } from './calculations'

export type DirectoryDeletionKind = 'category' | 'beneficiary' | 'sender' | 'tag'
export type CounterpartyKind = Exclude<DirectoryDeletionKind, 'category' | 'tag'>

export function deleteDirectoryData(
  data: AppData,
  kind: DirectoryDeletionKind,
  itemId: string,
  replacementId?: string,
): AppData {
  if (kind === 'tag') {
    const removeTag = <T extends { tagId?: string; tagIds?: string[] }>(item: T): T => {
      if (!movementTagIds(item).includes(itemId)) return item
      const tagIds = movementTagIds(item).filter((id) => id !== itemId)
      return { ...item, tagId: tagIds[0], tagIds }
    }
    return {
      ...data,
      tags: data.tags.filter((item) => item.id !== itemId),
      deletedTagIds: [...new Set([...(data.deletedTagIds ?? []), itemId])],
      tagReportIds: data.tagReportIds.filter((id) => id !== itemId),
      movements: data.movements.map((movement) => ({ ...removeTag(movement), splits: movement.splits?.map(removeTag) })),
      scheduledPayments: data.scheduledPayments.map((payment) => ({ ...removeTag(payment), splits: payment.splits?.map(removeTag) })),
      recurringMovements: data.recurringMovements.map(removeTag),
      // Preserve saved tag filters: clearing them would silently broaden reports.
    }
  }
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
      recurringMovements: data.recurringMovements.map((movement) => ({
        ...movement,
        categoryId: movement.categoryId === itemId ? replacementId ?? '' : movement.categoryId,
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
      recurringMovements: data.recurringMovements.map((movement) => movement.senderId === itemId
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
    recurringMovements: data.recurringMovements.map((movement) => movement.beneficiaryId === itemId
      ? { ...movement, beneficiaryId: replacementId }
      : movement),
  }
}

export const deleteCounterpartyData = deleteDirectoryData
