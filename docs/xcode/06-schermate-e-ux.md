# Schermate e comportamento adattivo

## Navigazione

Destinazioni: Bacheca, Spese ed entrate, Pagamenti programmati, Conti, Categorie, Beneficiari e mittenti, Tag, Guida, Account.

iPhone usa navigazione compatta; iPad e Mac sidebar completa. “Nuovo movimento”
è un'azione primaria verde nella toolbar, apre una sheet e conserva la
destinazione corrente. Non occupa una posizione nella tab bar: secondo le HIG
la barra inferiore rappresenta destinazioni, non comandi.

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
- “Crea conto” è un comando testuale esplicito; la modifica usa swipe trailing
  su iPhone e iPad verticale, mentre macOS e iPad orizzontale mostrano icone
  permanenti di modifica ed eliminazione.
- La creazione di un conto familiare richiede la famiglia proprietaria, senza
  dipendere implicitamente dallo spazio attivo.
- Nell'editor dei conti personali una selezione per ogni famiglia decide dove
  pubblicare soltanto nome e ID opaco per i rimborsi. Un'icona occhio indica
  almeno una pubblicazione; saldo e movimenti non vengono mai esposti.
- L'eliminazione mantiene intatti i movimenti storici. I conti familiari sono
  eliminabili solo da un amministratore della famiglia attiva.

## Directory e pagamenti programmati

Categorie con segmenti Spese/Entrate; Beneficiari e mittenti con segmenti
omonimi; tag in una directory dedicata. Le voci sono creabili e rinominabili.
La selezione apre i movimenti associati, con totale e data iniziale “Dal”. Su
iPhone le azioni sono trailing swipe; su Mac e iPad orizzontale restano visibili
come icone. L'eliminazione di categorie e controparti richiede una sostituzione
compatibile oppure “Senza categoria”/“Nessun …” e aggiorna anche parziali e rate
future. I tag espongono anche l'eliminazione, che rimuove l'associazione dai
movimenti senza cancellarli. Lo storico è una destinazione esplicita nello stack
del dettaglio, evitando doppi passaggi o liste ripetute nello split view iPad.

Le rate sono raggruppate per piano mostrando pagate/mancanti, singole scadenze,
conto e importo residuo.

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
