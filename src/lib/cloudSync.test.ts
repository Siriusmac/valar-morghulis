// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCloudSavePending, cloudSaveRetryDelay, createCloudWriteQueue, isCloudRevisionConflict,
  markCloudSavePending, readCloudSyncBaseline, readPendingCloudSave, recordCloudSaveFailure, writeCloudSyncBaseline,
} from './cloudSync'
import { createStarterData } from './seed'

describe('persistent cloud sync state', () => {
  beforeEach(() => localStorage.clear())

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
