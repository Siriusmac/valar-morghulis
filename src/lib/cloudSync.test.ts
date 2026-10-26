// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindCloudSaveSnapshot, clearCloudSavePending, cloudSaveRetryDelay, cloudSnapshotsEqual, createCloudWriteQueue, isCloudRevisionConflict,
  createCloudWorkspace, markCloudSavePending, preserveCloudRecovery, readCloudSyncBaseline, readLatestCloudRecovery, readPendingCloudSave, recordCloudSaveFailure, writeCloudSyncBaseline,
} from './cloudSync'
import { createStarterData } from './seed'

describe('persistent cloud sync state', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })

  it('ignores JSON object key order but never ignores changed financial values', () => {
    const original = createStarterData('user-1', [])
    const reordered = JSON.parse(JSON.stringify(original, (_key, value: unknown) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value))
    expect(cloudSnapshotsEqual(original, reordered)).toBe(true)
    reordered.accounts[0].openingBalance += 1
    expect(cloudSnapshotsEqual(original, reordered)).toBe(false)
  })

  it('isolates two live workspace caches and blocks inherited pending writes', () => {
    localStorage.setItem('workspace', JSON.stringify({ version: 3 }))
    const first = createCloudWorkspace('workspace')
    markCloudSavePending(first, 'first-write')
    const second = createCloudWorkspace('workspace')
    expect(first).not.toBe(second)
    expect(readPendingCloudSave(second)?.blocked).toBe(true)
    markCloudSavePending(second, 'second-write')
    expect(readPendingCloudSave(first)?.mutationId).toBe('first-write')
    expect(readPendingCloudSave(second)?.mutationId).toBe('second-write')
    localStorage.setItem(second, 'second-copy')
    expect(localStorage.getItem(first)).not.toBe('second-copy')
  })

  it('reuses a replaced document on reload without allocating duplicate snapshots', () => {
    localStorage.setItem('workspace', JSON.stringify({ version: 3 }))
    const first = createCloudWorkspace('workspace')
    markCloudSavePending(first, 'unsent')
    const count = localStorage.length
    for (let index = 0; index < 20; index++) expect(createCloudWorkspace('workspace', true)).toBe(first)
    expect(localStorage.length).toBe(count)
    expect(readPendingCloudSave(first)?.mutationId).toBe('unsent')
    expect(createCloudWorkspace('workspace')).not.toBe(first)
  })

  it('does not allocate another identical recovery copy on repeated attempts', () => {
    const data = createStarterData('user-1', [])
    markCloudSavePending('workspace', 'unsent')
    const first = preserveCloudRecovery('workspace', data)
    expect(preserveCloudRecovery('workspace', structuredClone(data))).toBe(first)
    expect(Object.keys(localStorage).filter((key) => key.includes(':recovery:'))).toEqual([first])
    expect(preserveCloudRecovery('workspace', { ...data, tags: [{ id: 'changed', name: 'Different', scope: 'personal', color: '#123456' }] })).not.toBe(first)
  })

  it('recovers only the current user/workspace archive after reloading, without resubmitting it', () => {
    const first = createCloudWorkspace('own-workspace')
    const data = createStarterData('user-1', [])
    preserveCloudRecovery(first, data)
    createCloudWorkspace('own-workspace')
    expect(readLatestCloudRecovery('own-workspace')).toEqual(data)
    expect(readLatestCloudRecovery('other-user')).toBeUndefined()
  })

  it('keeps a pending mutation until the matching save is acknowledged', () => {
    markCloudSavePending('workspace', 'mutation-one', '2026-09-05T12:00:00.000Z')
    expect(readPendingCloudSave('workspace')).toEqual({
      mutationId: 'mutation-one', createdAt: '2026-09-05T12:00:00.000Z', attempts: 0,
    })
    expect(clearCloudSavePending('workspace', 'another-mutation')).toBe(false)
    expect(readPendingCloudSave('workspace')?.mutationId).toBe('mutation-one')
    expect(clearCloudSavePending('workspace', 'mutation-one')).toBe(true)
    expect(readPendingCloudSave('workspace')).toBeNull()
  })

  it('persists failures and caps exponential retry delays', () => {
    markCloudSavePending('workspace', 'mutation-one')
    expect(recordCloudSaveFailure('workspace', 'mutation-one')?.attempts).toBe(1)
    expect(recordCloudSaveFailure('workspace', 'mutation-one')?.attempts).toBe(2)
    expect(cloudSaveRetryDelay(1)).toBe(1_000)
    expect(cloudSaveRetryDelay(2)).toBe(2_000)
    expect(cloudSaveRetryDelay(20)).toBe(30_000)
  })

  it('retries the identical persisted payload after a lost server response', () => {
    const first = createStarterData('user-1', [])
    markCloudSavePending('workspace', 'same-request')
    bindCloudSaveSnapshot('workspace', 'same-request', first)
    recordCloudSaveFailure('workspace', 'same-request')
    const changed = { ...first, tags: [{ id: 'new-tag', name: 'New', scope: 'personal' as const, color: '#123456' }] }
    expect(bindCloudSaveSnapshot('workspace', 'same-request', changed)?.snapshot).toEqual(first)
    expect(readPendingCloudSave('workspace')?.snapshot).toEqual(first)

    markCloudSavePending('workspace', 'new-request')
    expect(bindCloudSaveSnapshot('workspace', 'same-request', first)).toBeNull()
    expect(clearCloudSavePending('workspace', 'same-request')).toBe(false)
    expect(bindCloudSaveSnapshot('workspace', 'new-request', changed)?.snapshot).toEqual(changed)
  })

  it('conserva una base sincronizzata separata per risolvere i conflitti tra dispositivi', () => {
    const data = createStarterData('user-1', [])
    data.movements = [{
      id: 'movement-1', type: 'expense', authorId: 'user-1', memberId: 'user-1', amount: 12,
      date: '2026-09-15', description: 'Pranzo', categoryId: 'alimentari', accountId: 'user-1-cash',
      shared: false, createdAt: '2026-09-15T10:00:00.000Z',
    }, {
      id: 'movement-other', type: 'expense', authorId: 'user-2', memberId: 'user-2', amount: 8,
      date: '2026-09-15', description: 'Altro', categoryId: 'alimentari', accountId: 'user-2-cash',
      shared: true, createdAt: '2026-09-15T11:00:00.000Z',
    }]

    writeCloudSyncBaseline('workspace', data, 'user-1')

    expect(readCloudSyncBaseline('workspace')?.movements.map((item) => item.id)).toEqual(['movement-1'])
  })

  it('recognizes revision conflicts returned by Postgres', () => {
    expect(isCloudRevisionConflict({ message: 'app_data_revision_conflict' })).toBe(true)
    expect(isCloudRevisionConflict(new Error('network unavailable'))).toBe(false)
  })

  it('serializes cloud writes even when a previous operation fails', async () => {
    const run = createCloudWriteQueue()
    const events: string[] = []
    let releaseFirst!: () => void
    const first = run(() => new Promise<void>((resolve) => {
      events.push('first-start')
      releaseFirst = () => { events.push('first-end'); resolve() }
    }))
    const second = run(async () => { events.push('second') })

    await vi.waitFor(() => expect(events).toEqual(['first-start']))
    releaseFirst()
    await Promise.all([first, second])
    expect(events).toEqual(['first-start', 'first-end', 'second'])

    await expect(run(async () => { throw new Error('failed write') })).rejects.toThrow('failed write')
    await run(async () => { events.push('after-failure') })
    expect(events.at(-1)).toBe('after-failure')
  })
})
