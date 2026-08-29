// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { afterEach, vi } from 'vitest'
import { CloudLogin, InvitationDecision, InvitationPasswordSetup } from './CloudAccess'
import { invitationInvokeError } from '../lib/functionErrors'

const { rpc, updateUser } = vi.hoisted(() => ({ rpc: vi.fn(), updateUser: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ rpc, auth: { updateUser } }) }))

afterEach(() => {
  cleanup()
  rpc.mockReset()
  updateUser.mockReset()
})

describe('invitationInvokeError', () => {
  it('reads the structured error returned by a non-2xx Edge Function response', async () => {
    const error = {
      context: new Response(JSON.stringify({ error: 'invitation_declined_requires_removal' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }),
    }

    await expect(invitationInvokeError(null, error)).resolves.toBe('invitation_declined_requires_removal')
  })

  it('prefers an error already decoded in the response data', async () => {
    await expect(invitationInvokeError({ error: 'email_delivery_failed' }, new Error('generic')))
      .resolves.toBe('email_delivery_failed')
  })
})

describe('InvitationDecision', () => {
  it('accepts an invitation explicitly', async () => {
    const onResolved = vi.fn()
    rpc.mockResolvedValue({ data: 'family-one', error: null })
    render(<InvitationDecision token="token-one" onResolved={onResolved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Accetta invito' }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('accept_family_invitation', { invitation_token: 'token-one' }))
    expect(onResolved).toHaveBeenCalledWith('family-one')
  })

  it('records an explicit refusal', async () => {
    const onResolved = vi.fn()
    rpc.mockResolvedValue({ error: null })
    render(<InvitationDecision token="token-two" onResolved={onResolved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rifiuta invito' }))

    await waitFor(() => expect(rpc).toHaveBeenCalledWith('decline_family_invitation', { invitation_token: 'token-two' }))
    expect(onResolved).toHaveBeenCalledWith(null)
  })
})

describe('InvitationPasswordSetup', () => {
  it('completes a pending invited account after setting its password', async () => {
    const onCompleted = vi.fn()
    updateUser.mockResolvedValue({ error: null })
    render(<InvitationPasswordSetup onCompleted={onCompleted} />)

    fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: 'password-sicura' } })
    fireEvent.change(screen.getByLabelText('Conferma password'), { target: { value: 'password-sicura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({
      password: 'password-sicura',
      data: { skey_invitation_pending: false },
    }))
    expect(onCompleted).toHaveBeenCalledOnce()
  })
})

describe('CloudLogin tabs', () => {
  it('espone tablist, tab e pannello associato con lo stato selezionato', () => {
    render(<CloudLogin />)
    const loginTab = screen.getByRole('tab', { name: 'Accedi' })
    const signupTab = screen.getByRole('tab', { name: 'Registrati' })
    const panel = screen.getByRole('tabpanel')

    expect(screen.getByRole('tablist', { name: 'Accesso' })).toBeTruthy()
    expect(loginTab.getAttribute('aria-selected')).toBe('true')
    expect(loginTab.tabIndex).toBe(0)
    expect(signupTab.getAttribute('aria-selected')).toBe('false')
    expect(signupTab.tabIndex).toBe(-1)
    expect(loginTab.getAttribute('aria-controls')).toBe(panel.id)
    expect(panel.getAttribute('aria-labelledby')).toBe(loginTab.id)
  })

  it('cambia tab con le frecce e sposta il focus', () => {
    render(<CloudLogin />)
    const loginTab = screen.getByRole('tab', { name: 'Accedi' })
    loginTab.focus()
    fireEvent.keyDown(loginTab, { key: 'ArrowRight' })

    const signupTab = screen.getByRole('tab', { name: 'Registrati' })
    expect(signupTab.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(signupTab)
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(signupTab.id)

    fireEvent.keyDown(signupTab, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Accedi' }).getAttribute('aria-selected')).toBe('true')
  })

  it('mantiene un solo tab nell’ordine di focus', () => {
    render(<CloudLogin />)
    fireEvent.click(screen.getByRole('tab', { name: 'Registrati' }))
    expect(screen.getByRole('tab', { name: 'Accedi' }).tabIndex).toBe(-1)
    expect(screen.getByRole('tab', { name: 'Registrati' }).tabIndex).toBe(0)
  })
})
