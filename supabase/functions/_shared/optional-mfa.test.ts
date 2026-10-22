import { describe, expect, it, vi } from 'vitest'
import { userPassedOptionalMfa } from './optional-mfa'

describe('optional MFA Edge Function boundary', () => {
  it('allows only a successful current-user database check', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    expect(await userPassedOptionalMfa({ rpc })).toBe(true)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('require_optional_mfa')
  })
  it('fails closed for missing migration, insufficient assurance and network errors', async () => {
    for (const message of ['mfa_verification_required', 'function not found']) {
      expect(await userPassedOptionalMfa({ rpc: vi.fn().mockResolvedValue({ error: { message } }) })).toBe(false)
    }
    expect(await userPassedOptionalMfa({ rpc: vi.fn().mockRejectedValue(new Error('offline')) })).toBe(false)
  })
})
