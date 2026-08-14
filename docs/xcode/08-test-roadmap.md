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
- Rimborso completo tra due utenti.
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

Al 14 agosto 2026 sono operativi autenticazione, selezione dello spazio,
lettura di profilo/famiglie/conti e inserimento di spese o entrate semplici.
Il modulo usa controlli SwiftUI di sistema, consente di cercare o creare
categorie, beneficiari e mittenti, gestisce i movimenti antecedenti al saldo
iniziale e salva separatamente dati personali e familiari secondo AppData v3.

La sincronizzazione familiare incrementale invia sempre l’elenco completo dei
record già posseduti dall’autore, per evitare che la procedura Supabase elimini
movimenti estranei al salvataggio corrente. Restano da aggiungere al modulo
nativo parziali, tag, rateizzazione, modifica ed eliminazione.

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
