# Handoff — Valar Morghulis

Aggiornato il 19 luglio 2026.

## Stato del prodotto

L’MVP è una web app React + Vite mobile-first in italiano. Funziona interamente nel browser e include due utenti demo, Simone e Anna. I dati sono persistiti in `localStorage` con chiave `valar-morghulis:v2`; `src/lib/storage.ts` migra anche i dati della prima versione.

Funzioni disponibili:

- entrate e spese personali o condivise;
- ripartizione 50/50 e saldo debito/credito;
- esclusione dal saldo dei movimenti effettuati con un conto condiviso;
- conti personali, conti condivisi, carte, contanti e giro fondi;
- categorie, beneficiari e tag creabili durante l’uso;
- grafici mensili per categoria e bilancio per tag;
- rimborsi con conto di origine del debitore e conto di destinazione del creditore obbligatori;
- modifica dei movimenti riservata all’autore;
- logo, favicon, Apple touch icon e manifest installabile.

## Decisioni di prodotto

- Lingua italiana, valuta euro e formato data italiano.
- Ripartizione delle spese e delle entrate condivise al 50/50.
- I movimenti personali sono visibili soltanto al proprietario; quelli condivisi sono visibili alla famiglia.
- Un movimento su conto condiviso è visibile a entrambi ma non genera debito o credito.
- Il rimborso è una registrazione contabile: l’app non trasferisce realmente denaro.

## Struttura tecnica

- `src/App.tsx`: composizione, modali, salvataggi e rimborso.
- `src/features/`: dashboard, movimenti, anagrafiche e giro fondi.
- `src/lib/calculations.ts`: saldo condiviso, saldi dei conti e aggregazioni.
- `src/lib/storage.ts`: persistenza e migrazione dei dati demo.
- `src/lib/seed.ts`: utenti e dati iniziali.
- `src/types.ts`: modello dati condiviso.
- `public/`: logo, icone e manifest della web app.

## Verifica locale

```bash
pnpm install
pnpm test
pnpm run build
pnpm dev
```

Accesso rapido: `?demo=simone` oppure `?demo=anna`. Per aprire direttamente una sezione si può aggiungere `&page=movements`, `accounts`, `categories`, `beneficiaries` o `tags`.

## Limiti dell’MVP e prossimi passi

Prima di commercializzare il prodotto servono:

1. backend e database condiviso;
2. autenticazione reale e recupero password;
3. nuclei familiari con inviti e ruoli;
4. autorizzazioni e privacy applicate lato server;
5. backup, esportazione e cancellazione dei dati;
6. test end-to-end e accessibilità completa;
7. API stabile riutilizzabile dalle future app native iOS e macOS.

La pubblicazione GitHub Pages è configurata in `.github/workflows/deploy.yml`. Verificare sempre l’esito dell’azione dopo un push su `main`.
