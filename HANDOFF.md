# Handoff — sKey

Aggiornato il 26 ottobre 2026.

## Rientro dal background — rilascio web autorizzato il 26 ottobre

L’utente conferma che la riparazione dello spazio ha tolto il blocco, ma segnala
un nuovo avviso a ogni ripresa dopo pochi secondi, risolto premendo “Carica dati
aggiornati”. Ultimo rilascio ufficiale: 47c7aab su www.skeyapp.com, deployment
https://8c20ed32.valar-morghulis-web.pages.dev (hash verificati nel rilascio).

Riproduzione PRIMA della correzione: due test falliscono quando il contesto
autenticato viene ricreato senza modifiche finanziarie. L’effetto di persistenza
dipendeva dall’intero oggetto cloud e creava un nuovo pending sul semplice render;
il bootstrap ripartiva e poteva trattarlo come conflitto con dati aggiornati.
È una causa software dimostrata in test, non una traccia dell’evento Auth reale
del telefono, che non è stata acquisita.

Correzione locale: la persistenza dipende dalla presenza del cloud, non dall’identità
dell’oggetto sessione; crea pending solo se il contenuto dei dati cambia. Dopo
il primo bootstrap, i nuovi contesti usano il refresh silenzioso già previsto,
con controllo delle bozze; non ricominciano la procedura iniziale. Prima del
bootstrap gli eventi di refresh non avviano letture concorrenti inutili.
Nessuna variazione a durata token, MFA, controlli di revisione server, riparazione
della memoria o regole finanziarie. Un vecchio blocco con dati divergenti non
viene scartato automaticamente: se già presente può richiedere un ultimo recupero.

377 test / 46 file, lint, build cloud e diff-check superati. Test aggiunti:
contesto rinnovato senza pending, dati nuovi caricati silenziosamente, bozze
preservate per più rientri, conflitto reale ancora bloccato, identico mutationId
durante un salvataggio, errore di rete non bloccante dopo il rinnovo del contesto.
Chrome/Playwright con API fittizie e contesto/visibilità simulati: sei rientri,
zero invii finanziari, dati server aggiornati senza avviso, bozza intatta e vero
conflitto fermato; 1280/390 pixel, nessun errore console, overlay o overflow.
Browser plugin assente. Safari/PWA iPhone reale resta da verificare.
L’utente ha autorizzato commit, push e deploy di questa ulteriore correzione
web dopo il collaudo. Nessuna migrazione o modifica del client Apple.

## Memoria locale esaurita su iPhone — rilascio web autorizzato il 26 ottobre

Screenshot IMG_5549.HEIC: il blocco specifica “Spazio locale non disponibile”,
non un conteggio delle sessioni. L’utente conferma la presenza del file scaricato
nell’app File. Nessun dato del telefono acquisito, cancellato o modificato.
Checkout pulito di partenza: 234e69c, pubblicato il 25 ottobre su www.skeyapp.com.

Preparata una riparazione ESPLICITA, non automatica: aprire “Ripara lo spazio
locale”, confermare file conservato e altre schede sKey chiuse su questo
dispositivo, quindi “Archivia le copie e ripara”. Prima legge completamente il
server, poi conserva TUTTE le copie raw dello spazio famiglia/utente corrente,
inclusi pending, baseline, copie diverse e recuperi, in IndexedDB. Attende commit
e rilettura integrale identica prima di liberare le sole chiavi archiviate.
Se rileva chiavi nuove o cambiate durante l’archiviazione, si interrompe prima
della pulizia. Token Auth, altre famiglie e altri utenti restano esclusi.
Nessun vecchio movimento viene inviato al server. Le copie restano esportabili
dopo il reload da “Scarica ultima copia di recupero” (JSON di archivio completo;
non è un ripristino automatico dei vecchi movimenti).

Ridotta la duplicazione: reload riusa la propria chiave; nuove schede restano
isolate. Nessuna copia completa prima della lettura iniziale, nessuna nuova
baseline inutilizzata dal salvataggio v2, recuperi identici non duplicati.
I riavvii identificati come nuove navigazioni possono ancora creare una chiave:
non si riusano alla cieca chiavi di schede potenzialmente ancora aperte.

Il nuovo avviso distingue spazio locale e conflitto; quando manca spazio non
ripropone “Carica dati aggiornati” come soluzione. Riparazione non disponibile
finché non si confermano le precauzioni. In caso di IndexedDB non disponibile,
quota anche lì esaurita o errore di lettura, nessuna pulizia viene avviata.
Se fallisce la scrittura della nuova cache DOPO l’archiviazione, l’archivio già
verificato resta disponibile; i salvataggi restano protetti e va conservato il file.

Verifiche: 371 test / 46 file, lint, build cloud e diff-check. Chrome con API
fittizie e IndexedDB reale: quota simulata piena, fallimento archivio senza
pulizia, successiva riparazione, copie uniche/pending conservati, token e altro
workspace intatti, export dopo reload e zero invii finanziari. Layout 1280/390.
Browser plugin assente, usato Playwright; Safari/PWA iPhone reale non collaudati.
Nessuna migrazione o variazione Auth. L’utente ha autorizzato commit, push e
deploy di questa correzione web dopo il collaudo locale. La riparazione sul
telefono resta un’azione esplicita dell’utente, non viene eseguita dal deploy.

## Sessioni lunghe — rilascio web autorizzato il 25 ottobre 2026

L’utente ha approvato la riduzione degli avvisi invasivi e la correzione del
ciclo di recupero. Nessuna scadenza aggiunta alla sessione: polling ancora ogni
30 secondi in sottofondo, senza riquadro o blocco dei campi. Dopo il caricamento
iniziale un errore di lettura mostra soltanto il badge riprovabile; non crea
un falso conflitto. Il primo caricamento e un vero conflitto restano protetti.
Filtri esterni ai dialoghi e moduli chiusi senza salvare non restano marcati
come bozze. Confronto degli snapshot indipendente dall’ordine delle chiavi JSON.
Un vecchio blocco viene rimosso automaticamente solo se l’intero archivio locale
coincide con quello letto dal server, senza inviare dati. Recupero esplicito:
una risposta riuscita senza snapshot non genera più il ciclo; conserva la copia
locale e mostra lo stato iniziale del server, senza reinviare il vecchio archivio.
Una lettura fallita non aggiunge copie di recupero a ogni tentativo. Spazio
locale insufficiente o lettura fallita durante un vero conflitto restano bloccanti.
Le revisioni diventano utilizzabili per scrivere solo dopo la lettura completa;
controllo e decisione di blocco sono serializzati prima dei salvataggi accodati.
Backend, migrazioni e client Apple invariati. L’utente ha autorizzato commit,
push e deploy della correzione web dopo il collaudo. Recupero password precedente pubblicato con c895713 su
https://a1e99c2f.valar-morghulis-web.pages.dev e www.skeyapp.com (hash verificati).
Collaudo locale: 363 test in 45 file; Chrome con API fittizie a 1280 e 390 pixel,
conflitto tra due schede e recupero da risposta nulla senza ciclo alla riapertura.
Dettagli e limiti: docs/sincronizzazione-sessioni.md.

## Recupero password — collaudo completato e rilascio web autorizzato

L’utente ha completato anche il percorso con MFA: codice richiesto prima del
modulo, cambio password e nuovo accesso con password aggiornata e autenticatore
riusciti. Confermato anche l’avviso sul link già usato. Credenziali e codici
sempre inseriti personalmente, mai acquisiti. Autorizzati commit, push e deploy
della sola webapp. Nessuna migrazione. Verifica email/redirect produzione ancora
da eseguire. Le note sottostanti documentano le fasi precedenti del collaudo.
Separata segnalazione da diagnosticare: avviso sessioni invasivo e ciclo dopo
“Carica dati aggiornati”, anche con una sola sessione. Nessuna correzione della
sincronizzazione inclusa nel rilascio recupero password.

## Recupero password — link e cambio password confermati dall’utente su skey-test

Test MFA in corso: l’utente ha confermato anche l’avviso sul link già usato,
poi ha attivato personalmente un autenticatore sul terzo account di prova.
Verifica UI limitata allo stato: azione “Aggiungi un altro autenticatore”
presente, QR pendente assente; successivamente testo Protezione attiva e
fattore bf6e7f visibili. Nessun QR, chiave o codice acquisito. Uscita normale
dall’account e UNA nuova richiesta di recupero al destinatario già autorizzato;
servizio risponde con messaggio neutro di richiesta accettata. Non ancora
confermata ricezione/apertura di questa seconda email. Prossima verifica umana:
aprire SOLO l’ultimo link sul Mac e fermarsi alla richiesta del codice, prima
di ogni inserimento e prima della schermata password. Se il modulo password
si apre subito, interrompere e diagnosticare; non considerare MFA collaudato.

Ulteriori riscontri utente: nuovo accesso con password aggiornata riuscito;
riapertura del link usato da disconnesso mostra il normale login, non il form.
Questo non certifica da solo il codice d’errore del provider. Correzione locale
di UX: cattura otp_expired prima della pulizia del frammento SDK e mostra
“Collegamento non valido o scaduto”, anche con sessione preesistente senza
aprire il form password. Messaggio generico valido anche per altri link email
scaduti, senza stampare parametri di errore o token. Quattro test aggiunti per
callback nel frammento/query, errore recovery e sessione già presente.
Prova CUA con codice d’errore sintetico, NON link reale: messaggio e pulsante
Continua corretti; parametri eliminati e ritorno al login. Evidenza QA
recovery-invalid-link.png. Nessuna email reinviata o password modificata.
Da ripetere il vecchio link reale con la correzione; MFA reale resta da provare.
Verifiche finali della correzione: 354 test/45 file, lint, cloudflare:check e
diff-check superati. Sistemato nel solo mock di test l’export passkeysEnabled
necessario a renderizzare il login dopo il pulsante Continua.

Aggiornamento: il 24 ottobre l’utente ha confermato “aperto e reimpostata la
password, funziona”. Consegna/apertura link e cambio password reale nel solo
account di prova quindi confermati dall’utente, senza osservare o raccogliere
credenziali. La descrizione sotto registra i passaggi precedenti. Restano da
verificare il nuovo login con password appena scelta, il rifiuto del riutilizzo
del link/scadenza e il recupero con MFA reale attivo. Nessun rilascio del nuovo
recupero in produzione autorizzato o eseguito.

L’utente ha creato un terzo account di prova con un indirizzo consultabile,
senza condividere la password. Su conferma specifica, SOLO skey-test ha ora
Site URL http://localhost:5192 e un unico redirect esatto consentito:
http://localhost:5192/?recovery=password. Prima: localhost:3000, lista vuota.
Configurazione verificata salvata nella dashboard. Produzione invariata.
Uscita dalla vecchia sessione fittizia e richiesta di UNA email di recupero
dal login localhost:5192 all’indirizzo indicato dall’utente: risposta positiva
del provider. Nessuna conferma di consegna o cambio password ancora ricevuta.
La scheda eseguiva una versione precedente (messaggio invio legacy): nessun
listener locale su 5192. Avviato serve-staging-app.mjs nella sessione 21259,
configFile/envDir disabilitati e progetto staging verificato nello script.
La pagina /?recovery=password SENZA token/sessione mostra correttamente
“Richiedi un nuovo collegamento”; non è stato consumato alcun link email.
Il link legacy alla radice è supportato dall’evento PASSWORD_RECOVERY nella
nuova versione. Nessun reinvio richiesto. Prossimo passaggio umano: consultare
la propria casella/spam sul Mac, aprire il link e riferire se compare il form.
Non chiedere/copiare link di recupero, token o password; successivo aggiornamento
della password deve essere eseguito dall’utente. Evidenza configurazione:
/tmp/skey-security-qa.bJ7YeR/recovery-staging-redirect-ready.png.

## Rilascio selettivo grafica — 24 ottobre 2026

Pubblicato il solo commit 99c8af3 (SecurityMethods, test, CSS grafico e badge
originali locali). Il recupero password e il suo CSS NON sono stati commessi,
inviati o distribuiti. Checkout attivo conserva integralmente lo sviluppo locale.
Build pulita eseguita da /tmp/skey-graphics-release.ygma2e, clone locale del
commit con dipendenze condivise e solo config pubblica produzione ignorata.
340 test/43 file, lint e cloudflare:check superati sulla copia di rilascio;
350 test/45 file superati sul checkout che include il recupero non pubblicato.
Deploy https://870cf8f8.valar-morghulis-web.pages.dev sul progetto Cloudflare skey,
dominio www.skeyapp.com, nessun cambio backend/Apple/SMTP. Asset JS/CSS e badge
confrontati byte per byte tra build pulita, deploy e dominio ufficiale HTTP 200;
entry index-DDRl0gVu.js, CSS index-C-gdy4cL.css. File PasswordRecovery assente
nel clone e schermata nuova non presente nel bundle pubblicato.
Prossimo passo autorizzato: test recupero su skey-test, non produzione. Serve
un indirizzo consultabile per l’account di prova: collaudo e collaudo2 usano
example.invalid e non ricevono email. Richiesto all’utente; nessun invio reale
o cambio credenziali avviato. Ogni inserimento di nuova password resta umano.

## Nuovo sviluppo locale — testi sicurezza e recupero password

Base rilasciata ce1841a/cdb9d91 preservata; nessun nuovo commit/push/deploy per
questo sviluppo. SecurityMethods segue le annotazioni degli screenshot: rimossi
avviso Apple e frase sui link ufficiali, spiegazione passkey spostata nella sua
sezione, testo provider sperimentale e avviso recupero assistito rimossi come
richiesto. Conservata la distinzione password/MFA e le istruzioni sulla riserva
nei dettagli. Unico stile CSS per corpo del riquadro, note e riepiloghi; margini
prima/dopo i pulsanti e prima dei dettagli. Font/titoli gerarchici coerenti.

Prima implementazione recupero web in CloudAccess/PasswordRecovery: evento Auth
e rotta dedicata, form protetto da MfaGate, conferma e minimo 12 caratteri,
messaggio invio neutro, errori e collegamento senza sessione. Nessun bypass MFA,
recupero fattori persi o revoca di sessioni introdotti. Nessuna email inviata
né credenziale reale modificata. Dettagli e collaudi mancanti in
docs/recupero-password.md. 350 test/45 file, lint/build cloud e QA sintetico
1280/390 superati. Il test iniziale ha evidenziato e fatto correggere la gara
fra getSession iniziale ed evento recovery; corretto anche un tipo del test.
Nel solo harness grafico aggiunta favicon assente per eliminare un 404.
Evidenze security-copy-1280/390.png e recovery-form-1280/390.png nella cartella QA.

Aggiornamento successivo: link testuali ai download sostituiti da quattro badge,
App Store e Google Play per ciascuna app Google/Microsoft Authenticator. Asset
italiani originali scaricati dai provider in public/store-badges, fonti nel
relativo SOURCES.md. Immagini locali, proporzioni e margini integri, etichette
accessibili con nome app/store, nuova scheda con noopener/noreferrer. Microsoft
ora punta direttamente alle due schede ufficiali verificate. Nessun cambio
al recupero password in questo passaggio. 350 test, lint/build/diff-check e
QA Chrome a 1280/390/320 passati, quattro immagini caricate, nessun overflow
o errore console. Evidenze store-badges-1280/390/320.png nella cartella QA.
Ancora nessun nuovo commit/push/deploy.

## Rilascio web protezione dati — 24 ottobre 2026

L’utente ha autorizzato commit/push/deploy web e confermato specificamente la
sola migrazione 20261022120000 sul progetto ufficiale jjmrdnhvjircbakpthii.
Migrazione eseguita con successo tramite dashboard, lock_timeout 5s e
statement_timeout 60s, con registrazione della versione nella stessa transazione.
Nessun movimento riscritto o cancellato. Il frontend v2 va pubblicato subito
dopo; le vecchie schede devono ricaricare per salvare. Client Apple invariato.
Il progetto Cloudflare corrente si chiama skey e mantiene i domini esistenti
valar-morghulis-web.pages.dev e www.skeyapp.com; nessun Git Provider collegato.
339 test, lint, cloudflare:check e diff-check ripetuti con successo; Git allineato
a origin/main prima del commit. Le sezioni sotto registrano sviluppo e collaudi
precedenti: le indicazioni “non pubblicato” descrivono lo stato storico.
Commit funzionale cdb9d913942b021bd7698c1706f07ce63ff52093 inviato a origin/main.
Deploy web completato: https://0c897cd9.valar-morghulis-web.pages.dev.
Dominio ufficiale https://www.skeyapp.com HTTP 200: gli asset di ingresso JS/CSS
corrispondono byte per byte alla build locale e al deploy. Entry index-L9qxQItx.js
include save_app_data_snapshot_v2. Pagina anonima di accesso renderizzata senza
errori/warning console catturati; nessun movimento reale creato o modificato
per verificare il rilascio. Smoke autenticato produzione/dispositivi non eseguito.
Verifica SQL post-migrazione: versione registrata, v2 per authenticated=true e
anon=false; vecchie RPC snapshot/shared=false; UPDATE diretto su snapshot
personali/familiari=false. Evidenze QA production-data-protection-permissions.png
e production-data-release-login.png; script verify-data-release.mjs confronta
gli asset pubblici (corrette due imperfezioni iniziali del solo script di QA:
parentesi e prefisso relativo ./assets). Nessun segreto o fixture QA commesso.

## Registro sviluppo protezione dati — collaudata su skey-test

Checkout ATTIVO per questo sviluppo:
/Users/simone/Documents/Codex/2026-10-23/skey-data-protection, clone locale
persistente da 6ad9176. Origin GitHub corretto; nessun nuovo commit/push/deploy.
La copia temporanea /tmp/skey-security-publish.DjVBig contiene una prima versione
intermedia: non usarla per il prossimo rilascio. Il checkout originale con
modifiche aziendali/admin/email resta intatto. Online è ancora il rilascio MFA
6ad9176 verificato su www.skeyapp.com e 55632f37.valar-morghulis-web.pages.dev.

Nuova migration preparata 20261022120000_guard_obsolete_snapshot_writers.sql:
introduce save_app_data_snapshot_v2 con controllo MFA esplicito e delega alla
transazione revisionata/idempotente preesistente; revoca scritture dirette
su user_app_data/family_user_app_data e chiamate client alle vecchie RPC
save_app_data_snapshot e sync_family_shared_records. Nessuna riscrittura o
cancellazione di dati. Vecchie schede e client nativo devono aggiornarsi:
non mantenere un canale legacy capace di sovrascrivere l’archivio.

Frontend: cache e coda persistenti distinte per ogni istanza della pagina;
nessun merge automatico preferenziale della copia locale dopo conflitto o
riapertura con operazioni pendenti. Il conflitto sospende nuovi invii e lascia
la copia locale scaricabile. I moduli aperti restano montati ma non interattivi.
Al ritorno nella pagina si verifica il server, bloccando l’interazione durante
la lettura; se un modulo è stato modificato e i dati remoti differiscono, viene
richiesta revisione esplicita. Campi non confermati non inclusi nell’export:
l’avviso lo dichiara prima della chiusura del modulo.

“Carica dati aggiornati” conserva prima una copia locale immutabile di recupero,
poi legge il server; non invia la copia vecchia e non forza il conflitto.
Se spazio locale/connessione non consentono l’operazione, resta bloccato.
Ultima copia di recupero scaricabile dal pulsante in alto anche dopo reload,
limitata all’utente/spazio corrente. Nessun ripristino automatico da questi
JSON e nessun upload di essi. Le copie nel browser non sono cifrate e occupano
spazio: esportarle/conservarle in modo sicuro. Non eliminarle automaticamente
se contengono lavoro pendente. Spazio esaurito sospende i salvataggi anziché
mostrare una falsa conferma. Risposte tardive non rimuovono una protezione.

Verifiche: 339 test in 43 file, lint, build cloud e diff-check riusciti. Prova SQL
incorporata PGlite: tutte le 34 migration del checkout + 14 verifiche, ruoli e
claim sintetici; revisioni obsolete, scritture legacy, idempotenza, isolamento
utente e MFA AAL1/AAL2. Non è un test HTTP con JWT reali né un servizio ospitato.
Chrome/Playwright (Browser plugin non disponibile): due schede stessa origine,
modifica nella A e bozza nella B; B sospesa, bozza conservata, recupero esplicito
senza scrittura aggiuntiva sul server fittizio. Viewport 1280/390, nessun
overflow/overlay/errore console. Script/evidenze in /tmp/skey-security-qa.bJ7YeR:
data-protection-db.mjs, data-protection-browser.mjs, data-conflict-1280/390.png.
Errori iniziali del simulatore (familyContacts async ed attesa badge nascosto
su mobile) corretti; test ripetuti con successo.

Collaudo ospitato completato il 23 ottobre su autorizzazione esplicita limitata
a skey-test (njjesruyafxdizupjicq). Applicata e registrata solo la migration
20261022120000 tramite dashboard, in transazione con lock_timeout 5s e
statement_timeout 60s. Verificati permessi: v2 autenticati=true, anon=false;
scritture dirette personali/familiari=false; vecchie RPC snapshot/shared=false.
Produzione invariata, nessun nuovo commit/push/deploy, nessun invio email/push.

Webapp locale http://localhost:5192 collegata ESCLUSIVAMENTE a skey-test,
configFile/envDir disabilitati per non leggere gli env di produzione del checkout.
Server /tmp/skey-security-qa.bJ7YeR/serve-staging-app.mjs ora punta a questo
checkout persistente; processo avviato nella sessione 68236. Il vecchio server
è stato identificato sulla porta 5192 e terminato in modo ordinato.
Con sessione reale già autenticata di collaudo@example.invalid, due schede:
A salva “COLLAUDO CONCORRENZA A — dato fittizio”, 7,20 EUR, categoria Alimentari,
beneficiario di collaudo, conto Contanti, data 23/10/2026. B contiene il modulo
non confermato “COLLAUDO BOZZA B — non inviare”, 3,50 EUR. Riprendendo B compare
la protezione, modulo ancora montato e non interattivo. Recupero esplicito:
B vede il movimento A e il comando per scaricare l’ultima copia di recupero.
Il movimento fittizio A è rimasto nel solo account di prova; non è stato eliminato.

Verifica HTTP con normale SDK/sessione reale (nessuna estrazione token):
v2 con revisione precedente HTTP 400 app_data_revision_conflict; vecchie RPC
snapshot/shared e PATCH diretta senza destinatari HTTP 403 / 42501.
Lettura prima/dopo: revisione 49/49 e JSON identico; movimento A presente una
volta, bozza B assente. Probe temporaneo limitato all’esatto account di prova,
nessun codice di QA aggiunto al repository. Console della scheda senza errori
o warning catturati; risposte 400/403 previste come esito dei test negativi.
UI reale 553px e 1280px, contenuto e controlli presenti, nessun overlay framework.
Browser plugin non disponibile: CUA del browser integrato usata per il provider
e questi passaggi manuali, oltre al Playwright sintetico già documentato.
Evidenze nella cartella QA: staging-real-conflict.png, staging-real-recovered.png,
staging-real-http-checks.png.

Collaudo familiare reale completato il 24 ottobre. L’utente ha creato direttamente
collaudo2@example.invalid e ne ha eseguito il login senza condividere credenziali.
Su conferma specifica creata in skey-test la sola famiglia “Collaudo protezione
dati”, collaudo amministratore e collaudo2 membro, senza inviti/email/notifiche.
Sessioni isolate per origine localhost:5192 (A) e 127.0.0.1:5192 (B).
A salva spesa condivisa “COLLAUDO FAMIGLIA A — dato fittizio”, 4,80 EUR;
B con bozza aperta viene protetto e recupera esplicitamente la versione remota.
Poi B salva “COLLAUDO FAMIGLIA B — dato fittizio”, 2,40 EUR. Entrambi, anche
dopo reload completo, vedono due movimenti, totale 7,20 EUR, saldo reciproco
coerente di 1,20 EUR. Conti personali separati: A -12,00 EUR (include il proprio
precedente movimento privato 7,20), B -2,40 EUR. Famiglia e fixture conservate
soltanto su skey-test, nessuna eliminazione automatica.

Probe HTTP con i due JWT reali attraverso normale SDK/UI, nessuna estrazione
token: ciascuno legge zero righe dell’archivio privato e dello snapshot familiare
dell’altro; entrambi leggono due record condivisi (A e B una volta ciascuno),
zero record per la bozza “COLLAUDO FAMIGLIA BOZZA B — non inviare”. Chiamata v2
con revisione familiare precedente: HTTP 400 app_data_revision_conflict per
entrambi; snapshot personali/familiari e revisioni identici prima/dopo.
Console di entrambe le schede senza errori/warning catturati. Restano limiti
generali: non è una certificazione su dispositivi/PWA reali, disconnessioni
prolungate reali o tutte le possibili operazioni familiari. Il flusso di
conflitto, recupero, conservazione dei due autori e isolamento è stato provato
con backend ospitato, oltre ai test sintetici già elencati.
Evidenze QA aggiuntive: staging-family-members.png, staging-family-conflict.png,
staging-family-isolation-A.png e staging-family-isolation-B.png.

Prossimo passo: autorizzazione separata per commit/push e modifica backend/deploy
coordinati di produzione. Prima migrazione testata, poi frontend v2; le schede vecchie
avranno salvataggi negati fino al ricaricamento. Non distribuire solo il nuovo
frontend senza RPC v2. Non revocare indiscriminatamente tutte le sessioni e non
riaprire le vecchie scritture per aggirare un errore. Non è stato aggiunto un
timeout delle sessioni: il problema viene affrontato al livello dei dati.

## Attivazione backend completata — rilascio web del 22 ottobre

Conferma esplicita dell’utente ricevuta dopo il blocco del controllo di
sicurezza: migrazione 20261021120000 eseguita e registrata in produzione,
21 policy restrittive su 21 tabelle RLS, hook public.require_optional_mfa,
permesso anon sulla funzione di stato negato. Transazione con timeout lock 5s
e statement 60s; nessuna modifica ai movimenti. Smoke SQL con ruolo authenticated
e claim fittizi AAL1 senza fattori: optional_mfa_satisfied=true e hook invocato
senza eccezioni, rollback. Non è un login reale né un test completo delle RLS.

Distribuite soltanto invite-contact v7, invite-family-member v9 e
notify-family-reimbursement v6: tutte ACTIVE e verify_jwt=true. Funzione
inattività invariata. Hash dei bundle corrispondenti alle versioni collaudate
in skey-test. Sei smoke HTTP in produzione (JWT assente/invalido, body vuoto):
tutti HTTP 401; nessun destinatario, invio email o notifica. Flag pubblici di
build in .env.production entrambi true; nessuna
chiave aggiunta al Git. Conservato il gate anche per fattori già attivi.

Web-only: avviso prima dell’iscrizione TOTP sui limiti Apple nativi e recupero
assistito non disponibile, consiglio di riserva. Riserva realmente collaudata
dall’utente su skey-test senza rimuovere il primo fattore. La compatibilità
su dispositivi/PWA reali, il recupero, Auth diretto e Realtime non sono certificati.
332 test, lint/build cloud e QA sintetico 1280/390 px riusciti. Rilascio frontend
da verificare a deploy concluso; nessun collaudo reale di iscrizione in produzione
completato automaticamente. Le note di attesa qui sotto sono il registro storico.

## Preflight storico — backup e conferma backend

Aggiornamento successivo: backup manuale riuscito, cifrato e conservato soltanto
sul Mac dell’utente fuori dal Git. Verifica umana con password privata e
conferma dello script: decifratura autenticata integrale, pg_restore completo
verso /dev/null e lettura del catalogo; 69 voci TABLE DATA. Nessuna prova di
ripristino su database e nessuna esportazione di ruoli cluster, configurazione
Auth del provider o file Storage. Hash del file cifrato confrontato col
riepilogo locale, corrispondente. Le note sul backup mancante sotto sono storiche.

Migrazione di sola sicurezza preparata nell’editor SQL di produzione come
transazione con lock_timeout 5s, statement_timeout 60s e registrazione della
sola versione 20261021120000. NON eseguita: il controllo di sicurezza ha
rifiutato il click perché richiede autorizzazione esplicita per l’attivazione
backend, distinta dal deploy web. Inviata domanda precisa all’utente su
migrazione, hook/21 policy, tre Edge Function e abilitazione frontend; attendere
risposta prima di riprovare. Non aggirare il rifiuto usando CLI o API.

L’utente ha autorizzato il rilascio sicurezza solo webapp, rinviando il client
Apple. Ha confermato separatamente i parametri passkey di produzione: sKey,
RP ID skeyapp.com, origin https://www.skeyapp.com. Configurazione salvata nel
progetto jjmrdnhvjircbakpthii; dashboard: “Passkey settings updated successfully”.
TOTP già abilitato sul provider, massimo 10 fattori; limite AAL1 a 15 minuti
già attivo, non modificato. Zero utenti con fattori verificati al preflight.

Schema: 21 tabelle public con RLS, nessun hook db_pre_request, funzione
optional_mfa_satisfied assente. Registro migration più recente:
20261002120000 account_monthly_spending_limit. Non applicare le altre migration
locali fuori ambito. Non è stata ancora applicata quella MFA, né distribuite
le tre Edge Function in produzione. I flag frontend restano entrambi false.

Blocco: dashboard Database Backups conferma Free Plan senza project backups.
Serve predisporre un backup manuale ripristinabile o una soluzione equivalente
prima di modificare l’enforcement in produzione. Nessun dato utente esportato,
nessun cambio piano. Richiesta all’utente per il backup manuale ancora pendente.
Non presentare il rilascio come completato. Le passkey sono abilitate nel
provider ma non esposte nella webapp; le credenziali localhost non trasferite.

Modifica locale selettiva: avviso web-only e incompatibilità Apple prima
dell’iscrizione; testo esplicito sull’assenza del recupero assistito, senza
promettere sblocchi. 332 test / 43 file, lint, build e cloud check riusciti.
QA sintetico Chrome/Playwright (Browser plugin non disponibile) a 1280/390 px:
avvisi visibili, dettagli espandibili, nessun overflow/overlay/errore console.
Prova umana riserva su skey-test completata: nuovo TOTP 3adcd5 usato al login,
bacheca verificata, primo fattore 6cdf06 preservato. Nessun segreto acquisito.
Screenshot temporanei in /tmp/skey-security-qa.bJ7YeR: production-passkeys-configured,
production-backup-unavailable e web-only-warning-1280/390. Nessun nuovo commit,
push o deploy effettuato per questa attivazione ancora incompleta.

## Sicurezza web — rilascio preparatorio del 22 ottobre

Commit, push e deploy frontend autorizzati dall’utente. Questa selezione
introduce gate MFA, impostazioni facoltative, passkey predisposte, istruzioni
e link ufficiali agli autenticatori. VITE_MFA_ENABLED=false e
VITE_PASSKEYS_ENABLED=false nel bundle di produzione: nessuna nuova iscrizione
MFA o passkey viene attivata con questo rilascio. Restano email e password.
La migration MFA e le guardie Edge sono versionate ma NON applicate/distribuite
al backend di produzione. La loro attivazione richiede controlli e autorizzazione
separati. Le credenziali di collaudo non sono credenziali del sito pubblico.

Selezione isolata da 40301548370fbd9910b9851d1310f03c2694caf2: escluse modifiche
aziendali/fiscali, cancellazione amministrativa utenti, email e inattività.
Test della selezione: 331 test in 43 file, lint e compilazione; verificare anche
il gate cloud prima del deploy. Collaudi reali eseguiti solo su skey-test:
passkey/TOTP, codice errato, fallback, letture dirette AAL1 negate e ciclo
applicativo con movimento fittizio; limiti dettagliati in
docs/autenticazione-facoltativa.md. Restano recupero assistito, smartphone/PWA,
compatibilità Apple nativa e confini Edge/Realtime/Auth diretto.

Non distribuire automaticamente le Edge Function da questo commit senza aver
prima applicato e verificato l’enforcement: in assenza della RPC la guardia
nega le richieste. Non rimuovere verifiche MFA per un rollback.

## Introduzione della Guida web — rilascio del 3 ottobre

La prima parte della Guida presenta ora sKey come sistema unico per finanze
personali, conti condivisi, scadenze e rapporti economici fra persone. Spiega
l'origine del nome “SCHEI”, i casi d'uso coperti e la distinzione fra contatti e
familiari, chiarendo con un esempio come acquisti per altri, classificazione e
rimborso restino coerenti con conti, categorie e statistiche.

Il testo mantiene “Wellfare” come denominazione usata nell'interfaccia. Verifica
locale: 283 test web, lint e build Vite riusciti; controllo browser desktop e a
390 px senza overflow orizzontale né errori o avvisi in console.

## Movimenti ricorrenti web — rilascio del 2 ottobre

La voce “Pagamenti programmati” è diventata “Ricorrenze e rate” ed è sempre
visibile nel menu, anche quando non esistono ancora piani rateali. Da questa
pagina l'utente può creare spese o entrate ricorrenti con importo normalmente
fisso oppure da verificare, prossima data, frequenza, conto, categoria,
beneficiario o mittente, tag, commenti e condivisione.

Tre giorni prima della data prevista la Bacheca mostra una notifica che apre la
sezione delle ricorrenze. La conferma passa dal normale modulo del movimento,
quindi importo, data e classificazione restano modificabili; soltanto il
salvataggio aggiorna conti, budget, limiti e report. Dopo la conferma o il salto
della singola scadenza, la data successiva viene calcolata dalla regola
originaria senza slittare sui mesi corti. Le ricorrenze possono inoltre essere
modificate, sospese, riattivate o eliminate senza toccare i movimenti storici.

Le definizioni restano private all'autore e vengono salvate nello snapshot
AppData v3 personale o familiare; non richiedono una migration SQL e non vengono
pubblicate come record visibili agli altri membri. Il client Apple non è stato
modificato. Verifica locale: 283 test web, lint e build Vite riusciti.

## Saldo e limite mensile dei conti web — 2 ottobre

La pagina Conti mostra per ogni conto il saldo globale e la variazione netta del
mese corrente. Dalla modifica del conto si può impostare o rimuovere un limite
mensile di spesa; l'avanzamento è visibile nell'elenco e dal 90% compare una
notifica in Bacheca, con evidenza distinta in caso di superamento. Il conteggio
considera le spese effettivamente addebitate al conto, comprese commissioni e
quote Wellfare, ma non tratta i giro fondi come spesa.

La data dei movimenti resta visibile anche quando la finestra viene ridotta e
nelle liste mobili, mantenendo affiancati i comandi disponibili. La Guida web e
il riepilogo delle funzioni nel README sono stati aggiornati. Le modifiche alla
sicurezza discusse in parallelo sono state escluse dal rilascio e restano in
stand-by.

La migration `20261002120000_account_monthly_spending_limit.sql` è stata
applicata al progetto Supabase di produzione il 2 ottobre 2026; il successivo
`db lint --linked --schema public` non ha rilevato errori. Verifica locale: 278
test web, lint, build Vite e `cloudflare:check` riusciti.

## Navigazione e report web — sviluppo locale del 28 settembre

La voce “Spese ed Entrate” del menu web è stata rinominata “Movimenti”, senza
modificare il titolo o il contenuto della pagina. In “Ricerca e report”, creando
un report i risultati generici della ricerca vengono nascosti e resta visibile
soltanto il dettaglio del report. Avviando una nuova ricerca, il report aperto o
appena creato si contrae in un riepilogo con nome, numero di movimenti e totale;
i nuovi risultati occupano lo spazio principale e il report può essere riaperto
con “Espandi report”. I filtri del report e quelli della nuova ricerca sono
separati, quindi la ricerca successiva non modifica involontariamente il report.

Verifica locale: 274 test web, lint e build Vite riusciti. Il browser locale ha
confermato il flusso completo a desktop e a 390 px, la nuova etichetta nel menu,
l'assenza di overflow orizzontale e di errori o avvisi in console.

## Nome progetto Cloudflare Pages — 28 settembre

Il progetto Cloudflare Pages esistente è stato rinominato da
`valar-morghulis-web` a `skey` e `wrangler.jsonc` è stato allineato. La rinomina
non cambia il sottodominio assegnato alla creazione: Cloudflare continua a
servire il progetto su `valar-morghulis-web.pages.dev` e dichiara che un
`*.pages.dev` diverso richiede la cancellazione e ricreazione del progetto.
I domini personalizzati `www.skeyapp.com` e `www.valarmorghulis.it` restano
associati al progetto esistente.

## Ricerca e report web — sviluppo locale del 28 settembre

La nuova voce “Ricerca e report”, collocata sotto “Tag”, cerca i movimenti già
visibili all'utente usando parole presenti nella descrizione o nei commenti,
compresi quelli dei parziali. I filtri combinabili coprono intervallo di date,
spesa/entrata, beneficiario o mittente tramite menu ricercabile, categoria e
tag. I risultati rispettano la stessa separazione fra dati personali e familiari
del resto dell'app. All'apertura non viene eseguita alcuna ricerca: i risultati
restano nascosti mentre si compilano i campi e compaiono soltanto premendo
“Cerca”; anche “Crea report” è disponibile solo dopo questo passaggio.

Dai risultati si può generare un grafico a colonne verticali con la spesa di
ogni mese dell'intervallo. Per categorie, tag o beneficiari applicati a un
acquisto multiplo, il totale include soltanto le allocazioni corrispondenti e
non le righe escluse dai report. Sotto al grafico sono visibili il totale degli
importi pertinenti, il numero di movimenti e l'elenco completo con i comandi di
modifica ed eliminazione. L'eliminazione propone due scelte: escludere il
movimento soltanto dal report, lasciando invariati storico e saldi, oppure
cancellarlo completamente tramite il flusso contabile già esistente.

Il report salvato conserva nome, filtri e identificativi dei movimenti esclusi,
non una copia dei movimenti: riaprendolo mostra quindi i dati correnti e può
essere modificato o eliminato mantenendo la stessa identità finché esiste. Le
definizioni appartengono al solo utente e restano nello snapshot privato AppData
v3; il nuovo campo delle esclusioni è opzionale e non richiede una migration.

La funzione è stata sviluppata soltanto per la web app. Il client Apple non è
stato modificato. Verifica locale dopo l'estensione: 273 test web, lint e build
Vite riusciti; collaudo nel browser locale riuscito su desktop e a 390 px,
inclusi stato iniziale privo di risultati, compilazione senza ricerca automatica,
comparsa di risultati e “Crea report” dopo “Cerca”, totale, lista, apertura del
menu azioni, dialogo con le due modalità di eliminazione e apertura del modulo di
modifica, senza errori console né overflow orizzontale. La versione iniziale di
Ricerca e report è stata pubblicata con il commit `3bdbac8`; le estensioni
descritte qui sono state pubblicate con il commit `5d5a969` su Cloudflare Pages.

## Pagamenti PayPal con conto collegato — pubblicato il 25 settembre

Quando il conto di addebito è PayPal, web e client Apple mostrano l'opzione
“Utilizza conto collegato”. L'utente sceglie un secondo conto personale e la
quota prelevata da quel conto; la parte restante continua a essere addebitata a
PayPal. Il conto PayPal selezionato è escluso dalle alternative e il pagamento
a rate non viene proposto durante l'uso di due conti.

La persistenza riusa i campi compatibili `welfareAccountId` e `welfareAmount`
di AppData v3: `accountId` resta il conto PayPal, mentre il primo campo identifica
il secondo conto. Non è necessaria una migration del database.

Verifica di rilascio: 263 test web, lint e build Vite riusciti; controllo reale della
webapp desktop riuscito senza errori console, con residuo PayPal e lista del
secondo conto verificati; build iOS Simulator non firmata e 32 test unitari
Apple riusciti. Commit funzionale `5b77c9e`, push su `origin/main` e deploy
Cloudflare Pages completati. Il database remoto è allineato e non richiede
nuove migration.

## Istituto bancario e dettaglio commissioni — rilascio del 10 settembre

Prima di salvare una spesa o un giro fondi che usa in uscita un conto bancario
senza istituto, web e client Apple sospendono l'operazione e aprono una finestra
dedicata. La finestra spiega che l'istituto identifica il conto e determina la
categoria “Commissioni <Istituto>”, richiede il dato e, dopo aver aggiornato il
conto, riprende automaticamente il salvataggio. La regola copre anche un conto
bancario usato per completare un pagamento iniziato con Wellfare.
Nel dettaglio della categoria “Commissioni <Istituto>” sono inclusi anche i
giro fondi: la riga mostra il solo costo bancario, mentre il saldo del conto di
origine continua a sottrarre importo trasferito e commissione e il conto di
destinazione riceve soltanto l'importo trasferito. I campi del riquadro delle
commissioni nel nuovo movimento sono allineati sulla stessa griglia.

Verifica locale: 252 test web, lint e build Vite riusciti; build iOS Simulator
non firmata e 31 test unitari Apple riusciti. Playwright non è installato nel
progetto, quindi l'interazione web è stata verificata con test DOM. Non sono
necessarie modifiche allo schema del database.

## Pagamenti misti e commissioni — pubblicato il 10 settembre

Web e client Apple supportano ora il pagamento misto anche quando il conto
primario è Wellfare (“Completa con altri fondi”). Le spese da conto bancario
possono registrare tipo di operazione e commissione separata: il saldo addebita
netto più commissione, mentre la commissione crea o riusa la categoria personale
o familiare “Commissioni <Istituto>”. Lo stesso collegamento di categoria è stato
aggiunto alle commissioni dei giro fondi. L'editor dei conti modifica anche nome,
istituto/dettaglio e tipo. La web app forza l'email del profilo su una riga propria
e mantiene visibile il campo attivo nei browser touch che non ridimensionano la
viewport, incluso il caso segnalato su Tesla; il comportamento reale della
tastiera Tesla resta da provare sul veicolo.

Verifica di rilascio: 246 test web, lint, build Vite, controllo Cloudflare,
build iOS Simulator non firmata e 31 test unitari Apple riusciti. Commit
`d9195e2`, push su `origin/main` e deploy Cloudflare Pages completati.

## Ingressi familiari — pubblicato il 7 settembre

Il controllo dei sorgenti conferma flussi separati: `invite-contact` usa
`contactInvite` e `accept_contact_invitation` scrive soltanto il collegamento
tra contatti (e associa eventuali acquisti pendenti). Non scrive membership.
La causa del singolo ingresso segnalato non è stata verificata sul database
di produzione: non attribuirla automaticamente a questo flusso.

La migration `20260907120000_family_admission_approval.sql`, applicata al
progetto Supabase di produzione, sostituisce
l'ingresso immediato con consenso dell'invitato seguito da approvazione admin.
`accept_family_invitation` restituisce null senza inserire membri;
`review_family_admission` verifica amministratore, consenso, scadenza, email
confermata e impedisce auto-approvazioni. I nuovi campi di consenso non possono
essere precompilati con un INSERT client. Il reinvio invalida il vecchio consenso.
La web app mostra attesa, approvazione e rifiuto. Nessuna membership esistente
è modificata. UI amministrativa Apple ancora da allineare.

Rimozione membri pubblicata l’8 settembre 2026. La web app
presenta due scelte esplicite prima della revoca:

- Mantieni nello storico: conserva i movimenti generati dal membro e le quote
  passate; il membro perde l'accesso e non partecipa alle operazioni future.
- Elimina e ricalcola: elimina i suoi movimenti dalla contabilità familiare e
  ricalcola le quote fra i membri rimasti, come se non fosse entrato.

Nessuna scelta cancella l'account sKey o i dati personali dell'utente. La
scelta distruttiva richiede conferma esplicita con riepilogo degli effetti. La
migration `20260908120000_family_member_removal.sql` aggiunge la RPC atomica
`remove_family_member`, l’audit delle revoche e uno snapshot server-authoritative
di ID e nomi dei membri su ogni record finanziario. La modalità conservativa
blocca la revoca in presenza di rimborsi, prestiti, restituzioni o acquisti
ancora aperti; quella distruttiva elimina i record coinvolti, pulisce le cache
del membro e ristampa sui record rimasti la nuova composizione familiare.
L’amministratore non può rimuovere se stesso né un altro amministratore.

Verifica: 223 test web, lint, build e controllo Cloudflare superati. La migration
è applicata al progetto Supabase remoto. Sul nucleo familiare di produzione sono
state rimosse le appartenenze errate di Laura e Paolo, mantenendo intatti i loro
account personali; restano Anna e Simone. Il saldo server è stato verificato a
–109,97 € per Simone e +109,97 € per Anna, includendo correttamente il giro
fondi personale→familiare. Paolo resta iscritto alla piattaforma ma non appartiene
più alla famiglia. Restano da verificare la concorrenza e da allineare UI e
calcoli Apple.

## Revisione email e inattività — pubblicata in modalità disattivata

La base iniziale è main pulito e allineato a origin/main a `73a5f1c`.
I cinque template Auth sono pubblicati e il mittente SMTP ospitato è
“Attivazione sKey”. Gli avvisi usano una coda privata nella migration applicata
`20260905220000_inactivity_notices.sql`, la Edge Function
`send-inactivity-notices` distribuita e un adapter Resend opzionale.
La proposta è 180 giorni senza attività + 30 di preavviso. La web app segnala
le aperture visibili e il client Apple segnala il primo piano. Nessuna
cancellazione account automatica o email di inattività è attiva: policy,
segreti e scheduler sono assenti/disabilitati. Specifiche e collaudo richiesto
in `docs/email-e-inattivita.md`.

Verifiche complessive: 217 test web, lint, build Vite e controllo Cloudflare
riusciti; build iOS Simulator non firmata già riuscita. SQL/RLS, consegna reale
delle email e runtime della Edge Function restano da collaudare in staging.

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
- conti personali, conti condivisi, carte, contanti e giro fondi; il profilo
  consente di scegliere il conto predefinito dei nuovi movimenti;
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
- piano rateale completo conservato soltanto nei dati privati dell'autore: non viene pubblicato come record familiare e “Ricorrenze e rate” mostra sempre l'intera rata, non la quota condivisa;
- rimborsi in attesa di conferma della controparte, esclusi da saldi e conti finché non vengono accettati;
- pagina “Rimborsi e prestiti” con segmenti “Attesi” e “Dovuti”; include anche gli acquisti ordinari per conto terzi e, sul web, prestiti familiari con conferma iniziale, residuo e restituzioni parziali;
- migration `20260901100000_family_loans.sql` applicata al progetto Supabase remoto il 1 settembre 2026: aggiunge record autorevoli `loan`/`loan_repayment`, RPC di creazione e risposta reciproca e controllo server del credito familiare; il client Apple decodifica e contabilizza questi record e dispone delle chiamate repository, mentre la relativa UI nativa resta da completare;
- compensazione di un rimborso mediante acquisto diretto per il creditore, con descrizione obbligatoria e classificazione personale da parte del destinatario;
- rubrica Contatti composta automaticamente dai membri delle famiglie e da amici invitati via email, rimovibili senza cancellare lo storico;
- spese su commissione personali: il pagante sceglie un contatto o lo invita
  durante l'inserimento e il proprio conto viene addebitato senza includere la
  voce nelle statistiche. Il destinatario conferma e cataloga l’acquisto, poi
  emette il rimborso dal proprio conto; il pagante contabilizza l’entrata solo
  dopo avere confermato l’incasso e scelto il conto di destinazione;
- “Paga alla romana” registra un unico addebito del totale e calcola in centesimi la quota del pagante e una quota per ogni contatto. Le quote dei contatti riusano le richieste commissionate; per un familiare la quota può invece essere collegata a un rimborso `purchase` solo se il credito disponibile la copre interamente;
- il record familiare confermato o rifiutato prevale sulla copia privata precedente dell’autore, evitando che un rimborso approvato torni a risultare “in attesa” dopo il login;
- pubblicazione facoltativa e distinta per famiglia del solo nome dei conti personali usabili nei rimborsi; saldo, istituto e movimenti non vengono condivisi;
- completamento del conto personale mancante da parte del proprietario durante la conferma e possibilità di rifiutare il rimborso;
- modifica dei movimenti riservata all’autore;
- modifica ed eliminazione disponibili in ogni elenco che mostra movimenti,
  compresi dettagli del conto e filtri per categoria, beneficiario, mittente e
  tag; dopo il salvataggio si torna all’elenco di origine;
- giro fondi modificabili ed eliminabili nello storico e nei dettagli del conto,
  con data visibile e spese bancarie sottratte soltanto dal conto di origine;
- un movimento esistente può passare da personale a condiviso o viceversa, con
  ricalcolo derivato di saldi, conti e statistiche;
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
- pagina Guida raggiungibile dal menù laterale, aggiornata alle quattro scelte
  del nuovo movimento, acquisti multipli, Paga alla romana, commissioni dei giro
  fondi, piano rateale completo, iter reciproco di rimborsi e prestiti, azioni
  contestuali in tutti gli elenchi, sincronizzazione resiliente e privacy;
- più famiglie per utente, famiglia attiva selezionabile e ruoli `admin`/`member` distinti per appartenenza;
- vista condivisa selezionabile direttamente dalla bacheca, mantenendo un unico archivio personale fra tutte le famiglie;
- onboarding utilizzabile anche senza creare subito una famiglia;
- esportazione completa in JSON, CSV o XML e cancellazione definitiva dell’account;
- cancellazione della famiglia con eliminazione dei dati condivisi oppure conversione in personali dei movimenti creati da ciascun autore;
- creazione di ulteriori famiglie, rinomina e inviti riservati agli amministratori, con inviti validi sette giorni;
- elenco amministrativo dei membri e degli inviti: revoca o reinvio per quelli in attesa, reinvio per quelli scaduti e rimozione obbligatoria per quelli rifiutati prima di un nuovo invito;
- rimozione amministrativa di un membro con scelta fra storico invariato ed eliminazione con ricalcolo; account e dati personali del membro restano intatti;
- accettazione o rifiuto esplicito da parte del destinatario prima di entrare nella famiglia;
- conto condiviso immediatamente visibile ai membri che accettano l’invito.
- movimenti, rate, rimborsi e girofondi condivisi sincronizzati in tempo reale fra tutti i membri, con ricalcolo locale del saldo;
- salvataggi web protetti da coda locale persistente, retry automatico/manuale,
  identificatori idempotenti e revisioni optimistic-lock; l’interfaccia distingue
  gli stati sincronizzato, in corso, offline, pendente ed errore;
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
- Una richiesta ordinaria per conto terzi usa tre passaggi distinti: il destinatario conferma e cataloga l’acquisto senza muovere denaro, poi sceglie il conto e usa “Emetti rimborso”; il pagante sceglie infine il conto di destinazione e conferma l’incasso. L’addebito nasce all’emissione e l’entrata soltanto all’ultima conferma. Una richiesta collegata a `settlementMethod = purchase` regola invece il solo rimborso familiare e non genera quell'entrata aggiuntiva.
- Un nuovo utente parte soltanto con `Contanti` e l’eventuale conto condiviso della famiglia.
- Il rimborso è una registrazione contabile: l’app non trasferisce realmente denaro.
- Un rimborso nuovo non modifica il saldo familiare né i conti finché la controparte non lo conferma. L’autore non può auto-confermarlo.
- Un rimborso confermato non è modificabile dalla sincronizzazione ordinaria. Ciascuna parte può proporre una variazione di importo, data e del proprio conto, oppure l'annullamento; l'effetto originale resta attivo finché l'altra parte approva. Il richiedente può ritirare la proposta e tutte le risposte restano registrate per audit.
- I conti personali restano privati. Il proprietario sceglie separatamente per quali famiglie pubblicare soltanto nome e identificatore opaco dei conti selezionabili nei rimborsi.
- Se la destinazione del rimborso è un conto condiviso, compensa il debito soltanto la quota appartenente agli altri membri.
- Un giroconto dal conto condiviso a un conto personale genera per il titolare del conto di destinazione un debito pari alle quote appartenenti agli altri membri.
- La famiglia attiva è una preferenza locale per utente; lo snapshot personale è unico per account, mentre i record familiari sono comuni ai membri della sola famiglia selezionata.
- Ogni record finanziario conserva la composizione familiare usata per la ripartizione. Rimuovendo un membro con storico invariato, le vecchie quote restano quindi identiche e il membro uscente è escluso soltanto dalle operazioni future.
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
- `src/lib/cloudSync.ts`: metadati persistenti della coda cloud, retry e
  riconoscimento dei conflitti di revisione.
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

1. collaudare la rimozione membri con ulteriori combinazioni concorrenti, poi aggiungere trasferimento del ruolo amministratore e uscita volontaria da una famiglia;
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

La migrazione `20260803120000_registered_user_count.sql` esponeva agli utenti
autenticati soltanto il totale dei profili registrati. La successiva
`20260904120000_platform_admin_console.sql` revoca quell’accesso generale e
introduce amministratori globali separati dai ruoli familiari, attività di
apertura autenticata aggiornata al massimo ogni dodici ore e un riepilogo minimo
degli utenti protetto da RPC. La console non mostra dati contabili e non offre
ancora avvisi o eliminazioni. La migration è stata applicata il 4 settembre
2026; il titolare è stato inserito in `platform_admins` direttamente sul backend,
senza versionarne email o UUID. `migration list` è allineato, il lint dello
schema `public` non segnala errori e le due tabelle restano illeggibili al ruolo
`authenticated`, che può usare soltanto le RPC autorizzate.

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
Notifications per il bundle `com.skeyapp.skey`, profili di firma aggiornati
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
saldo familiare in modo proporzionale al numero dei membri. Le spese bancarie
opzionali sono addebitate soltanto al conto di origine, non aumentano l’importo
accreditato e non generano credito familiare.

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

“Ricorrenze e rate” raggruppa le rate future per piano di acquisto come la
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

Verifiche locali al 4 settembre 2026: 192 test web superati, lint e build Vite
verdi; il browser locale ha verificato anche presenza, spiegazione e allineamento
del campo “Spese bancarie” nel giro fondi. Anche il build non firmato del target
Apple per simulatore è riuscito nell’ultima verifica dedicata.

Il lavoro del 5 settembre 2026 rende resiliente la sincronizzazione ordinaria
della web app. Ogni modifica aggiorna subito la copia locale e crea un marker
persistente per utente e famiglia; il marker viene eliminato soltanto dopo la
conferma del server. I retry usano lo stesso UUID, così una risposta di rete
persa non duplica l’operazione. In presenza di revisioni divergenti il client
ricarica il remoto, mantiene autorevoli i movimenti, le rate e i girofondi
dell’autore ancora pendenti (incluse le cancellazioni), conserva i record degli
altri membri e riprova con una nuova revisione. Gli eventi Realtime vengono
rinviati finché la coda locale non è vuota.

La migration locale `20260905130000_resilient_app_data_sync.sql` aggiunge le
revisioni agli snapshot, il registro idempotente delle mutation e la RPC
transazionale `save_app_data_snapshot`. I trigger incrementano le revisioni
anche per i client precedenti che usano ancora gli upsert diretti, mantenendo la
compatibilità col client Apple. La migration è stata applicata al progetto
Supabase remoto il 5 settembre 2026; `migration list` è allineato e
`db lint --linked --schema public` non rileva errori. Verifica locale: 200 test
web, lint e build Vite superati. La prova visuale in browser non è stata
eseguita perché in questa sessione non è disponibile il browser di collaudo.

La build cloud separa ora `@supabase/*` dal codice applicativo tramite il
`codeSplitting` nativo di Vite 8/Rolldown. Con la configurazione cloud attiva il
chunk principale passa da 513,57 kB a 307,42 kB e il chunk Supabase misura
205,72 kB; nessun file JavaScript supera quindi la soglia Vite di 500 kB. Il
gate `cloudflare:check` verifica anche questa soglia e blocca il rilascio in caso
di regressione, oltre a continuare a controllare la presenza della
configurazione Supabase.

Il lavoro locale dell’8 settembre 2026 aggiunge il conto personale “Wellfare”
e l’addebito misto delle spese: la quota indicata viene sottratta dalla tessera
Wellfare e soltanto il residuo dal conto principale. Il totale del movimento
resta unico per categorie, condivisione e statistiche; il client Apple decodifica
il nuovo tipo e calcola correttamente entrambi i saldi. Le categorie di spesa
possono inoltre avere un budget mensile personale o familiare: la bacheca avvisa
dal 90% e propone esplicitamente il riporto dell’eccedenza al mese successivo.
Le azioni contestuali della web app sono raccolte in menu a tre puntini e le
righe aprono i relativi movimenti tramite una freccia separata. Nessuna migration
è necessaria perché i nuovi campi restano nei documenti JSON già versionati.
Verifica locale: 231 test web, lint, controllo TypeScript e build Vite superati;
31 test unitari Apple superati, incluso il nuovo caso Wellfare. Modifiche non
ancora commesse né pubblicate.

La migration `20260905150000_commissioned_reimbursement_confirmation.sql`
separa la ricezione di un acquisto per conto terzi dall’emissione e dall’incasso
del relativo rimborso. I record ordinari già confermati vengono convertiti in
rimborsi emessi ancora da confermare dal pagante; le compensazioni familiari
tramite acquisto restano invariate. Le scritture private vengono riconciliate in
entrambi i versi: un rimborso annullato rimuove sia l’eventuale entrata del
pagante sia l’addebito del destinatario. La tabella è aggiunta a Realtime per
aggiornare le due parti mentre la pagina è aperta. La migration è stata
applicata al progetto remoto il 5 settembre 2026; `migration list` è allineato e
`db lint --linked --schema public` non segnala errori. Verifica locale aggiornata dopo il rebranding sKey:
207 test web, lint, build e gate cloud superati; la build iOS Simulator compila
con il nuovo bundle `com.skeyapp.skey`. Il browser locale ha confermato il nuovo
marchio, la guida aggiornata, la voce singolare “Giro fondi”, i comandi
modifica/elimina e la navigazione interna senza errori console.

## Hosting Cloudflare

Il progetto è configurato per Cloudflare Pages tramite `wrangler.jsonc`.
`pnpm cloudflare:check` esegue la build e verifica che l'autenticazione Supabase
sia inclusa e che ogni chunk JavaScript resti entro 500 kB;
`pnpm cloudflare:deploy` pubblica la SPA nel progetto
`skey`. Il file locale ignorato `.env.production.local` deve
contenere `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`: senza questi valori il
controllo fallisce prima del deploy, impedendo di pubblicare la modalità demo.

Produzione: `https://www.skeyapp.com/`. Il dominio è attivo nei Custom domains
del progetto Pages esistente e in Tophost il CNAME `www` punta al sottodominio
storico `valar-morghulis-web.pages.dev`, che Cloudflare non consente di rinominare
in-place. Il segreto Supabase `APP_URL`, il Site URL Auth
e la relativa allow list usano il nuovo indirizzo; il vecchio dominio resta
temporaneamente consentito nella allow list durante la transizione.
Il middleware `functions/_middleware.js` reindirizza permanentemente
`valarmorghulis.it`, con e senza `www`, verso `www.skeyapp.com`, conservando
percorso e query. I record DNS relativi alla posta e i nameserver Tophost non
sono stati modificati.

## Rilascio del 9 settembre 2026

La web app allinea la freccia dei contatti alla fine della riga e usa lo stesso
indicatore personalizzato nei due selettori della bacheca. I menu a tre puntini
sono ora controllati: si chiudono dopo un'azione, con un clic esterno e con Esc.

La pagina Conti permette di eliminare un conto scegliendo se conservare le
operazioni nello storico, eliminarle oppure ricondurle a un conto compatibile
dello stesso ambito. I record conservati mostrano “Conto eliminato”; la
preferenza del conto predefinito viene rimossa o ricondotta. I conti familiari
richiedono il ruolo amministratore e usano la nuova RPC atomica
`delete_family_account`. Le operazioni reciproche — rimborsi, prestiti e
acquisti per conto terzi — non possono essere eliminate o ricondotte da questa
procedura: vanno prima rettificate con la conferma della controparte.

Le migration `20260909010000_account_deletion_strategies.sql` e
`20260909013000_account_deletion_function_volatility.sql` implementano la RPC
e allineano la volatilità dichiarata delle funzioni JSONB a quella rilevata da
PostgreSQL. Verifica locale: 244 test web, lint, controllo TypeScript, build
Vite e `git diff --check` superati. Entrambe sono applicate in produzione; lo
schema remoto supera `db lint --linked --schema public` senza segnalazioni. La
web app è pubblicata su Cloudflare Pages e verificata su `www.skeyapp.com`.
