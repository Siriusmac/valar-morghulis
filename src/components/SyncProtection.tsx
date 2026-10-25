export function SyncProtection({ conflict, checking, error, onDownload, onReload }: {
  conflict: boolean; checking: boolean; error: string
  onDownload: () => void; onReload: () => void
}) {
  if (!conflict && !checking) return null
  return <section className="sync-protection" role={conflict ? 'alert' : 'status'} aria-live="polite">
    <h2>{conflict ? 'Salvataggi sospesi per proteggere i dati' : 'Verifica dei dati aggiornati…'}</h2>
    {conflict ? <>
      <p>Non possiamo confermare che questa copia sia allineata al server. I salvataggi sono sospesi per evitare sovrascritture.</p>
      <p>Carica i dati aggiornati per continuare: conserveremo una copia locale di recupero. Annota prima i campi non ancora salvati: i moduli aperti verranno chiusi.</p>
      <details><summary>Informazioni sulla copia di recupero</summary><p>Puoi scaricare la copia locale per confrontarla. I campi di un modulo non ancora confermato non sono inclusi nella copia. Il file contiene dati finanziari: conservalo in modo sicuro.</p></details>
      {error ? <p role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button button--secondary" disabled={checking} onClick={onDownload}>Scarica copia locale</button><button className="button button--primary" disabled={checking} onClick={onReload}>Carica dati aggiornati</button></div>
    </> : <p>Attendi prima di modificare i movimenti. Gli eventuali campi aperti restano sullo schermo.</p>}
  </section>
}
