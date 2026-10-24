// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CloudAccess } from './CloudAccess'
const state = vi.hoisted(() => ({ session: null as unknown, listener: undefined as undefined | ((event: string, session: unknown) => void), blockMfa: false }))
vi.mock('../lib/supabase', () => ({ getSupabase: () => client }))
const client = { auth: {
  getSession: vi.fn(async () => ({ data: { session: state.session } })),
  onAuthStateChange: (listener: typeof state.listener) => { state.listener = listener; return { data: { subscription: { unsubscribe() {} } } } },
  updateUser: vi.fn(), signOut: vi.fn(),
} }
vi.mock('../lib/authSecurity', () => ({ createAuthSecurityApi: () => ({}), passkeysEnabled: false }))
vi.mock('../lib/userActivity', () => ({ observeUserActivity: () => () => {} }))
vi.mock('./MfaGate', () => ({ MfaGate: ({ children }: { children: ReactNode }) => state.blockMfa ? <p>Codice richiesto dal gate MFA</p> : <div data-testid="mfa-gate">{children}</div> }))
const session = { user: { id: 'test-user' }, access_token: 'synthetic-session' }
afterEach(() => { cleanup(); state.session = null; state.blockMfa = false; state.listener = undefined; window.history.replaceState(null, '', '/'); vi.clearAllMocks() })
describe('recovery route', () => {
  it.each(['/#error=access_denied&error_code=otp_expired', '/?error_code=otp_expired', '/?recovery=password#error=access_denied'])('explains invalid callbacks without displaying a password form: %s', async (url) => {
    window.history.replaceState(null, '', url)
    render(<CloudAccess>{() => <p>Archivio</p>}</CloudAccess>)
    await screen.findByRole('heading', { name: 'Collegamento non valido o scaduto' })
    expect(screen.queryByLabelText('Nuova password')).toBeNull()
    expect(client.auth.updateUser).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    await screen.findByRole('heading', { name: 'Bentornato' })
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('')
  })
  it('does not open a reset form for an invalid link even when another session exists', async () => {
    state.session = session
    window.history.replaceState(null, '', '/?recovery=password#error_code=otp_expired')
    render(<CloudAccess>{() => <p>Archivio</p>}</CloudAccess>)
    await screen.findByRole('heading', { name: 'Collegamento non valido o scaduto' })
    expect(screen.queryByLabelText('Nuova password')).toBeNull()
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
  it('does not show the application when a recovery URL has no valid session', async () => {
    window.history.replaceState(null, '', '/?recovery=password')
    render(<CloudAccess>{() => <p>Archivio</p>}</CloudAccess>)
    await screen.findByRole('heading', { name: 'Richiedi un nuovo collegamento' })
    expect(screen.queryByText('Archivio')).toBeNull()
    expect(screen.queryByLabelText('Nuova password')).toBeNull()
  })
  it('renders recovery instead of financial data only inside the MFA gate', async () => {
    state.session = session
    window.history.replaceState(null, '', '/?recovery=password')
    render(<CloudAccess>{() => <p>Archivio</p>}</CloudAccess>)
    await screen.findByRole('heading', { name: 'Reimposta la password' })
    expect(screen.getByTestId('mfa-gate').contains(screen.getByLabelText('Nuova password'))).toBe(true)
    expect(screen.queryByText('Archivio')).toBeNull()
  })
  it('never bypasses a required authenticator challenge for password recovery', async () => {
    state.session = session; state.blockMfa = true
    window.history.replaceState(null, '', '/?recovery=password')
    render(<CloudAccess>{() => <p>Archivio</p>}</CloudAccess>)
    await screen.findByText('Codice richiesto dal gate MFA')
    expect(screen.queryByLabelText('Nuova password')).toBeNull()
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
  it('recognizes a provider recovery event, including legacy root redirects', async () => {
    render(<CloudAccess>{() => <p>Archivio</p>}</CloudAccess>)
    await act(async () => { state.listener?.('PASSWORD_RECOVERY', session) })
    await screen.findByRole('heading', { name: 'Reimposta la password' })
    expect(window.location.search).toBe('?recovery=password')
    expect(client.auth.updateUser).not.toHaveBeenCalled()
  })
})
