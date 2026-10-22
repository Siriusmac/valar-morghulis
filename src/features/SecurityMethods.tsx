import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { AuthSecurityApi, PasskeyInfo } from '../lib/authSecurity'

type Methods = {
  api: AuthSecurityApi
  status?: Awaited<ReturnType<AuthSecurityApi['status']>>
  keys: PasskeyInfo[]
  passkeysError?: string
  error?: string
}
const methodsLoadError = 'Impossibile caricare i metodi di sicurezza. Riprova.'
async function readMethods(api: AuthSecurityApi): Promise<Methods> {
  const [status, keys] = await Promise.allSettled([api.status(), api.passkeys()])
  if (status.status === 'rejected') throw status.reason
  return { api, status: status.value, keys: keys.status === 'fulfilled' ? keys.value : [],
    passkeysError: keys.status === 'rejected' ? 'Impossibile caricare le passkey. L’autenticatore resta gestibile; riprova il caricamento delle passkey.' : undefined }
}

export function SecurityMethods({ api }: { api?: AuthSecurityApi }) {
  const [methods, setMethods] = useState<Methods>()
  const [pending, setPending] = useState<Awaited<ReturnType<AuthSecurityApi['enroll']>>>()
  const [removingId, setRemovingId] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const current = methods?.api === api ? methods : undefined
  const loading = Boolean(api) && !current
  const factors = current?.status?.factors ?? []
  const passkeys = current?.keys ?? []
  const load = useCallback(async () => {
    if (!api) return
    try { setMethods(await readMethods(api)) }
    catch (reason) { setMethods({ api, keys: [], error: methodsLoadError }); throw reason }
  }, [api])
  useEffect(() => {
    let active = true
    if (!api) return
    readMethods(api).then((next) => { if (active) setMethods(next) })
      .catch(() => { if (active) setMethods({ api, keys: [], error: methodsLoadError }) })
    return () => { active = false }
  }, [api])
  const run = async (action: () => Promise<void>, failureMessage = 'Operazione non completata. Verifica il codice o riprova. Nessuna conferma viene considerata riuscita senza la risposta del servizio.') => {
    if (busy) return
    setBusy(true); setError(''); setMessage('')
    try { await action() } catch { setError(failureMessage) }
    finally { setBusy(false) }
  }
  const verify = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!api || !/^\d{6}$/.test(code)) return
    await run(async () => {
      if (pending) {
        await api.verify(pending.id, code)
        setPending(undefined); setCode('')
        await load(); setMessage('Autenticatore attivato. Conserva l’accesso all’app di autenticazione: il codice sarà richiesto ai nuovi accessi.')
      } else if (removingId) {
        await api.verify(removingId, code)
        await api.removeFactor(removingId)
        setRemovingId(''); setCode('')
        await load(); setMessage('Autenticatore disattivato.')
      }
    })
    setCode('')
  }
  const qr = pending?.qr ? pending.qr.startsWith('data:image/svg+xml') ? pending.qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pending.qr)}` : ''
  return <section className="settings-card security-methods">
    <div className="settings-card__heading"><span aria-hidden="true"><ShieldCheck /></span><div><h2>Passkey e autenticatore</h2><p>Metodi aggiuntivi per proteggere il tuo account.</p></div></div>
    <p className="settings-card__note" role="note"><strong>Autenticatore facoltativo.</strong> Ti consigliamo di attivarlo per aumentare la sicurezza: dopo l’accesso dovrai inserire un codice generato dalla tua app di autenticazione. Puoi continuare a usare sKey senza attivarlo.</p>
    <p className="settings-card__note" role="note"><strong>Per ora solo webapp.</strong> Il client Apple nativo non supporta ancora il secondo passaggio: se attivi l’autenticatore, usa sKey dal browser o dall’icona web aggiunta alla schermata Home. Attendi l’aggiornamento del client nativo se vuoi continuare a utilizzarlo.</p>
    <div className="security-authenticator-apps">
      <h3>Quale app posso usare?</h3>
      <p>Se non hai già un’app di autenticazione, puoi scegliere uno di questi esempi compatibili con i codici TOTP:</p>
      <ul>
        <li><strong>Google Authenticator</strong>: <a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener noreferrer">Android — Google Play</a> oppure <a href="https://apps.apple.com/it/app/google-authenticator/id388497605" target="_blank" rel="noopener noreferrer">iPhone e iPad — App Store</a>.</li>
        <li><a href="https://www.microsoft.com/it-it/security/mobile-authenticator-app" target="_blank" rel="noopener noreferrer">Microsoft Authenticator — Android e iPhone</a>.</li>
      </ul>
      <p>Sono link ufficiali e si aprono in una nuova scheda, senza chiudere questa configurazione. Una sola app compatibile è sufficiente: non è necessario installarle entrambe. Dopo l’installazione, torna qui per aggiungere l’account sKey e confermare il codice.</p>
    </div>
    <p>La passkey usa il sistema del dispositivo, come Face ID, Touch ID o PIN. L’autenticatore genera invece codici temporanei: sono due metodi distinti. Se attivi l’autenticatore, il secondo passaggio viene richiesto anche dopo l’accesso con passkey.</p>
    {!api ? <p>La configurazione dei metodi aggiuntivi sarà disponibile dopo l’attivazione del servizio.</p> : <>
      {loading ? <p role="status">Verifica dei metodi di sicurezza…</p> : null}
      {!pending && !removingId && current?.status ? <>
        <h3>Autenticatore</h3>
        <p>{factors.length ? 'Protezione attiva. Conserva l’accesso al tuo autenticatore; puoi aggiungerne un altro come riserva.' : 'Non attivo: l’attivazione è una tua scelta.'}</p>
        {factors.length === 1 ? <p className="settings-card__note" role="note"><strong>Un solo autenticatore configurato.</strong> Per evitare di restare bloccato se perdi il telefono, aggiungine uno di riserva su un altro dispositivo sicuro. È facoltativo.</p> : null}
        {factors.map((factor) => <div className="security-method-row" key={factor.id}><span>{factor.name}</span><button className="button button--ghost" disabled={busy} onClick={() => { setRemovingId(factor.id); setCode(''); setError(''); setMessage('') }}>Disattiva {factor.name}</button></div>)}
        {api.enrollmentEnabled ? <button className="button button--secondary" disabled={busy} onClick={() => void run(async () => { setPending(await api.enroll()); setCode('') })}>{factors.length ? 'Aggiungi un altro autenticatore' : 'Attiva autenticatore'}</button> : <p>Attivazione in preparazione: prima è necessario completare la configurazione di sicurezza sul server.</p>}
        {api.passkeysEnabled ? <>
          <h3>Passkey</h3><p>Accesso rapido senza digitare la password. Funzione Supabase sperimentale: conserva anche il metodo di accesso con password.</p>
          {current.passkeysError ? <><p role="alert" className="form-message form-message--error">{current.passkeysError}</p><button className="button button--ghost" disabled={busy} onClick={() => void run(load)}>Riprova caricamento passkey</button></> : <>
            {passkeys.map((key) => <div className="security-method-row" key={key.id}><span>{key.name}</span><button className="button button--ghost" disabled={busy} onClick={() => { if (window.confirm(`Eliminare la passkey “${key.name}”? Potrai ancora accedere con password e, se attivo, autenticatore.`)) void run(async () => { await api.removePasskey(key.id); await load(); setMessage('Passkey eliminata.') }) }}>Elimina passkey {key.name}</button></div>)}
            <button className="button button--secondary" disabled={busy} onClick={() => void run(async () => { await api.registerPasskey(); await load(); setMessage('Passkey aggiunta.') }, 'Procedura passkey non completata o elenco non aggiornato. Riprova e controlla le passkey elencate; puoi continuare a usare gli altri metodi di accesso.')}>Aggiungi passkey</button>
          </>}
        </> : null}
      </> : null}
      {pending || removingId ? <form className="security-method-form" onSubmit={(event) => void verify(event)}>
        {pending ? <><h3>Configura l’autenticatore</h3><ol><li>Apri un’app di autenticazione compatibile con codici TOTP e scegli di aggiungere un account.</li><li>Scansiona questo QR code. Se stai usando lo stesso telefono, usa l’inserimento manuale con la chiave qui sotto.</li><li>Inserisci il codice a 6 cifre mostrato dall’app. La protezione si attiva soltanto dopo la conferma.</li></ol><img className="security-qr" src={qr} alt="QR code personale per configurare l’autenticatore sKey" /><details><summary>Mostra chiave per inserimento manuale</summary><code className="security-secret">{pending.secret}</code></details><p>Non condividere il QR code o la chiave e non inviarli all’assistenza.</p></> : <><h3>Disattiva autenticatore</h3><p>Inserisci un codice attuale dell’autenticatore da rimuovere. Se è l’ultimo, gli accessi successivi non richiederanno più il secondo passaggio.</p></>}
        <label>Codice dell’autenticatore<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
        <div className="form-actions"><button className="button button--ghost" type="button" disabled={busy} onClick={() => void run(async () => { if (pending) await api.removeFactor(pending.id); setPending(undefined); setRemovingId(''); setCode('') })}>Annulla</button><button className="button button--primary" disabled={busy || code.length !== 6}>{pending ? 'Conferma attivazione' : 'Conferma disattivazione'}</button></div>
      </form> : null}
    </>}
    <p>Se perdi tutti gli autenticatori, il solo recupero della password non disattiva la protezione. Non è ancora disponibile una procedura di recupero assistito e non possiamo garantire il ripristino dell’accesso: configura e verifica un autenticatore di riserva su un altro dispositivo sicuro.</p>
    <details><summary>Come evitare di perdere l’accesso</summary><ul><li>Conserva l’accesso alla tua email e al metodo con password, anche se usi una passkey.</li><li>Se attivi l’autenticatore, configura e verifica una riserva prima di cambiare o dismettere il telefono.</li><li>Una passkey non sostituisce il codice quando l’autenticatore è attivo. Reimpostare la password non rimuove questa protezione.</li><li>Non inviare all’assistenza password, codici, QR code o chiavi dell’autenticatore. Non sono disponibili codici di recupero sKey.</li></ul></details>
    {current?.error ? <><p role="alert" className="form-message form-message--error">{current.error}</p><button className="button button--ghost" disabled={busy} onClick={() => void run(load)}>Riprova caricamento</button></> : null}
    {error ? <p role="alert" className="form-message form-message--error">{error}</p> : null}
    {message ? <p role="status" className="form-message form-message--success">{message}</p> : null}
  </section>
}
