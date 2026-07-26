import {
  ArrowRight, Check, Copy, Landmark, LoaderCircle, LockKeyhole, Mail, Plus, UsersRound,
} from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Brand } from '../components/Brand'
import { buildCloudPersistence, mergeCloudPersistence, type SharedRecord } from '../lib/cloudData'
import { createStarterData } from '../lib/seed'
import { getSupabase } from '../lib/supabase'
import type { Account, AppData, User } from '../types'

export interface FamilySession {
  familyId: string
  familyName: string
  role: 'admin' | 'member'
  families: FamilyOption[]
  user: User
  members: User[]
  sharedAccounts: Account[]
  switchFamily: (familyId: string) => Promise<void>
  createFamily: (input: CreateFamilyInput) => Promise<void>
  renameFamily: (name: string) => Promise<void>
  inviteMember: (email: string) => Promise<void>
  updateEmail: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  loadAppData: () => Promise<Partial<AppData> | null>
  saveAppData: (data: AppData) => Promise<void>
  subscribeToSharedData?: (onChange: () => void) => () => void
  updateSharedAccount: (account: Account) => Promise<void>
  signOut: () => Promise<void>
}

export interface FamilyOption {
  id: string
  name: string
  role: 'admin' | 'member'
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

function CloudLogin() {
  const supabase = getSupabase()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    if (mode === 'signup') {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
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
      <div className="auth-switch" role="tablist">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); setMessage('') }}>Accedi</button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); setMessage('') }}>Registrati</button>
      </div>
      <form onSubmit={submit}>
        {mode === 'signup' ? <label>Nome e cognome<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} required /></label> : null}
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} required /></label>
        {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
        {message ? <p className="form-message form-message--success" role="status">{message}</p> : null}
        <button className="button button--primary button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : null}{mode === 'signup' ? 'Continua' : 'Accedi'} <ArrowRight /></button>
      </form>
      {mode === 'login' ? <button type="button" className="text-button auth-recovery" onClick={resetPassword}>Password dimenticata?</button> : null}
      <small className="privacy-note"><LockKeyhole /> Dati personali protetti e separati da quelli familiari.</small>
    </div>
  </AccessLayout>
}

function FamilyBootstrap({ session, children }: { session: Session; children: (context: FamilySession) => ReactNode }) {
  const supabase = getSupabase()
  const searchParams = new URLSearchParams(window.location.search)
  const inviteToken = searchParams.get('invite')
  const needsPasswordSetup = searchParams.get('setup') === 'password'
  const [passwordReady, setPasswordReady] = useState(!needsPasswordSetup)
  const [snapshot, setSnapshot] = useState<FamilySnapshot | null>(null)
  const [loading, setLoading] = useState(!needsPasswordSetup)
  const [error, setError] = useState('')

  const load = useCallback(async (preferredFamilyId?: string) => {
    setLoading(true); setError('')
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id, full_name, email').eq('id', session.user.id).single()
    if (profileError) { setError(profileError.message); setLoading(false); return }

    let acceptedFamilyId: string | undefined
    if (inviteToken) {
      const { data: acceptedId, error: acceptError } = await supabase.rpc('accept_family_invitation', { invitation_token: inviteToken })
      if (acceptError) setError(onboardingMessage(acceptError.message))
      else {
        acceptedFamilyId = acceptedId
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.delete('invite')
        window.history.replaceState({}, '', nextUrl)
      }
    }

    const { data: memberships, error: membershipError } = await supabase
      .from('family_members')
      .select('family_id, role')
      .eq('user_id', session.user.id)
    if (membershipError) { setError(membershipError.message); setLoading(false); return }
    if (!memberships.length) {
      setSnapshot({ profile: toUser(profile), membership: null, family: null, families: [], members: [], accounts: [] })
      setLoading(false); return
    }

    const familyIds = memberships.map((item) => item.family_id)
    const { data: familyRows, error: familiesError } = await supabase
      .from('families')
      .select('id, name, onboarding_completed')
      .in('id', familyIds)
    if (familiesError) { setError(familiesError.message); setLoading(false); return }
    const familyById = new Map(familyRows.map((family) => [family.id, family]))
    const families: FamilyOption[] = memberships.flatMap((membership) => {
      const family = familyById.get(membership.family_id)
      return family ? [{ id: family.id, name: family.name, role: membership.role as FamilyOption['role'] }] : []
    }).toSorted((a, b) => a.name.localeCompare(b.name, 'it'))
    if (!families.length) { setError('Nessuna famiglia disponibile.'); setLoading(false); return }
    const storedFamilyId = localStorage.getItem(activeFamilyKey(session.user.id)) ?? undefined
    const activeFamilyId = [preferredFamilyId, acceptedFamilyId, storedFamilyId]
      .find((candidate) => candidate && familyIds.includes(candidate)) ?? families[0].id
    const membership = memberships.find((item) => item.family_id === activeFamilyId)!
    const activeFamily = familyById.get(activeFamilyId)!
    localStorage.setItem(activeFamilyKey(session.user.id), activeFamilyId)

    const [membershipsResult, accountsResult] = await Promise.all([
      supabase.from('family_members').select('user_id, role').eq('family_id', activeFamilyId),
      supabase.from('accounts').select('id, name, institution, account_type, opening_balance, opening_balance_date').eq('family_id', activeFamilyId).eq('scope', 'family'),
    ])
    if (membershipsResult.error || accountsResult.error) {
      setError(membershipsResult.error?.message ?? accountsResult.error?.message ?? 'Errore di caricamento')
      setLoading(false); return
    }
    const memberIds = membershipsResult.data.map((item) => item.user_id)
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name, email').in('id', memberIds)
    if (profilesError) { setError(profilesError.message); setLoading(false); return }
    setSnapshot({
      profile: toUser(profile),
      membership,
      family: activeFamily,
      families,
      members: profiles.map(toUser),
      accounts: accountsResult.data.map((account) => ({
        id: account.id,
        name: account.name,
        institution: account.institution,
        type: account.account_type as Account['type'],
        scope: 'family' as const,
        openingBalance: Number(account.opening_balance),
        openingBalanceDate: account.opening_balance_date,
      })),
    })
    setLoading(false)
  }, [inviteToken, session.user.id, supabase])

  // Ricarica profilo, famiglia e conti quando la sessione è pronta o termina la configurazione di un invito.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (passwordReady) void load() }, [load, passwordReady])
  if (!passwordReady) return <InvitationPasswordSetup onCompleted={() => {
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.delete('setup')
    window.history.replaceState({}, '', nextUrl)
    setPasswordReady(true)
  }} />
  if (loading) return <AccessLoading label="Carichiamo la tua famiglia" />
  if (!snapshot) return <AccessError message={error || 'Impossibile caricare il profilo.'} onRetry={load} />
  if (!snapshot.membership) return <CreateFamily user={snapshot.profile} error={error} onCreated={(familyId) => load(familyId)} />
  if (snapshot.family && snapshot.membership.role === 'admin' && !snapshot.family.onboarding_completed) {
    return <InviteFamily family={snapshot.family} onCompleted={load} />
  }
  if (!snapshot.family) return <AccessError message="Famiglia non disponibile." onRetry={load} />
  return children({
    familyId: snapshot.family.id,
    familyName: snapshot.family.name,
    role: snapshot.membership.role as FamilySession['role'],
    families: snapshot.families,
    user: snapshot.profile,
    members: snapshot.members,
    sharedAccounts: snapshot.accounts,
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
      const { error: renameError } = await supabase
        .from('families')
        .update({ name: name.trim() })
        .eq('id', snapshot.family!.id)
      if (renameError) throw renameError
      await load(snapshot.family!.id)
    },
    inviteMember: async (email) => {
      const { data, error: functionError } = await supabase.functions.invoke('invite-family-member', {
        body: { familyId: snapshot.family!.id, email: email.trim().toLowerCase() },
      })
      if (functionError || data?.error) throw new Error(onboardingMessage(data?.error ?? functionError?.message ?? 'Invito non inviato'))
    },
    updateEmail: async (email) => {
      const { error: updateError } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() })
      if (updateError) throw new Error(authMessage(updateError.message))
    },
    updatePassword: async (password) => {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw new Error(authMessage(updateError.message))
    },
    loadAppData: async () => {
      const [privateResult, sharedResult] = await Promise.all([
        supabase
          .from('family_user_app_data')
          .select('data')
          .eq('family_id', snapshot.family!.id)
          .eq('user_id', snapshot.profile.id)
          .maybeSingle(),
        supabase
          .from('family_shared_records')
          .select('record_type, record_id, data')
          .eq('family_id', snapshot.family!.id),
      ])
      if (privateResult.error || sharedResult.error) throw privateResult.error ?? sharedResult.error
      const privateData = privateResult.data?.data as Partial<AppData> | null
      if (!privateData && !sharedResult.data.length) return null
      return mergeCloudPersistence(
        privateData,
        sharedResult.data as SharedRecord[],
        createStarterData(snapshot.profile.id, snapshot.accounts),
      )
    },
    saveAppData: async (appData) => {
      const payload = buildCloudPersistence(appData, snapshot.profile.id)
      const [privateResult, sharedResult] = await Promise.all([
        supabase
          .from('family_user_app_data')
          .upsert({
            family_id: snapshot.family!.id,
            user_id: snapshot.profile.id,
            data: payload.privateData,
          }, { onConflict: 'family_id,user_id' }),
        supabase.rpc('sync_family_shared_records', {
          target_family_id: snapshot.family!.id,
          records: payload.sharedRecords,
          owned_keys: payload.ownedKeys,
        }),
      ])
      if (privateResult.error || sharedResult.error) throw privateResult.error ?? sharedResult.error
    },
    subscribeToSharedData: (onChange) => {
      const channel = supabase
        .channel(`family-shared-data:${snapshot.family!.id}:${snapshot.profile.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'family_shared_records',
          filter: `family_id=eq.${snapshot.family!.id}`,
        }, onChange)
        .subscribe()
      return () => { void supabase.removeChannel(channel) }
    },
    updateSharedAccount: async (account) => {
      const { error: updateError } = await supabase
        .from('accounts')
        .update({
          opening_balance: account.openingBalance,
          opening_balance_date: account.openingBalanceDate,
        })
        .eq('id', account.id)
        .eq('family_id', snapshot.family!.id)
        .eq('scope', 'family')
      if (updateError) throw updateError
    },
    signOut: async () => { await supabase.auth.signOut() },
  })
}

function InvitationPasswordSetup({ onCompleted }: { onCompleted: () => void }) {
  const supabase = getSupabase()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (password !== confirmation) { setError('Le password non coincidono.'); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
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
        <button className="button button--primary button--full" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : null}Entra nella famiglia <ArrowRight /></button>
      </form>
    </div>
  </AccessLayout>
}

function CreateFamily({ user, error: initialError, onCreated }: { user: User; error: string; onCreated: (familyId: string) => Promise<void> }) {
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
    if (functionError || data?.error) { setError(onboardingMessage(data?.error ?? functionError?.message ?? 'Invito non inviato')); return }
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

function toUser(profile: { id: string; full_name: string; email: string }): User {
  const initials = profile.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'VM'
  return { id: profile.id, name: profile.full_name, email: profile.email, initials }
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
  if (message.includes('invitation_email_mismatch')) return 'Accedi con la stessa email a cui è stato inviato l’invito.'
  if (message.includes('invitation_already_pending')) return 'Esiste già un invito in attesa per questa email.'
  if (message.includes('email_delivery_failed')) return 'Non è stato possibile inviare l’email. Riprova tra poco.'
  return message
}

interface FamilyRow { id: string; name: string; onboarding_completed: boolean }
interface FamilySnapshot {
  profile: User
  membership: { family_id: string; role: string } | null
  family: FamilyRow | null
  families: FamilyOption[]
  members: User[]
  accounts: Account[]
}

function activeFamilyKey(userId: string) {
  return `valar-morghulis:active-family:${userId}`
}
