import {
  ArrowRight, Check, Copy, Landmark, LoaderCircle, LockKeyhole, Mail, Plus, UserCheck, UserX, UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Brand } from '../components/Brand'
import { buildCloudPersistence, mergeCloudPersistence, mergePrivateCloudData, type SharedRecord } from '../lib/cloudData'
import type { AccountExportData } from '../lib/exportData'
import { invitationInvokeError } from '../lib/functionErrors'
import { reconcilePurchaseReimbursementMovements } from '../lib/commissioned'
import { reconcileConfirmedLoanPurchases } from '../lib/loans'
import { createPersonalStarterData, createStarterData } from '../lib/seed'
import { getSupabase } from '../lib/supabase'
import type { Account, AppData, Loan, LoanRepayment, ReimbursementAccountReference, ReimbursementChangeRequest, User } from '../types'

export const PERSONAL_WORKSPACE_ID = 'personal'

export interface FamilySession {
  familyId: string
  familyName: string
  role: 'admin' | 'member'
  personalMode: boolean
  families: FamilyOption[]
  user: User
  members: User[]
  invitations: FamilyInvitation[]
  sharedAccounts: Account[]
  reimbursementAccountReferences: ReimbursementAccountReference[]
  platformAdminUsers?: PlatformAdminUserOverview[]
  switchFamily: (familyId: string) => Promise<void>
  createFamily: (input: CreateFamilyInput) => Promise<void>
  renameFamily: (name: string) => Promise<void>
  inviteMember: (email: string) => Promise<void>
  withdrawInvitation: (invitationId: string) => Promise<void>
  deleteInvitation: (invitationId: string) => Promise<void>
  deleteFamily: (preserveAuthoredData: boolean) => Promise<void>
  updateProfileName: (firstName: string, lastName: string) => Promise<void>
  updateEmail: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  exportAccountData: () => Promise<AccountExportData>
  deleteAccount: () => Promise<void>
  loadAppData: () => Promise<Partial<AppData> | null>
  saveAppData: (data: AppData, mutationId?: string) => Promise<void>
  deleteSharedDirectory?: (recordType: 'category' | 'beneficiary' | 'sender', recordId: string, replacementId?: string) => Promise<void>
  subscribeToSharedData?: (onChange: () => void, onStatus?: (status: string, error?: unknown) => void) => () => void
  createSharedAccount: (account: Account, familyId: string) => Promise<void>
  updateSharedAccount: (account: Account) => Promise<void>
  setReimbursementAccountFamilies: (account: Account, familyIds: string[]) => Promise<void>
  respondToReimbursement: (reimbursementId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  createLoan: (loan: Loan) => Promise<void>
  respondToLoan: (loanId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
  createLoanRepayment: (repayment: LoanRepayment) => Promise<void>
  respondToLoanRepayment: (repaymentId: string, accepted: boolean, selectedAccountId?: string, selectedCategoryId?: string, recipientMovementId?: string) => Promise<void>
  requestReimbursementChange: (reimbursementId: string, change: { kind: 'update' | 'delete'; amount?: number; date?: string; selectedAccountId?: string }) => Promise<void>
  respondToReimbursementChange: (requestId: string, accepted: boolean) => Promise<void>
  withdrawReimbursementChange: (requestId: string) => Promise<void>
  signOut: () => Promise<void>
}

export interface PlatformAdminUserOverview {
  id: string
  name: string
  email: string
  createdAt: string
  emailConfirmedAt?: string
  lastSignInAt?: string
  lastSeenAt?: string
  lastActivityAt?: string
  familyCount: number
}

export interface FamilyOption {
  id: string
  name: string
  role: 'admin' | 'member'
}

export interface FamilyInvitation {
  id: string
  email: string
  status: 'pending' | 'expired' | 'declined'
  createdAt: string
  expiresAt: string
}

export interface CreateFamilyInput {
  name: string
  withAccount: boolean
  accountName: string
  institution: string
  openingBalance: number
}

export function CloudAccess({ children }: { children: (context: FamilySession) => ReactNode }) {
  const supabase = getSupabase()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => data.subscription.unsubscribe()
  }, [supabase])

  if (loading) return <AccessLoading label="Prepariamo il tuo spazio" />
  if (!session) return <CloudLogin />
  return <FamilyBootstrap session={session}>{children}</FamilyBootstrap>
}

export function CloudLogin() {
  const supabase = getSupabase()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectMode = (nextMode: 'login' | 'signup') => {
    setMode(nextMode)
    setError('')
    setMessage('')
  }

  const navigateTabs = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextMode = event.key === 'Home' ? 'login'
      : event.key === 'End' ? 'signup'
        : mode === 'login' ? 'signup' : 'login'
    selectMode(nextMode)
    document.getElementById(`auth-tab-${nextMode}`)?.focus()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    if (mode === 'signup') {
      const fullName = `${firstName.trim()} ${lastName.trim()}`
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { first_name: firstName.trim(), last_name: lastName.trim(), full_name: fullName },
          emailRedirectTo: window.location.href,
        },
      })
      if (!authError && !data.session) setMessage('Controlla la tua email per confermare l’iscrizione.')
      if (authError) setError(authMessage(authError.message))
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) setError(authMessage(authError.message))
    }
    setBusy(false)
  }

  const resetPassword = async () => {
    if (!email.trim()) { setError('Inserisci prima il tuo indirizzo email.'); return }
    setBusy(true); setError('')
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    setBusy(false)
    if (authError) setError(authMessage(authError.message))
    else setMessage('Ti abbiamo inviato le istruzioni per reimpostare la password.')
  }

  return <AccessLayout>
    <div className="login-card cloud-login-card">
      <span className="eyebrow">{mode === 'signup' ? 'Nuova famiglia' : 'Area riservata'}</span>
      <h2>{mode === 'signup' ? 'Crea il tuo account' : 'Bentornato'}</h2>
      <p>{mode === 'signup' ? 'Inizia dal tuo profilo personale. La famiglia viene creata al passo successivo.' : 'Accedi al tuo spazio familiare.'}</p>
      <div className="auth-switch" role="tablist" aria-label="Accesso">
        <button id="auth-tab-login" type="button" role="tab" aria-selected={mode === 'login'} aria-controls="auth-panel-login" tabIndex={mode === 'login' ? 0 : -1} className={mode === 'login' ? 'active' : ''} onKeyDown={navigateTabs} onClick={() => selectMode('login')}>Accedi</button>
        <button id="auth-tab-signup" type="button" role="tab" aria-selected={mode === 'signup'} aria-controls="auth-panel-signup" tabIndex={mode === 'signup' ? 0 : -1} className={mode === 'signup' ? 'active' : ''} onKeyDown={navigateTabs} onClick={() => selectMode('signup')}>Registrati</button>
      </div>
      <div id={`auth-panel-${mode}`} role="tabpanel" aria-labelledby={`auth-tab-${mode}`}>
      <form onSubmit={submit}>
        {mode === 'signup' ? <>
          <label>Nome<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" maxLength={60} required /></label>
          <label>Cognome<input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" maxLength={60} required /></label>
        </> : null}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /></label>
        {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        {message ? <p className="form-message form-message--success" role="status">{message}</p> : null}
        <button className="button button--primary button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : null}{mode === 'signup' ? 'Continua' : 'Accedi'} <ArrowRight /></button>
      </form>
      {mode === 'login' ? <button type="button" className="text-button auth-recovery" onClick={resetPassword}>Password dimenticata?</button> : null}
      </div>
      <small className="privacy-note"><LockKeyhole /> I dati personali sono protetti e non sono visibili agli altri utenti. Gli accessi tecnici eccezionali sono limitati a sicurezza e assistenza.</small>
    </div>
  </AccessLayout>
}

function FamilyBootstrap({ session, children }: { session: Session; children: (context: FamilySession) => ReactNode }) {
  const supabase = getSupabase()
  const searchParams = new URLSearchParams(window.location.search)
  const inviteToken = searchParams.get('invite')
  const contactInviteToken = searchParams.get('contactInvite')
  const needsPasswordSetup = searchParams.get('setup') === 'password'
  const [passwordReady, setPasswordReady] = useState(!needsPasswordSetup)
  const [familyInvitationResolved, setFamilyInvitationResolved] = useState(!inviteToken)
  const [contactInvitationResolved, setContactInvitationResolved] = useState(!contactInviteToken)
  const [snapshot, setSnapshot] = useState<FamilySnapshot | null>(null)
  const [loading, setLoading] = useState(!needsPasswordSetup && !inviteToken && !contactInviteToken)
  const [error, setError] = useState('')
  const [dataRevisions] = useState(() => new Map<string, { personalRevision: number; familyRevision: number }>())

  const load = useCallback(async (preferredFamilyId?: string) => {
    setLoading(true); setError('')
    const activityPromise = supabase.rpc('record_user_activity')
    const platformAdminUsersPromise = loadPlatformAdminUsers(supabase)
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, first_name, last_name, full_name, email, onboarding_completed').eq('id', session.user.id).single()
    if (profileError) { setError(profileError.message); setLoading(false); return }

    const { data: memberships, error: membershipError } = await supabase
      .from('family_members')
      .select('family_id, role')
      .eq('user_id', session.user.id)
    if (membershipError) { setError(membershipError.message); setLoading(false); return }
    const familyIds = memberships.map((item) => item.family_id)
    const [platformAdminUsers] = await Promise.all([platformAdminUsersPromise, activityPromise])
    const [familiesResult, reimbursementAccountsResult] = familyIds.length ? await Promise.all([
      supabase.from('families').select('id, name, onboarding_completed').in('id', familyIds),
      supabase.from('family_reimbursement_accounts')
        .select('family_id, owner_id, account_id, display_name')
        .in('family_id', familyIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }]
    if (familiesResult.error || reimbursementAccountsResult.error) {
      setError(familiesResult.error?.message ?? reimbursementAccountsResult.error?.message ?? 'Errore di caricamento')
      setLoading(false); return
    }
    const familyRows = familiesResult.data ?? []
    const familyById = new Map(familyRows.map((family) => [family.id, family]))
    const families: FamilyOption[] = memberships.flatMap((membership) => {
      const family = familyById.get(membership.family_id)
      return family ? [{ id: family.id, name: family.name, role: membership.role as FamilyOption['role'] }] : []
    }).toSorted((a, b) => a.name.localeCompare(b.name, 'it'))
    const storedFamilyId = localStorage.getItem(activeFamilyKey(session.user.id)) ?? undefined
    const requestedWorkspace = preferredFamilyId ?? storedFamilyId
    const activeFamilyId = requestedWorkspace === PERSONAL_WORKSPACE_ID
      ? undefined
      : [requestedWorkspace].find((candidate) => candidate && familyIds.includes(candidate)) ?? families[0]?.id
    if (!activeFamilyId) {
      localStorage.setItem(activeFamilyKey(session.user.id), PERSONAL_WORKSPACE_ID)
      setSnapshot({
        profile: toUser(profile),
        onboardingCompleted: profile.onboarding_completed,
        membership: null,
        family: null,
        families,
        members: [toUser(profile)],
        invitations: [],
        accounts: [],
        reimbursementAccountReferences: reimbursementAccountsResult.data.map((account) => ({
          familyId: account.family_id,
          ownerId: account.owner_id,
          accountId: account.account_id,
          name: account.display_name,
        })),
        platformAdminUsers,
      })
      setLoading(false); return
    }
    const membership = memberships.find((item) => item.family_id === activeFamilyId)!
    const activeFamily = familyById.get(activeFamilyId)!
    localStorage.setItem(activeFamilyKey(session.user.id), activeFamilyId)

    const [membershipsResult, accountsResult, invitationsResult] = await Promise.all([
      supabase.from('family_members').select('user_id, role').eq('family_id', activeFamilyId),
      supabase.from('accounts').select('id, name, institution, account_type, opening_balance, opening_balance_date').eq('family_id', activeFamilyId).eq('scope', 'family'),
      membership.role === 'admin'
        ? supabase.from('family_invitations').select('id, email, created_at, expires_at, accepted_at, declined_at').eq('family_id', activeFamilyId)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (membershipsResult.error || accountsResult.error || invitationsResult.error) {
      setError(membershipsResult.error?.message ?? accountsResult.error?.message ?? invitationsResult.error?.message ?? 'Errore di caricamento')
      setLoading(false); return
    }
    const memberIds = membershipsResult.data.map((item) => item.user_id)
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', memberIds)
    if (profilesError) { setError(profilesError.message); setLoading(false); return }
    setSnapshot({
      profile: toUser(profile),
      onboardingCompleted: profile.onboarding_completed,
      membership,
      family: activeFamily,
      families,
      members: profiles.map(toUser),
      invitations: invitationsResult.data
        .filter((invitation) => !invitation.accepted_at)
        .map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          status: invitation.declined_at
            ? 'declined' as const
            : new Date(invitation.expires_at).getTime() <= Date.now() ? 'expired' as const : 'pending' as const,
          createdAt: invitation.created_at,
          expiresAt: invitation.expires_at,
        })),
      accounts: accountsResult.data.map((account) => ({
        id: account.id,
        name: account.name,
        institution: account.institution,
        type: account.account_type as Account['type'],
        scope: 'family' as const,
        openingBalance: Number(account.opening_balance),
        openingBalanceDate: account.opening_balance_date,
      })),
      reimbursementAccountReferences: reimbursementAccountsResult.data.map((account) => ({
        familyId: account.family_id,
        ownerId: account.owner_id,
        accountId: account.account_id,
        name: account.display_name,
      })),
      platformAdminUsers,
    })
    setLoading(false)
  }, [session.user.id, supabase])

  // Ricarica profilo, famiglia e conti soltanto dopo l'eventuale scelta sull'invito.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (passwordReady && familyInvitationResolved && contactInvitationResolved) void load() }, [contactInvitationResolved, familyInvitationResolved, load, passwordReady])
  if (!passwordReady) return <InvitationPasswordSetup onCompleted={() => {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('setup')
    window.history.replaceState({}, '', nextUrl)
    setPasswordReady(true)
  }} />
  if (inviteToken && !familyInvitationResolved) return <InvitationDecision
    token={inviteToken}
    onResolved={(familyId) => {
      const nextUrl = new URL(window.location.href)
      nextUrl.searchParams.delete('invite')
      nextUrl.searchParams.delete('setup')
      window.history.replaceState({}, '', nextUrl)
      localStorage.setItem(activeFamilyKey(session.user.id), familyId ?? PERSONAL_WORKSPACE_ID)
      setLoading(true)
      setFamilyInvitationResolved(true)
    }}
  />
  if (contactInviteToken && !contactInvitationResolved) return <ContactInvitationDecision token={contactInviteToken} onResolved={() => {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('contactInvite')
    nextUrl.searchParams.delete('setup')
    window.history.replaceState({}, '', nextUrl)
    setLoading(true)
    setContactInvitationResolved(true)
  }} />
  if (loading) return <AccessLoading label="Carichiamo la tua famiglia" />
  if (!snapshot) return <AccessError message={error || 'Impossibile caricare il profilo.'} onRetry={load} />
  if (!snapshot.onboardingCompleted && !snapshot.membership) return <CreateFamily
    user={snapshot.profile}
    error={error}
    onCreated={(familyId) => load(familyId)}
    onSkip={async () => {
      const { error: skipError } = await supabase.rpc('complete_personal_onboarding')
      if (skipError) throw skipError
      await load(PERSONAL_WORKSPACE_ID)
    }}
  />
  if (snapshot.family && snapshot.membership?.role === 'admin' && !snapshot.family.onboarding_completed) {
    return <InviteFamily family={snapshot.family} onCompleted={load} />
  }
  const personalMode = !snapshot.family
  const activeFamilyId = snapshot.family?.id
  const revisionKey = activeFamilyId ?? PERSONAL_WORKSPACE_ID
  return children({
    familyId: activeFamilyId ?? PERSONAL_WORKSPACE_ID,
    familyName: snapshot.family?.name ?? 'Contabilità personale',
    role: (snapshot.membership?.role ?? 'member') as FamilySession['role'],
    personalMode,
    families: snapshot.families,
    user: snapshot.profile,
    members: snapshot.members,
    invitations: snapshot.invitations,
    sharedAccounts: snapshot.accounts,
    reimbursementAccountReferences: snapshot.reimbursementAccountReferences,
    platformAdminUsers: snapshot.platformAdminUsers,
    switchFamily: async (familyId) => { await load(familyId) },
    createFamily: async (input) => {
      const { data: familyId, error: createError } = await supabase.rpc('create_family_with_optional_account', {
        family_name: input.name.trim(),
        shared_account_name: input.withAccount ? input.accountName.trim() : null,
        shared_account_institution: input.withAccount ? input.institution.trim() : null,
        shared_account_type: 'bank',
        shared_account_opening_balance: input.withAccount ? input.openingBalance : 0,
      })
      if (createError) throw createError
      await load(familyId)
    },
    renameFamily: async (name) => {
      if (!activeFamilyId) throw new Error('Seleziona prima una famiglia.')
      const { error: renameError } = await supabase
        .from('families')
        .update({ name: name.trim() })
        .eq('id', activeFamilyId)
      if (renameError) throw renameError
      await load(activeFamilyId)
    },
    inviteMember: async (email) => {
      if (!activeFamilyId) throw new Error('Seleziona prima una famiglia.')
      const { data, error: functionError } = await supabase.functions.invoke('invite-family-member', {
        body: { familyId: activeFamilyId, email: email.trim().toLowerCase() },
      })
      const inviteError = await invitationInvokeError(data, functionError)
      if (inviteError) throw new Error(onboardingMessage(inviteError))
      await load(activeFamilyId)
    },
    withdrawInvitation: async (invitationId) => {
      if (!activeFamilyId) throw new Error('Seleziona prima una famiglia.')
      const { error: withdrawError } = await supabase.rpc('withdraw_family_invitation', {
        target_invitation_id: invitationId,
      })
      if (withdrawError) throw withdrawError
      await load(activeFamilyId)
    },
    deleteInvitation: async (invitationId) => {
      if (!activeFamilyId) throw new Error('Seleziona prima una famiglia.')
      const { error: deleteError } = await supabase.rpc('delete_declined_family_invitation', {
        target_invitation_id: invitationId,
      })
      if (deleteError) throw deleteError
      await load(activeFamilyId)
    },
    deleteFamily: async (preserveAuthoredData) => {
      if (!activeFamilyId) throw new Error('Seleziona prima una famiglia.')
      const { error: deleteError } = await supabase.rpc('delete_family', {
        target_family_id: activeFamilyId,
        preserve_authored_data: preserveAuthoredData,
      })
      if (deleteError) throw deleteError
      await load(PERSONAL_WORKSPACE_ID)
    },
    updateProfileName: async (firstName, lastName) => {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      if (!firstName.trim() || !lastName.trim()) throw new Error('Inserisci nome e cognome.')
      if (fullName.length > 80) throw new Error('Nome e cognome non possono superare 80 caratteri.')
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ first_name: firstName.trim(), last_name: lastName.trim(), full_name: fullName })
        .eq('id', snapshot.profile.id)
      if (updateError) throw updateError
      await load(activeFamilyId ?? PERSONAL_WORKSPACE_ID)
    },
    updateEmail: async (email) => {
      const { error: updateError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() })
      if (updateError) throw new Error(authMessage(updateError.message))
    },
    updatePassword: async (password) => {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error(authMessage(updateError.message))
    },
    exportAccountData: async () => {
      const familyIds = snapshot.families.map((family) => family.id)
      const personalResult = await supabase.from('user_app_data').select('data').eq('user_id', snapshot.profile.id).maybeSingle()
      if (personalResult.error) throw personalResult.error
      let accountRows: Array<Record<string, unknown>> = []
      let sharedRows: Array<{ family_id: string; record_type: string; record_id: string; data: unknown }> = []
      let familyPrivateRows: Array<{ family_id: string; data: unknown }> = []
      if (familyIds.length) {
        const [accountsResult, recordsResult, privateRowsResult] = await Promise.all([
          supabase.from('accounts').select('id, family_id, name, institution, account_type, scope, opening_balance, opening_balance_date').in('family_id', familyIds).eq('scope', 'family'),
          supabase.from('family_shared_records').select('family_id, record_type, record_id, data').in('family_id', familyIds),
          supabase.from('family_user_app_data').select('family_id, data').eq('user_id', snapshot.profile.id).in('family_id', familyIds),
        ])
        if (accountsResult.error || recordsResult.error || privateRowsResult.error) throw accountsResult.error ?? recordsResult.error ?? privateRowsResult.error
        accountRows = accountsResult.data
        sharedRows = recordsResult.data
        familyPrivateRows = privateRowsResult.data
      }
      return {
        exportedAt: new Date().toISOString(),
        profile: snapshot.profile,
        personalData: personalResult.data?.data as Partial<AppData> | null,
        families: snapshot.families.map((family) => ({
          ...family,
          privateData: familyPrivateRows.find((row) => row.family_id === family.id)?.data as Partial<AppData> | undefined ?? null,
          accounts: accountRows.filter((account) => account.family_id === family.id),
          sharedRecords: sharedRows.filter((record) => record.family_id === family.id)
            .map((record) => ({ recordType: record.record_type, recordId: record.record_id, data: record.data })),
        })),
      }
    },
    deleteAccount: async () => {
      const { error: deleteError } = await supabase.rpc('delete_my_account')
      if (deleteError) throw deleteError
      await supabase.auth.signOut()
    },
    loadAppData: async () => {
      const [privateResult, familyPrivateResult] = await Promise.all([
        supabase.from('user_app_data').select('data, revision').eq('user_id', snapshot.profile.id).maybeSingle(),
        activeFamilyId ? supabase.from('family_user_app_data').select('data, revision')
          .eq('family_id', activeFamilyId).eq('user_id', snapshot.profile.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ])
      if (privateResult.error || familyPrivateResult.error) throw privateResult.error ?? familyPrivateResult.error
      dataRevisions.set(revisionKey, {
        personalRevision: Number(privateResult.data?.revision ?? 0),
        familyRevision: Number(familyPrivateResult.data?.revision ?? 0),
      })
      const [sharedResult, changeRequestsResult] = activeFamilyId ? await Promise.all([
        supabase.from('family_shared_records')
          .select('record_type, record_id, data').eq('family_id', activeFamilyId),
        supabase.from('family_reimbursement_change_requests')
          .select('id, reimbursement_id, requested_by, change_kind, proposed_amount, proposed_date, proposed_account_id, requested_at')
          .eq('family_id', activeFamilyId).eq('status', 'pending'),
      ]) : [{ data: [], error: null }, { data: [], error: null }]
      if (sharedResult.error || changeRequestsResult.error) throw sharedResult.error ?? changeRequestsResult.error
      const privateData = mergePrivateCloudData(
        privateResult.data?.data as Partial<AppData> | null,
        familyPrivateResult.data?.data as Partial<AppData> | null,
        snapshot.profile.id,
      )
      if (!privateData && !sharedResult.data.length) return null
      const merged = mergeCloudPersistence(
        privateData,
        sharedResult.data as SharedRecord[],
        personalMode ? createPersonalStarterData(snapshot.profile.id) : createStarterData(snapshot.profile.id, snapshot.accounts),
      )
      const requests = new Map((changeRequestsResult.data ?? []).map((row) => [row.reimbursement_id, {
        id: row.id,
        kind: row.change_kind,
        requestedBy: row.requested_by,
        requestedAt: row.requested_at,
        amount: row.proposed_amount === null ? undefined : Number(row.proposed_amount),
        date: row.proposed_date ?? undefined,
        selectedAccountId: row.proposed_account_id ?? undefined,
      } as ReimbursementChangeRequest]))
      return reconcileConfirmedLoanPurchases(reconcilePurchaseReimbursementMovements({
        ...merged,
        reimbursements: merged.reimbursements.map((reimbursement) => ({
          ...reimbursement,
          changeRequest: requests.get(reimbursement.id),
        })),
      }), snapshot.profile.id, snapshot.members)
    },
    saveAppData: async (appData, mutationId) => {
      const payload = buildCloudPersistence(appData, snapshot.profile.id)
      const revisions = dataRevisions.get(revisionKey) ?? { personalRevision: 0, familyRevision: 0 }
      const { data: syncResult, error: syncError } = await supabase.rpc('save_app_data_snapshot', {
        target_family_id: activeFamilyId ?? null,
        personal_snapshot: payload.privateData,
        family_snapshot: payload.familyPrivateData,
        shared_records: payload.sharedRecords,
        owned_keys: payload.ownedKeys,
        expected_personal_revision: revisions.personalRevision,
        expected_family_revision: revisions.familyRevision,
        client_mutation_id: mutationId ?? globalThis.crypto.randomUUID(),
      })
      if (syncError) throw syncError
      const nextRevisions = syncResult as { personalRevision?: number; familyRevision?: number | null } | null
      if (!nextRevisions || typeof nextRevisions.personalRevision !== 'number') throw new Error('invalid_sync_revision')
      dataRevisions.set(revisionKey, {
        personalRevision: nextRevisions.personalRevision,
        familyRevision: Number(nextRevisions.familyRevision ?? revisions.familyRevision),
      })
      if (activeFamilyId) {
        const pendingAuthoredReimbursements = appData.reimbursements.filter((reimbursement) =>
          reimbursement.authorId === snapshot.profile.id && reimbursement.status === 'pending')
        await Promise.allSettled(pendingAuthoredReimbursements.map((reimbursement) =>
          supabase.functions.invoke('notify-family-reimbursement', {
            body: { familyId: activeFamilyId, reimbursementId: reimbursement.id },
          })))
      }
    },
    deleteSharedDirectory: async (recordType, recordId, replacementId) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: deleteError } = await supabase.rpc('delete_family_directory_record', {
        target_family_id: activeFamilyId,
        target_record_type: recordType,
        target_record_id: recordId,
        replacement_record_id: replacementId ?? null,
      })
      if (deleteError) throw deleteError
    },
    subscribeToSharedData: activeFamilyId ? (onChange, onStatus) => {
      const channel = supabase
        .channel(`family-shared-data:${activeFamilyId}:${snapshot.profile.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'family_shared_records',
          filter: `family_id=eq.${activeFamilyId}`,
        }, onChange)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'family_reimbursement_change_requests',
          filter: `family_id=eq.${activeFamilyId}`,
        }, onChange)
        .subscribe((status, error) => onStatus?.(status, error))
      return () => { void supabase.removeChannel(channel) }
    } : undefined,
    createSharedAccount: async (account, familyId) => {
      if (!snapshot.families.some((family) => family.id === familyId)) {
        throw new Error('La famiglia selezionata non è disponibile.')
      }
      const { error: insertError } = await supabase.from('accounts').insert({
        id: account.id,
        family_id: familyId,
        owner_id: null,
        name: account.name,
        institution: account.institution,
        account_type: account.type,
        scope: 'family',
        opening_balance: account.openingBalance,
        opening_balance_date: account.openingBalanceDate,
        created_by: snapshot.profile.id,
      })
      if (insertError) throw insertError
      if (familyId === activeFamilyId) await load(activeFamilyId)
    },
    updateSharedAccount: async (account) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          opening_balance: account.openingBalance,
          opening_balance_date: account.openingBalanceDate,
        })
        .eq('id', account.id)
        .eq('family_id', activeFamilyId)
        .eq('scope', 'family')
      if (updateError) throw updateError
    },
    setReimbursementAccountFamilies: async (account, requestedFamilyIds) => {
      if (account.scope !== 'personal' || account.ownerId !== snapshot.profile.id) {
        throw new Error('Il conto personale non appartiene all’utente corrente.')
      }
      const allowedFamilyIds = new Set(snapshot.families.map((family) => family.id))
      const selectedFamilyIds = [...new Set(requestedFamilyIds)]
      if (selectedFamilyIds.some((familyId) => !allowedFamilyIds.has(familyId))) {
        throw new Error('Una delle famiglie selezionate non è disponibile.')
      }
      const { error: updateError } = await supabase.rpc('set_reimbursement_account_families', {
        target_account_id: account.id,
        target_display_name: account.name,
        target_family_ids: selectedFamilyIds,
      })
      if (updateError) throw updateError
      setSnapshot((current) => current ? {
        ...current,
        reimbursementAccountReferences: [
          ...current.reimbursementAccountReferences.filter((item) => item.accountId !== account.id || item.ownerId !== snapshot.profile.id),
          ...selectedFamilyIds.map((familyId) => ({
            familyId,
            ownerId: snapshot.profile.id,
            accountId: account.id,
            name: account.name,
          })),
        ],
      } : current)
    },
    respondToReimbursement: async (reimbursementId, accepted, selectedAccountId) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: responseError } = await supabase.rpc('respond_to_family_reimbursement', {
        target_family_id: activeFamilyId,
        target_reimbursement_id: reimbursementId,
        accept_reimbursement: accepted,
        selected_account_id: selectedAccountId ?? null,
      })
      if (responseError) {
        if (responseError.message.includes('reimbursement_already_resolved')) await load(activeFamilyId)
        throw responseError
      }
      await load(activeFamilyId)
    },
    createLoan: async (loan) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: createError } = await supabase.rpc('create_family_loan', {
        target_family_id: activeFamilyId,
        target_loan_id: loan.id,
        target_borrower_id: loan.borrowerId,
        target_amount: loan.amount,
        target_date: loan.date,
        target_description: loan.description,
        target_lender_account_id: loan.lenderAccountId,
      })
      if (createError) throw createError
      await load(activeFamilyId)
    },
    respondToLoan: async (loanId, accepted, selectedAccountId) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: responseError } = await supabase.rpc('respond_to_family_loan', {
        target_family_id: activeFamilyId,
        target_loan_id: loanId,
        accept_loan: accepted,
        selected_account_id: selectedAccountId ?? null,
      })
      if (responseError) throw responseError
      await load(activeFamilyId)
    },
    createLoanRepayment: async (repayment) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: createError } = await supabase.rpc('create_family_loan_repayment', {
        target_family_id: activeFamilyId,
        target_repayment_id: repayment.id,
        target_loan_id: repayment.loanId,
        target_amount: repayment.amount,
        target_date: repayment.date,
        target_description: repayment.description,
        target_method: repayment.method,
        target_from_account_id: repayment.fromAccountId ?? null,
        target_payer_movement_id: repayment.payerMovementId ?? null,
      })
      if (createError) throw createError
      await load(activeFamilyId)
    },
    respondToLoanRepayment: async (repaymentId, accepted, selectedAccountId, selectedCategoryId, recipientMovementId) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: responseError } = await supabase.rpc('respond_to_family_loan_repayment', {
        target_family_id: activeFamilyId,
        target_repayment_id: repaymentId,
        accept_repayment: accepted,
        selected_account_id: selectedAccountId ?? null,
        selected_category_id: selectedCategoryId ?? null,
        target_recipient_movement_id: recipientMovementId ?? null,
      })
      if (responseError) throw responseError
      await load(activeFamilyId)
    },
    requestReimbursementChange: async (reimbursementId, change) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: requestError } = await supabase.rpc('request_family_reimbursement_change', {
        target_family_id: activeFamilyId,
        target_reimbursement_id: reimbursementId,
        target_change_kind: change.kind,
        target_amount: change.amount ?? null,
        target_date: change.date ?? null,
        target_selected_account_id: change.selectedAccountId ?? null,
      })
      if (requestError) throw requestError
      await load(activeFamilyId)
    },
    respondToReimbursementChange: async (requestId, accepted) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: responseError } = await supabase.rpc('respond_to_family_reimbursement_change', {
        target_request_id: requestId,
        accept_change: accepted,
      })
      if (responseError) throw responseError
      await load(activeFamilyId)
    },
    withdrawReimbursementChange: async (requestId) => {
      if (!activeFamilyId) throw new Error('Nessuna famiglia selezionata.')
      const { error: withdrawError } = await supabase.rpc('withdraw_family_reimbursement_change', {
        target_request_id: requestId,
      })
      if (withdrawError) throw withdrawError
      await load(activeFamilyId)
    },
    signOut: async () => { await supabase.auth.signOut() },
  })
}

export function InvitationDecision({ token, onResolved }: {
  token: string
  onResolved: (familyId: string | null) => void
}) {
  const supabase = getSupabase()
  const [busy, setBusy] = useState<'accept' | 'decline' | ''>('')
  const [error, setError] = useState('')

  const accept = async () => {
    setBusy('accept'); setError('')
    const { data: familyId, error: acceptError } = await supabase.rpc('accept_family_invitation', {
      invitation_token: token,
    })
    if (acceptError) { setError(onboardingMessage(acceptError.message)); setBusy(''); return }
    onResolved(familyId)
  }
  const decline = async () => {
    setBusy('decline'); setError('')
    const { error: declineError } = await supabase.rpc('decline_family_invitation', {
      invitation_token: token,
    })
    if (declineError) { setError(onboardingMessage(declineError.message)); setBusy(''); return }
    onResolved(null)
  }

  return <AccessLayout compact>
    <div className="onboarding-card invitation-decision">
      <span className="onboarding-icon"><UsersRound /></span>
      <span className="eyebrow">Invito familiare</span>
      <h2>Vuoi entrare nella famiglia?</h2>
      <p>Se accetti, vedrai i conti e i movimenti condivisi. I tuoi conti e movimenti personali resteranno privati.</p>
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      <div className="invitation-decision__actions">
        <button type="button" className="button button--primary button--full" disabled={Boolean(busy)} onClick={() => void accept()}>
          {busy === 'accept' ? <LoaderCircle className="spin" /> : <UserCheck />} Accetta invito
        </button>
        <button type="button" className="button button--ghost button--full" disabled={Boolean(busy)} onClick={() => void decline()}>
          {busy === 'decline' ? <LoaderCircle className="spin" /> : <UserX />} Rifiuta invito
        </button>
      </div>
      <small>Se rifiuti, l’amministratore dovrà eliminare l’invito prima di poterne inviare uno nuovo.</small>
    </div>
  </AccessLayout>
}

function ContactInvitationDecision({ token, onResolved }: { token: string; onResolved: () => void }) {
  const supabase = getSupabase()
  const [busy, setBusy] = useState<'accept' | 'decline' | ''>('')
  const [error, setError] = useState('')
  const respond = async (accepted: boolean) => {
    setBusy(accepted ? 'accept' : 'decline'); setError('')
    const { error: responseError } = await supabase.rpc(accepted ? 'accept_contact_invitation' : 'decline_contact_invitation', {
      invitation_token: token,
    })
    if (responseError) { setError(onboardingMessage(responseError.message)); setBusy(''); return }
    onResolved()
  }
  return <AccessLayout compact><div className="onboarding-card invitation-decision">
    <span className="onboarding-icon"><UserCheck /></span><span className="eyebrow">Invito contatto</span>
    <h2>Vuoi entrare nella sua cerchia?</h2><p>Potrete inviarvi richieste per acquisti fatti l’uno per conto dell’altro. Nessuno dei due vedrà conti, saldi o altri movimenti personali.</p>
    {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    <div className="invitation-decision__actions"><button className="button button--primary button--full" type="button" disabled={Boolean(busy)} onClick={() => void respond(true)}>{busy === 'accept' ? <LoaderCircle className="spin" /> : <UserCheck />}Accetta invito</button><button className="button button--ghost button--full" type="button" disabled={Boolean(busy)} onClick={() => void respond(false)}>{busy === 'decline' ? <LoaderCircle className="spin" /> : <UserX />}Rifiuta</button></div>
  </div></AccessLayout>
}

export function InvitationPasswordSetup({ onCompleted }: { onCompleted: () => void }) {
  const supabase = getSupabase()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (password !== confirmation) { setError('Le password non coincidono.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { skey_invitation_pending: false },
    })
    setBusy(false)
    if (updateError) setError(authMessage(updateError.message))
    else onCompleted()
  }

  return <AccessLayout compact>
    <div className="onboarding-card invitation-password">
      <span className="onboarding-icon"><LockKeyhole /></span>
      <span className="eyebrow">Invito personale</span>
      <h2>Scegli la tua password</h2>
      <p>Il link email ha verificato il tuo indirizzo. Imposta ora la password che userai per i prossimi accessi.</p>
      <form className="onboarding-form" onSubmit={submit}>
        <label>Nuova password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <label>Conferma password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        <button className="button button--primary button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : null}Continua <ArrowRight /></button>
      </form>
    </div>
  </AccessLayout>
}

function CreateFamily({ user, error: initialError, onCreated, onSkip }: {
  user: User
  error: string
  onCreated: (familyId: string) => Promise<void>
  onSkip: () => Promise<void>
}) {
  const supabase = getSupabase()
  const familySuggestion = user.name.split(' ').at(-1) || user.name
  const [familyName, setFamilyName] = useState(`Famiglia ${familySuggestion}`)
  const [withAccount, setWithAccount] = useState(true)
  const [accountName, setAccountName] = useState('Conto famiglia')
  const [institution, setInstitution] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    const { data: familyId, error: rpcError } = await supabase.rpc('create_family_with_optional_account', {
      family_name: familyName.trim(),
      shared_account_name: withAccount ? accountName.trim() : null,
      shared_account_institution: withAccount ? institution.trim() : null,
      shared_account_type: 'bank',
      shared_account_opening_balance: Number(openingBalance.replace(',', '.')) || 0,
    })
    setBusy(false)
    if (rpcError) setError(onboardingMessage(rpcError.message))
    else await onCreated(familyId)
  }
  const skip = async () => {
    setBusy(true); setError('')
    try { await onSkip() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Operazione non riuscita.'); setBusy(false) }
  }

  return <AccessLayout compact>
    <div className="onboarding-card">
      <OnboardingSteps active={1} />
      <span className="onboarding-icon"><UsersRound /></span>
      <h2>Crea la tua famiglia</h2>
      <p>Questo sarà lo spazio condiviso per conti e movimenti familiari.</p>
      <form onSubmit={submit} className="onboarding-form">
        <label>Nome della famiglia<input value={familyName} onChange={(event) => setFamilyName(event.target.value)} minLength={2} required /></label>
        <button type="button" className={`account-option ${withAccount ? 'account-option--active' : ''}`} onClick={() => setWithAccount((value) => !value)}>
          <span><Landmark /></span><span><strong>Aggiungi un conto condiviso</strong><small>Facoltativo: potrai aggiungerlo anche in seguito.</small></span><i>{withAccount ? <Check /> : <Plus />}</i>
        </button>
        {withAccount ? <div className="optional-account-fields">
          <label>Nome del conto<input value={accountName} onChange={(event) => setAccountName(event.target.value)} required /></label>
          <label>Banca o descrizione<input value={institution} onChange={(event) => setInstitution(event.target.value)} placeholder="Es. Intesa Sanpaolo" /></label>
          <label>Saldo iniziale<input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} inputMode="decimal" /></label>
        </div> : null}
        {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        <button className="button button--primary button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : null}Crea famiglia <ArrowRight /></button>
      </form>
      <div className="onboarding-skip">
        <button type="button" className="button button--ghost button--full" onClick={() => void skip()} disabled={busy}>Usa solo la contabilità personale</button>
        <small>Potrai creare una famiglia dalle impostazioni in qualsiasi momento.</small>
      </div>
    </div>
  </AccessLayout>
}

function InviteFamily({ family, onCompleted }: { family: FamilyRow; onCompleted: () => Promise<void> }) {
  const supabase = getSupabase()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState<Array<{ email: string; url: string }>>([])

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    const { data, error: functionError } = await supabase.functions.invoke('invite-family-member', { body: { familyId: family.id, email } })
    setBusy(false)
    const inviteError = await invitationInvokeError(data, functionError)
    if (inviteError) { setError(onboardingMessage(inviteError)); return }
    setSent((items) => [...items, { email: email.trim().toLowerCase(), url: data.redirectTo }])
    setEmail('')
  }

  const complete = async () => {
    setBusy(true); setError('')
    const { error: rpcError } = await supabase.rpc('complete_family_onboarding', { target_family_id: family.id })
    setBusy(false)
    if (rpcError) setError(onboardingMessage(rpcError.message))
    else await onCompleted()
  }

  return <AccessLayout compact>
    <div className="onboarding-card">
      <OnboardingSteps active={2} />
      <span className="onboarding-icon"><Mail /></span>
      <h2>Invita i membri</h2>
      <p>Riceveranno un link personale e troveranno già attivi i conti condivisi di <strong>{family.name}</strong>.</p>
      <form onSubmit={invite} className="invite-form">
        <label>Email del familiare<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@email.it" required /></label>
        <button className="button button--secondary" disabled={busy}><Mail /> Invia invito</button>
      </form>
      {sent.length ? <div className="sent-invitations">
        {sent.map((item) => <div key={item.email}><span><Check /><strong>{item.email}</strong><small>Invito inviato</small></span><button type="button" className="icon-button" onClick={() => navigator.clipboard.writeText(item.url)} aria-label={`Copia link per ${item.email}`}><Copy /></button></div>)}
      </div> : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      <div className="onboarding-actions"><button type="button" className="button button--ghost" onClick={complete} disabled={busy}>Continua per ora</button><button type="button" className="button button--primary" onClick={complete} disabled={busy}>Entra nell’app <ArrowRight /></button></div>
    </div>
  </AccessLayout>
}

function AccessLayout({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <main className={`login-page access-page ${compact ? 'access-page--compact' : ''}`}>
    <section className="login-story"><Brand /><div><h1>Le spese di casa,<br />finalmente in equilibrio.</h1><p>Uno spazio privato per te e uno condiviso con la tua famiglia.</p></div><div className="login-story__foot"><UsersRound /><span>Ogni membro mantiene privati<br />i propri movimenti personali.</span></div></section>
    <section className="login-panel">{children}</section>
  </main>
}

function OnboardingSteps({ active }: { active: 1 | 2 }) {
  return <div className="onboarding-steps"><span className="done"><Check /> Account</span><i /><span className={active >= 1 ? 'done' : ''}>{active > 1 ? <Check /> : '2'} Famiglia</span><i /><span className={active === 2 ? 'done' : ''}>3 Membri</span></div>
}

function AccessLoading({ label }: { label: string }) {
  return <main className="access-status"><Brand /><LoaderCircle className="spin" /><p>{label}…</p></main>
}

function AccessError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <main className="access-status"><Brand /><LockKeyhole /><h1>Non riusciamo ad accedere</h1><p>{message}</p><button className="button button--primary" onClick={onRetry}>Riprova</button></main>
}

function toUser(profile: { id: string; first_name?: string | null; last_name?: string | null; full_name: string; email: string }): User {
  const firstName = profile.first_name?.trim() || profile.full_name.trim().split(/\s+/)[0] || ''
  const lastName = profile.last_name?.trim() || profile.full_name.trim().split(/\s+/).slice(1).join(' ')
  const name = `${firstName} ${lastName}`.trim() || profile.full_name
  const initials = [firstName, lastName].filter(Boolean).map((part) => part[0]?.toUpperCase()).join('') || 'VM'
  return { id: profile.id, name, firstName, lastName, email: profile.email, initials }
}

function authMessage(message: string) {
  if (message.includes('Invalid login credentials')) return 'Email o password non corretti.'
  if (message.includes('User already registered')) return 'Esiste già un account con questa email.'
  if (message.includes('Password should be')) return 'La password deve contenere almeno 8 caratteri.'
  return message
}

function onboardingMessage(message: string) {
  if (message.includes('user_already_in_family')) return 'Questo account appartiene già a questa famiglia.'
  if (message.includes('invalid_or_expired_invitation')) return 'Questo invito non è valido o è scaduto.'
  if (message.includes('invitation_declined_requires_removal')) return 'Questo invito è stato rifiutato. Eliminalo dall’elenco prima di invitare nuovamente la persona.'
  if (message.includes('invitation_declined') || message.includes('invitation_already_declined')) return 'Questo invito è già stato rifiutato.'
  if (message.includes('invitation_email_mismatch')) return 'Accedi con la stessa email a cui è stato inviato l’invito.'
  if (message.includes('invitation_already_pending')) return 'Esiste già un invito in attesa per questa email.'
  if (message.includes('email_delivery_failed')) return 'Non è stato possibile inviare l’email. Riprova tra poco.'
  return message
}

interface FamilyRow { id: string; name: string; onboarding_completed: boolean }
interface FamilySnapshot {
  profile: User
  onboardingCompleted: boolean
  membership: { family_id: string; role: string } | null
  family: FamilyRow | null
  families: FamilyOption[]
  members: User[]
  invitations: FamilyInvitation[]
  accounts: Account[]
  reimbursementAccountReferences: ReimbursementAccountReference[]
  platformAdminUsers?: PlatformAdminUserOverview[]
}

async function loadPlatformAdminUsers(supabase: ReturnType<typeof getSupabase>): Promise<PlatformAdminUserOverview[] | undefined> {
  const adminResult = await supabase.rpc('is_platform_admin')
  if (adminResult.error || adminResult.data !== true) return undefined
  const overviewResult = await supabase.rpc('platform_admin_user_overview')
  if (overviewResult.error || !Array.isArray(overviewResult.data)) return undefined
  return overviewResult.data.map((row) => ({
    id: row.user_id,
    name: row.full_name,
    email: row.email,
    createdAt: row.created_at,
    emailConfirmedAt: row.email_confirmed_at ?? undefined,
    lastSignInAt: row.last_sign_in_at ?? undefined,
    lastSeenAt: row.last_seen_at ?? undefined,
    lastActivityAt: row.last_activity_at ?? undefined,
    familyCount: Number(row.family_count) || 0,
  }))
}

function activeFamilyKey(userId: string) {
  return `valar-morghulis:active-family:${userId}`
}
