// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { captureLocalRecoveryArchive, clearArchivedWorkspaceCopies, persistLocalRecoveryArchive } from './localRecoveryArchive'
import { createPersonalStarterData } from './seed'

const base = 'skey:family:personal:user:simone:v3'
describe('bounded local storage repair', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
  it('captures all raw copies and metadata of exactly the current workspace', () => {
    localStorage.setItem(base, 'legacy-raw')
    localStorage.setItem(`${base}:tab:one`, 'unsent raw copy')
    localStorage.setItem(`${base}:tab:one:cloud-sync-pending`, '{"snapshot":"older-payload"}')
    localStorage.setItem(`${base}:tab:two:recovery:old`, 'unrecognized recovery payload')
    localStorage.setItem('sb-auth-token', 'untouched')
    localStorage.setItem('skey:family:other:user:simone:v3:tab:one', 'other family')
    localStorage.setItem('skey:family:personal:user:other:v3:tab:one', 'other person')
    const archive = captureLocalRecoveryArchive(base, createPersonalStarterData('simone'))
    expect(archive.entries).toHaveLength(4)
    expect(archive.entries.map(([, raw]) => raw)).toContain('unsent raw copy')
    clearArchivedWorkspaceCopies(archive)
    expect(localStorage.getItem('sb-auth-token')).toBe('untouched')
    expect(localStorage.getItem('skey:family:other:user:simone:v3:tab:one')).toBe('other family')
    expect(localStorage.getItem('skey:family:personal:user:other:v3:tab:one')).toBe('other person')
  })
  it('does not clear any entries if a different tab changed or created work during archival', () => {
    localStorage.setItem(`${base}:tab:one`, 'original')
    const archive = captureLocalRecoveryArchive(base, createPersonalStarterData('simone'))
    localStorage.setItem(`${base}:tab:two`, 'new work')
    expect(() => clearArchivedWorkspaceCopies(archive)).toThrow('recovery_archive_changed')
    expect(localStorage.getItem(`${base}:tab:one`)).toBe('original')
    expect(localStorage.getItem(`${base}:tab:two`)).toBe('new work')
    localStorage.removeItem(`${base}:tab:two`)
    localStorage.setItem(`${base}:tab:one`, 'changed')
    expect(() => clearArchivedWorkspaceCopies(archive)).toThrow('recovery_archive_changed')
    expect(localStorage.getItem(`${base}:tab:one`)).toBe('changed')
  })
  it('keeps the data unchanged if the durable archive is unavailable', async () => {
    localStorage.setItem(`${base}:tab:one`, 'unsent')
    const archive = captureLocalRecoveryArchive(base, createPersonalStarterData('simone'))
    await expect(persistLocalRecoveryArchive(archive)).rejects.toThrow('recovery_archive_unavailable')
    expect(localStorage.getItem(`${base}:tab:one`)).toBe('unsent')
  })
})
