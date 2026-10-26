# Sessioni lunghe e aggiornamento dei dati

## Aggiornamento locale del 26 ottobre: spazio del browser

Una segnalazione reale iPhone mostra il messaggio “Spazio locale non disponibile”.
La scrittura locale può fallire per quota o indisponibilità della memoria del
browser: non prova che esistano più sessioni né che il disco dell’iPhone sia pieno.
L’accumulo di copie complete per scheda è una causa plausibile, non misurata sul
telefono. L’utente ha autorizzato il rilascio web della correzione dopo il
collaudo locale; la riparazione sul telefono richiede comunque conferma esplicita.

- Un reload riusa l’archivio di quel documento invece di duplicarlo. Una nuova
  scheda resta isolata. Le nuove navigazioni non vengono considerate reload.
- Tolte le baseline complete non più lette dal percorso di salvataggio v2;
  quelle storiche restano archiviate nella riparazione, non eliminate a caso.
- Nessuna scrittura dell’intero archivio prima della lettura iniziale del server.
- Tentativi di recupero identici riusano la copia già conservata.

In caso di spazio insufficiente, il riquadro “Spazio locale da ripristinare”
offre “Ripara lo spazio locale”. È necessario conservare il file scaricato,
annotare i campi non confermati e chiudere le altre schede sKey su quel dispositivo.
L’utente conferma esplicitamente queste condizioni prima della riparazione.

La procedura legge il server, cattura i dati in memoria e tutte le stringhe raw
della sola famiglia/utente corrente, comprese copie differenti, metadati dei
salvataggi pendenti e recuperi. Le salva in un archivio IndexedDB immutabile,
attende il commit e rilegge l’archivio completo per verificarne l’identità.
Solo dopo verifica che le chiavi non siano cambiate e libera quelle archiviate,
ricreando la cache con i dati del server. Non cancella movimenti sul server e
non reinvia vecchie copie. Non tocca token di autenticazione, altri utenti o
altre famiglie. L’archivio resta esportabile dopo la riapertura con “Scarica
ultima copia di recupero”; il nuovo JSON include le copie raw e non è un’importazione
automatica nell’app. È un file finanziario riservato, da conservare con cura.

Se il browser non consente nemmeno di conservare/verificare l’archivio separato,
la pulizia non inizia. Se fallisce una successiva operazione, le copie già
archiviate restano in IndexedDB e i salvataggi restano bloccati. La disponibilità
di spazio su IndexedDB non è garantita: non cancellare indiscriminatamente i
dati del sito. La chiusura delle altre schede è una precauzione necessaria,
non un controllo globale delle sessioni su tutti i dispositivi.

Collaudo: test automatici e Chrome con IndexedDB reale, quota localStorage
simulata, errore deliberato di archiviazione prima della pulizia, riparazione
riuscita, zero scritture finanziarie al server, copie uniche e pending conservati,
export dopo reload, token e altro workspace intatti. Desktop 1280 e mobile 390.
Non ancora verificato su Safari/iPhone reale; nessun intervento sul telefono.

## Rilascio precedente del 25 ottobre

Correzione web del 25 ottobre 2026; commit, push e deploy autorizzati dall’utente
dopo il collaudo locale. Nessuna nuova migrazione o modifica al client Apple.

## Comportamento

Non esiste una durata dell’apertura della scheda dopo la quale chiedere di
ricaricare. I controlli continuano ogni 30 secondi quando la pagina è visibile
e al ritorno nella scheda, senza coprire o bloccare l’interfaccia. Non sono
state cambiate la durata dei token o le impostazioni Auth di Supabase.

Se non ci sono modifiche locali, i nuovi dati vengono caricati silenziosamente.
Un errore momentaneo di lettura dopo l’avvio mostra il badge di sincronizzazione
riprovabile, senza ipotizzare che esista un’altra sessione. Il controllo iniziale
resta necessario prima di rendere operativa la copia locale.

I campi modificati in un dialogo aperto restano protetti: se nel frattempo il
server è cambiato, i salvataggi vengono fermati. Lo stesso vale per un vero
conflitto di revisione o un problema di scrittura locale. Un filtro di ricerca
o un modulo chiuso senza salvare non costituiscono modifiche finanziarie pendenti.
Il controllo lato server contro le revisioni obsolete resta invariato.

## Recupero senza ciclo

- Una copia già completamente identica allo snapshot del server non richiede
  revisione manuale: il vecchio marcatore pendente viene rimosso senza scritture
  finanziarie al server.
- “Carica dati aggiornati” legge prima il server, poi conserva la copia locale
  prima di sostituirla. Una richiesta fallita non accumula copie inutili.
- Una lettura riuscita con risultato nullo significa assenza dello snapshot:
  viene mostrato lo stato iniziale, conservando il vecchio archivio come copia
  di recupero. Non viene ricaricato automaticamente sul server. La riapertura
  può inizializzare uno snapshot vuoto, senza ripristinare i movimenti precedenti.
- In caso di errore di rete durante il recupero o impossibilità di conservare
  la copia locale, il blocco resta: scaricare la copia ed evitare cancellazioni
  della memoria del browser.

Gli snapshot sono confrontati ignorando solo l’ordine delle chiavi degli oggetti
JSON, non modifiche ai valori. L’ordine degli array resta significativo.
Le revisioni sono aggiornate soltanto dopo una lettura interamente riuscita.
L’applicazione del risultato e il controllo di eventuali modifiche locali si
concludono prima che la coda possa inviare un salvataggio successivo.

## Collaudo

Test automatici: controllo lento mentre si scrive, errore e nuovo tentativo,
sessione ripresa dopo tre giorni (orologio simulato), modulo annullato, vecchio
blocco su copia identica, risposta nulla e riapertura, salvataggi concorrenti
con risposta invariata o cambiata, spazio locale esaurito e conflitto reale.

Chrome/Playwright su localhost con API e movimenti fittizi, desktop 1280 e
smartphone 390: conflitto tra due schede, conservazione della bozza, recupero,
riapertura, errore di lettura non bloccante e risposta senza snapshot. Verificati
assenza di overflow e overlay, console pulita salvo il 409 deliberato del test
di conflitto. Browser plugin non disponibile; usato harness temporaneo in /tmp.
Nessuna email, operazione in produzione o credenziale reale usata nei test.
Restano da verificare il caso specifico dei beta tester, Safari e PWA su telefono;
il test di tre giorni non equivale a tre giorni reali di esecuzione continua.
