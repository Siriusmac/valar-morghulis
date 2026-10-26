import type { AppData } from '../types'

export interface LocalRecoveryArchive {
  version: 1
  id: string
  baseKey: string
  savedAt: string
  activeData: AppData
  entries: Array<[string, string]>
}

const DATABASE = 'skey-local-recovery'
const STORE = 'archives'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('recovery_archive_unavailable')); return }
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onerror = () => reject(new Error('recovery_archive_unavailable'))
    request.onblocked = () => reject(new Error('recovery_archive_blocked'))
    request.onsuccess = () => resolve(request.result)
  })
}

/** Exact scope: no Auth tokens, other users, or other family workspaces. */
function belongsToWorkspace(key: string, baseKey: string) {
  return key === baseKey || key.startsWith(`${baseKey}:tab:`)
    || key === `${baseKey}:cloud-sync-pending` || key === `${baseKey}:cloud-sync-baseline`
    || key.startsWith(`${baseKey}:recovery:`)
}

export function captureLocalRecoveryArchive(baseKey: string, activeData: AppData): LocalRecoveryArchive {
  const entries: Array<[string, string]> = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key || !belongsToWorkspace(key, baseKey)) continue
    const raw = localStorage.getItem(key)
    if (raw !== null) entries.push([key, raw])
  }
  return { version: 1, id: crypto.randomUUID(), baseKey, savedAt: new Date().toISOString(), activeData: structuredClone(activeData), entries }
}

/** Resolves only after commit AND a separate read-back of the entire archive. */
export async function persistLocalRecoveryArchive(archive: LocalRecoveryArchive) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).add(archive)
      transaction.oncomplete = () => resolve()
      transaction.onerror = transaction.onabort = () => reject(new Error('recovery_archive_write_failed'))
    })
    const restored = await new Promise<unknown>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(archive.id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('recovery_archive_read_failed'))
    })
    if (JSON.stringify(restored) !== JSON.stringify(archive)) throw new Error('recovery_archive_verification_failed')
  } finally { db.close() }
}

/** Invoke only after verified archival and the user's explicit repair confirmation. */
export function clearArchivedWorkspaceCopies(archive: LocalRecoveryArchive) {
  const captured = new Map(archive.entries)
  // Never delete work changed/created while the asynchronous archive was being written.
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key && belongsToWorkspace(key, archive.baseKey) && localStorage.getItem(key) !== captured.get(key)) {
      throw new Error('recovery_archive_changed')
    }
  }
  for (const [key, raw] of archive.entries) {
    if (!belongsToWorkspace(key, archive.baseKey) || localStorage.getItem(key) !== raw) throw new Error('recovery_archive_changed')
  }
  for (const [key] of archive.entries) localStorage.removeItem(key)
}

export async function readLocalRecoveryArchives(baseKey: string): Promise<LocalRecoveryArchive[]> {
  const db = await openDatabase()
  try {
    const records = await new Promise<LocalRecoveryArchive[]>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as LocalRecoveryArchive[])
      request.onerror = () => reject(new Error('recovery_archive_read_failed'))
    })
    return records.filter((record) => record.version === 1 && record.baseKey === baseKey)
      .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
  } finally { db.close() }
}
