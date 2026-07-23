# Valar Morghulis

<img src="public/valar-logo.png" alt="Logo Valar Morghulis" width="120" />

Web app mobile-first per gestire entrate e spese personali e familiari, conti, categorie, beneficiari e tag. I movimenti condivisi vengono divisi al 50% e il saldo tra i membri si aggiorna automaticamente.

![Spese ed Entrate di Valar Morghulis](docs/movements-desktop.png)

**App online:** [www.valarmorghulis.it](https://www.valarmorghulis.it/)

## Funzioni della prima versione

- iscrizione e accesso tramite email e password;
- entrate e spese personali private, oppure condivise con la famiglia;
- grafici mensili per categoria su spese, entrate e movimenti condivisi;
- grafico giornaliero della bacheca calcolato sulle spese condivise del mese corrente;
- saldo automatico 50/50 e conti condivisi esclusi dal debito/credito;
- saldo iniziale dei conti modificabile con data di riferimento;
- movimenti antecedenti al saldo iniziale mantenibili solo nelle statistiche;
- rimborsi registrati indicando il conto di origine del debitore e quello di destinazione, anche condiviso; in quest’ultimo caso solo il 50% compensa il debito;
- conti personali e condivisi, contanti e giro fondi tra conti; un prelievo dal conto condiviso verso un conto personale genera un debito pari al 50%;
- PayPal come conto personale;
- categorie, beneficiari e tag creabili durante l'uso, con i relativi movimenti;
- nomi delle categorie modificabili e commenti facoltativi sui movimenti;
- bilancio e grafico delle spese per ogni tag;
- righe di riepilogo della pagina Tag configurabili senza nascondere i tag dai movimenti;
- spese in 3 o 5 rate con prima rata immediata e pagamenti successivi programmati;
- saldo familiare calcolato subito sull'intero acquisto condiviso, senza duplicarlo nelle rate future;
- modifica consentita solo all'autore del movimento;
- creazione della famiglia, conto condiviso facoltativo e inviti email ai membri;
- interfaccia italiana, euro e date italiane, ottimizzata per smartphone.
- favicon, icona iOS e manifest per salvare la web app nella schermata Home.

## Configurare iscrizione e famiglie

L’ambiente di produzione utilizza Supabase per autenticazione, famiglie, inviti
e conti condivisi. Per configurare un nuovo ambiente:

1. crea un progetto Supabase;
2. collega il repository e applica la migration in
   `supabase/migrations/20260722193000_family_onboarding.sql` e
   `supabase/migrations/20260723183000_account_opening_balance_date.sql`;
3. pubblica la funzione `invite-family-member`;
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
supabase secrets set APP_URL=https://www.valarmorghulis.it
```

La chiave `service_role` rimane esclusivamente nella funzione Supabase e non deve
mai essere inserita in file `VITE_*` o commessa nella repository.

## Avvio locale

```bash
pnpm install
pnpm dev
```

## Deploy su Cloudflare

L'app è configurata come SPA statica su Cloudflare Pages. Dopo aver effettuato
l'accesso a Cloudflare con Wrangler:

```bash
pnpm cloudflare:check
pnpm cloudflare:deploy
```

Produzione: [www.valarmorghulis.it](https://www.valarmorghulis.it/). Il dominio
usa un CNAME esterno verso `valar-morghulis-web.pages.dev`, mantenendo DNS ed
email presso Tophost.

Il backend gestisce account, famiglie, membri, inviti e conti condivisi.
Movimenti, categorie, beneficiari, tag, rate, rimborsi e trasferimenti sono
ancora conservati nel `localStorage` del singolo browser: la loro migrazione
verso tabelle Supabase protette da RLS resta il principale passo successivo.

Controlli prima di pubblicare:

```bash
pnpm test
pnpm lint
pnpm run build
```

Per lo stato tecnico, le decisioni di prodotto e i prossimi passi consulta [HANDOFF.md](HANDOFF.md).

## Nota tecnica

Questa versione è un MVP con onboarding cloud attivo. Movimenti, categorie,
beneficiari e tag restano ancora locali e dovranno essere migrati su Supabase
prima di considerare completa la sincronizzazione tra dispositivi e membri.
