import { describe, expect, it } from 'vitest'
import { invitationAuthPlan } from './invitation-auth'

describe('invitationAuthPlan', () => {
  it('uses the existing account without asking for a new password', () => {
    expect(invitationAuthPlan('https://www.skeyapp.com/', 'family-token', 'family', 'existing-account')).toEqual({
      redirectTo: 'https://www.skeyapp.com/?invite=family-token',
      accountState: 'existing-account',
      delivery: 'magic-link',
    })
  })

  it('starts account setup only for a new family member', () => {
    expect(invitationAuthPlan('https://www.skeyapp.com/', 'family-token', 'family', 'new-account')).toEqual({
      redirectTo: 'https://www.skeyapp.com/?invite=family-token&setup=password',
      accountState: 'new-account',
      delivery: 'invite',
    })
  })

  it('keeps password setup on a resent invitation for a pending account', () => {
    expect(invitationAuthPlan('https://www.skeyapp.com/', 'family-token', 'family', 'pending-account')).toEqual({
      redirectTo: 'https://www.skeyapp.com/?invite=family-token&setup=password',
      accountState: 'pending-account',
      delivery: 'magic-link',
    })
  })

  it('keeps the contact invitation parameter distinct', () => {
    expect(invitationAuthPlan('https://www.skeyapp.com', 'contact-token', 'contact', 'existing-account')).toEqual({
      redirectTo: 'https://www.skeyapp.com/?contactInvite=contact-token',
      accountState: 'existing-account',
      delivery: 'magic-link',
    })
  })
})
