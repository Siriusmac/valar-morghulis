import { useEffect, useState, type ReactNode } from 'react'
import type { AuthSecurityApi } from '../lib/authSecurity'

type Status = Awaited<ReturnType<AuthSecurityApi['status']>>

export function MfaGate({ api, sessionToken, onLogout, children }: { api: AuthSecurityApi; sessionToken: string; onLogout: () => Promise<void>; children: ReactNode }) {
  const [result, setResult] = useState<{ api: AuthSecurityApi; token: string; status?: Status; error?: string }>()
  const [attempt, setAttempt] = useState(0)
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    api.status().then((status) => { if (active) setResult({ api, token: sessionToken, status }) })
      .catch(() => { if (active) setResult({ api, token: sessionToken, error: 'Impossibile verificare la sessione. I dati restano bloccati finché il controllo non riesce.' }) })
    return () => { active = false }
  }, [api, sessionToken, attempt])

  const checking = result?.token !== sessionToken || result?.api !== api
  const keepContent = result?.api === api && Boolean(result.status && !result.status.needsChallenge)
  const factors = result?.status?.factors ?? []
  const selected = factors.some((factor) => factor.id === factorId) ? factorId : factors[0]?.id
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !/^\d{6}$/.test(code) || busy) return
    setBusy(true); setError('')
    try {
      await api.verify(selected, code)
      setCode('')
      const status = await api.status()
      if (status.currentLevel !== 'aal2') throw new Error('Verifica non completata. Riprova.')
      // Never overwrite a newer check completed after a token refresh.
      setResult((current) => current?.token === sessionToken && current.api === api ? { api, token: sessionToken, status } : current)
    } catch { setCode(''); setError('Codice non valido o verifica non completata. Usa il codice attuale dell’autenticatore.') }
    finally { setBusy(false) }
  }
  return <>
    {/* Keep already-authorized drafts hidden during refresh. Suspending Effects
        would restart bootstrap and discard the financial app on resumption.
        A denied or failed check unmounts the old content instead. */}
    {keepContent ? <div hidden={checking} inert={checking} style={{ display: checking ? 'none' : 'contents' }}>{children}</div> : null}
    {checking ? <main className="access-status" role="status">Verifica della sicurezza dell’accesso…</main> : keepContent ? null : <main className="access-status"><section className="login-card security-challenge">
    <h1>Verifica con l’autenticatore</h1>
    {result?.error ? <><p role="alert">{result.error}</p><button className="button button--primary" onClick={() => setAttempt((value) => value + 1)}>Riprova verifica</button></> : selected ? <form onSubmit={submit}>
      <p>Hai attivato la protezione facoltativa. Apri la tua app di autenticazione e inserisci il codice sKey. Il codice non viene inviato via email.</p>
      {factors.length > 1 ? <label>Autenticatore<select value={selected} onChange={(event) => setFactorId(event.target.value)}>{factors.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}</select></label> : null}
      <label>Codice dell’autenticatore<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus required /></label>
      {error ? <p role="alert">{error}</p> : null}
      <button className="button button--primary" disabled={busy || code.length !== 6}>{busy ? 'Verifica…' : 'Verifica e accedi'}</button>
    </form> : <p role="alert">Il metodo di verifica richiesto non è disponibile in questa versione. Contatta l’assistenza; la password da sola non sblocca un account protetto.</p>}
    <p>Se hai perso l’autenticatore, usa un altro autenticatore già configurato o richiedi assistenza. Il recupero della password non disattiva questa protezione.</p>
    {error && !selected ? <p role="alert">{error}</p> : null}
    <button className="button button--ghost" onClick={() => void onLogout().catch(() => setError('Uscita non completata. Riprova.'))}>Torna all’accesso</button>
  </section></main>}
  </>
}
