export type CloudSyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error'

export interface PendingCloudSave {
  mutationId: string
  createdAt: string
  attempts: number
}

export function createCloudWriteQueue() {
  let queue: Promise<void> = Promise.resolve()
  return <T>(operation: () => Promise<T>) => {
    const result = queue.catch(() => undefined).then(operation)
    queue = result.then(() => undefined, () => undefined)
    return result
  }
}

export function pendingCloudSaveKey(storageKey: string) {
  return `${storageKey}:cloud-sync-pending`
}

export function readPendingCloudSave(storageKey: string): PendingCloudSave | null {
  try {
    const raw = localStorage.getItem(pendingCloudSaveKey(storageKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PendingCloudSave>
    if (!parsed.mutationId || !parsed.createdAt || typeof parsed.attempts !== 'number') return null
    return { mutationId: parsed.mutationId, createdAt: parsed.createdAt, attempts: parsed.attempts }
  } catch {
    return null
  }
}

export function markCloudSavePending(
  storageKey: string,
  mutationId: string = globalThis.crypto?.randomUUID?.() ?? `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  createdAt = new Date().toISOString(),
) {
  const pending = { mutationId, createdAt, attempts: 0 }
  localStorage.setItem(pendingCloudSaveKey(storageKey), JSON.stringify(pending))
  return pending
}

export function recordCloudSaveFailure(storageKey: string, mutationId: string) {
  const current = readPendingCloudSave(storageKey)
  if (!current || current.mutationId !== mutationId) return current
  const next = { ...current, attempts: current.attempts + 1 }
  localStorage.setItem(pendingCloudSaveKey(storageKey), JSON.stringify(next))
  return next
}

export function clearCloudSavePending(storageKey: string, mutationId: string) {
  const current = readPendingCloudSave(storageKey)
  if (!current || current.mutationId !== mutationId) return false
  localStorage.removeItem(pendingCloudSaveKey(storageKey))
  return true
}

export function cloudSaveRetryDelay(attempts: number) {
  return Math.min(30_000, 1_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 5))
}

export function isCloudRevisionConflict(reason: unknown) {
  if (!reason || typeof reason !== 'object') return false
  const error = reason as { message?: string; details?: string; code?: string }
  return error.message?.includes('app_data_revision_conflict')
    || error.details?.includes('app_data_revision_conflict')
    || error.code === 'APP_DATA_REVISION_CONFLICT'
}
