# Valar Morghulis

<img src="public/valar-logo.png" alt="Logo Valar Morghulis" width="120" />

Web app mobile-first che riunisce contabilità personale, conti e spese
familiari, acquisti fatti per altre persone e rimborsi tra utenti. I dati
personali restano privati; le operazioni condivise seguono regole trasparenti e
aggiornano automaticamente quote e saldi fra i membri della famiglia.

![Spese ed Entrate di Valar Morghulis](docs/movements-desktop.png)

**App online:** [www.valarmorghulis.it](https://www.valarmorghulis.it/)

## Funzioni della prima versione

- iscrizione e accesso tramite email e password;
- entrate e spese personali private, oppure condivise con la famiglia;
- grafici mensili per categoria su spese, entrate e movimenti condivisi;
- grafico della bacheca navigabile per mese, alternabile tra spese condivise per giorno e per persona;
- confronto mensile in bacheca degli importi anticipati da ciascun membro per le spese condivise, escludendo i pagamenti effettuati direttamente da un conto condiviso;
- saldo automatico proporzionale al numero di membri e conti condivisi esclusi dal debito/credito;
- movimenti, rimborsi e operazioni familiari sincronizzati in tempo reale tra tutti i membri, mantenendo privati i dati personali;
- saldo iniziale dei conti modificabile con data di riferimento;
- movimenti antecedenti al saldo iniziale mantenibili solo nelle statistiche;
- rimborsi sottoposti alla conferma della controparte: soltanto dopo l’accettazione aggiornano saldo familiare e conti; il conto personale mancante può essere completato da chi lo possiede;
- scelta esplicita della famiglia proprietaria quando si crea un conto familiare e, per i conti personali, selezione indipendente delle famiglie alle quali pubblicare il solo nome utilizzabile nei rimborsi; saldo, istituto e movimenti restano privati;
- destinazione del rimborso selezionabile anche su un conto condiviso; in questo caso compensa soltanto la quota appartenente agli altri membri;
- conti personali e condivisi, contanti e giro fondi tra conti dalla terza scelta di “Nuovo movimento”; un prelievo dal conto condiviso verso un conto personale genera un debito proporzionale alle quote degli altri membri;
- PayPal come conto personale;
- categorie, beneficiari e mittenti ricercabili mentre si scrive e creati automaticamente quando il nome non esiste; tag creabili durante l'uso;
- beneficiari per le spese e mittenti per le entrate, gestiti in due schede della stessa pagina e selezionabili anche durante la modifica dei movimenti storici;
- nomi di categorie, beneficiari e mittenti modificabili, con aggiornamento automatico dei movimenti già registrati, e commenti facoltativi sui movimenti;
- beneficiari e mittenti eliminabili scegliendo se riassegnare movimenti e rate a un'altra anagrafica oppure raggrupparli come “Nessun beneficiario” o “Nessun mittente”;
- nuovo movimento ordinato per importo, conto/rate, beneficiario e data, seguito dal “Tipo di acquisto” (unico o multiplo); l’acquisto unico e ogni parziale usano “Tipo di spesa” con le opzioni personale, condivisa, per conto di un’altra persona o rimborso tramite acquisto;
- suddivisione facoltativa di uno scontrino in più categorie, con beneficiario unico a monte e importo, categoria, tag e destinazione indipendenti per ogni parziale; una stessa spesa può contenere quote personali, familiari, acquisti per conto di contatti e acquisti che compensano debiti verso membri diversi, con residuo automatico in coda;
- movimenti modificabili ed eliminabili dal loro autore direttamente dal pannello di modifica, con possibilità di cambiare la condivisione e ricalcolo immediato di conti, statistiche e saldo condiviso;
- eliminazione della prima rata estesa all’intero piano collegato e propagazione delle modifiche anagrafiche alle rate future;
- creazione del beneficiario direttamente dal modulo del movimento, con validazione del nome;
- bilancio e grafico delle spese per ogni tag;
- righe di riepilogo della pagina Tag configurabili senza nascondere i tag dai movimenti;
- spese in 3 o 5 rate, anche suddivise in più categorie, con prima rata immediata e pagamenti successivi programmati;
- saldo familiare calcolato subito sull'intero acquisto condiviso, senza duplicarlo nelle rate future;
- sezione “Rimborsi” con viste “Attesi” e “Dovuti” separate;
- modifica consentita solo all'autore del movimento;
- creazione della famiglia, conto condiviso facoltativo e inviti email ai membri;
- scelta esplicita tra accettazione e rifiuto dell’invito; nelle impostazioni gli amministratori vedono membri, possono ritirare o reinviare gli inviti in attesa, reinviare quelli scaduti e rimuovere quelli rifiutati;
- gestione account dal profilo nella barra laterale, con modifica di nome, cognome, email e password;
- appartenenza a più famiglie, selezione della famiglia attiva e ruoli amministratore/membro indipendenti per ciascuna;
- archivio personale unico fra tutte le famiglie e selettore della vista condivisa direttamente in bacheca;
- possibilità di iniziare senza creare una famiglia e aggiungerla in seguito dalle impostazioni;
- esportazione completa in JSON, CSV o XML prima della cancellazione definitiva dell’account;
- cancellazione amministrativa della famiglia, eliminando i dati condivisi oppure conservando come personali i movimenti creati da ciascun membro;
- creazione di ulteriori famiglie; l’autore ne diventa amministratore e può rinominarle e invitare membri;
- interfaccia italiana, euro e date italiane, ottimizzata per smartphone;
- totale aggregato degli utenti iscritti visibile sotto il logo dopo l’accesso, senza esporre profili o dati personali;
- guida integrata raggiungibile dal menù laterale, con premessa sul rapporto fra
  contabilità personale e condivisa, indice navigabile e dieci capitoli su
  bacheca, composizione dei movimenti, analisi, condivisione, conti, rate,
  rimborsi, contatti, anagrafiche, famiglie e privacy;
- campi mobile ottimizzati per la tastiera virtuale senza zoom automatico invasivo.
- favicon, icona iOS e manifest per salvare la web app nella schermata Home.

## Configurare iscrizione e famiglie

L’ambiente di produzione utilizza Supabase per autenticazione, famiglie, inviti
e conti condivisi. Per configurare un nuovo ambiente:

1. crea un progetto Supabase;
2. collega il repository e applica la migration in
   `supabase/migrations/20260722193000_family_onboarding.sql` e
   `supabase/migrations/20260723183000_account_opening_balance_date.sql` e
   `supabase/migrations/20260724130000_multi_family_accounts.sql`,
   `supabase/migrations/20260725123000_private_family_app_data.sql` e
   `supabase/migrations/20260726110000_family_shared_records.sql` e
   `supabase/migrations/20260727100000_personal_workspace_and_deletion.sql` e
   `supabase/migrations/20260727150000_invitation_lifecycle.sql` e
   `supabase/migrations/20260727170000_movement_senders.sql`,
   `supabase/migrations/20260727233000_private_reimbursement_accounts.sql` e
   `supabase/migrations/20260803120000_registered_user_count.sql`,
   `supabase/migrations/20260815143000_push_notifications.sql`,
   `supabase/migrations/20260815160000_multi_member_reimbursements.sql`,
   `supabase/migrations/20260816010000_category_directory_deletion.sql`,
   `supabase/migrations/20260816020000_tag_and_account_deletion.sql`,
   `supabase/migrations/20260816030000_multi_family_reimbursement_accounts.sql` e
   `supabase/migrations/20260816120000_contacts_and_commissioned_purchases.sql` e
   `supabase/migrations/20260816170000_multiple_commissioned_purchase_allocations.sql` e
   `supabase/migrations/20260829160000_withdraw_invitations.sql`;
3. pubblica le funzioni `invite-family-member` e
   `notify-family-reimbursement`, oltre a `invite-contact` per la rubrica;
4. configura il segreto della funzione con
   `APP_URL=https://www.valarmorghulis.it`;
5. copia `.env.example` in `.env.local` e inserisci URL e chiave pubblica del
   progetto;
6. aggiungi l'URL Cloudflare e `http://127.0.0.1:5173` agli URL di redirect
   consentiti in Supabase Auth.

Con Supabase CLI già configurata, i passaggi centrali sono:

```bash
supabase link --project-ref ID_PROGETTO
supabase db push
supabase functions deploy invite-family-member
supabase functions deploy notify-family-reimbursement
supabase functions deploy invite-contact
supabase secrets set APP_URL=https://www.valarmorghulis.it
```

Gli inviti usano due flussi separati: il template Supabase Auth **Magic Link**
per chi possiede già un account e il template **Invite user** per chi deve
crearlo. I contenuti HTML versionati in `supabase/email-templates/` vanno
copiati nei corrispondenti template del progetto Supabase ospitato. In questo
modo la mail propone rispettivamente “Usa il tuo account esistente” oppure
“Crea il tuo account”, senza chiedere una seconda registrazione allo stesso
indirizzo.

La revoca elimina il record non ancora risolto e rende immediatamente
inutilizzabile il link già consegnato. Per gli inviti ai contatti vengono
annullate anche le richieste d’acquisto ancora pendenti e prive di destinatario;
il movimento del pagante resta nella sua contabilità.

Per le notifiche push Apple occorre inoltre abilitare la capability Push
Notifications per l'App ID `it.valarmorghulis.skey` e impostare come segreti
della funzione `APNS_KEY_ID`, `APNS_TEAM_ID` e `APNS_PRIVATE_KEY` (contenuto
della chiave APNs `.p8`). Non inserire questi valori nel client o nei file
`.xcconfig`.

La chiave `service_role` rimane esclusivamente nella funzione Supabase e non deve
mai essere inserita in file `VITE_*` o commessa nella repository.

## Avvio locale

```bash
pnpm install
pnpm dev
```

## Deploy su Cloudflare

L'app è configurata come SPA statica su Cloudflare Pages. Dopo aver effettuato
l'accesso a Cloudflare con Wrangler, assicurati che
`.env.production.local` contenga `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`, quindi:

```bash
pnpm cloudflare:check
pnpm cloudflare:deploy
```

`cloudflare:check` interrompe il rilascio se la build non contiene la
configurazione Supabase, evitando di pubblicare accidentalmente la modalità
locale al posto dell'accesso email/password.

Produzione: [www.valarmorghulis.it](https://www.valarmorghulis.it/). Il dominio
usa un CNAME esterno verso `valar-morghulis-web.pages.dev`, mantenendo DNS ed
email presso Tophost.

Il backend gestisce account, appartenenze multiple, ruoli per famiglia, inviti e
conti condivisi. La famiglia attiva, oppure la vista solo personale, viene
ricordata localmente per ogni utente. Conti e movimenti personali vengono
salvati in uno snapshot privato Supabase unico per utente, così restano
invariati passando da una famiglia all’altra. Movimenti condivisi, rimborsi, operazioni sui
conti familiari e relative anagrafiche sono invece conservati come record
familiari normalizzati e aggiornati in tempo reale. Entrambi i livelli sono
protetti da RLS. Il browser conserva una copia locale come cache.

Controlli prima di pubblicare:

```bash
pnpm test
pnpm lint
pnpm run build
```

Ultima verifica web completata il 29 agosto 2026: 139 test, lint e build Vite.
I test coprono anche la distinzione fra account esistente, account nuovo e
account creato da un invito ma non ancora completato. La precedente verifica
Apple comprende build iOS/macOS e 29 test unitari. Il collaudo browser desktop e mobile ha confermato il
menu unificato per acquisto ordinario, per conto terzi e rimborso tramite
acquisto, disponibile sia sul movimento singolo sia su ogni voce dell'acquisto
multiplo. Ha inoltre verificato i dieci capitoli e l'indice navigabile della
guida, senza overflow orizzontale o errori console.

Per lo stato tecnico, le decisioni di prodotto e i prossimi passi consulta [HANDOFF.md](HANDOFF.md).

## Nota tecnica

La versione nativa Apple `sKey` è in sviluppo nel progetto
[`apple/SKey/SKey.xcodeproj`](apple/SKey/SKey.xcodeproj). Usa SwiftUI e i
controlli di sistema per iPhone, iPad e macOS, mantenendo Supabase e AppData v3
compatibili con la web app. Sono già operativi accesso, ripristino della
sessione, selezione dello spazio personale o familiare, lettura di profilo e
conti con creazione e modifica, configurazione di account e famiglie, inserimento
e modifica di spese ed entrate personali o condivise, acquisti singoli o multipli
con categoria, tag e destinazione indipendenti per parziale, acquisti in 3 o 5 rate,
azioni contestuali touch o Mac, anagrafiche di categorie, beneficiari, mittenti
e tag modificabili con accesso ai relativi movimenti, elenco mensile dei
movimenti, sezione Rimborsi “Attesi/Dovuti”, conferma delle richieste, saldi calcolati di conti e famiglia e
grafici mensili condivisi/per categoria tramite Swift Charts. Le rate future
sono raggruppate per acquisto in “Pagamenti programmati” e vengono materializzate
alla scadenza.
I conti possono anche essere eliminati con azioni adattive al dispositivo. Alla
creazione di un conto familiare si sceglie esplicitamente la famiglia
proprietaria; per ogni conto personale si possono invece selezionare una o più
famiglie alle quali pubblicare soltanto il nome come destinazione di un
rimborso. L'interfaccia identifica i conti pubblicati con una piccola icona,
senza esporre saldo o movimenti.
Nelle famiglie con
più di due persone il debitore può ripartire il totale fra uno o più creditori,
con importi e conti di destinazione distinti; ogni rimborso viene confermato
separatamente. iOS e macOS registrano il token APNs dell'utente autenticato;
quando viene creato un rimborso, app Apple e web richiedono un avviso push
generico soltanto alla controparte interessata, senza esporre importi o conti
nella schermata bloccata. Toccando l'avviso si apre direttamente la conferma.

Web app e client Apple includono anche “Contatti”: i membri delle famiglie sono
presenti automaticamente e possono essere affiancati da amici invitati via
email, senza concedere loro accesso ai dati familiari. Una spesa personale può
essere registrata per conto di un contatto; resta fuori dai riepiloghi del
pagante ma modifica il suo conto, mentre il destinatario la conferma e la
classifica nella propria contabilità senza duplicare il saldo. Lo stesso flusso
può compensare un rimborso familiare con un acquisto, scegliendo questa modalità
direttamente nel nuovo movimento intero o in una singola riga di uno scontrino
multiplo. Il destinatario è limitato ai membri con credito disponibile e la
somma assegnata non può superarlo. Rimuovere un amico elimina
soltanto il collegamento: lo storico resta a entrambi i partecipanti.

La configurazione pubblica Supabase viene letta da file `.xcconfig`; il file
locale `apple/SKey/Configuration/Secrets.xcconfig` è ignorato da Git. Per
configurazione, architettura, parità funzionale e roadmap consulta
[`docs/xcode/`](docs/xcode/README.md).


Questa versione è un MVP con onboarding e persistenza cloud attivi. Lo snapshot
privato evita la perdita dei dati personali, mentre i record familiari
normalizzati mantengono allineati in tempo reale saldi e movimenti condivisi tra
tutti i membri.
