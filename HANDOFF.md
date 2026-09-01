# Handoff — Valar Morghulis

Aggiornato il 28 agosto 2026.

## Stato del prodotto

L’MVP è una web app React + Vite mobile-first in italiano, pubblicata su
Cloudflare Pages. Supabase gestisce autenticazione, creazione famiglia, conto
condiviso facoltativo, inviti email e sincronizzazione del saldo iniziale dei
conti condivisi.

Funzioni disponibili:

- entrate e spese personali o condivise;
- ripartizione in quote uguali in base al numero di membri e saldo debito/credito;
- esclusione dal saldo dei movimenti effettuati con un conto condiviso;
- grafico mensile della bacheca navigabile con menu dei mesi non editabile e alternabile “Per giorno / Per persona”, con confronto in euro delle spese condivise anticipate da ciascun membro e conti condivisi esclusi dall’attribuzione personale;
- pagina “Spese ed Entrate” con lo stesso menu dei mesi non editabile nelle viste Spese, Entrate e Condivise;
- saldo iniziale modificabile con data di riferimento e sincronizzazione dei conti condivisi;
- movimenti retrodatati registrabili come “solo statistiche”, senza effetto sul saldo del conto;
- conti personali, conti condivisi, carte, contanti e giro fondi;
- categorie, beneficiari e mittenti ricercabili per testo e creati automaticamente dal modulo del movimento quando non esiste una corrispondenza; tag creabili durante l’uso, fino a tre sul movimento web e fino a tre per ogni parziale di un acquisto multiplo;
- beneficiari associati alle spese e mittenti associati alle entrate, gestiti in due schede della stessa pagina;
- modifica del nome di categorie, beneficiari e mittenti; mantenendo invariato l’ID, anche i movimenti storici mostrano subito il nuovo nome;
- eliminazione di beneficiari e mittenti con riassegnazione facoltativa di movimenti e rate; senza sostituzione, le operazioni vengono raccolte nelle righe “Nessun beneficiario” e “Nessun mittente”;
- nuovo movimento con quattro scelte descritte e coerenti web/Apple: “Spesa”, “Entrata”, “Giro fondi” e “Paga alla romana”; segue la gerarchia importo, conto, beneficiario/mittente e data;
- suddivisione facoltativa in parziali con beneficiario unico a monte e importo, categoria, fino a tre tag e destinazione indipendenti; “Tipo di acquisto” distingue acquisto unico e multiplo, mentre “Tipo di spesa” distingue personale, condivisa, per conto di un’altra persona e rimborso tramite acquisto. La famiglia compare solo per la spesa condivisa e non include opzioni personali;
- grafici mensili per categoria e bilancio per tag;
- righe della pagina Tag aggiungibili e rimovibili, con tag sempre disponibili nel selettore;
- PayPal come conto personale;
- rateizzazione in 3 o 5 rate con intermediario statistico e pagina dei pagamenti programmati;
- piano rateale completo conservato soltanto nei dati privati dell'autore: non viene pubblicato come record familiare e “Pagamenti programmati” mostra sempre l'intera rata, non la quota condivisa;
- rimborsi in attesa di conferma della controparte, esclusi da saldi e conti finché non vengono accettati;
- pagina “Rimborsi e prestiti” con segmenti “Attesi” e “Dovuti”; include anche gli acquisti ordinari per conto terzi e, sul web, prestiti familiari con conferma iniziale, residuo e restituzioni parziali;
- migration `20260901100000_family_loans.sql` applicata al progetto Supabase remoto il 1 settembre 2026: aggiunge record autorevoli `loan`/`loan_repayment`, RPC di creazione e risposta reciproca e controllo server del credito familiare; il client Apple decodifica e contabilizza questi record e dispone delle chiamate repository, mentre la relativa UI nativa resta da completare;
- compensazione di un rimborso mediante acquisto diretto per il creditore, con descrizione obbligatoria e classificazione personale da parte del destinatario;
- rubrica Contatti composta automaticamente dai membri delle famiglie e da amici invitati via email, rimovibili senza cancellare lo storico;
- spese su commissione personali: il pagante sceglie un contatto o lo invita durante l'inserimento, il proprio conto viene addebitato ma l'operazione resta fuori dalle statistiche, mentre il destinatario conferma categoria e conto senza una seconda variazione di saldo; alla conferma il pagante riceve una sola entrata personale “Rimborsi ricevuti” sul conto di origine, con ID deterministico per impedire duplicazioni;
- “Paga alla romana” registra un unico addebito del totale e calcola in centesimi la quota del pagante e una quota per ogni contatto. Le quote dei contatti riusano le richieste commissionate; per un familiare la quota può invece essere collegata a un rimborso `purchase` solo se il credito disponibile la copre interamente;
- il record familiare confermato o rifiutato prevale sulla copia privata precedente dell’autore, evitando che un rimborso approvato torni a risultare “in attesa” dopo il login;
- pubblicazione facoltativa e distinta per famiglia del solo nome dei conti personali usabili nei rimborsi; saldo, istituto e movimenti non vengono condivisi;
- completamento del conto personale mancante da parte del proprietario durante la conferma e possibilità di rifiutare il rimborso;
- modifica dei movimenti riservata all’autore;
- modifica ed eliminazione dei movimenti visibili anche su smartphone e direttamente nel pannello di modifica; un movimento esistente può passare da personale a condiviso o viceversa, con ricalcolo derivato di saldi, conti e statistiche;
- modifica dei movimenti importati basata anche sull'identità stabile
  autore/data di creazione, per sostituire l'originale e rimuovere eventuali
  copie con ID divergenti;
- eliminazione della prima rata estesa al piano collegato e modifiche anagrafiche propagate alle rate non ancora scadute;
- creazione e selezione affidabile di un nuovo beneficiario nel modulo del movimento;
- campi mobile a 16 px e viewport adattiva per evitare lo zoom automatico invasivo con la tastiera virtuale;
- selettori nativi mantenuti per accessibilità e futura corrispondenza con i `Picker` SwiftUI, con schema colore chiaro esplicito per evitare menu diversi in base al tema del browser;
- logo, favicon, Apple touch icon e manifest installabile;
- iscrizione e accesso email/password con conferma email e recupero password;
- pagina Account raggiungibile dal profilo nella barra laterale, con modifica di nome, cognome, email e password;
- pagina Guida raggiungibile dal menù laterale, con premessa sulla continuità
  fra finanze personali, conti condivisi e rapporti fra utenti, indice a
  collegamenti interni e dieci capitoli responsive che documentano anche
  acquisti multipli, commissioni, contatti, rimborsi tramite acquisto, pagamenti
  programmati, gestione delle anagrafiche e privacy multi-famiglia;
- più famiglie per utente, famiglia attiva selezionabile e ruoli `admin`/`member` distinti per appartenenza;
- vista condivisa selezionabile direttamente dalla bacheca, mantenendo un unico archivio personale fra tutte le famiglie;
- onboarding utilizzabile anche senza creare subito una famiglia;
- esportazione completa in JSON, CSV o XML e cancellazione definitiva dell’account;
- cancellazione della famiglia con eliminazione dei dati condivisi oppure conversione in personali dei movimenti creati da ciascun autore;
- creazione di ulteriori famiglie, rinomina e inviti riservati agli amministratori, con inviti validi sette giorni;
- elenco amministrativo dei membri e degli inviti: revoca o reinvio per quelli in attesa, reinvio per quelli scaduti e rimozione obbligatoria per quelli rifiutati prima di un nuovo invito;
- accettazione o rifiuto esplicito da parte del destinatario prima di entrare nella famiglia;
- conto condiviso immediatamente visibile ai membri che accettano l’invito.
- movimenti, rate, rimborsi e girofondi condivisi sincronizzati in tempo reale fra tutti i membri, con ricalcolo locale del saldo;
- conteggio aggregato degli utenti iscritti mostrato sotto il logo agli utenti autenticati, senza accesso all’elenco globale dei profili;
- caricamento differito delle pagine e dei moduli secondari per ridurre il bundle JavaScript iniziale;

## Decisioni di prodotto

- Lingua italiana, valuta euro e formato data italiano.
- Spese ed entrate condivise sono ripartite in quote uguali: 50% con due membri, un terzo con tre, e così via.
- I movimenti personali sono visibili soltanto al proprietario; quelli condivisi sono visibili alla famiglia.
- Un movimento su conto condiviso è visibile a tutta la famiglia ma non genera debito o credito.
- Nei movimenti suddivisi, i parziali vengono sottratti dalla categoria principale; soltanto i parziali marcati come condivisi partecipano al saldo familiare. Il conto registra comunque una sola operazione per l’importo totale.
- Acquisto multiplo e rateizzazione possono convivere: ogni parziale viene ripartito proporzionalmente sulle rate, preservando i centesimi, la categoria, il tag e la destinazione; il beneficiario resta quello unico dell'acquisto. La rateizzazione usa sempre il totale dell'acquisto.
- Il piano rateale appartiene al solo autore e non viene sincronizzato nei record condivisi: gli altri membri vedono il movimento e la quota familiare completa, non le scadenze del conto personale del pagante.
- Le sole allocazioni “per conto di” sono escluse da statistiche e saldo familiare del pagante; le altre righe dello stesso movimento continuano a produrre i normali effetti personali o familiari.
- Anche una singola allocazione di un acquisto multiplo può compensare un rimborso: genera un rimborso `purchase` e una richiesta commissionata collegati allo stesso addebito, senza creare un secondo movimento sul conto del pagante. Il totale assegnato a ogni creditore non può superarne il credito disponibile.
- Nel pagamento alla romana le quote commissionate restano fuori dai report del pagante; soltanto la sua quota usa categoria e tag scelti, mentre il conto registra il totale una sola volta.
- Una spesa personale rateizzata pesa sul conto soltanto per le rate scadute.
- Una spesa familiare rateizzata regola subito l’intero debito/credito in base al numero di membri; le rate successive non lo modificano di nuovo.
- Le rate scadute vengono trasformate automaticamente in movimenti quando l’app viene caricata.
- Una richiesta ordinaria per conto terzi resta nei rimborsi attesi/dovuti finché il destinatario non la conferma o rifiuta; la conferma genera in modo idempotente l'entrata di rimborso del pagante. Una richiesta collegata a `settlementMethod = purchase` regola invece il solo rimborso familiare e non genera quell'entrata aggiuntiva.
- Un nuovo utente parte soltanto con `Contanti` e l’eventuale conto condiviso della famiglia.
- Il rimborso è una registrazione contabile: l’app non trasferisce realmente denaro.
- Un rimborso nuovo non modifica il saldo familiare né i conti finché la controparte non lo conferma. L’autore non può auto-confermarlo.
- Un rimborso confermato non è modificabile dalla sincronizzazione ordinaria. Ciascuna parte può proporre una variazione di importo, data e del proprio conto, oppure l'annullamento; l'effetto originale resta attivo finché l'altra parte approva. Il richiedente può ritirare la proposta e tutte le risposte restano registrate per audit.
- I conti personali restano privati. Il proprietario sceglie separatamente per quali famiglie pubblicare soltanto nome e identificatore opaco dei conti selezionabili nei rimborsi.
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
- `src/features/GuidePage.tsx`: premessa di prodotto, indice stabile e guida
  operativa responsive in dieci capitoli sulle funzioni dell’app.
- `src/lib/supabase.ts`: client Supabase attivato soltanto tramite variabili Vite.
- `supabase/migrations/`: schema, funzioni transazionali, indici e policy RLS.
- `supabase/functions/invite-family-member/`: invio degli inviti email con
  accesso diretto per utenti registrati e creazione guidata per i nuovi utenti.
- `supabase/email-templates/`: sorgenti dei template ospitati Supabase Auth per
  distinguere chiaramente l’uso di un account esistente dalla sua creazione.
- `src/types.ts`: modello dati condiviso.
- `public/`: logo, icone e manifest della web app.
- `docs/xcode/`: specifiche per architettura, parità funzionale, modello dati,
  contratto Supabase, privacy, UX, avvio Xcode e collaudo della futura app
  SwiftUI multipiattaforma.
- `scripts/verify-cloud-build.mjs`: blocca il deploy se la build non include
  la configurazione pubblica Supabase.

## Verifica locale

```bash
pnpm install
pnpm test
pnpm run build
pnpm dev
```

Ultima verifica completata il 3 agosto 2026: lint, 117 test automatici e build
di produzione. Il bundle principale è sceso da 563,64 kB a 473,39 kB grazie al
caricamento differito e non genera più l’avviso Vite oltre 500 kB. I test coprono
anche l’indice e i capitoli della guida, i parziali
per categoria e beneficiario, la combinazione con le rate e la loro quota
condivisa, ricerca e creazione contestuale di beneficiari e mittenti,
cancellazione con riassegnazione o anagrafica vuota,
propagazione familiare delle cancellazioni, dipendenze dei pagamenti rateali e
importazione dei dati locali nello snapshot cloud. Coprono inoltre il confronto
mensile delle spese condivise anticipate da ciascun membro, incluse le quote
condivise dei movimenti suddivisi e l’esclusione dei conti familiari. La verifica
interattiva locale ha confermato il selettore mensile, il passaggio “Per giorno /
Per persona”, la presenza contemporanea di parziali e rate, i menu ricercabili e
creabili nei parziali, l’assenza di errori in console e nessun overflow
orizzontale a 390 px.

## Limiti dell’MVP e prossimi passi

Prossimi passi:

1. aggiungere rimozione membri, trasferimento del ruolo amministratore e uscita volontaria da una famiglia;
2. introdurre limiti anti-abuso sugli inviti email;
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

La migrazione `20260727233000_private_reimbursement_accounts.sql` introduce
la rubrica minima dei conti personali autorizzati per i rimborsi, protetta da
RLS e separata per famiglia. La stessa migrazione forza i nuovi rimborsi nello
stato `pending`, impedisce all’autore di alterarne lo stato e aggiunge la
procedura protetta con cui soltanto la controparte può confermare o rifiutare,
completando il proprio conto quando necessario.
La migrazione è stata applicata al progetto Supabase remoto il 27 luglio 2026.
Il database remoto è allineato alle migration locali fino alla migration
`20260829160000_withdraw_invitations.sql`, applicata il 29 agosto 2026. La
migration aggiunge le RPC protette `withdraw_family_invitation` e
`withdraw_contact_invitation`; il successivo controllo dell'elenco migration ha
confermato l'allineamento tra repository e progetto Supabase remoto.

La migration locale `20260829230000_repair_reimbursement_responses.sql`
recupera le compensazioni storiche nelle quali pagante, destinatario e famiglia
sono corretti ma mancano i metadati di collegamento introdotti in seguito. Il
destinatario può inoltre rifiutare una richiesta commissionata incoerente senza
modificare il rimborso eventualmente indicato per errore. Questa migration è
applicata al progetto remoto dal 29 agosto 2026; `migration list` risulta
allineato e `db lint --linked --schema public` non segnala errori.

La migration locale `20260830100000_confirmed_reimbursement_changes.sql`
introduce le richieste di rettifica dei rimborsi confermati. La tabella è
leggibile soltanto dai due partecipanti; una sola richiesta può restare pending
per rimborso e soltanto la controparte può approvarla o rifiutarla. La normale
sincronizzazione conserva integralmente i rimborsi già risolti e non può
eliminarli. Un annullamento approvato conserva il record nello storico con stato
`cancelled`; per un rimborso tramite acquisto rimuove dal successivo snapshot il
movimento statistico del destinatario senza stornare l'acquisto reale del
pagante. La migration è stata applicata al progetto remoto il 30 agosto 2026.
Il lint successivo ha individuato il confronto UUID/testo sul conto familiare;
la migration correttiva
`20260830110000_fix_reimbursement_change_account_validation.sql` aggiunge il
cast esplicito senza riscrivere la migration già registrata. Anche la migration
correttiva è applicata; `migration list` è allineato e
`db lint --linked --schema public` non segnala errori.

La migrazione `20260727213000_profile_first_last_name.sql` separa nome e cognome
nel profilo, mantiene `full_name` per compatibilità e aggiorna la creazione dei
nuovi utenti. Gli utenti esistenti vengono inizializzati a partire dal nome già
salvato e possono poi correggere entrambi i campi dalle impostazioni.

La migrazione `20260803120000_registered_user_count.sql` espone agli utenti
autenticati soltanto il totale dei profili registrati. La funzione usa privilegi
minimi e non rende consultabile l’elenco globale degli utenti.

La migrazione `20260815143000_push_notifications.sql` aggiunge token APNs
privati, registrazione/rimozione tramite RPC legate a `auth.uid()` e consegne
idempotenti per rimborso e dispositivo. La Edge Function
`notify-family-reimbursement` autentica l'autore, verifica il record condiviso e
invia soltanto alla controparte del singolo rimborso un testo privo di importi o
riferimenti ai conti. I client Apple registrano il token a ogni sessione e lo
rimuovono al logout; anche la web app richiama l'invio dopo la sincronizzazione
del record. Il payload identifica famiglia e rimborso, così il client Apple apre
direttamente la relativa conferma quando l'utente tocca la notifica.

La migration `20260815160000_multi_member_reimbursements.sql` protegge il nuovo
flusso per famiglie con più di due membri: ogni record deve essere creato dal
pagatore e ha una sola controparte. Web e Apple calcolano il debito residuo,
tolgono gli importi già in attesa e propongono una ripartizione deterministica
fra i creditori correnti; l'utente può selezionarne più di uno e modificare gli
importi entro i rispettivi crediti disponibili. Vengono creati rimborsi
separati, collegati da un identificativo di gruppo, e ciascun destinatario
conferma soltanto il proprio. Il flusso a due membri resta invariato.

Le migration `20260815143000_push_notifications.sql` e
`20260815160000_multi_member_reimbursements.sql` sono state applicate al progetto
Supabase remoto il 15 agosto 2026; il successivo `migration list` è allineato e
`db lint --linked --schema public` non rileva errori. La Edge Function non è
ancora stata distribuita. Per attivare l'invio servono la capability Apple Push
Notifications per il bundle `it.valarmorghulis.skey`, profili di firma aggiornati
e i segreti Supabase `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`. Un errore
APNs non annulla né duplica il rimborso: il client segnala separatamente il
mancato avviso.

La migrazione `20260726110000_family_shared_records.sql` introduce
`family_shared_records`, recupera i dati condivisi già esistenti e abilita
Realtime. Una funzione transazionale sincronizza soltanto i record creati
dall’utente corrente; tutti i membri possono leggerli tramite RLS. Nei movimenti
con parziali misti viene pubblicata soltanto la quota marcata come condivisa.

Verificare sempre build, test e stato del deploy Cloudflare dopo un push su
`main`.

## App Apple nativa — avanzamento 15 agosto 2026

Il progetto `apple/SKey/SKey.xcodeproj` dispone ora del primo flusso di
scrittura operativo. `MovementComposerView` registra spese ed entrate
con `Form`, `Picker`, `DatePicker`, ricerca/creazione nativa delle anagrafiche,
commenti e scelta dell'impatto sul saldo per date antecedenti al saldo iniziale.
Le nuove spese possono essere suddivise in 3 o 5 rate con PayPal, Klarna,
Scalapay, Amazon o un provider libero: il resto in centesimi va all'ultima rata,
le scadenze mensili rispettano la fine del mese e sono elencate in “Pagamenti
programmati”. Le rate scadute vengono materializzate in modo idempotente; per
gli acquisti condivisi il saldo familiare usa subito il totale e le rate future
non lo conteggiano nuovamente.

La sezione “Spese ed Entrate” legge e unisce lo snapshot personale, la copia
privata della famiglia attiva e i record familiari normalizzati. Offre sezioni
Spese/Entrate/Condivise, menu mensile non editabile, ricerca nativa, gruppi per
giorno, riepiloghi ed esplicita i movimenti conservati solo per le statistiche.
I saldi dei conti includono movimenti, girofondi e rimborsi confermati; la
bacheca mostra anche il credito/debito familiare, con importi di dominio
calcolati in centesimi e conti condivisi esclusi dall'attribuzione personale.
La bacheca include inoltre il grafico Swift Charts delle spese condivise del
mese, commutabile fra andamento giornaliero e importi anticipati da ciascun
membro. La sezione Movimenti mostra donut mensili con importi e percentuali per
categoria nelle viste Spese, Entrate e Condivise; oltre cinque categorie le
restanti vengono aggregate in “Altro” per preservare la leggibilità.

La finestra Account replica ora i settaggi cloud della web app: dati personali,
email e password, selezione e creazione famiglie con conto condiviso
facoltativo, elenco membri, rinomina, inviti e relativo ciclo di reinvio/rimozione,
export JSON/CSV/XML e cancellazioni protette di famiglia o account. La bacheca è stata
alleggerita: lo spazio attivo espone membri e ruolo, resta in evidenza il solo
saldo familiare e compaiono gli ultimi quattro movimenti condivisi prima dei
conti. Dal saldo si registra un rimborso in stato `pending`; nelle famiglie
numerose il debitore sceglie uno o più creditori, importi e conti di
destinazione, mentre ogni controparte può completare il proprio conto,
confermare o rifiutare direttamente in bacheca o dalla notifica push.
La sezione Conti consente inoltre di creare, modificare ed eliminare conti
personali o familiari, preservando i movimenti storici, e di modificarne nome,
istituto, tipo, saldo iniziale e data di riferimento. I conti personali restano
nello snapshot privato; quelli familiari usano la tabella Supabase condivisa,
con eliminazione riservata agli amministratori. Su iPhone e iPad verticale le
azioni si aprono con swipe da destra verso sinistra; macOS e iPad orizzontale
mostrano invece icone permanenti di modifica ed eliminazione. La creazione usa
il comando testuale “Crea conto” e, per un conto familiare, richiede di scegliere
esplicitamente la famiglia proprietaria. Nell'editor di un conto personale una
selezione distinta per ogni appartenenza stabilisce a quali famiglie pubblicare
esclusivamente nome e identificativo opaco; un'icona occhio contrassegna i conti
pubblicati ad almeno una famiglia.

Il comando “Giro fondi” non è più nella sezione Conti: web app e client Apple
lo espongono nella finestra “Nuovo movimento” come terza scelta dopo Spesa ed
Entrata. Il trasferimento mantiene il record `transfer` esistente, aggiorna i
saldi dei due conti e, dal conto familiare verso un conto personale, regola il
saldo familiare in modo proporzionale al numero dei membri.

Ogni movimento creato dall'utente corrente espone le azioni native di modifica
ed eliminazione con swipe da destra verso sinistra su touch e icone permanenti
su Mac. Gli altri membri restano in sola lettura. Il form espone ora anche i
parziali per categoria: il beneficiario è unico per l'acquisto, mentre importo,
categoria e visibilità personale/familiare sono indipendenti per riga. I parziali restano
editabili e, durante una rateizzazione, vengono distribuiti su ogni rata senza
perdere centesimi. Il record familiare pubblicato contiene soltanto le quote
condivise; il movimento completo resta nella copia privata dell'autore.

`SupabaseLedgerRepository` conserva i campi AppData v3 non ancora conosciuti
dal client Swift e separa correttamente gli snapshot personali da quelli
familiari. Prima di chiamare `sync_family_shared_records` unisce le chiavi
transazionali del server e dello snapshot privato: non sostituire questa logica
con un payload contenente soltanto il nuovo movimento, perché la funzione
interpreta `owned_keys` come elenco completo e cancellerebbe gli altri record
dell’autore.

Categorie, beneficiari, mittenti e tag sono ora creabili e rinominabili nel
client nativo; uno swipe trailing espone le azioni su iPhone, mentre Mac e iPad
orizzontale mostrano le icone permanenti. Selezionando una voce si apre lo
storico dedicato con totale e data del movimento più vecchio. Le categorie si
possono eliminare scegliendo una sostituzione compatibile oppure “Senza
categoria”; i tag possono essere eliminati rimuovendone il riferimento dai
movimenti. Le operazioni aggiornano anche parziali e rate future. La navigazione
delle directory usa un unico stack nel dettaglio dello split view, così la
selezione apre direttamente lo storico sia su iPhone sia su iPad. Le migration
`20260816010000_category_directory_deletion.sql` e
`20260816020000_tag_and_account_deletion.sql` estendono allo stesso caso la
sincronizzazione familiare e le policy di cancellazione e devono essere
applicate, in ordine, prima di usare le funzioni condivise in produzione.
La migration `20260816030000_multi_family_reimbursement_accounts.sql` aggiunge
la RPC atomica `set_reimbursement_account_families`: verifica proprietà del
conto personale e appartenenza a tutte le famiglie richieste, quindi sostituisce
in un'unica transazione l'intero insieme delle pubblicazioni del conto.

“Pagamenti programmati” raggruppa le rate future per piano di acquisto come la
web app e mostra totale residuo, conto, rate pagate e singole scadenze.

La migration `20260816120000_contacts_and_commissioned_purchases.sql` introduce
inviti e collegamenti tra contatti e richieste di acquisto su commissione, con
RLS limitata ai due partecipanti e RPC atomiche per accettazione, rimozione e
conferma. Vincoli e controlli server-side assicurano che una compensazione possa
risolvere soltanto il rimborso pending che l'ha generata, fra gli stessi due
partecipanti. La Edge Function `invite-contact` invia l'invito senza associare
l'amico ad alcuna famiglia. `notify-family-reimbursement` distingue le
compensazioni con acquisto e indirizza la push Apple alla conferma in Contatti.
Il client Apple carica il modulo in modo isolato: durante una distribuzione
graduale, l'assenza temporanea delle nuove tabelle non blocca bacheca, conti o
movimenti.

La migration è stata applicata al progetto Supabase remoto il 16 agosto 2026;
il successivo `migration list` è allineato e `db lint --linked --schema public`
non rileva errori. Le Edge Function `invite-contact` e
`notify-family-reimbursement` risultano entrambe `ACTIVE`.

La migration `20260816170000_multiple_commissioned_purchase_allocations.sql`
ha sostituito l'indice univoco `(payer_id, payer_movement_id)` con un indice
ordinario. Uno stesso scontrino può quindi generare più richieste su commissione
per contatti diversi mantenendo un solo addebito sul conto del pagatore. È stata
applicata al progetto remoto il 16 agosto 2026; `migration list` è allineato e
il lint dello schema `public` non rileva errori.

La revoca degli inviti è paritetica fra web e client Apple. Un amministratore
può ritirare soltanto un invito familiare non risolto. L'autore può ritirare un
invito a un contatto; la RPC elimina prima le richieste d'acquisto pending che
dipendono da quell'invito e non hanno ancora un destinatario, senza cancellare
il movimento personale del pagante. Il token eliminato non può più essere
accettato dal link già ricevuto.

Il nuovo movimento web e Apple riusa questo schema anche per la compensazione:
il singolo e ogni parziale espongono le tre finalità dell'acquisto in un unico
menu. “Rimborso tramite acquisto” seleziona soltanto un creditore della famiglia
attiva, crea `Reimbursement.settlementMethod = purchase` e collega il relativo
`CommissionedPurchase` al movimento già addebitato. Non è richiesta una nuova
migration.

Verifiche concluse il 29 agosto 2026: il gate web ha confermato 153 test, lint e
build Vite. Sono coperti anche il nuovo selettore iniziale a quattro tasti, gli
errori espliciti dei rimborsi, l'importo totale dei piani rateali, la
ricostruzione dei parziali commissionati, la modifica delle scadenze e i menu
ricercabili uniformi per categorie, controparti e tag. La
verifica Apple comprende 30 test unitari nativi superati; il runner UI macOS è
stato interrotto dall'ambiente prima dell'avvio e non costituisce un esito dei
test dell'app.
Il browser locale ha verificato il nuovo movimento desktop e mobile, incluso il
menu con le tre finalità sul movimento singolo e su ogni voce dell'acquisto
multiplo. Ha inoltre verificato la guida in dieci capitoli, tutte le ancore
dell'indice e il layout a 390 px, senza overflow o errori console. La consegna
APNs reale resta da collaudare su dispositivi firmati dopo l'attivazione server.

La conferma web dei rimborsi ora interpreta anche gli errori strutturati
PostgREST restituiti dalle RPC Supabase, così distingue un conto storico
mancante da una catalogazione incompleta o da un collegamento acquisto-rimborso
incoerente. Nei nuovi rimborsi tramite acquisto il record familiare viene
pubblicato prima della richiesta commissionata e, se quest'ultima fallisce, il
salvataggio preliminare viene annullato: la conferma server-side non riceve più
una richiesta priva del rimborso che deve compensare. La suite web comprende 154
test superati; lint e build Vite risultano verdi. I record storici già
incompleti non vengono modificati automaticamente.

Questo rilascio estende il commit
`6e6072f5be932c29b0d37db406452c850bbc1693`. Nessuna migration è necessaria per
queste correzioni. Il
nuovo tentativo di collaudo visuale è stato bloccato dalla policy amministrativa
del browser integrato prima dell'accesso all'app e va quindi ripetuto quando il
browser sarà disponibile.

Il lavoro del 30 agosto 2026 aggiunge la rettifica reciproca dei rimborsi
confermati. La suite web comprende ora 162 test superati; lint e build Vite sono
verdi. Il browser integrato ha verificato caricamento e navigazione della pagina
Rimborsi senza errori console o overlay, ma i dati demo non contengono un
rimborso confermato: il ciclo reale a due utenti resta quindi da collaudare con
account autenticati dopo il rilascio del frontend.

Il lavoro del 31 agosto 2026 estende il modello web con `tagIds` (massimo tre),
mantenendo `tagId` come primo valore per la compatibilità con i dati e i client
precedenti. Il modulo consente tre tag sul movimento principale e tre tag
indipendenti su ogni parziale; ricerca, report, filtri, rate e record condivisi
considerano l'intero insieme. La selezione multipla nel compositore Apple resta
un intervento separato: il client continua a usare il primo tag compatibile.

La sincronizzazione non accetta più transazioni di altri autori provenienti da
snapshot privati personali o familiari: movimenti, rate, girofondi e rimborsi
altrui vengono caricati soltanto dai record condivisi correnti. La stessa
protezione è applicata al caricamento del repository Apple e impedisce che un
movimento condiviso cancellato dall'autore ricompaia dalla copia privata obsoleta
di un altro membro. Non sono richieste migration.

Verifiche locali: 165 test web superati, lint e build Vite verdi; il browser
locale ha verificato il selettore a tre tag nel movimento singolo e
nell'acquisto multiplo senza errori console. Anche il build non firmato del
target Apple per simulatore è riuscito.

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
