import type { AppData, Transfer } from '../types'

export function saveTransferData(current: AppData, transfer: Transfer): AppData {
  const exists = current.transfers.some((item) => item.id === transfer.id)
  return {
    ...current,
    transfers: exists
      ? current.transfers.map((item) => item.id === transfer.id ? transfer : item)
      : [...current.transfers, transfer],
  }
}

export function deleteTransferData(current: AppData, transferId: string): AppData {
  if (!current.transfers.some((item) => item.id === transferId)) return current
  return { ...current, transfers: current.transfers.filter((item) => item.id !== transferId) }
}
