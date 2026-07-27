// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { afterEach, vi } from 'vitest'
import { InvitationDecision } from './CloudAccess'
import { invitationInvokeError } from '../lib/functionErrors'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', () => ({ getSupabase: () => ({ rpc }) }))

afterEach(() => {
  cleanup()
  rpc.mockReset()
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
