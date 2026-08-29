export type InvitationKind = 'family' | 'contact'
export type InvitationAccountState = 'existing-account' | 'pending-account' | 'new-account'

export type InvitationAuthPlan = {
  redirectTo: string
  accountState: InvitationAccountState
  delivery: 'magic-link' | 'invite'
}

export function invitationAuthPlan(
  appUrl: string,
  token: string,
  kind: InvitationKind,
  accountState: InvitationAccountState,
): InvitationAuthPlan {
  const redirect = new URL(appUrl)
  redirect.pathname = redirect.pathname.replace(/\/$/, '') || '/'
  redirect.search = ''
  redirect.hash = ''
  redirect.searchParams.set(kind === 'family' ? 'invite' : 'contactInvite', token)

  if (accountState !== 'existing-account') redirect.searchParams.set('setup', 'password')

  return {
    redirectTo: redirect.toString(),
    accountState,
    delivery: accountState === 'new-account' ? 'invite' : 'magic-link',
  }
}
