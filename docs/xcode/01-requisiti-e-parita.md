# Requisiti e parità funzionale

## Obiettivo

La versione Apple deve usare gli stessi account, famiglie e dati della web app. Un movimento inserito da una piattaforma deve comparire sulle altre senza alterare saldo, attribuzione o privacy.

## Ambito MVP nativo

### Accesso e onboarding

- Registrazione/accesso con email e password, recupero password e deep link.
- Creazione facoltativa di famiglia e conto condiviso; uso solo personale consentito.
- Accettazione o rifiuto inviti.
- Revoca degli inviti in attesa da parte dell'amministratore o dell'autore.
- Più famiglie con famiglia attiva selezionabile.

### Movimenti

- Entrate e spese personali o condivise.
- Categoria, conto, data, descrizione, commenti e fino a tre tag (`tagIds`); `tagId` resta l'alias compatibile del primo.
- Beneficiario per spese; mittente per entrate.
- Creazione contestuale di categoria, beneficiario o mittente tramite autocompletamento.
- Acquisto unico o multiplo; il beneficiario è unico per lo scontrino, mentre ogni parziale ha importo, categoria, fino a tre tag e tipo di spesa personale/condivisa/per conto terzi/rimborso tramite acquisto indipendenti.
- Pagamento alla romana: divisione automatica ai centesimi fra pagante e contatti; richiesta ordinaria per ogni quota oppure compensazione di un debito familiare sufficiente.
- Rateizzazione: prima rata immediata, successive programmate; gli acquisti familiari regolano subito l'intero importo condiviso.
- Modifica ed eliminazione con aggiornamento di tutte le dipendenze e senza duplicati.
- Operazioni antecedenti al saldo iniziale incluse nel conto oppure conservate solo per statistiche.

### Conti e regolazioni

- Conti bancari, carte, contanti e PayPal; personali o condivisi.
- Saldo iniziale e data modificabili; in creazione il compositore propone Spesa, Entrata, Giro fondi e Paga alla romana.
- Rimborsi con approvazione e scelta dei conti di origine/destinazione.
- Sezione Rimborsi distinta fra richieste attese e dovute.
- Agli altri membri è pubblicabile solo il nome dei conti abilitati ai rimborsi, mai il saldo.

### Famiglia

- Saldo credito/debito ripartito per il numero corrente di membri.
- Movimenti da conto condiviso visibili ma senza debito personale.
- Rimborso verso conto condiviso: regola solo la quota degli altri membri.
- Giroconto da conto condiviso a personale: genera debito per la quota degli altri.
- Inviti con stati inviato, accettato e rifiutato.
- Amministrazione per famiglia, rinomina ed eliminazione con scelta sulla conservazione dati.

### Consultazione

- Bacheca personale e condivisa, mese selezionabile e grafici per giorno, persona e categoria.
- Elenchi filtrabili per conto, categoria, tag, beneficiario e mittente.
- Pagamenti programmati.
- Export JSON e CSV; XML è compatibilità secondaria.
- Profilo, email, password, nome/cognome ed eliminazione account con export preventivo.

## Criteri trasversali

- VoiceOver, Dynamic Type, contrasto e target tattili adeguati.
- Nessuno zoom forzato durante la compilazione.
- Formattazione `it_IT`, valuta EUR e date italiane.
- Nuovi account senza dati demo: solo Contanti e l'eventuale conto condiviso.
- Stati caricamento, vuoto, errore e offline espliciti.
- Ogni operazione distruttiva richiede conferma e ne descrive gli effetti.

## Fuori ambito iniziale

- Open Banking e riconciliazione automatica.
- Widget, Siri/App Intents e Apple Watch.
- Abbonamenti App Store.
- Migrazione da Supabase a CloudKit.
