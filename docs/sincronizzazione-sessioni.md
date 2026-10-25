# Sessioni lunghe e aggiornamento dei dati

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
