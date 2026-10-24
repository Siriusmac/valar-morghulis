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
    <><input aria-label="Bozza non confermata" />{[1, 2].map((id) => <button key={id} onClick={() => onSave({
      id: `phone-${id}`, type: 'expense', authorId: 'simone', memberId: 'simone',
      amount: 7.2, date: '2026-10-04', description: `Spesa telefono ${id}`,
      categoryId: 'alimentari', accountId: 'simone-cash', shared: false,
      createdAt: `2026-10-05T08:00:0${id}Z`,
    }, {})}>Salva test {id}</button>)}</>,
}))

const storageKey = 'skey:family:personal:user:simone:v3'
const activeKey = () => sessionStorage.getItem(`${storageKey}:workspace`) ?? storageKey
const readLocal = () => JSON.parse(localStorage.getItem(activeKey())!) as AppData
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
      resumeSnapshotWrites: vi.fn(),
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
    expect(readPendingCloudSave(activeKey())).toBeNull()
  })

  it('blocks conflict retries and preserves every local addition without overwriting the server', async () => {
    const write = deferred<void>()
    save.mockImplementationOnce(() => write.promise)
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await add(2)
    await act(async () => write.reject(new Error('app_data_revision_conflict')))
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    fireEvent(window, new Event('focus'))
    fireEvent(window, new Event('online'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
    expect(remote.movements).toHaveLength(0)
    expect(readLocal().movements).toHaveLength(2)
    expect(readPendingCloudSave(activeKey())?.blocked).toBe(true)
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
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    expect(remote.movements.map((m) => m.id)).toEqual(['desktop'])
    expect(save).not.toHaveBeenCalled()
    expect(readLocal().movements.map((m) => m.id)).toEqual(['offline-phone'])
    fireEvent.click(screen.getByRole('button', { name: 'Carica dati aggiornati' }))
    await screen.findByText('Sincronizzato')
    const recoveryKey = Object.keys(localStorage).find((key) => key.startsWith(activeKey() + ':recovery:'))!
    expect(JSON.parse(localStorage.getItem(recoveryKey)!).data.movements[0].id).toBe('offline-phone')
    expect(readLocal().movements[0].id).toBe('desktop')
    expect(save).not.toHaveBeenCalled()
    expect(context.cloud?.resumeSnapshotWrites).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Scarica ultima copia di recupero' })).toBeTruthy()
  })

  it('refreshes personal movements when restoring the installed web app', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    remote = { ...remote, tags: [{ id: 'from-other-device', name: 'Altro dispositivo', scope: 'personal', color: '#123456' }] }
    fireEvent(window, new Event('pageshow'))
    await waitFor(() => expect(readLocal().tags.some((tag) => tag.id === 'from-other-device')).toBe(true))
    expect(save).not.toHaveBeenCalled()
  })

  it('never resends an unconfirmed archive automatically even when the server has no snapshot', async () => {
    const movement: Movement = { id: 'phone-first', type: 'expense', authorId: 'simone', memberId: 'simone',
      amount: 7.2, date: '2026-10-04', description: 'Telefono', categoryId: 'alimentari',
      accountId: 'simone-cash', shared: false, createdAt: '2026-10-05T09:00:00Z' }
    localStorage.setItem(storageKey, JSON.stringify({ ...remote, movements: [movement] }))
    markCloudSavePending(storageKey)
    remote.movements = [{ ...movement, id: 'desktop-first' }]
    load.mockResolvedValueOnce(null)
    save.mockRejectedValueOnce(new Error('app_data_revision_conflict'))
    render(<App />)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    expect(save).not.toHaveBeenCalled()
    expect(remote.movements.map((item) => item.id)).toEqual(['desktop-first'])
  })

  it('retains an offline movement and sends it on reconnection', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await add(1)
    await waitFor(() => expect(readPendingCloudSave(activeKey())).not.toBeNull())
    expect(save).not.toHaveBeenCalled()
    expect(readLocal().movements).toHaveLength(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    fireEvent(window, new Event('online'))
    await screen.findByText('Sincronizzato')
    expect(remote.movements.map((movement) => movement.id)).toEqual(['phone-1'])
    expect(readPendingCloudSave(activeKey())).toBeNull()
  })

  it('locks a dirty open form when a resumed page discovers newer server data', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    fireEvent.click(screen.getAllByRole('button', { name: 'Aggiungi movimento' })[0])
    fireEvent.input(await screen.findByLabelText('Bozza non confermata'), { target: { value: 'Bozza da mantenere' } })
    remote = { ...remote, tags: [{ id: 'changed-elsewhere', name: 'Nuovo', scope: 'personal', color: '#123456' }] }
    fireEvent(window, new Event('focus'))
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    expect((screen.getByLabelText('Bozza non confermata') as HTMLInputElement).value).toBe('Bozza da mantenere')
    expect(screen.getByLabelText('Bozza non confermata').closest('[inert]')).not.toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps the conflict blocked if the remote reload fails', async () => {
    save.mockRejectedValueOnce(new Error('app_data_revision_conflict'))
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    load.mockRejectedValueOnce(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Carica dati aggiornati' }))
    await screen.findByText(/Non è stato possibile caricare i dati o conservare/)
    expect(readLocal().movements).toHaveLength(1)
    expect(readPendingCloudSave(activeKey())?.blocked).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
    expect(context.cloud?.resumeSnapshotWrites).not.toHaveBeenCalled()
  })

  it('does not clear pending work if saving the recovery copy runs out of space', async () => {
    save.mockRejectedValueOnce(new Error('app_data_revision_conflict'))
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes(':recovery:')) throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Carica dati aggiornati' }))
    await screen.findByText(/Non è stato possibile caricare i dati o conservare/)
    expect(load).toHaveBeenCalledTimes(1)
    expect(readPendingCloudSave(activeKey())?.blocked).toBe(true)
    expect(readLocal().movements).toHaveLength(1)
    expect(context.cloud?.resumeSnapshotWrites).not.toHaveBeenCalled()
  })

  it('does not let a late save response clear protection raised by a local storage failure', async () => {
    const write = deferred<void>()
    save.mockImplementationOnce(() => write.promise)
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === activeKey()) throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    })
    await add(2)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    await act(async () => write.resolve())
    expect(screen.getByText('Salvataggi sospesi per proteggere i dati')).toBeTruthy()
    expect(readPendingCloudSave(activeKey())?.blocked).toBe(true)
    expect(screen.queryByText('Sincronizzato')).toBeNull()
  })

  it('shows a protected local copy instead of crashing when a new tab cache cannot be allocated', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    render(<App />)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    expect(screen.getByRole('button', { name: 'Scarica copia locale' })).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })
})
