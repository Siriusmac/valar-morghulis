import { useState, type FormEvent } from 'react'

export function PasswordRecovery({ updatePassword, onCompleted, onCancel }: {
  updatePassword: (password: string) => Promise<void>
  onCompleted: () => void
  onCancel: () => void
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completed, setCompleted] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setError('')
    if (password.length < 12) { setError('Usa almeno 12 caratteri per la nuova password.'); return }
    if (password !== confirmation) { setError('Le due password non coincidono.'); return }
    setBusy(true)
    try {
      await updatePassword(password)
      setPassword(''); setConfirmation(''); setCompleted(true)
    } catch {
      setError('Password non aggiornata. Il collegamento potrebbe essere scaduto oppure la sessione non è più valida. Riprova o richiedi un nuovo link dalla pagina di accesso.')
    } finally { setBusy(false) }
  }
  return <section className="onboarding-card password-recovery" aria-labelledby="password-recovery-title">
    <h1 id="password-recovery-title">{completed ? 'Password aggiornata' : 'Reimposta la password'}</h1>
    {completed ? <>
      <p role="status">La nuova password è stata salvata. Passkey e autenticatore, se configurati, restano attivi.</p>
      <button className="button button--primary" onClick={onCompleted}>Continua in sKey</button>
    </> : <>
      <p>Scegli una password unica di almeno 12 caratteri e conservala nel tuo gestore di password.</p>
      <p>Il recupero della password non rimuove l’autenticatore: se attivo, devi prima confermare il codice.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>Nuova password<input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Conferma nuova password<input type="password" autoComplete="new-password" minLength={12} required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
        {error ? <p role="alert" className="form-message form-message--error">{error}</p> : null}
        <div className="form-actions"><button className="button button--ghost" type="button" disabled={busy} onClick={onCancel}>Annulla</button><button className="button button--primary" disabled={busy}>{busy ? 'Salvataggio…' : 'Salva nuova password'}</button></div>
      </form>
    </>}
  </section>
}
