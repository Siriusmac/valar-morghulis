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

Prossimi blocchi: elenco movimenti e saldi calcolati, tag, parziali, rate,
rimborsi, export e amministrazione.

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
