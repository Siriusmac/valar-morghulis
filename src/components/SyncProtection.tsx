export function SyncProtection({ conflict, checking, error, onDownload, onReload }: {
  conflict: boolean; checking: boolean; error: string
  onDownload: () => void; onReload: () => void
}) {
  if (!conflict && !checking) return null
  return <section className="sync-protection" role={conflict ? 'alert' : 'status'} aria-live="polite">
    <h2>{conflict ? 'Salvataggi sospesi per proteggere i dati' : 'Verifica dei dati aggiornati…'}</h2>
    {conflict ? <>
      <p>Questa copia potrebbe essere rimasta indietro o contenere modifiche non confermate. Non sovrascriviamo i dati sul server automaticamente.</p>
      <p>Puoi scaricare la copia locale per confrontarla. Caricando i dati aggiornati conserveremo anche una copia di recupero su questo browser e chiuderemo gli eventuali moduli aperti.</p>
      <p>I campi di un modulo non ancora confermato non sono inclusi nella copia: annotali prima di continuare. Il file scaricato contiene dati finanziari: conservalo in modo sicuro.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button button--secondary" disabled={checking} onClick={onDownload}>Scarica copia locale</button><button className="button button--primary" disabled={checking} onClick={onReload}>Carica dati aggiornati</button></div>
    </> : <p>Attendi prima di modificare i movimenti. Gli eventuali campi aperti restano sullo schermo.</p>}
  </section>
}
