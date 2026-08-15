# Avvio del progetto Xcode

## Progetto esistente

Aprire `apple/SKey/SKey.xcodeproj`. Il prodotto si chiama `sKey`, usa il bundle
identifier `it.valarmorghulis.skey` e supporta iPhone, iPad e macOS come target
nativi SwiftUI. Mac Catalyst è disattivato.

Il package `supabase-swift` è già collegato. Non aggiungerlo una seconda volta.

## Configurazione locale

## Configurazione

```text
Configuration/
├── Base.xcconfig
├── Debug.xcconfig
├── Release.xcconfig
└── Secrets.example.xcconfig
```

Copiare `Secrets.example.xcconfig` in `Secrets.xcconfig` e valorizzare soltanto
`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Il file reale è ignorato da Git;
non inserire mai SMTP, password o chiavi server.

Per provare le push su dispositivo reale:

1. abilitare Push Notifications per l'App ID `it.valarmorghulis.skey` nel
   portale Apple e aggiornare i profili di firma;
2. applicare `20260815143000_push_notifications.sql`;
3. configurare in Supabase `APNS_KEY_ID`, `APNS_TEAM_ID` e
   `APNS_PRIVATE_KEY`, quindi distribuire `notify-family-reimbursement`;
4. accedere con due membri su dispositivi distinti e autorizzare le notifiche.

Debug usa APNs sandbox, Release usa APNs produzione. La chiave `.p8` non deve
mai essere copiata in Xcode o nel bundle.

`Debug.xcconfig` e `Release.xcconfig` sono già impostati come Base Configuration
del target app. Prima dei test distruttivi dovrà essere creato un ambiente
staging separato: fino ad allora non usare account di produzione per prove che
creano o cancellano grandi quantità di dati.

## Vertical slice disponibile

1. Login e ripristino sessione.
2. Profilo, famiglie e selezione dello spazio attivo.
3. Lettura dei conti personali e condivisi.
4. Spesa o entrata semplice personale.
5. Spesa o entrata semplice condivisa, con sincronizzazione AppData v3.
6. Ricerca o creazione di categoria, beneficiario e mittente.
7. Elenco mensile Spese/Entrate/Condivise con ricerca e raggruppamento per data.
8. Saldi conto e credito/debito familiare calcolati dal dominio nativo.
9. Grafico condiviso mensile per giorno/persona e donut percentuali per
   categoria in Spese, Entrate e Condivise.
10. Notifica push agli altri membri dopo la registrazione di un rimborso.

Prossimi blocchi: tag, parziali, rate, cache offline e riallineamento Realtime.

## Definition of done

- Regola dominio testata.
- Repository finto e preview caricato/vuoto/errore.
- Offline e retry definiti.
- Accessibilità e Dynamic Type verificati.
- Parità web/native sullo stesso account staging.
- Nessun dato sensibile nei log.

## Da evitare

- Logica contabile nelle View.
- `Double` per denaro.
- Chiamate Supabase sparse nelle schermate.
- CloudKit come seconda fonte dati.
- Sovrascrittura cieca dell'intero snapshot remoto.
