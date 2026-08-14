# Schermate e comportamento adattivo

## Navigazione

Destinazioni: Bacheca, Spese ed entrate, Pagamenti programmati, Conti, Categorie, Beneficiari e mittenti, Tag, Guida, Account.

iPhone usa navigazione compatta; iPad e Mac sidebar completa. “Aggiungi movimento” è un'azione che apre una sheet e conserva la destinazione corrente.

## Bacheca

- Selettore famiglia solo con più famiglie.
- Selettore mese nativo, non editabile come testo.
- Saldi personali/familiari chiaramente attribuiti.
- Swift Charts per giorno/persona, membro e categoria.
- Legenda, descrizione accessibile e alternativa tabellare.
- Stato vuoto esplicativo.

## Nuovo/modifica movimento

Form progressivo:

1. Entrata/spesa, importo, data e conto.
2. Categoria con ricerca e creazione contestuale.
3. Beneficiario per spesa o mittente per entrata.
4. Tag e commenti.
5. Condivisione.
6. Parziali opzionali.
7. Rateizzazione delle spese, compatibile con parziali.

Per autocomplete usare campo testuale, risultati filtrati e azione “Crea …”, non un picker statico. Mostrare sempre il residuo dei parziali. In modifica, “Salva” conserva l'ID; “Elimina movimento” è separato e distruttivo.

Usare controlli nativi, focus state e scrolling automatico: l'intero controllo attivo resta visibile sopra la tastiera.

## Conti

- Elenco con saldo e ambito, senza esporre saldi personali ad altri.
- Dettaglio con movimenti, saldo/data iniziali e pubblicazione nome per rimborsi.
- “Giro fondi” solo nella sezione Conti.
- Conti familiari chiaramente contrassegnati.

## Directory e pagamenti programmati

Categorie con segmenti Spese/Entrate; Beneficiari e mittenti con segmenti omonimi. Voci rinominabili. Eliminazione con sostituzione o “Nessun …”; lo storico riflette le rinomine.

Raggruppare rate per piano mostrando pagate/mancanti, prossima scadenza, conto e importo. Spiegare l'effetto delle modifiche sulla serie.

## Account e famiglie

- Profilo: nome, cognome, email, password, export ed eliminazione.
- Famiglia: nome, membri, ruoli e inviti.
- Pending: “Reinvia”; accettati: membro; rifiutati: “Elimina dall'elenco”.
- “Elimina famiglia” solo per admin e separato dalle azioni quotidiane.

## Design system

Riutilizzare logo, verde e tono visivo, preferendo componenti Apple e colori semantici. Definire token per spaziatura, raggio, colori contabili e tipografia. Nessuna misura fissa incompatibile con Dynamic Type. Menu e picker seguono l'aspetto nativo anziché imitare CSS web.

## Principio di traduzione nativa

La web app è il riferimento per gerarchia informativa, terminologia, funzioni e identità del prodotto, ma non è un layout da riprodurre letteralmente. Quando una soluzione web diverge dalle Human Interface Guidelines, l'app Apple usa il comportamento canonico di SwiftUI e del sistema operativo.

- iPhone: tab bar compatta con un massimo di cinque destinazioni visibili; le sezioni secondarie confluiscono in “Altro”.
- iPad e Mac: `NavigationSplitView` con sidebar di sistema, selezione persistente e dettaglio stabile.
- macOS: Impostazioni in una scena `Settings`, comandi da menu e scorciatoie da tastiera per le azioni principali.
- Toolbar, menu, picker, form, sheet, alert, ricerca, condivisione ed esportazione usano prima le API di sistema.
- Swift Charts, ShareLink, PhotosPicker, fileImporter/fileExporter, App Intents e altre librerie Apple sono preferiti a componenti personalizzati equivalenti.
- Liquid Glass è usato sui sistemi che lo supportano per superfici e azioni appropriate, con materiali adattivi come fallback; non si aggiunge vetro decorativo a ogni riga.
- Colori, tipografia, contrasto, Dynamic Type, VoiceOver, tastiera e puntatore restano adattivi. Evitare copie di dropdown HTML, sidebar a schede personalizzate o finestre modali web.
- Non introdurre astrazioni multipiattaforma pensate per Android o Windows se limitano un comportamento Apple migliore.
