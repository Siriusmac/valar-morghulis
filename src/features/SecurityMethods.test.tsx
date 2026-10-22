// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthSecurityApi } from '../lib/authSecurity'
import { SecurityMethods } from './SecurityMethods'
import { MfaGate } from './MfaGate'

afterEach(cleanup)
const openStatus = { currentLevel: 'aal1', needsChallenge: false, factors: [] }
const protectedStatus = { currentLevel: 'aal1', needsChallenge: true, factors: [{ id: 'factor', name: 'Telefono' }] }
const elevatedStatus = { ...protectedStatus, currentLevel: 'aal2', needsChallenge: false }
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function Draft({ onMount, onUnmount }: { onMount?: () => void; onUnmount?: () => void }) {
  const [value, setValue] = useState('')
  useEffect(() => { onMount?.(); return onUnmount }, [onMount, onUnmount])
  return <label>Bozza<input value={value} onChange={(event) => setValue(event.target.value)} /></label>
}
function api(overrides: Partial<AuthSecurityApi> = {}): AuthSecurityApi {
  return { enrollmentEnabled: true, passkeysEnabled: false,
    status: vi.fn().mockResolvedValue(openStatus), enroll: vi.fn().mockResolvedValue({ id: 'pending', qr: '<svg/>', secret: 'PRIVATE-KEY' }),
    verify: vi.fn().mockResolvedValue(undefined), removeFactor: vi.fn().mockResolvedValue(undefined),
    passkeys: vi.fn().mockResolvedValue([]), registerPasskey: vi.fn(), removePasskey: vi.fn(), ...overrides }
}

describe('optional authenticator settings', () => {
  it('offers official authenticator downloads without starting enrollment or leaving the page', async () => {
    const security = api()
    render(<SecurityMethods api={security} />)
    await screen.findByRole('button', { name: 'Attiva autenticatore' })
    const links = [
      ['Android — Google Play', 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2'],
      ['iPhone e iPad — App Store', 'https://apps.apple.com/it/app/google-authenticator/id388497605'],
      ['Microsoft Authenticator — Android e iPhone', 'https://www.microsoft.com/it-it/security/mobile-authenticator-app'],
    ]
    for (const [name, href] of links) {
      const link = screen.getByRole('link', { name })
      expect(link.getAttribute('href')).toBe(href)
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    }
    expect(security.enroll).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Attiva autenticatore' }))
    await screen.findByText('Configura l’autenticatore')
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
  it('keeps the authenticator available when only the passkey list fails', async () => {
    const security = api({ passkeysEnabled: true, status: vi.fn().mockResolvedValue(elevatedStatus), passkeys: vi.fn().mockRejectedValue(new Error('passkeys unavailable')) })
    render(<SecurityMethods api={security} />)
    await screen.findByRole('button', { name: 'Disattiva Telefono' })
    expect(screen.getByRole('button', { name: 'Aggiungi un altro autenticatore' })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Impossibile caricare le passkey')
    expect(screen.queryByRole('button', { name: 'Aggiungi passkey' })).toBeNull()
  })
  it('reloads passkeys after a temporary failure without changing authenticators', async () => {
    const security = api({ passkeysEnabled: true, passkeys: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([{ id: 'key', name: 'Dispositivo' }]) })
    render(<SecurityMethods api={security} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Riprova caricamento passkey' }))
    await screen.findByText('Dispositivo')
    expect(security.enroll).not.toHaveBeenCalled()
    expect(security.removeFactor).not.toHaveBeenCalled()
  })
  it('does not claim MFA is inactive or expose actions when status cannot be checked', async () => {
    render(<SecurityMethods api={api({ status: vi.fn().mockRejectedValue(new Error('offline')) })} />)
    await screen.findByText('Impossibile caricare i metodi di sicurezza. Riprova.')
    expect(screen.queryByText('Non attivo: l’attivazione è una tua scelta.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Attiva autenticatore' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Riprova caricamento' })).toBeTruthy()
  })
  it('keeps methods and retry actions visible after passkey registration fails', async () => {
    render(<SecurityMethods api={api({ passkeysEnabled: true, status: vi.fn().mockResolvedValue(elevatedStatus), registerPasskey: vi.fn().mockRejectedValue(new Error('cancelled')) })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Aggiungi passkey' }))
    await screen.findByRole('alert')
    expect((screen.getByRole('button', { name: 'Aggiungi passkey' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Disattiva Telefono' })).toBeTruthy()
  })
  it('keeps activation available after a failed enrollment without inventing a pending factor', async () => {
    render(<SecurityMethods api={api({ enroll: vi.fn().mockRejectedValue(new Error('offline')) })} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Attiva autenticatore' }))
    await screen.findByRole('alert')
    expect((screen.getByRole('button', { name: 'Attiva autenticatore' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByLabelText('Codice dell’autenticatore')).toBeNull()
  })
  it('recommends a reserve for a single authenticator but never creates one automatically', async () => {
    const security = api({ status: vi.fn().mockResolvedValue(elevatedStatus) })
    render(<SecurityMethods api={security} />)
    await screen.findByText('Un solo autenticatore configurato.')
    expect(screen.getByText('Come evitare di perdere l’accesso')).toBeTruthy()
    expect(security.enroll).not.toHaveBeenCalled()
  })
  it('recommends without requiring enrollment or creating a factor automatically', async () => {
    const security = api()
    render(<SecurityMethods api={security} />)
    expect(screen.getByText('Autenticatore facoltativo.')).toBeTruthy()
    await screen.findByText('Non attivo: l’attivazione è una tua scelta.')
    expect(security.enroll).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Aggiungi passkey' })).toBeNull()
  })
  it('keeps activation unavailable until server rollout is enabled', async () => {
    render(<SecurityMethods api={api({ enrollmentEnabled: false })} />)
    await screen.findByText(/Attivazione in preparazione/)
    expect(screen.queryByRole('button', { name: 'Attiva autenticatore' })).toBeNull()
  })
  it('explains same-phone setup and removes canceled pending enrollment', async () => {
    const security = api()
    render(<SecurityMethods api={security} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Attiva autenticatore' }))
    await screen.findByText(/stesso telefono/)
    expect(screen.getByText('PRIVATE-KEY')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    await waitFor(() => expect(security.removeFactor).toHaveBeenCalledWith('pending'))
    await waitFor(() => expect(screen.queryByText('PRIVATE-KEY')).toBeNull())
  })
  it('activates only after a valid six-digit code and clears the secret', async () => {
    const security = api()
    render(<SecurityMethods api={security} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Attiva autenticatore' }))
    const input = await screen.findByLabelText('Codice dell’autenticatore')
    expect((screen.getByRole('button', { name: 'Conferma attivazione' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma attivazione' }))
    await screen.findByText(/Autenticatore attivato\./)
    expect(security.verify).toHaveBeenCalledWith('pending', '123456')
    expect(screen.queryByText('PRIVATE-KEY')).toBeNull()
  })
  it('requires a fresh verification before removing a verified factor', async () => {
    const security = api({ status: vi.fn().mockResolvedValue({ ...protectedStatus, currentLevel: 'aal2', needsChallenge: false }) })
    render(<SecurityMethods api={security} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Disattiva Telefono' }))
    expect(security.removeFactor).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Codice dell’autenticatore'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Conferma disattivazione' }))
    await waitFor(() => expect(security.removeFactor).toHaveBeenCalledWith('factor'))
    expect(security.verify).toHaveBeenCalledWith('factor', '123456')
  })
})

describe('MFA data access gate', () => {
  function mount(security: AuthSecurityApi) { return render(<MfaGate api={security} sessionToken="token" onLogout={vi.fn()}><p>PRIVATE DATA</p></MfaGate>) }
  it('allows password-only users who never activated MFA', async () => {
    mount(api())
    await screen.findByText('PRIVATE DATA')
  })
  it('does not mount private data while security status is unresolved', () => {
    mount(api({ status: () => new Promise(() => {}) }))
    expect(screen.queryByText('PRIVATE DATA')).toBeNull()
  })
  it('fails closed when the server cannot check the session', async () => {
    mount(api({ status: vi.fn().mockRejectedValue(new Error('offline')) }))
    await screen.findByRole('alert')
    expect(screen.queryByText('PRIVATE DATA')).toBeNull()
  })
  it('unlocks enrolled users only after confirmed AAL2', async () => {
    const status = vi.fn().mockResolvedValueOnce(protectedStatus).mockResolvedValue({ ...protectedStatus, currentLevel: 'aal2', needsChallenge: false })
    mount(api({ status }))
    fireEvent.change(await screen.findByLabelText('Codice dell’autenticatore'), { target: { value: '123456' } })
    expect(screen.queryByText('PRIVATE DATA')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Verifica e accedi' }))
    await screen.findByText('PRIVATE DATA')
  })
  it('does not trust successful verification without elevated assurance', async () => {
    mount(api({ status: vi.fn().mockResolvedValue(protectedStatus) }))
    fireEvent.change(await screen.findByLabelText('Codice dell’autenticatore'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica e accedi' }))
    await screen.findByText(/Codice non valido o verifica non completata/)
    expect(screen.queryByText('PRIVATE DATA')).toBeNull()
  })
  it('preserves a draft and mounted effects through an authorized refresh, while hiding it during the check', async () => {
    const next = deferred<typeof elevatedStatus>()
    const security = api({ status: vi.fn().mockResolvedValueOnce(elevatedStatus).mockReturnValueOnce(next.promise) })
    const onMount = vi.fn(), onUnmount = vi.fn()
    const view = render(<MfaGate api={security} sessionToken="old" onLogout={vi.fn()}><Draft onMount={onMount} onUnmount={onUnmount} /></MfaGate>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Bozza' }), { target: { value: 'Spesa non salvata' } })
    view.rerender(<MfaGate api={security} sessionToken="new" onLogout={vi.fn()}><Draft onMount={onMount} onUnmount={onUnmount} /></MfaGate>)
    expect(screen.queryByRole('textbox', { name: 'Bozza' })).toBeNull()
    expect(screen.getByLabelText('Bozza').closest('[inert]')?.hasAttribute('hidden')).toBe(true)
    expect(onUnmount).not.toHaveBeenCalled()
    await act(async () => next.resolve(elevatedStatus))
    expect((await screen.findByRole('textbox', { name: 'Bozza' }) as HTMLInputElement).value).toBe('Spesa non salvata')
    expect(onMount).toHaveBeenCalledTimes(1)
    expect(onUnmount).not.toHaveBeenCalled()
  })
  it('removes previously authorized content if a refreshed session needs MFA', async () => {
    const security = api({ status: vi.fn().mockResolvedValueOnce(elevatedStatus).mockResolvedValue(protectedStatus) })
    const onUnmount = vi.fn()
    const view = render(<MfaGate api={security} sessionToken="old" onLogout={vi.fn()}><Draft onUnmount={onUnmount} /></MfaGate>)
    await screen.findByLabelText('Bozza')
    view.rerender(<MfaGate api={security} sessionToken="new" onLogout={vi.fn()}><Draft onUnmount={onUnmount} /></MfaGate>)
    await screen.findByLabelText('Codice dell’autenticatore')
    expect(screen.queryByLabelText('Bozza')).toBeNull()
    expect(onUnmount).toHaveBeenCalledTimes(1)
  })
  it('fails closed and removes old content when a refresh check fails', async () => {
    const security = api({ status: vi.fn().mockResolvedValueOnce(elevatedStatus).mockRejectedValue(new Error('offline')) })
    const view = render(<MfaGate api={security} sessionToken="old" onLogout={vi.fn()}><Draft /></MfaGate>)
    await screen.findByLabelText('Bozza')
    view.rerender(<MfaGate api={security} sessionToken="new" onLogout={vi.fn()}><Draft /></MfaGate>)
    await screen.findByRole('alert')
    expect(screen.queryByLabelText('Bozza')).toBeNull()
  })
  it('ignores an older status response after a newer session requires MFA', async () => {
    const old = deferred<typeof elevatedStatus>()
    const security = api({ status: vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue(protectedStatus) })
    const view = render(<MfaGate api={security} sessionToken="old" onLogout={vi.fn()}><Draft /></MfaGate>)
    view.rerender(<MfaGate api={security} sessionToken="new" onLogout={vi.fn()}><Draft /></MfaGate>)
    await screen.findByLabelText('Codice dell’autenticatore')
    await act(async () => old.resolve(elevatedStatus))
    expect(screen.queryByLabelText('Bozza')).toBeNull()
    expect(screen.getByLabelText('Codice dell’autenticatore')).toBeTruthy()
  })
  it('does not let late verification overwrite a newer successful token check', async () => {
    const verification = deferred<void>()
    const status = vi.fn().mockResolvedValueOnce(protectedStatus).mockResolvedValue(elevatedStatus)
    const security = api({ status, verify: () => verification.promise })
    const view = render(<MfaGate api={security} sessionToken="old" onLogout={vi.fn()}><Draft /></MfaGate>)
    fireEvent.change(await screen.findByLabelText('Codice dell’autenticatore'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verifica e accedi' }))
    view.rerender(<MfaGate api={security} sessionToken="new" onLogout={vi.fn()}><Draft /></MfaGate>)
    await screen.findByRole('textbox', { name: 'Bozza' })
    await act(async () => verification.resolve())
    expect(screen.getByRole('textbox', { name: 'Bozza' })).toBeTruthy()
    expect(screen.queryByText('Verifica della sicurezza dell’accesso…')).toBeNull()
  })
  it('resets draft state for a different user identity', async () => {
    const security = api({ status: vi.fn().mockResolvedValue(elevatedStatus) })
    const view = render(<MfaGate key="alice" api={security} sessionToken="alice" onLogout={vi.fn()}><Draft /></MfaGate>)
    fireEvent.change(await screen.findByLabelText('Bozza'), { target: { value: 'Privato Alice' } })
    view.rerender(<MfaGate key="bob" api={security} sessionToken="bob" onLogout={vi.fn()}><Draft /></MfaGate>)
    expect((await screen.findByRole('textbox', { name: 'Bozza' }) as HTMLInputElement).value).toBe('')
  })
  it('does not reuse approval from another security client, even with an identical token', async () => {
    const first = api({ status: vi.fn().mockResolvedValue(elevatedStatus) })
    const pending = deferred<typeof protectedStatus>()
    const second = api({ status: () => pending.promise })
    const view = render(<MfaGate api={first} sessionToken="token" onLogout={vi.fn()}><Draft /></MfaGate>)
    await screen.findByLabelText('Bozza')
    view.rerender(<MfaGate api={second} sessionToken="token" onLogout={vi.fn()}><Draft /></MfaGate>)
    expect(screen.queryByLabelText('Bozza')).toBeNull()
    await act(async () => pending.resolve(protectedStatus))
    expect(screen.queryByLabelText('Bozza')).toBeNull()
    expect(screen.getByLabelText('Codice dell’autenticatore')).toBeTruthy()
  })
})
