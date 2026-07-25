# Handoff — Valar Morghulis

Aggiornato il 25 luglio 2026.

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
- categorie, beneficiari e tag creabili durante l’uso;
- modifica del nome delle categorie e commenti sui movimenti;
- suddivisione facoltativa di un movimento in parziali per categoria, ciascuno personale o condiviso, interamente modificabile a posteriori;
- grafici mensili per categoria e bilancio per tag;
- righe della pagina Tag aggiungibili e rimovibili, con tag sempre disponibili nel selettore;
- PayPal come conto personale;
- rateizzazione in 3 o 5 rate con intermediario statistico e pagina dei pagamenti programmati;
- rimborsi con conto di origine del debitore e conto di destinazione del creditore obbligatori;
- modifica dei movimenti riservata all’autore;
- modifica ed eliminazione dei movimenti visibili anche su smartphone, con ricalcolo derivato di saldi, conti e statistiche;
- modifica dei movimenti importati basata anche sull'identità stabile
  autore/data di creazione, per sostituire l'originale e rimuovere eventuali
  copie con ID divergenti;
- eliminazione della prima rata estesa al piano collegato e modifiche anagrafiche propagate alle rate non ancora scadute;
- creazione e selezione affidabile di un nuovo beneficiario nel modulo del movimento;
- campi mobile a 16 px e viewport adattiva per evitare lo zoom automatico invasivo con la tastiera virtuale;
- logo, favicon, Apple touch icon e manifest installabile;
- iscrizione e accesso email/password con conferma email e recupero password;
- pagina Account raggiungibile dal profilo nella barra laterale, con modifica email e password;
- più famiglie per utente, famiglia attiva selezionabile e ruoli `admin`/`member` distinti per appartenenza;
- creazione di ulteriori famiglie, rinomina e inviti riservati agli amministratori, con inviti validi sette giorni;
- conto condiviso immediatamente visibile ai membri che accettano l’invito.

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
- La famiglia attiva è una preferenza locale per utente; i dati locali dell’MVP restano separati per coppia famiglia/utente.
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
- `src/lib/seed.ts`: utenti e dati iniziali.
- `src/features/CloudAccess.tsx`: autenticazione e onboarding famiglia.
- `src/features/AccountSettings.tsx`: credenziali, selezione/creazione famiglie e funzioni amministrative.
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

Ultima verifica completata il 25 luglio 2026: lint, test automatici e build di
produzione. I test coprono anche i parziali per categoria e la loro quota
condivisa, nuovo beneficiario, modifica e cancellazione con ricalcolo dei saldi,
dipendenze dei pagamenti rateali e importazione dei dati locali nello snapshot
cloud.

## Limiti dell’MVP e prossimi passi

Prossimi passi:

1. normalizzare movimenti e relative dipendenze in tabelle Supabase condivise,
   per sincronizzarli in tempo reale fra tutti i membri della famiglia; oggi
   ogni utente-famiglia usa uno snapshot privato durevole con cache locale;
2. aggiungere rimozione membri, trasferimento del ruolo amministratore e uscita volontaria da una famiglia;
3. rifinire i template email e introdurre limiti anti-abuso;
4. aggiungere backup, esportazione, cancellazione dati e test end-to-end;
5. definire l’API stabile per le future app native iOS e macOS.

La migrazione `20260725123000_private_family_app_data.sql` introduce
`family_user_app_data`, con una riga JSON per utente e famiglia. Al primo avvio
dopo l'aggiornamento, l'app unisce una sola volta gli eventuali dati già presenti
nel browser e salva il risultato nel cloud. Le policy RLS consentono a ogni
utente di leggere e modificare esclusivamente la propria riga.

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
