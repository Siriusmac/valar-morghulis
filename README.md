# Valar Morghulis

Web app mobile-first per gestire entrate e spese personali e familiari, conti, categorie, beneficiari e tag. I movimenti condivisi vengono divisi al 50% e il saldo tra i membri si aggiorna automaticamente.

![Spese ed Entrate di Valar Morghulis](docs/movements-desktop.png)

**Demo online:** [siriusmac.github.io/valar-morghulis](https://siriusmac.github.io/valar-morghulis/)

## Funzioni della prima versione

- accesso demo come Simone o Anna;
- entrate e spese personali private, oppure condivise con la famiglia;
- grafici mensili per categoria su spese, entrate e movimenti condivisi;
- saldo automatico 50/50, rimborsi e conti condivisi esclusi dal debito/credito;
- conti personali e condivisi, contanti e giro fondi tra conti;
- categorie, beneficiari e tag creabili durante l'uso, con i relativi movimenti;
- bilancio e grafico delle spese per ogni tag;
- modifica consentita solo all'autore del movimento;
- dati demo salvati nel browser;
- interfaccia italiana, euro e date italiane, ottimizzata per smartphone.

## Avvio locale

```bash
pnpm install
pnpm dev
```

## Nota tecnica

Questa versione è un MVP locale. Per la commercializzazione saranno necessari un backend con autenticazione reale, database, gestione dei nuclei familiari, autorizzazioni server-side e conformità privacy.
