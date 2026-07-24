import {
  Check, ChevronRight, KeyRound, Landmark, Mail, Plus, ShieldCheck, UserRoundCog, UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import type { FamilySession } from './CloudAccess'
import type { User } from '../types'

interface Props {
  user: User
  cloud?: FamilySession
}

export function AccountSettings({ user, cloud }: Props) {
  if (!cloud) {
    return <div className="page account-settings-page">
      <PageHeading />
      <section className="settings-card">
        <UserRoundCog />
        <div><h2>{user.name}</h2><p>La gestione dell’account è disponibile quando l’app è collegata al servizio cloud.</p></div>
      </section>
    </div>
  }

  return <div className="page account-settings-page">
    <PageHeading />
    <section className="settings-profile">
      <span className="avatar avatar--large">{user.initials}</span>
      <div><span className="eyebrow">Profilo personale</span><h2>{user.name}</h2><p>{user.email}</p></div>
    </section>
    <div className="settings-layout">
      <div className="settings-column">
        <FamilySwitcher cloud={cloud} />
        <SecuritySettings cloud={cloud} />
      </div>
      <div className="settings-column">
        {cloud.role === 'admin' ? <FamilyAdministration cloud={cloud} /> : <MemberFamilyCard cloud={cloud} />}
        <CreateFamily cloud={cloud} />
      </div>
    </div>
  </div>
}

function PageHeading() {
  return <div className="page-heading">
    <div><h1>Account e famiglie</h1><p>Gestisci accesso, appartenenze e membri della famiglia attiva.</p></div>
  </div>
}

function FamilySwitcher({ cloud }: { cloud: FamilySession }) {
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const select = async (familyId: string) => {
    if (familyId === cloud.familyId) return
    setBusyId(familyId); setError('')
    try { await cloud.switchFamily(familyId) } catch (reason) { setError(errorText(reason)) }
    finally { setBusyId('') }
  }

  return <section className="settings-card">
    <div className="settings-card__heading"><span><UsersRound /></span><div><h2>Le tue famiglie</h2><p>Scegli lo spazio sul quale vuoi lavorare.</p></div></div>
    <div className="family-switcher">
      {cloud.families.map((family) => <button
        type="button"
        key={family.id}
        className={family.id === cloud.familyId ? 'family-choice family-choice--active' : 'family-choice'}
        onClick={() => void select(family.id)}
        disabled={Boolean(busyId)}
      >
        <span><strong>{family.name}</strong><small>{family.role === 'admin' ? 'Amministratore' : 'Membro'}</small></span>
        {family.id === cloud.familyId ? <Check /> : <ChevronRight className={busyId === family.id ? 'spin' : ''} />}
      </button>)}
    </div>
    {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
  </section>
}

function SecuritySettings({ cloud }: { cloud: FamilySession }) {
  const [email, setEmail] = useState(cloud.user.email)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState<'email' | 'password' | ''>('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const changeEmail = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy('email'); setError(''); setMessage('')
    try {
      await cloud.updateEmail(email)
      setMessage('Controlla entrambe le caselle email per confermare il nuovo indirizzo.')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy('') }
  }

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setMessage('')
    if (password !== confirmation) { setError('Le password non coincidono.'); return }
    setBusy('password')
    try {
      await cloud.updatePassword(password)
      setPassword(''); setConfirmation(''); setMessage('Password aggiornata.')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy('') }
  }

  return <section className="settings-card">
    <div className="settings-card__heading"><span><ShieldCheck /></span><div><h2>Accesso e sicurezza</h2><p>Aggiorna le credenziali del tuo account.</p></div></div>
    <form className="settings-form" onSubmit={changeEmail}>
      <label>Nuova email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label>
      <button className="button button--secondary" disabled={Boolean(busy) || email.trim().toLowerCase() === cloud.user.email.toLowerCase()}><Mail /> Cambia email</button>
    </form>
    <form className="settings-form settings-form--password" onSubmit={changePassword}>
      <label>Nuova password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <label>Conferma password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
      <button className="button button--secondary" disabled={Boolean(busy)}><KeyRound /> Aggiorna password</button>
    </form>
    {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    {message ? <p className="form-message form-message--success" role="status">{message}</p> : null}
  </section>
}

function FamilyAdministration({ cloud }: { cloud: FamilySession }) {
  const [name, setName] = useState(cloud.familyName)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'name' | 'invite' | ''>('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const rename = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy('name'); setError(''); setMessage('')
    try { await cloud.renameFamily(name); setMessage('Nome della famiglia aggiornato.') }
    catch (reason) { setError(errorText(reason)) }
    finally { setBusy('') }
  }

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy('invite'); setError(''); setMessage('')
    try {
      await cloud.inviteMember(email)
      setMessage(`Invito inviato a ${email.trim().toLowerCase()}.`); setEmail('')
    } catch (reason) { setError(errorText(reason)) }
    finally { setBusy('') }
  }

  return <section className="settings-card">
    <div className="settings-card__heading"><span><UsersRound /></span><div><h2>Amministra {cloud.familyName}</h2><p>Il tuo ruolo in questa famiglia è amministratore.</p></div></div>
    <div className="family-member-list" aria-label={`${cloud.members.length} membri`}>
      {cloud.members.map((member) => <span key={member.id}><i className="avatar">{member.initials}</i><span><strong>{member.name}</strong><small>{member.email}</small></span></span>)}
    </div>
    <form className="settings-form" onSubmit={rename}>
      <label>Nome della famiglia<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required /></label>
      <button className="button button--secondary" disabled={Boolean(busy) || name.trim() === cloud.familyName}>Salva nome</button>
    </form>
    <form className="settings-form" onSubmit={invite}>
      <label>Email del nuovo membro<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@email.it" required /></label>
      <button className="button button--primary" disabled={Boolean(busy)}><Mail /> Invia invito</button>
    </form>
    {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    {message ? <p className="form-message form-message--success" role="status">{message}</p> : null}
  </section>
}

function MemberFamilyCard({ cloud }: { cloud: FamilySession }) {
  return <section className="settings-card">
    <div className="settings-card__heading"><span><UsersRound /></span><div><h2>{cloud.familyName}</h2><p>In questa famiglia partecipi come membro.</p></div></div>
    <p className="settings-card__note">Solo un amministratore di questa famiglia può cambiarne il nome o invitare nuovi membri.</p>
  </section>
}

function CreateFamily({ cloud }: { cloud: FamilySession }) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [withAccount, setWithAccount] = useState(false)
  const [accountName, setAccountName] = useState('Conto famiglia')
  const [institution, setInstitution] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await cloud.createFamily({
        name,
        withAccount,
        accountName,
        institution,
        openingBalance: Number(openingBalance.replace(',', '.')) || 0,
      })
    } catch (reason) { setError(errorText(reason)); setBusy(false) }
  }

  return <section className="settings-card settings-card--create">
    <button type="button" className="settings-card__heading settings-card__toggle" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span><Plus /></span><div><h2>Crea un’altra famiglia</h2><p>Ne diventerai automaticamente amministratore.</p></div><ChevronRight className={expanded ? 'rotate-90' : ''} />
    </button>
    {expanded ? <form className="settings-create-form" onSubmit={submit}>
      <label>Nome della nuova famiglia<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} required /></label>
      <label className="inline-choice"><input type="checkbox" checked={withAccount} onChange={(event) => setWithAccount(event.target.checked)} /><span><strong>Aggiungi un conto condiviso</strong><small>Facoltativo, potrai crearlo anche in seguito.</small></span></label>
      {withAccount ? <div className="settings-create-account">
        <Landmark />
        <label>Nome conto<input value={accountName} onChange={(event) => setAccountName(event.target.value)} required /></label>
        <label>Banca o descrizione<input value={institution} onChange={(event) => setInstitution(event.target.value)} /></label>
        <label>Saldo iniziale<input value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} inputMode="decimal" /></label>
      </div> : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      <button className="button button--primary" disabled={busy}><Plus /> Crea e apri famiglia</button>
    </form> : null}
  </section>
}

function errorText(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Operazione non riuscita. Riprova.'
}
