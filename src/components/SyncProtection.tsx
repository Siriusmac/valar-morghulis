import { useState } from 'react'

export function SyncProtection({ conflict, checking, error, storageIssue = false, onDownload, onReload, onRepair }: {
  conflict: boolean; checking: boolean; error: string
  storageIssue?: boolean; onRepair?: () => void
  onDownload: () => void; onReload: () => void
}) {
  const [repairConfirmed, setRepairConfirmed] = useState(false)
  if (!conflict && !checking) return null
  return <section className="sync-protection" role={conflict ? 'alert' : 'status'} aria-live="polite">
    <h2>{conflict ? storageIssue ? 'Spazio locale da ripristinare' : 'Salvataggi sospesi per proteggere i dati' : 'Verifica dei dati aggiornati…'}</h2>
    {conflict ? <>
      {storageIssue ? <p>Il problema riguarda la memoria di questo browser, non il numero di sessioni. Conserva la copia scaricata e apri “Ripara lo spazio locale” qui sotto.</p> : <>
      <p>Non possiamo confermare che questa copia sia allineata al server. I salvataggi sono sospesi per evitare sovrascritture.</p>
      <p>Carica i dati aggiornati per continuare: conserveremo una copia locale di recupero. Annota prima i campi non ancora salvati: i moduli aperti verranno chiusi.</p>
      </>}
      <details><summary>Informazioni sulla copia di recupero</summary><p>Puoi scaricare la copia locale per confrontarla. I campi di un modulo non ancora confermato non sono inclusi nella copia. Il file contiene dati finanziari: conservalo in modo sicuro.</p></details>
      {error ? <p role="alert">{error}</p> : null}
      <div className="form-actions"><button className="button button--secondary" disabled={checking} onClick={onDownload}>Scarica copia locale</button>{!storageIssue ? <button className="button button--primary" disabled={checking} onClick={onReload}>Carica dati aggiornati</button> : null}</div>
      {storageIssue && onRepair ? <details className="sync-storage-repair"><summary>Ripara lo spazio locale</summary>
        <p>Le vecchie copie di questo spazio personale o familiare verranno conservate in un archivio separato sul dispositivo e verificate prima di liberare spazio. Non vengono eliminati movimenti sul server né caricati quelli delle vecchie copie.</p>
        <p>Chiudi le altre schede sKey su questo dispositivo. I campi non ancora salvati vanno annotati: la riparazione chiude i moduli.</p>
        <label><input type="checkbox" checked={repairConfirmed} disabled={checking} onChange={(event) => setRepairConfirmed(event.target.checked)} />Ho conservato il file scaricato e chiuso le altre schede sKey su questo dispositivo.</label>
        <button type="button" className="button button--primary" disabled={checking || !repairConfirmed} onClick={onRepair}>Archivia le copie e ripara</button>
      </details> : null}
    </> : <p>Attendi prima di modificare i movimenti. Gli eventuali campi aperti restano sullo schermo.</p>}
  </section>
}
