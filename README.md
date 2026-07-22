# Valar Morghulis

<img src="public/valar-logo.png" alt="Logo Valar Morghulis" width="120" />

Web app mobile-first per gestire entrate e spese personali e familiari, conti, categorie, beneficiari e tag. I movimenti condivisi vengono divisi al 50% e il saldo tra i membri si aggiorna automaticamente.

![Spese ed Entrate di Valar Morghulis](docs/movements-desktop.png)

**Demo online:** [siriusmac.github.io/valar-morghulis](https://siriusmac.github.io/valar-morghulis/)

## Funzioni della prima versione

- accesso demo come Simone o Anna;
- entrate e spese personali private, oppure condivise con la famiglia;
- grafici mensili per categoria su spese, entrate e movimenti condivisi;
- saldo automatico 50/50 e conti condivisi esclusi dal debito/credito;
- rimborsi registrati indicando il conto di origine del debitore e quello di destinazione del creditore;
- conti personali e condivisi, contanti e giro fondi tra conti;
- PayPal come conto personale;
- categorie, beneficiari e tag creabili durante l'uso, con i relativi movimenti;
- nomi delle categorie modificabili e commenti facoltativi sui movimenti;
- bilancio e grafico delle spese per ogni tag;
- righe di riepilogo della pagina Tag configurabili senza nascondere i tag dai movimenti;
- spese in 3 o 5 rate con prima rata immediata e pagamenti successivi programmati;
- saldo familiare calcolato subito sull'intero acquisto condiviso, senza duplicarlo nelle rate future;
- modifica consentita solo all'autore del movimento;
- dati demo salvati nel browser;
- interfaccia italiana, euro e date italiane, ottimizzata per smartphone.
- favicon, icona iOS e manifest per salvare la web app nella schermata Home.

## Accesso demo

| Utente | Email | Password |
| --- | --- | --- |
| Simone | `simone@valarmorghulis.demo` | `demo1234` |
| Anna | `anna@valarmorghulis.demo` | `demo1234` |

I dati sono salvati nel browser tramite `localStorage` con migrazione automatica tra le versioni. Questa modalità è adatta alla demo, non alla gestione reale di dati finanziari.

## Avvio locale

```bash
pnpm install
pnpm dev
```

## Deploy su Cloudflare

La demo è configurata come SPA statica su Cloudflare Workers. Dopo aver effettuato
l'accesso a Cloudflare con Wrangler:

```bash
pnpm cloudflare:check
pnpm cloudflare:deploy
```

Demo pubblica: [valar-morghulis.siriusmac.workers.dev](https://valar-morghulis.siriusmac.workers.dev/)

Il deploy pubblico conserva i dati esclusivamente nel `localStorage` del singolo
browser: non sincronizza ancora Simone e Anna tra dispositivi diversi e non è
adatto a dati finanziari reali finché non saranno disponibili backend,
autenticazione e autorizzazioni lato server.

Controlli prima di pubblicare:

```bash
pnpm test
pnpm run build
```

Per lo stato tecnico, le decisioni di prodotto e i prossimi passi consulta [HANDOFF.md](HANDOFF.md).

## Nota tecnica

Questa versione è un MVP locale. Per la commercializzazione saranno necessari un backend con autenticazione reale, database, gestione dei nuclei familiari, autorizzazioni server-side, backup e conformità privacy.
