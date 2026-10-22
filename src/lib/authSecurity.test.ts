import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createAuthSecurityApi } from './authSecurity'

function setup({ level = 'aal1', verified = false, error = false } = {}) {
  const factor = { id: 'factor', status: verified ? 'verified' : 'unverified', friendly_name: 'Telefono' }
  const mfa = {
    getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: level, nextLevel: verified ? 'aal2' : 'aal1' }, error: error ? new Error('offline') : null }),
    listFactors: vi.fn().mockResolvedValue({ data: { all: [factor], totp: [factor] }, error: null }),
    challengeAndVerify: vi.fn().mockResolvedValue({ error: null }),
  }
  const security = createAuthSecurityApi({ auth: { mfa } } as unknown as SupabaseClient)
  return { mfa, security }
}
describe('auth security adapter', () => {
  it('does not require MFA for an unverified enrollment', async () => {
    expect(await setup().security.status()).toEqual({ currentLevel: 'aal1', needsChallenge: false, factors: [] })
  })
  it('requires MFA for verified factors even when enrollment flag is disabled', async () => {
    expect((await setup({ verified: true }).security.status()).needsChallenge).toBe(true)
  })
  it('accepts confirmed elevated assurance', async () => {
    expect((await setup({ verified: true, level: 'aal2' }).security.status()).needsChallenge).toBe(false)
  })
  it('rejects provider failures and unknown assurance', async () => {
    await expect(setup({ error: true }).security.status()).rejects.toThrow()
    await expect(setup({ level: 'unknown' }).security.status()).rejects.toThrow()
  })
  it('rejects malformed codes without calling the provider', async () => {
    const { security, mfa } = setup()
    await expect(security.verify('factor', '12345')).rejects.toThrow()
    expect(mfa.challengeAndVerify).not.toHaveBeenCalled()
    await security.verify('factor', '123456')
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor', code: '123456' })
  })
})
