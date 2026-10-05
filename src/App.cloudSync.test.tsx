// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FamilySession } from './features/CloudAccess'
import type { AppData, Movement } from './types'
import type { MovementAdditions } from './lib/movements'
import { createPersonalStarterData, users } from './lib/seed'
import { markCloudSavePending, readPendingCloudSave, writeCloudSyncBaseline } from './lib/cloudSync'
import App from './App'

const context = vi.hoisted(() => ({ cloud: null as FamilySession | null }))
vi.mock('./lib/supabase', () => ({ cloudAuthEnabled: true }))
vi.mock('./features/CloudAccess', () => ({
  CloudAccess: ({ children }: { children: (cloud: FamilySession) => ReactNode }) => children(context.cloud!),
}))
vi.mock('./lib/contacts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/contacts')>(),
  loadContactData: async () => ({ friends: [], invitations: [], purchases: [] }),
}))
vi.mock('./features/MovementForm', () => ({
  MovementForm: ({ onSave }: { onSave: (movement: Movement, additions: MovementAdditions) => void }) =>
    <>{[1, 2].map((id) => <button key={id} onClick={() => onSave({
      id: `phone-${id}`, type: 'expense', authorId: 'simone', memberId: 'simone',
      amount: 7.2, date: '2026-10-04', description: `Spesa telefono ${id}`,
      categoryId: 'alimentari', accountId: 'simone-cash', shared: false,
      createdAt: `2026-10-05T08:00:0${id}Z`,
    }, {})}>Salva test {id}</button>)}</>,
}))

const storageKey = 'skey:family:personal:user:simone:v3'
const readLocal = () => JSON.parse(localStorage.getItem(storageKey)!) as AppData
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('cloud save lifecycle on mobile', () => {
  let remote: AppData
  let load: ReturnType<typeof vi.fn<() => Promise<Partial<AppData> | null>>>
  let save: ReturnType<typeof vi.fn<(data: AppData, mutationId?: string) => Promise<void>>>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/?page=accounts')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    remote = createPersonalStarterData('simone')
    load = vi.fn<() => Promise<Partial<AppData> | null>>(async () => structuredClone(remote))
    save = vi.fn(async (data: AppData) => { remote = structuredClone(data) })
    context.cloud = {
      familyId: 'personal', personalMode: true, familyName: 'Personale', role: 'member',
      user: users[0], members: [users[0]], families: [], invitations: [], sharedAccounts: [],
      reimbursementAccountReferences: [], loadAppData: load, saveAppData: save,
    } as unknown as FamilySession
    localStorage.setItem(storageKey, JSON.stringify(remote))
    localStorage.setItem('skey:cloud-imported:personal:simone:v1', '1')
    writeCloudSyncBaseline(storageKey, remote, 'simone')
  })
  afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

  const add = async (id: number) => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Aggiungi movimento' })[0])
    fireEvent.click(await screen.findByRole('button', { name: `Salva test ${id}` }))
  }

  it('keeps the badge pending until both movements added during a save are acknowledged', async () => {
    const first = deferred<void>(), second = deferred<void>()
    save.mockImplementationOnce(async (data) => { await first.promise; remote = structuredClone(data) })
      .mockImplementationOnce(async (data) => { await second.promise; remote = structuredClone(data) })
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await add(2)
    await act(async () => first.resolve())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Sincronizzato')).toBeNull()
    expect(save.mock.calls[1][0].movements.map((m) => m.id).sort()).toEqual(['phone-1', 'phone-2'])
    expect(save.mock.calls[1][1]).not.toBe(save.mock.calls[0][1])
    await act(async () => second.resolve())
    await screen.findByText('Sincronizzato')
    expect(remote.movements).toHaveLength(2)
    expect(readPendingCloudSave(storageKey)).toBeNull()
  })

  it('preserves a second movement entered while reading the remote conflict', async () => {
    const reload = deferred<Partial<AppData>>()
    load.mockImplementationOnce(async () => structuredClone(remote)).mockImplementationOnce(() => reload.promise)
    save.mockRejectedValueOnce(new Error('app_data_revision_conflict'))
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await add(2)
    await act(async () => reload.resolve(remote))
    await screen.findByText('Sincronizzato')
    expect(remote.movements.map((m) => m.id).sort()).toEqual(['phone-1', 'phone-2'])
    expect(readLocal().movements).toHaveLength(2)
  })

  it('keeps additions from another device when reopening an offline pending archive', async () => {
    const base = structuredClone(remote)
    const movement: Movement = { id: 'desktop', type: 'expense', authorId: 'simone', memberId: 'simone',
      amount: 20, date: '2026-10-04', description: 'Computer', categoryId: 'alimentari',
      accountId: 'simone-cash', shared: false, createdAt: '2026-10-05T09:00:00Z' }
    remote.movements = [movement]
    localStorage.setItem(storageKey, JSON.stringify({ ...base, movements: [{ ...movement, id: 'offline-phone' }] }))
    markCloudSavePending(storageKey, 'old-request')
    render(<App />)
    await screen.findByText('Sincronizzato')
    expect(remote.movements.map((m) => m.id).sort()).toEqual(['desktop', 'offline-phone'])
    expect(save.mock.calls[0][1]).not.toBe('old-request')
  })

  it('refreshes personal movements when restoring the installed web app', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    remote = { ...remote, tags: [{ id: 'from-other-device', name: 'Altro dispositivo', scope: 'personal', color: '#123456' }] }
    fireEvent(window, new Event('pageshow'))
    await waitFor(() => expect(readLocal().tags.some((tag) => tag.id === 'from-other-device')).toBe(true))
    expect(save).not.toHaveBeenCalled()
  })

  it('does not treat an unconfirmed first upload as an acknowledged baseline', async () => {
    const movement: Movement = { id: 'phone-first', type: 'expense', authorId: 'simone', memberId: 'simone',
      amount: 7.2, date: '2026-10-04', description: 'Telefono', categoryId: 'alimentari',
      accountId: 'simone-cash', shared: false, createdAt: '2026-10-05T09:00:00Z' }
    localStorage.setItem(storageKey, JSON.stringify({ ...remote, movements: [movement] }))
    markCloudSavePending(storageKey)
    remote.movements = [{ ...movement, id: 'desktop-first' }]
    load.mockResolvedValueOnce(null)
    save.mockRejectedValueOnce(new Error('app_data_revision_conflict'))
    render(<App />)
    await screen.findByText('Sincronizzato')
    expect(remote.movements.map((item) => item.id).sort()).toEqual(['desktop-first', 'phone-first'])
  })

  it('retains an offline movement and sends it on reconnection', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await add(1)
    await waitFor(() => expect(readPendingCloudSave(storageKey)).not.toBeNull())
    expect(save).not.toHaveBeenCalled()
    expect(readLocal().movements).toHaveLength(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    fireEvent(window, new Event('online'))
    await screen.findByText('Sincronizzato')
    expect(remote.movements.map((movement) => movement.id)).toEqual(['phone-1'])
    expect(readPendingCloudSave(storageKey)).toBeNull()
  })
})
