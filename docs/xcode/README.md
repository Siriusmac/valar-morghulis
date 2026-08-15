# Valar Morghulis per Apple — documentazione di sviluppo

Questo fascicolo accompagna lo sviluppo in Xcode di `sKey`, la versione nativa
Apple di Valar Morghulis per iPhone, iPad e Mac, mantenendo compatibilità
funzionale e dati condivisi con la web app.

Il progetto esiste in `apple/SKey/SKey.xcodeproj`. La documentazione descrive
gli invarianti da preservare e come verificare la parità. Il codice TypeScript
e le migrazioni Supabase restano la fonte di verità per le funzioni che non
sono ancora state portate o coperte da test equivalenti in Swift.

## Documenti

1. [Requisiti e parità funzionale](01-requisiti-e-parita.md)
2. [Architettura nativa](02-architettura.md)
3. [Modello dati e regole contabili](03-modello-dati-e-contabilita.md)
4. [Contratto Supabase](04-contratto-supabase.md)
5. [Privacy, sicurezza e sincronizzazione](05-privacy-sicurezza-sync.md)
6. [Schermate e comportamento adattivo](06-schermate-e-ux.md)
7. [Avvio del progetto Xcode](07-avvio-xcode.md)
8. [Test, migrazione e rilascio](08-test-roadmap.md)

## Fonti di verità nel repository

- Modelli: `src/types.ts`
- Calcoli: `src/lib/calculations.ts`
- Rate: `src/lib/scheduled.ts`
- Modifica ed eliminazione: `src/lib/movements.ts`
- Separazione dati: `src/lib/cloudData.ts`
- Integrazione cloud: `src/features/CloudAccess.tsx`
- Schema, RLS e RPC: `supabase/migrations/`
- Inviti: `supabase/functions/invite-family-member/index.ts`
- Push rimborsi: `supabase/functions/notify-family-reimbursement/index.ts`

## Decisioni già prese

- SwiftUI multipiattaforma, con logica e modelli condivisi.
- Supabase esistente come backend; nessuna duplicazione con CloudKit.
- Importi in centesimi (`Int64`) nel dominio, mai con `Double`.
- UI italiana, euro e formato data italiano.
- Dati personali privati; solo i record necessari vengono condivisi con la famiglia.
- Supporto offline con cache locale e coda di mutazioni.

## Configurazione attuale

- Nome prodotto: `sKey`; bundle identifier app: `it.valarmorghulis.skey`.
- UI SwiftUI nativa con target iPhone, iPad e macOS; Mac Catalyst è disattivato.
- Supabase Swift 2.55.1 come client del backend esistente.
- Configurazioni Debug e Release collegate ai rispettivi `.xcconfig`.
- Login, Account e famiglie, conti, CRUD dei movimenti semplici, rimborsi con
  conferma, elenco mensile, saldi calcolati e grafici mensili
  condivisi/per categoria già operativi.
- Registrazione APNs iOS/macOS e richiesta push agli altri membri dopo un
  rimborso implementate; attivazione remota ancora da eseguire.

Restano da definire App Group, Universal Links, domini associati, diagnostica,
cache offline persistente e strategia definitiva di distribuzione Mac.

## Riferimenti ufficiali

- [SwiftUI](https://developer.apple.com/documentation/swiftui/)
- [NavigationStack](https://developer.apple.com/documentation/swiftui/navigationstack)
- [Observation](https://developer.apple.com/documentation/observation)
- [Swift Charts](https://developer.apple.com/documentation/charts)
- [Supabase Swift: installazione](https://supabase.com/docs/reference/swift/installing)
- [Supabase Swift: inizializzazione](https://supabase.com/docs/reference/swift/initializing)
