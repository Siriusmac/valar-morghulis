// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { afterEach, vi } from 'vitest'
import { CloudLogin, ContactInvitationDecision, InvitationDecision, InvitationPasswordSetup } from './CloudAccess'
import { functionErrorMessage, invitationInvokeError } from '../lib/functionErrors'

const { resetPasswordForEmail, rpc, signInWithPassword, signInWithPasskey, signUp, updateUser, securityFlags } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(), rpc: vi.fn(), signInWithPassword: vi.fn(), signInWithPasskey: vi.fn(), signUp: vi.fn(), updateUser: vi.fn(), securityFlags: { passkeys: false },
}))
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ rpc, auth: { resetPasswordForEmail, signInWithPassword, signInWithPasskey, signUp, updateUser } }) }))
vi.mock('../lib/authSecurity', async (importOriginal) => ({ ...await importOriginal<typeof import('../lib/authSecurity')>(), get passkeysEnabled() { return securityFlags.passkeys } }))

afterEach(() => {
  cleanup()
  rpc.mockReset()
  resetPasswordForEmail.mockReset()
  signInWithPassword.mockReset()
  signUp.mockReset()
  updateUser.mockReset()
  signInWithPasskey.mockReset()
  securityFlags.passkeys = false
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

describe('functionErrorMessage', () => {
  it('reads the structured PostgREST errors returned by Supabase RPC calls', () => {
    expect(functionErrorMessage({
      code: 'P0001',
      message: 'reimbursement_accounts_required',
      details: 'The originating account is missing',
    })).toBe('reimbursement_accounts_required · The originating account is missing · P0001')
  })
})

describe('InvitationDecision', () => {
  it('waits for administrator approval without granting or selecting a family', async () => {
    const onResolved = vi.fn()
    rpc.mockResolvedValue({ data: null, error: null })
    render(<InvitationDecision token="pending-token" onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accetta invito' }))
    await screen.findByText('In attesa dell’amministratore')
    expect(onResolved).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continua nel tuo spazio' }))
    expect(onResolved).toHaveBeenCalledWith(null)
  })

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

describe('ContactInvitationDecision', () => {
  it('accepts a circle invitation without calling any family RPC', async () => {
    const onResolved = vi.fn()
    rpc.mockResolvedValue({ data: 'inviter', error: null })
    render(<ContactInvitationDecision token="contact-token" onResolved={onResolved} />)
    fireEvent.click(screen.getByRole('button', { name: 'Accetta invito' }))
    await waitFor(() => expect(onResolved).toHaveBeenCalledOnce())
    expect(rpc.mock.calls).toEqual([['accept_contact_invitation', { invitation_token: 'contact-token' }]])
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
  it('requests a dedicated recovery redirect without revealing whether an account exists', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null })
    render(<CloudLogin />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'collaudo@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    fireEvent.click(screen.getByRole('button', { name: 'Password dimenticata?' }))
    await screen.findByRole('status')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('collaudo@example.invalid', { redirectTo: `${window.location.origin}/?recovery=password` })
    expect(screen.getByRole('status').textContent).toContain('Se l’indirizzo è associato a un account')
  })
  it('handles a failed recovery request without a false success notice', async () => {
    resetPasswordForEmail.mockRejectedValue(new Error('offline'))
    render(<CloudLogin />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'collaudo@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    fireEvent.click(screen.getByRole('button', { name: 'Password dimenticata?' }))
    await screen.findByRole('alert')
    expect(screen.queryByRole('status')).toBeNull()
    expect((screen.getByRole('button', { name: 'Password dimenticata?' }) as HTMLButtonElement).disabled).toBe(false)
  })
  it('focuses a prominent passkey error and offers the email fallback without submitting it', async () => {
    securityFlags.passkeys = true
    signInWithPasskey.mockResolvedValue({ error: new Error('cancelled') })
    render(<CloudLogin />)
    fireEvent.click(screen.getByRole('button', { name: 'Accedi con passkey' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Passkey: accesso non completato')
    expect(document.activeElement).toBe(alert)
    expect(alert.compareDocumentPosition(screen.getByLabelText('Email')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continua con email e password' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Email'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('preserves the selected email and returns focus to password after a passkey failure', async () => {
    securityFlags.passkeys = true
    signInWithPasskey.mockRejectedValue(new Error('unsupported'))
    render(<CloudLogin />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'collaudo@example.invalid' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    fireEvent.click(screen.getByRole('button', { name: 'Accedi con passkey' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Continua con email e password' }))
    expect(document.activeElement).toBe(screen.getByLabelText('Password'))
    expect(screen.getByText('collaudo@example.invalid')).toBeTruthy()
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('clears the passkey notice when switching to registration', async () => {
    securityFlags.passkeys = true
    signInWithPasskey.mockResolvedValue({ error: new Error('cancelled') })
    render(<CloudLogin />)
    fireEvent.click(screen.getByRole('button', { name: 'Accedi con passkey' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('tab', { name: 'Registrati' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Accedi con passkey' })).toBeNull()
  })

  it('mostra email e password in due passaggi separati durante l’accesso', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    render(<CloudLogin />)

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.queryByLabelText('Password')).toBeNull()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'simone@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))

    const passwordField = screen.getByLabelText('Password')
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.getByText('simone@example.com')).toBeTruthy()
    expect(document.activeElement).toBe(passwordField)
    expect(signInWithPassword).not.toHaveBeenCalled()

    fireEvent.change(passwordField, { target: { value: 'password-sicura' } })
    fireEvent.click(screen.getByRole('button', { name: 'Accedi' }))
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({ email: 'simone@example.com', password: 'password-sicura' }))
  })

  it('permette di tornare alla modifica dell’email', () => {
    render(<CloudLogin />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'simone@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continua' }))
    fireEvent.click(screen.getByRole('button', { name: 'Modifica email' }))

    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('simone@example.com')
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

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
