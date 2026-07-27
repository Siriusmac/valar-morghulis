# Handoff — Valar Morghulis

Aggiornato il 27 luglio 2026.

## Stato del prodotto

L’MVP è una web app React + Vite mobile-first in italiano, pubblicata su
Cloudflare Pages. Supabase gestisce autenticazione, creazione famiglia, conto
condiviso facoltativo, inviti email e sincronizzazione del saldo iniziale dei
conti condivisi.

Funzioni disponibili:

- entrate e spese personali o condivise;
- ripartizione in quote uguali in base al numero di membri e saldo debito/credito;
- esclusione dal saldo dei movimenti effettuati con un conto condiviso;
- grafico giornaliero della bacheca derivato dalle spese condivise del mese corrente;
- saldo iniziale modificabile con data di riferimento e sincronizzazione dei conti condivisi;
- movimenti retrodatati registrabili come “solo statistiche”, senza effetto sul saldo del conto;
- conti personali, conti condivisi, carte, contanti e giro fondi;
- categorie, beneficiari e mittenti ricercabili per testo e creati automaticamente dal modulo del movimento quando non esiste una corrispondenza; tag creabili durante l’uso;
- beneficiari associati alle spese e mittenti associati alle entrate, gestiti in due schede della stessa pagina;
- modifica del nome di categorie, beneficiari e mittenti; mantenendo invariato l’ID, anche i movimenti storici mostrano subito il nuovo nome;
- eliminazione di beneficiari e mittenti con riassegnazione facoltativa di movimenti e rate; senza sostituzione, le operazioni vengono raccolte nelle righe “Nessun beneficiario” e “Nessun mittente”;
- suddivisione facoltativa di un movimento in parziali per categoria, ciascuno personale o condiviso, interamente modificabile a posteriori;
- grafici mensili per categoria e bilancio per tag;
- righe della pagina Tag aggiungibili e rimovibili, con tag sempre disponibili nel selettore;
- PayPal come conto personale;
- rateizzazione in 3 o 5 rate con intermediario statistico e pagina dei pagamenti programmati;
- rimborsi con conto di origine del debitore e conto di destinazione del creditore obbligatori;
- modifica dei movimenti riservata all’autore;
- modifica ed eliminazione dei movimenti visibili anche su smartphone e direttamente nel pannello di modifica; un movimento esistente può passare da personale a condiviso o viceversa, con ricalcolo derivato di saldi, conti e statistiche;
- modifica dei movimenti importati basata anche sull'identità stabile
  autore/data di creazione, per sostituire l'originale e rimuovere eventuali
  copie con ID divergenti;
- eliminazione della prima rata estesa al piano collegato e modifiche anagrafiche propagate alle rate non ancora scadute;
- creazione e selezione affidabile di un nuovo beneficiario nel modulo del movimento;
- campi mobile a 16 px e viewport adattiva per evitare lo zoom automatico invasivo con la tastiera virtuale;
- logo, favicon, Apple touch icon e manifest installabile;
- iscrizione e accesso email/password con conferma email e recupero password;
- pagina Account raggiungibile dal profilo nella barra laterale, con modifica di nome, cognome, email e password;
- pagina Guida raggiungibile dal menù laterale, con introduzione all’app,
  indice a collegamenti interni e sette capitoli responsive sulle funzioni
  principali;
- più famiglie per utente, famiglia attiva selezionabile e ruoli `admin`/`member` distinti per appartenenza;
- vista condivisa selezionabile direttamente dalla bacheca, mantenendo un unico archivio personale fra tutte le famiglie;
- onboarding utilizzabile anche senza creare subito una famiglia;
- esportazione completa in JSON, CSV o XML e cancellazione definitiva dell’account;
- cancellazione della famiglia con eliminazione dei dati condivisi oppure conversione in personali dei movimenti creati da ciascun autore;
- creazione di ulteriori famiglie, rinomina e inviti riservati agli amministratori, con inviti validi sette giorni;
- elenco amministrativo dei membri e degli inviti: reinvio per quelli in attesa o scaduti, rimozione obbligatoria per quelli rifiutati prima di un nuovo invito;
- accettazione o rifiuto esplicito da parte del destinatario prima di entrare nella famiglia;
- conto condiviso immediatamente visibile ai membri che accettano l’invito.
- movimenti, rate, rimborsi e girofondi condivisi sincronizzati in tempo reale fra tutti i membri, con ricalcolo locale del saldo;

## Decisioni di prodotto

- Lingua italiana, valuta euro e formato data italiano.
- Spese ed entrate condivise sono ripartite in quote uguali: 50% con due membri, un terzo con tre, e così via.
- I movimenti personali sono visibili soltanto al proprietario; quelli condivisi sono visibili alla famiglia.
- Un movimento su conto condiviso è visibile a tutta la famiglia ma non genera debito o credito.
- Nei movimenti suddivisi, i parziali vengono sottratti dalla categoria principale; soltanto i parziali marcati come condivisi partecipano al saldo familiare. Il conto registra comunque una sola operazione per l’importo totale.
- Suddivisione per categorie e rateizzazione sono alternative nello stesso movimento, per evitare di attribuire in modo ambiguo i parziali alle singole scadenze.
- Una spesa personale rateizzata pesa sul conto soltanto per le rate scadute.
- Una spesa familiare rateizzata regola subito l’intero debito/credito in base al numero di membri; le rate successive non lo modificano di nuovo.
- Le rate scadute vengono trasformate automaticamente in movimenti quando l’app viene caricata.
- Un nuovo utente parte soltanto con `Contanti` e l’eventuale conto condiviso della famiglia.
- Il rimborso è una registrazione contabile: l’app non trasferisce realmente denaro.
- Se la destinazione del rimborso è un conto condiviso, compensa il debito soltanto la quota appartenente agli altri membri.
- Un giroconto dal conto condiviso a un conto personale genera per il titolare del conto di destinazione un debito pari alle quote appartenenti agli altri membri.
- La famiglia attiva è una preferenza locale per utente; lo snapshot personale è unico per account, mentre i record familiari sono comuni ai membri della sola famiglia selezionata.
- Eliminando una famiglia con conservazione, ogni membro mantiene i movimenti e le rate che aveva creato; rimborsi e girofondi familiari vengono rimossi perché non hanno significato fuori dal gruppo.
- JSON è il formato di backup consigliato; CSV privilegia la consultazione tabellare e XML l’interoperabilità con altri software.
- Cloudflare Pages ospita il frontend; Supabase gestisce autenticazione, famiglie,
  appartenenze, inviti e conti condivisi.
- Le tabelle esposte usano RLS; la `service_role` è confinata alla Edge Function.
- L’ambiente pubblico richiede Supabase configurato e usa accesso email/password.

## Struttura tecnica

- `src/App.tsx`: composizione, modali, salvataggi e rimborso.
- `src/features/`: dashboard, movimenti, anagrafiche e giro fondi.
- `src/lib/calculations.ts`: saldo condiviso, saldi dei conti e aggregazioni.
- `src/lib/movements.ts`: inserimento, modifica, eliminazione e coerenza delle rate dipendenti.
- `src/lib/scheduled.ts`: trasformazione delle rate scadute in movimenti effettivi.
- `src/lib/storage.ts`: persistenza locale e migrazione delle versioni dei dati.
- `src/lib/cloudData.ts`: separazione fra snapshot privato e record familiari, inclusa la copia sicura dei soli parziali condivisi.
- `src/lib/seed.ts`: utenti e dati iniziali.
- `src/features/CloudAccess.tsx`: autenticazione e onboarding famiglia.
- `src/features/AccountSettings.tsx`: credenziali, selezione/creazione famiglie e funzioni amministrative.
- `src/features/GuidePage.tsx`: introduzione, indice e guida operativa
  responsive alle funzioni dell’app.
- `src/lib/supabase.ts`: client Supabase attivato soltanto tramite variabili Vite.
- `supabase/migrations/`: schema, funzioni transazionali, indici e policy RLS.
- `supabase/functions/invite-family-member/`: invio degli inviti email.
- `src/types.ts`: modello dati condiviso.
- `public/`: logo, icone e manifest della web app.
- `scripts/verify-cloud-build.mjs`: blocca il deploy se la build non include
  la configurazione pubblica Supabase.

## Verifica locale

```bash
pnpm install
pnpm test
pnpm run build
pnpm dev
```

Ultima verifica completata il 27 luglio 2026: lint, 73 test automatici e build
di produzione. I test coprono anche l’indice e i capitoli della guida, i parziali
per categoria e la loro quota condivisa, ricerca e creazione contestuale di
beneficiari e mittenti, cancellazione con riassegnazione o anagrafica vuota,
propagazione familiare delle cancellazioni, dipendenze dei pagamenti rateali e
importazione dei dati locali nello snapshot cloud. La verifica interattiva
locale dell’ultimo aggiornamento resta da ripetere perché il browser integrato
ha bloccato l’URL locale per una regola di rete dell’ambiente.

## Limiti dell’MVP e prossimi passi

Prossimi passi:

1. aggiungere rimozione membri, trasferimento del ruolo amministratore e uscita volontaria da una famiglia;
2. rifinire i template email e introdurre limiti anti-abuso;
3. aggiungere test end-to-end autenticati per esportazione e cancellazioni distruttive;
4. definire l’API stabile per le future app native iOS e macOS.

La migrazione `20260727100000_personal_workspace_and_deletion.sql` introduce
`user_app_data`, con un unico snapshot JSON per utente, e copia il più recente
snapshot privato precedente. Aggiunge inoltre le procedure protette per
onboarding personale, cancellazione della famiglia e cancellazione dell’account.
Le policy RLS consentono a ogni utente di leggere e modificare esclusivamente la
propria riga.

La migrazione `20260727150000_invitation_lifecycle.sql` aggiunge lo stato
`declined_at` e le procedure protette per rifiutare un invito e rimuovere un
invito rifiutato. La Edge Function `invite-family-member` riutilizza gli inviti
in attesa, rinnova token e scadenza durante il reinvio e restituisce errori
strutturati all’interfaccia.

La migrazione `20260727170000_movement_senders.sql` abilita il tipo di record
familiare `sender` e aggiorna la sincronizzazione protetta. Registra inoltre le
cancellazioni delle anagrafiche familiari e l’eventuale destinazione scelta, così
la riassegnazione viene applicata in modo coerente a tutti i membri. Le entrate
nuove richiedono un mittente; quelle storiche senza mittente restano valide e
possono essere completate dal pannello di modifica.

La migrazione `20260727213000_profile_first_last_name.sql` separa nome e cognome
nel profilo, mantiene `full_name` per compatibilità e aggiorna la creazione dei
nuovi utenti. Gli utenti esistenti vengono inizializzati a partire dal nome già
salvato e possono poi correggere entrambi i campi dalle impostazioni.

La migrazione `20260726110000_family_shared_records.sql` introduce
`family_shared_records`, recupera i dati condivisi già esistenti e abilita
Realtime. Una funzione transazionale sincronizza soltanto i record creati
dall’utente corrente; tutti i membri possono leggerli tramite RLS. Nei movimenti
con parziali misti viene pubblicata soltanto la quota marcata come condivisa.

Verificare sempre build, test e stato del deploy Cloudflare dopo un push su
`main`.

## Hosting Cloudflare

Il progetto è configurato per Cloudflare Pages tramite `wrangler.jsonc`.
`pnpm cloudflare:check` esegue la build e verifica che l'autenticazione Supabase
sia inclusa; `pnpm cloudflare:deploy` pubblica la SPA nel progetto
`valar-morghulis-web`. Il file locale ignorato `.env.production.local` deve
contenere `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: senza questi valori il
controllo fallisce prima del deploy, impedendo di pubblicare la modalità demo.

Produzione: `https://www.valarmorghulis.it/`, collegata tramite CNAME Tophost a
`valar-morghulis-web.pages.dev`. Il certificato del dominio Pages è attivo dal
23 luglio 2026.
