// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCloudSavePending, cloudSaveRetryDelay, createCloudWriteQueue, isCloudRevisionConflict,
  markCloudSavePending, readPendingCloudSave, recordCloudSaveFailure,
} from './cloudSync'

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
