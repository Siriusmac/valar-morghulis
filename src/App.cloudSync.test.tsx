// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { FamilySession } from './features/CloudAccess'
import type { AppData, Movement } from './types'
import type { MovementAdditions } from './lib/movements'
import { createPersonalStarterData, users } from './lib/seed'
import { blockCloudSave, markCloudSavePending, readPendingCloudSave, writeCloudSyncBaseline } from './lib/cloudSync'
import App from './App'

const context = vi.hoisted(() => ({ cloud: null as FamilySession | null }))
const archiveApi = vi.hoisted(() => ({ persist: vi.fn(), read: vi.fn() }))
vi.mock('./lib/localRecoveryArchive', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/localRecoveryArchive')>(),
  persistLocalRecoveryArchive: archiveApi.persist,
  readLocalRecoveryArchives: archiveApi.read,
}))
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
    archiveApi.persist.mockReset().mockResolvedValue(undefined)
    archiveApi.read.mockReset().mockResolvedValue([])
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
    expect(Object.keys(localStorage).filter((key) => key.includes(':recovery:'))).toHaveLength(0)
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
    expect(load).toHaveBeenCalledTimes(2)
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
    await screen.findByText('Spazio locale da ripristinare')
    await act(async () => write.resolve())
    expect(screen.getByText('Spazio locale da ripristinare')).toBeTruthy()
    expect(readPendingCloudSave(activeKey())?.blocked).toBe(true)
    expect(screen.queryByText('Sincronizzato')).toBeNull()
  })

  it('shows a protected local copy instead of crashing when a new tab cache cannot be allocated', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
    render(<App />)
    await screen.findByText('Spazio locale da ripristinare')
    expect(screen.getByRole('button', { name: 'Scarica copia locale' })).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  const fillOldWorkspaceCopies = () => {
    const data = structuredClone(remote)
    data.movements = [{ id: 'unsent-old-phone', type: 'expense', authorId: 'simone', memberId: 'simone', amount: 7.2,
      date: '2026-10-04', description: 'Da conservare', categoryId: 'alimentari', accountId: 'simone-cash', shared: false, createdAt: '2026-10-05T08:00:00Z' }]
    localStorage.setItem(storageKey, JSON.stringify(data))
    markCloudSavePending(storageKey, 'pending-old-phone')
    localStorage.setItem(`${storageKey}:tab:closed-one`, JSON.stringify({ ...data, tags: [{ id: 'older-unique', name: 'Da conservare', scope: 'personal', color: '#123456' }] }))
    localStorage.setItem(`${storageKey}:tab:closed-two`, JSON.stringify(data))
    localStorage.setItem('sb-auth-token', 'untouched')
    const capacity = Object.keys(localStorage).reduce((sum, key) => sum + key.length + localStorage.getItem(key)!.length, 0) + 128
    const original = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === localStorage) {
        const used = Object.keys(localStorage).filter((existing) => existing !== key)
          .reduce((sum, existing) => sum + existing.length + localStorage.getItem(existing)!.length, 0)
        if (used + key.length + value.length > capacity) throw new DOMException('Full', 'QuotaExceededError')
      }
      return original.call(this, key, value)
    })
    return data
  }

  const confirmRepair = async () => {
    await screen.findByText('Spazio locale non disponibile: scarica la copia locale prima di chiudere la pagina. I salvataggi sono sospesi.')
    fireEvent.click(screen.getByText('Ripara lo spazio locale'))
    const button = screen.getByRole('button', { name: 'Archivia le copie e ripara' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Ho conservato il file scaricato/ }))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
  }

  it('archives all unique raw copies before reclaiming quota and never uploads the old archive', async () => {
    fillOldWorkspaceCopies()
    render(<App />)
    await confirmRepair()
    await screen.findByText('Sincronizzato')
    expect(archiveApi.persist).toHaveBeenCalledTimes(1)
    const archive = archiveApi.persist.mock.calls[0][0]
    expect(archive.activeData.movements[0].id).toBe('unsent-old-phone')
    expect(archive.entries.some(([, raw]: [string, string]) => raw.includes('older-unique'))).toBe(true)
    expect(archive.entries.some(([key, raw]: [string, string]) => key.endsWith(':cloud-sync-pending') && raw.includes('pending-old-phone'))).toBe(true)
    expect(readLocal().movements).toHaveLength(0)
    expect(localStorage.getItem(`${storageKey}:tab:closed-one`)).toBeNull()
    expect(localStorage.getItem('sb-auth-token')).toBe('untouched')
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(screen.getByRole('button', { name: 'Scarica ultima copia di recupero' })).toBeTruthy()
  })

  it('does not clear any old copies if the durable archive fails', async () => {
    fillOldWorkspaceCopies()
    archiveApi.persist.mockRejectedValueOnce(new Error('archive verification failed'))
    const copies = localStorage.getItem(`${storageKey}:tab:closed-one`)
    render(<App />)
    await confirmRepair()
    await screen.findByText(/Riparazione non completata/)
    expect(localStorage.getItem(`${storageKey}:tab:closed-one`)).toBe(copies)
    expect(localStorage.getItem(storageKey)).toContain('unsent-old-phone')
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByText('Spazio locale da ripristinare')).toBeTruthy()
  })

  it('does not start archival or cleanup if the complete server read fails', async () => {
    fillOldWorkspaceCopies()
    render(<App />)
    await screen.findByText('Spazio locale da ripristinare')
    load.mockRejectedValueOnce(new Error('offline'))
    await confirmRepair()
    await screen.findByText(/Riparazione non completata/)
    expect(archiveApi.persist).not.toHaveBeenCalled()
    expect(localStorage.getItem(storageKey)).toContain('unsent-old-phone')
    expect(save).not.toHaveBeenCalled()
  })

  it('checks in the background without locking or closing an open form', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    const read = deferred<Partial<AppData>>()
    load.mockImplementationOnce(() => read.promise)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Verifica dei dati aggiornati…')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: 'Aggiungi movimento' })[0])
    const field = await screen.findByLabelText('Bozza non confermata')
    expect(field.closest('[inert]')).toBeNull()
    fireEvent.input(field, { target: { value: 'Scrivo durante il controllo' } })
    await act(async () => read.resolve(structuredClone(remote)))
    expect((field as HTMLInputElement).value).toBe('Scrivo durante il controllo')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('does not create a pending financial mutation when the authenticated context is refreshed', async () => {
    const view = render(<App />)
    await screen.findByText('Sincronizzato')
    context.cloud = { ...context.cloud! }
    view.rerender(<App />)
    expect(readPendingCloudSave(activeKey())).toBeNull()
    await act(async () => { await Promise.resolve() })
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
  })

  it('refreshes newer server data silently after an auth-context refresh with no local changes', async () => {
    const view = render(<App />)
    await screen.findByText('Sincronizzato')
    remote = { ...remote, tags: [{ id: 'resume-server', name: 'Aggiornato', scope: 'personal', color: '#123456' }] }
    context.cloud = { ...context.cloud! }
    view.rerender(<App />)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(readLocal().tags.some((tag) => tag.id === 'resume-server')).toBe(true))
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('preserves an open draft across repeated auth-context and visibility refreshes', async () => {
    const view = render(<App />)
    await screen.findByText('Sincronizzato')
    fireEvent.click(screen.getAllByRole('button', { name: 'Aggiungi movimento' })[0])
    const field = await screen.findByLabelText('Bozza non confermata')
    fireEvent.input(field, { target: { value: 'Bozza mentre cambio app' } })
    for (let index = 0; index < 4; index++) {
      context.cloud = { ...context.cloud! }
      view.rerender(<App />)
      fireEvent(document, new Event('visibilitychange'))
      fireEvent(window, new Event('focus'))
      await act(async () => { await Promise.resolve() })
      expect(readPendingCloudSave(activeKey())).toBeNull()
      expect((field as HTMLInputElement).value).toBe('Bozza mentre cambio app')
      expect(field.closest('[inert]')).toBeNull()
    }
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
  })

  it('still protects a dirty draft when auth refresh discovers actual server changes', async () => {
    const view = render(<App />)
    await screen.findByText('Sincronizzato')
    fireEvent.click(screen.getAllByRole('button', { name: 'Aggiungi movimento' })[0])
    const field = await screen.findByLabelText('Bozza non confermata')
    fireEvent.input(field, { target: { value: 'Non perdere questa bozza' } })
    remote = { ...remote, tags: [{ id: 'server-during-draft', name: 'Altrove', scope: 'personal', color: '#123456' }] }
    context.cloud = { ...context.cloud! }
    view.rerender(<App />)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    expect((field as HTMLInputElement).value).toBe('Non perdere questa bozza')
    expect(field.closest('[inert]')).not.toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps the same pending mutation when auth refresh occurs during an in-flight save', async () => {
    const write = deferred<void>()
    save.mockImplementationOnce(async (data) => { await write.promise; remote = structuredClone(data) })
    const view = render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const mutation = readPendingCloudSave(activeKey())?.mutationId
    context.cloud = { ...context.cloud! }
    view.rerender(<App />)
    fireEvent(window, new Event('focus'))
    expect(readPendingCloudSave(activeKey())?.mutationId).toBe(mutation)
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    await act(async () => write.resolve())
    await screen.findByText('Sincronizzato')
    expect(save).toHaveBeenCalledTimes(1)
    expect(readPendingCloudSave(activeKey())).toBeNull()
    expect(remote.movements[0].id).toBe('phone-1')
  })

  it('keeps transient resume failures non-blocking after the authenticated context changes', async () => {
    const view = render(<App />)
    await screen.findByText('Sincronizzato')
    load.mockRejectedValueOnce(new Error('temporary resume network failure'))
    context.cloud = { ...context.cloud! }
    view.rerender(<App />)
    await screen.findByText('Sincronizzazione non riuscita')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(readPendingCloudSave(activeKey())).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('shows a retryable badge, not a conflict, when a background read fails', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    load.mockRejectedValueOnce(new Error('temporary network failure'))
    fireEvent(window, new Event('focus'))
    await screen.findByText('Sincronizzazione non riuscita')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(readPendingCloudSave(activeKey())).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Riprova sincronizzazione' }))
    await screen.findByText('Sincronizzato')
    expect(load).toHaveBeenCalledTimes(3)
    expect(save).not.toHaveBeenCalled()
  })

  it('resumes after several days without an age-based warning when there is no unsaved work', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 3 * 24 * 60 * 60 * 1000)
      remote = { ...remote, tags: [{ id: 'after-days', name: 'Aggiornato', scope: 'personal', color: '#123456' }] }
      fireEvent(window, new Event('focus'))
      await waitFor(() => expect(readLocal().tags.some((tag) => tag.id === 'after-days')).toBe(true))
      expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
      expect(screen.queryByText('Verifica dei dati aggiornati…')).toBeNull()
      expect(save).not.toHaveBeenCalled()
    } finally { vi.useRealTimers() }
  })

  it('does not mistake an abandoned form for an unsaved draft on a later refresh', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    fireEvent.click(screen.getAllByRole('button', { name: 'Aggiungi movimento' })[0])
    fireEvent.input(await screen.findByLabelText('Bozza non confermata'), { target: { value: 'Annullata' } })
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }))
    remote = { ...remote, tags: [{ id: 'after-cancel', name: 'Aggiornato', scope: 'personal', color: '#123456' }] }
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(readLocal().tags.some((tag) => tag.id === 'after-cancel')).toBe(true))
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('clears an inherited block automatically only when the complete cache matches the server', async () => {
    blockCloudSave(storageKey)
    render(<App />)
    await screen.findByText('Sincronizzato')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(readPendingCloudSave(activeKey())).toBeNull()
    expect(save).not.toHaveBeenCalled()
  })

  it('recovers from a successful empty snapshot without looping or uploading the old archive', async () => {
    save.mockRejectedValueOnce(new Error('app_data_revision_conflict'))
    render(<App />)
    await screen.findByText('Sincronizzato')
    await add(1)
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    load.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: 'Carica dati aggiornati' }))
    await screen.findByText('Sincronizzato')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(readPendingCloudSave(activeKey())).toBeNull()
    expect(readLocal().movements).toHaveLength(0)
    const recoveryKey = Object.keys(localStorage).find((key) => key.includes(':recovery:'))!
    expect(JSON.parse(localStorage.getItem(recoveryKey)!).data.movements[0].id).toBe('phone-1')
    expect(save).toHaveBeenCalledTimes(1)
    cleanup()
    load.mockResolvedValueOnce(null)
    render(<App />)
    await screen.findByText('Sincronizzato')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
    expect(readLocal().movements).toHaveLength(0)
    // Reopening an empty server can create an empty snapshot, never the old movement.
    expect(save.mock.calls.slice(1).every(([snapshot]) => snapshot.movements.length === 0)).toBe(true)
  })

  it('allows saving during an unchanged background read without a false conflict', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    const read = deferred<Partial<AppData>>()
    load.mockImplementationOnce(() => read.promise)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await add(1)
    await waitFor(() => expect(readPendingCloudSave(activeKey())).not.toBeNull())
    await act(async () => read.resolve(structuredClone(remote)))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    await screen.findByText('Sincronizzato')
    expect(remote.movements[0].id).toBe('phone-1')
    expect(screen.queryByText('Salvataggi sospesi per proteggere i dati')).toBeNull()
  })

  it('blocks a queued save before it can overwrite changes discovered during a background read', async () => {
    render(<App />)
    await screen.findByText('Sincronizzato')
    const read = deferred<Partial<AppData>>()
    load.mockImplementationOnce(() => read.promise)
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await add(1)
    await waitFor(() => expect(readPendingCloudSave(activeKey())).not.toBeNull())
    remote = { ...remote, tags: [{ id: 'new-elsewhere', name: 'Altro dispositivo', scope: 'personal', color: '#123456' }] }
    await act(async () => read.resolve(structuredClone(remote)))
    await screen.findByText('Salvataggi sospesi per proteggere i dati')
    expect(save).not.toHaveBeenCalled()
    expect(readLocal().movements[0].id).toBe('phone-1')
    expect(remote.movements).toHaveLength(0)
    expect(readPendingCloudSave(activeKey())?.blocked).toBe(true)
  })
})
