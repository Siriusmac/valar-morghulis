# Handoff — Valar Morghulis

Aggiornato il 23 luglio 2026.

## Stato del prodotto

L’MVP è una web app React + Vite mobile-first in italiano, pubblicata su
Cloudflare Pages. Supabase gestisce autenticazione, creazione famiglia, conto
condiviso facoltativo, inviti email e sincronizzazione del saldo iniziale dei
conti condivisi.

Funzioni disponibili:

- entrate e spese personali o condivise;
- ripartizione 50/50 e saldo debito/credito;
- esclusione dal saldo dei movimenti effettuati con un conto condiviso;
- grafico giornaliero della bacheca derivato dalle spese condivise del mese corrente;
- saldo iniziale modificabile con data di riferimento e sincronizzazione dei conti condivisi;
- movimenti retrodatati registrabili come “solo statistiche”, senza effetto sul saldo del conto;
- conti personali, conti condivisi, carte, contanti e giro fondi;
- categorie, beneficiari e tag creabili durante l’uso;
- modifica del nome delle categorie e commenti sui movimenti;
- grafici mensili per categoria e bilancio per tag;
- righe della pagina Tag aggiungibili e rimovibili, con tag sempre disponibili nel selettore;
- PayPal come conto personale;
- rateizzazione in 3 o 5 rate con intermediario statistico e pagina dei pagamenti programmati;
- rimborsi con conto di origine del debitore e conto di destinazione del creditore obbligatori;
- modifica dei movimenti riservata all’autore;
- logo, favicon, Apple touch icon e manifest installabile;
- iscrizione e accesso email/password con conferma email e recupero password;
- una famiglia per utente, ruoli `admin` e `member`, inviti validi sette giorni;
- conto condiviso immediatamente visibile ai membri che accettano l’invito.

## Decisioni di prodotto

- Lingua italiana, valuta euro e formato data italiano.
- Ripartizione delle spese e delle entrate condivise al 50/50.
- I movimenti personali sono visibili soltanto al proprietario; quelli condivisi sono visibili alla famiglia.
- Un movimento su conto condiviso è visibile a entrambi ma non genera debito o credito.
- Una spesa personale rateizzata pesa sul conto soltanto per le rate scadute.
- Una spesa familiare rateizzata regola subito l’intero debito/credito 50/50; le rate successive non lo modificano di nuovo.
- Le rate scadute vengono trasformate automaticamente in movimenti quando l’app viene caricata.
- Un nuovo utente parte soltanto con `Contanti` e l’eventuale conto condiviso della famiglia.
- Il rimborso è una registrazione contabile: l’app non trasferisce realmente denaro.
- Se la destinazione del rimborso è un conto condiviso, soltanto metà dell’importo compensa il debito.
- Un giroconto dal conto condiviso a un conto personale genera per il titolare del conto di destinazione un debito pari a metà dell’importo verso l’altro membro.
- Cloudflare Pages ospita il frontend; Supabase gestisce autenticazione, famiglie,
  appartenenze, inviti e conti condivisi.
- Le tabelle esposte usano RLS; la `service_role` è confinata alla Edge Function.
- L’ambiente pubblico richiede Supabase configurato e usa accesso email/password.

## Struttura tecnica

- `src/App.tsx`: composizione, modali, salvataggi e rimborso.
- `src/features/`: dashboard, movimenti, anagrafiche e giro fondi.
- `src/lib/calculations.ts`: saldo condiviso, saldi dei conti e aggregazioni.
- `src/lib/scheduled.ts`: trasformazione delle rate scadute in movimenti effettivi.
- `src/lib/storage.ts`: persistenza locale e migrazione delle versioni dei dati.
- `src/lib/seed.ts`: utenti e dati iniziali.
- `src/features/CloudAccess.tsx`: autenticazione e onboarding famiglia.
- `src/lib/supabase.ts`: client Supabase attivato soltanto tramite variabili Vite.
- `supabase/migrations/`: schema, funzioni transazionali, indici e policy RLS.
- `supabase/functions/invite-family-member/`: invio degli inviti email.
- `src/types.ts`: modello dati condiviso.
- `public/`: logo, icone e manifest della web app.

## Verifica locale

```bash
pnpm install
pnpm test
pnpm run build
pnpm dev
```

Ultima verifica completata il 23 luglio 2026: lint pulito, 14 test automatici e
build di produzione riusciti. QA browser su desktop e smartphone 390×844:
grafico giornaliero derivato dai movimenti reali, modifica del saldo iniziale,
scelta per i movimenti retrodatati e layout della pagina Conti senza errori
console. Produzione verificata con risposta HTTP 200.

## Limiti dell’MVP e prossimi passi

Prossimi passi:

1. migrare movimenti, categorie, beneficiari, tag, rate, rimborsi e trasferimenti
   da `localStorage` a tabelle protette da RLS;
2. aggiungere gestione membri e inviti dall’interno dell’app;
3. rifinire i template email e introdurre limiti anti-abuso;
4. aggiungere backup, esportazione, cancellazione dati e test end-to-end;
5. definire l’API stabile per le future app native iOS e macOS.

Verificare sempre build, test e stato del deploy Cloudflare dopo un push su
`main`.

## Hosting Cloudflare

Il progetto è configurato per Cloudflare Pages tramite `wrangler.jsonc`.
`pnpm cloudflare:check` esegue la build e `pnpm cloudflare:deploy` pubblica la
SPA nel progetto `valar-morghulis-web`.

Produzione: `https://www.valarmorghulis.it/`, collegata tramite CNAME Tophost a
`valar-morghulis-web.pages.dev`. Il certificato del dominio Pages è attivo dal
23 luglio 2026.
