# Test, migrazione e rilascio

## Test core

- Centesimi e arrotondamenti.
- Residuo e parziali.
- Bilancio con 2, 3 e più membri.
- Esclusione conti familiari dal debito personale.
- Rimborsi personali/verso conto familiare e girofondi.
- Rate personali/familiari.
- Aggregazioni mensili e per categoria.
- Movimento solo statistico.

Trascrivere le fixture TypeScript per garantire risultati identici.

## Integrazione Supabase

In staging testare RLS tra famiglie, CRUD personale, sync/cancellazioni condivise, ciclo inviti, rimborso risolto dalla sola controparte, conflitti multi-dispositivo ed export/eliminazione.

## UI test

- Primo accesso senza famiglia e creazione famiglia.
- Movimento semplice, suddiviso, condiviso e rateizzato.
- Modifica senza duplicazione ed eliminazione.
- Cambio mese e famiglia.
- Rimborso completo tra due utenti, senza variazioni rispetto al flusso storico.
- Famiglia con almeno tre membri: ripartizione del debito fra più creditori,
  importi differenti, conto destinatario precompilato o completato in conferma,
  rifiuto indipendente e prenotazione degli importi già pending.
- Push rimborso soltanto alla singola controparte, su sandbox e produzione;
  apertura diretta della conferma, revoca permesso, logout e token APNs non più
  valido.
- Offline e riallineamento.
- Dynamic Type massimo e VoiceOver.

## Fasi

1. Fondazione: core, configurazioni, auth, cache.
2. Lettura: famiglie, conti, movimenti, dashboard.
3. Scrittura base: CRUD e directory.
4. Condivisione: record, N membri, realtime.
5. Flussi avanzati: parziali, rate, rimborsi, trasferimenti.
6. Amministrazione: inviti, export ed eliminazioni.
7. Qualità: accessibilità, offline, performance, privacy, TestFlight.
8. Mac: collaudo dedicato se non incluso subito.

## Stato dell’implementazione nativa

Al 15 agosto 2026 sono operativi autenticazione, selezione dello spazio,
lettura di profilo/famiglie/conti e inserimento di spese o entrate semplici.
Il modulo usa controlli SwiftUI di sistema, consente di cercare o creare
categorie, beneficiari e mittenti, gestisce i movimenti antecedenti al saldo
iniziale e salva separatamente dati personali e familiari secondo AppData v3.

Sono inoltre operativi l'elenco mensile Spese/Entrate/Condivise con ricerca e
stati caricato/vuoto/errore, il merge fra snapshot personale, copia privata
della famiglia e record condivisi, i saldi conto derivati e il saldo familiare.
Il core usa centesimi interi e copre movimenti, parziali condivisi, girofondi,
rimborsi confermati, conti familiari e movimenti solo statistici.
La bacheca usa Swift Charts per confrontare le spese condivise per giorno o per
membro; Movimenti presenta le percentuali mensili per categoria con donut e
legenda testuale accessibile. Le aggregazioni sono fixture pure testate e non
risiedono nelle View.

Account e famiglie sono gestibili con controlli nativi: profilo, credenziali,
selettore famiglie, creazione con conto facoltativo, rinomina, membri, inviti,
export JSON/CSV/XML e cancellazioni protette. La bacheca mostra soltanto il saldo principale,
membri e ruolo nello spazio attivo, gli ultimi movimenti condivisi e il ciclo
dei rimborsi pending/confermato/rifiutato. Nelle famiglie con più di due membri
il debitore può selezionare più creditori e importi distinti; vengono creati
record separati, ciascuno confermabile solo dalla controparte interessata. I
movimenti dell'autore corrente sono
modificabili ed eliminabili con swipe su touch e con icone permanenti su Mac;
quelli degli altri membri sono in sola lettura. La registrazione di un rimborso
richiede inoltre una push generica soltanto alla controparte del record: i token
sono privati e l'esito APNs resta separato dal salvataggio contabile. Il tap
seleziona la famiglia corretta e presenta la conferma indicata nel payload.

La sincronizzazione familiare incrementale invia sempre l’elenco completo dei
record già posseduti dall’autore, per evitare che la procedura Supabase elimini
movimenti estranei al salvataggio corrente. Restano da aggiungere al modulo
nativo l'editor completo di parziali, tag e rateizzazione, oltre a cache offline
e riallineamento Realtime.

Prima del collaudo push applicare la migration e distribuire la Edge Function;
la build locale da sola non può verificare APNs. Usare almeno due dispositivi
reali con membri diversi e controllare che né l'autore né i membri non coinvolti
ricevano l'avviso e che nessun importo compaia nella notifica.

## Collaudo web/native

Preparare famiglie staging da 1, 2 e 3 membri. Inserire ogni scenario dal web e leggerlo su Apple, poi invertire. Confrontare ID, saldo conti, credito/debito, grafici, rate/rimborsi e visibilità personale.

## Gate di rilascio

- Suite Swift e web verdi.
- Schema compatibile col client web distribuito.
- RLS e privacy superate.
- TestFlight interno e beta esterna.
- Prova su dispositivi reali.
- Informativa, export ed eliminazione verificati.
- Rollback senza perdita dati.
