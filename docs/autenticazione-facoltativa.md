# Autenticatore facoltativo e passkey — preparazione locale

Aggiornamento di rilascio del 22 ottobre: l’utente ha successivamente
autorizzato commit, push e deploy della preparazione web. Il bundle pubblico
mantiene entrambi i flag disabilitati. Nessuna migration o modifica Auth di
produzione è inclusa nell’operazione; le guardie Edge sono solo versionate.
Le sezioni seguenti descrivono collaudi e preparazione precedenti al rilascio,
non un’attivazione già completata del secondo fattore sul sito pubblico.

## Comportamento web

L’autenticatore TOTP è facoltativo. Nelle impostazioni il consiglio di attivarlo
non impedisce di usare email e password. Nessuna iscrizione o apertura delle
impostazioni crea automaticamente un fattore. La procedura illustra QR code,
inserimento manuale sullo stesso telefono e conferma con codice a sei cifre.
QR e chiave rimangono nello stato temporaneo della schermata, non nell’archivio
finanziario. L’annullamento elimina la configurazione incompleta corrente.
Una procedura abbandonata chiudendo la pagina può lasciare un fattore non
verificato: non attiva MFA e richiede eventuale pulizia amministrativa.

Dopo l’attivazione, ogni accesso AAL1 richiede il codice prima di montare
l’applicazione finanziaria, anche se effettuato tramite passkey. Errori di
verifica bloccano i dati invece di saltare il controllo. La rimozione di un
autenticatore richiede un suo codice valido. È possibile aggiungerne uno di
riserva. Il recupero password non disabilita MFA; non sono implementati codici
di recupero. Prima del rilascio definire una procedura di assistenza con verifica
della titolarità, evitando rimozioni basate sulla sola richiesta email.

## Stato: non attivato in produzione

### Migliorie dell’interfaccia dopo i collaudi — 22 ottobre 2026

Caricamento dei metodi con risultati indipendenti: se l’elenco delle passkey
fallisce ma lo stato MFA è verificato, l’autenticatore rimane visibile e gestibile.
Le azioni passkey restano sospese fino a un caricamento riuscito, con retry
esplicito. Se fallisce lo stato di sicurezza, nessuna falsa indicazione “non
attivo” e nessun comando di configurazione vengono mostrati. Un errore durante
un’operazione non nasconde più tutti i comandi; si può riprovare senza ricaricare
la pagina. Stato caricato associato alla specifica istanza API.

Accesso con passkey annullato/non supportato: avviso vicino al pulsante, con
focus accessibile, testo più leggibile e comando “Continua con email e password”.
Il comando riporta al campo corretto senza inviare il modulo né perdere l’email.
Il cambio scheda e l’accesso con password eliminano l’avviso precedente.

Con un solo autenticatore, consiglio facoltativo di configurare una riserva
su un altro dispositivo sicuro. Aggiunte istruzioni espandibili per prevenire
la perdita di accesso, senza generare credenziali, promettere codici di recupero
o rimuovere la verifica MFA. Nessun recupero amministrativo automatico aggiunto.

Verifica: 331 test in 43 file (nove nuove regressioni), lint e build riusciti.
QA grafico sintetico: 15 controlli a 390/1280 px, focus e fallback, errore
parziale delle passkey con TOTP disponibile, istruzioni espandibili e assenza
di overflow/overlay/errori console. Browser plugin non disponibile: Playwright
con Chrome in contesto isolato senza credenziali reali. Nel browser integrato
su skey-test verificata la scheda aggiornata con fattore e passkey preesistenti,
senza creazioni o rimozioni. Nessuna modifica alla produzione, commit o deploy.

### Preparazione del passaggio in produzione — 22 ottobre 2026

Richiesta dell’utente: preparare l’attivazione su `https://www.skeyapp.com`.
Non equivale ad autorizzare ora commit, push, deploy, modifiche Auth o migration
in produzione. Progetto di destinazione: `jjmrdnhvjircbakpthii`; il collaudo
rimane su `njjesruyafxdizupjicq`. Nessun file ambiente di produzione copiato o
modificato durante questa preparazione.

Nelle spiegazioni sono stati aggiunti Google Authenticator (link Google Play
e App Store) e Microsoft Authenticator (pagina ufficiale italiana), anche
durante la configurazione. Apertura `_blank` con `noopener noreferrer`, senza
passare chiavi o codici nei link e senza creare fattori automaticamente.

Preparata copia locale isolata dal commit `40301548370fbd9910b9851d1310f03c2694caf2`:
solo 18 file di sicurezza aggiunti/aggiornati, con manifest SHA-256. Per i file
con cambiamenti misti sono stati selezionati solo import/render SecurityMethods,
autenticazione e relativi stili; esclusi parte aziendale/fiscale, cancellazione
amministrativa degli utenti, template email e inattività. Il test di quella
console non è quindi incluso: la copia isolata supera 331 test, lint e build,
mentre il checkout completo supera 332 test, lint e build. La copia è temporanea,
non è un worktree, non è stata commessa o pubblicata e va rigenerata se cambia
il commit di base o uno dei sorgenti selezionati.

Prima di procedere realmente:

1. Recupero: definire un referente e una procedura verificabile per chi perde
   tutti i fattori; vietato rimuoverli su semplice richiesta email. Nessun
   automatismo di recupero o codice sKey è stato implementato. Verificare
   riserva e disattivazione sul servizio reale prima di aprire le iscrizioni.
2. Compatibilità: provare almeno iPhone/Safari/PWA e Android/Chrome/PWA. Il
   client Apple nativo non implementa ancora TOTP: decidere come avvisare e
   assistere chi lo usa, prima che possa attivare MFA sull’intero account.
3. Confini server: collaudare le tre Edge Function con AAL1/AAL2 e un utente
   senza MFA, senza invii email/push non autorizzati; verificare Realtime,
   isolamento fra utenti/famiglie e operazioni Auth dirette, in particolare
   aggiunta/rimozione di credenziali da una sessione non ancora elevata.
4. Rilascio sorgenti: rivedere il manifest contro il diff di base e ripetere
   test, lint, build con flag di sicurezza abilitati e controllo cloud sulla
   configurazione finale. Non pubblicare il bundle compilato per lo staging.
5. Preflight produzione, con sola lettura e poi conferma separata: controllare
   versione schema, hook preesistenti, policy/ruoli, backup ripristinabile,
   versione frontend ed Edge Function in uso. Non eseguire un generico db push
   dal checkout sporco: la migration amministrativa locale è fuori ambito.
6. Applicare solo la migration MFA revisionata, poi le tre Edge Function con
   guardia MFA, mantenendo per ora entrambi i flag frontend a false. Eseguire
   smoke test con account dedicato e senza dati degli utenti; approvazione
   esplicita richiesta per tutte le modifiche remote.
7. Solo dopo i controlli abilitare l’iscrizione TOTP volontaria. Per le passkey
   usare una fase successiva separata: nome `sKey`, RP ID proposto `skeyapp.com`,
   origin consentito `https://www.skeyapp.com`. Non trasferire né cambiare il
   progetto skey-test: le sue credenziali localhost non valgono per il sito.
   Verificare dominio e origin effettivi prima di salvare la configurazione.

Rollback sicuro: se occorre fermare nuove attivazioni, impostare i flag
frontend a false e distribuire una versione che conservi MfaGate e le
verifiche dei fattori già iscritti. Non ripristinare automaticamente il vecchio
frontend privo di TOTP dopo che gli utenti lo hanno attivato. Non rimuovere
hook, policy, fattori o passkey per sbloccare un problema. Conservare il RP ID
stabile dopo la prima iscrizione; ogni modifica richiede valutazione separata.

Riferimenti verificati: [Google Authenticator su Google Play](https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2),
[Google Authenticator su App Store](https://apps.apple.com/it/app/google-authenticator/id388497605),
[Microsoft Authenticator](https://www.microsoft.com/it-it/security/mobile-authenticator-app),
[configurazione passkey Supabase](https://supabase.com/docs/guides/auth/passkeys).

### Ambiente di collaudo autorizzato — 21 ottobre 2026

Progetto separato `skey-test`, ref `njjesruyafxdizupjicq`, regione Irlanda,
URL `https://njjesruyafxdizupjicq.supabase.co`. Il controllo preliminare ha
confermato zero tabelle applicative, zero utenti e nessun pre-request hook.
Sono state applicate atomicamente le 34 migrazioni locali, compresa quella
MFA, registrando nomi e hash sorgente in `supabase_migrations.schema_migrations`.
Il registro ha RLS abilitata e privilegi revocati ai client. Le 22 tabelle
pubbliche con RLS hanno la policy MFA restrittiva; il pre-request hook è
configurato. Nessun cambiamento al progetto di produzione.

Sul server ospitato sono passate 14 verifiche di accesso con tre utenti e due
famiglie fittizi: opt-out, fattore non confermato, blocco AAL1 con MFA attiva,
accesso AAL2, lettura/scrittura del proprio archivio, divieto di scrittura
altrui e separazione fra famiglie. I ruoli e i claim erano impostati nella
sessione SQL, non ottenuti da un login Auth reale. Tutti i record fittizi sono
stati creati dentro una transazione annullata al termine; assenza di utenti,
archivi e movimenti residui verificata. Nessun invio email o cron attivato,
policy di inattività ancora disabilitata. Non sono stati copiati dati reali.

Successivamente l’utente ha creato manualmente l’account persistente
`collaudo@example.invalid`, con conferma amministrativa senza invio email.
La copia locale `http://127.0.0.1:5192/` usa esclusivamente il progetto di prova:
configurazione pubblica separata in una cartella temporanea, caricamento dei
file ambiente di produzione disabilitato, iscrizione MFA abilitata solo in
questa istanza. Le passkey sono state abilitate successivamente, come descritto
sotto. La porta 5189 apparteneva al precedente
harness simulato, ora spento: non usarla per il collaudo reale.

Collaudo interattivo TOTP completato con Supabase Auth reale: accesso senza MFA
prima dell’attivazione, configurazione e conferma del fattore effettuate
dall’utente, stato “Protezione attiva”, logout, nuovo login con password,
schermata “Verifica con l’autenticatore” con campo vuoto, pulsante disabilitato
e area finanziaria assente; dopo il codice inserito dall’utente, Bacheca e
contabilità personale nuovamente accessibili. Nessuna password, chiave TOTP,
QR o codice acquisito o registrato. La sessione SQL sintetica delle 14 prove
precedenti resta distinta da questo collaudo Auth reale. Il blocco delle
richieste Data API dirette con JWT AAL1 non è ancora stato provato via HTTP:
la schermata bloccata attesta il gate frontend, non da sola tutte le policy.

Ancora da collaudare: richieste HTTP vietate con JWT reali, codici errati/scaduti
sul provider, riserva, disattivazione e recupero del fattore, passkey, iscrizione
ordinaria con conferma email, inviti via Edge Function e Realtime.

### Correzioni e verifiche del 22 ottobre 2026

Il titolo della scheda usa l’icona ShieldCheck nella colonna da 44 px e testo
nella colonna flessibile: verificato senza overflow a 1280 e 390 px.
MfaGate mantiene montati i moduli già autorizzati durante il controllo di un
token rinnovato, nascondendoli e rendendoli non interattivi. Non sospende gli
effetti, perché la loro ripresa riavviava il bootstrap e perdeva le bozze.
Se la verifica fallisce o richiede MFA, il contenuto precedente viene rimosso;
il cambio utente rimonta il gate con una chiave diversa. Prima del primo
controllo positivo i dati finanziari non vengono montati. I test coprono
conservazione dello stato e degli effetti, controlli falliti, downgrade AAL1,
cambio identità/client e risposte fuori ordine. Un errore del controllo rimuove
ancora la bozza: non viene promessa conservazione in ogni condizione offline.

Su skey-test il rinnovo reale tramite SDK ha conservato importo 7,20 euro,
descrizione e commenti di un modulo fittizio, con AAL2 confermato. Il modulo è
stato annullato senza salvarlo. Un harness separato con API simulate e Chrome
ha superato nove controlli a 1280x900 e 390x844, senza errori o warning.
La copia locale contiene un pulsante temporaneo di collaudo per rinnovare la
sessione; questo strumento non è parte del sorgente applicativo da rilasciare.
Verifica finale: 322 test in 43 file, lint e compilazione riusciti; controllo
whitespace dei file modificati per queste correzioni riuscito. Nessun commit,
push, deploy o cambiamento alla produzione.

Passkey abilitate il 22 ottobre su conferma esplicita soltanto in skey-test:
nome “sKey collaudo”, RP ID `localhost` e origin `http://localhost:5192`.
Salvataggio confermato dalla dashboard con “Passkey settings updated successfully”.
Opt-in SDK attivato soltanto nella configurazione locale temporanea. Il nuovo
origin è distinto da `http://127.0.0.1:5192`: aperta la schermata password per
ripetere il login, poi completato dall’utente. Credenziale creata direttamente
dall’utente e visibile come Google Password Manager, “Passkey aggiunta”.
Dopo logout, l’utente ha effettuato l’accesso con passkey: verificata la schermata
TOTP con campo vuoto, pulsante disabilitato e dati finanziari assenti. Dopo il
codice inserito dall’utente, verificato il ritorno alla Bacheca. Nessuna credenziale
o codice acquisiti. Prova limitata a questo browser e progetto: compatibilità
su altri dispositivi, recupero e accesso HTTP diretto restano da
collaudare; non costituisce una verifica completa di sicurezza.
Ulteriori prove reali completate: annullamento della richiesta passkey da parte
dell’utente, con messaggio di accesso non completato visibile nella pagina ma
poco evidente per l’utente. Schermata sbloccata e fallback email/password
disponibile; accesso con password nuovamente arrivato al TOTP. Codice errato
inserito dall’utente rifiutato con avviso, campo svuotato, verifica disabilitata
e nessun dato finanziario visibile. Codice valido successivo inserito dall’utente
accettato, con ritorno alla Bacheca. Nessun codice acquisito o registrato.
Password, TOTP e configurazione di produzione invariati.

### Prova HTTP reale del secondo fattore

Il 22 ottobre, strumento temporaneo nella sola copia locale di skey-test,
con SDK e sessione Auth reale: HEAD profiles e user_app_data (nessun contenuto
richiesto) e RPC di sola lettura optional_mfa_satisfied. Con AAL2 tutte e tre
HTTP 200. Dopo logout e login con sola password, prima del TOTP, livello AAL1:
tutte HTTP 403; la RPC restituisce PT403, MFA richiesta. Ripetizione dopo reload
con stesso risultato. Le risposte HEAD non includono il dettaglio dell’errore:
per esse è verificato il 403, non il codice PT403 nel corpo. Nessun token,
codice o contenuto personale estratto o registrato; nessuna scrittura effettuata.
Questo aggiorna le precedenti note sui test HTTP ancora mancanti, limitatamente
a queste tre richieste. Restano da provare scritture, altre RPC, operazioni
Auth dirette, Edge Function e Realtime; nessuna certificazione generale.

Prova successiva di richiesta PATCH profiles senza destinatari: filtro id
00000000-0000-0000-0000-000000000000, prima verificato con HEAD/count in AAL2.
Con AAL2 la richiesta torna HTTP 200, count 0 e rappresentazione vuota: nessuna
riga modificata. Dopo logout e login con sola password, stesso PATCH in AAL1
rifiutato HTTP 403 con PT403, MFA richiesta. Non sono state eseguite scritture
su righe reali, INSERT o DELETE: questa prova certifica soltanto il blocco
pre-request della specifica richiesta, non tutte le policy di modifica.
Completato anche il confronto precedente AAL2 → AAL1 → AAL2 delle tre letture:
dopo codice valido sono tornate tutte HTTP 200.

### Movimento fittizio: ciclo applicativo reale

Su skey-test, account collaudo@example.invalid con MFA completata: creata spesa
personale “COLLAUDO SICUREZZA — dato fittizio” del 22 ottobre 2026, conto
Contanti, categoria Caffè, nuovo beneficiario “Beneficiario collaudo”, importo
1,23 euro e commento fittizio. Lettura diretta user_app_data via SDK: una sola
corrispondenza con importo/commento corretti. Modificata poi a 2,34 euro e
commento “MODIFICA VERIFICATA — solo skey-test, dato fittizio.”; dopo reload,
copia remota confermata HTTP 200. Eliminazione del solo movimento autorizzata
esplicitamente dall’utente, messaggio di eliminazione e saldo tornato a zero.
Il beneficiario fittizio non è stato cancellato. Nessun dato di produzione
coinvolto. Questa è una prova applicativa autenticata, non un test di scrittura
diretta AAL1 su un movimento reale, né una prova cross-device/PWA.
Verifica remota dopo eliminazione e reload: HTTP 200, zero corrispondenze per
il movimento fittizio. Nessun ripristino applicativo eseguito o garantito.

`VITE_MFA_ENABLED=false` e `VITE_PASSKEYS_ENABLED=false` sono i valori predefiniti.
Il primo abilita soltanto l’iscrizione a MFA: non disabilita la verifica degli
account già protetti. Il secondo tiene nascosta l’integrazione sperimentale
passkey e disabilita l’opt-in SDK. Nessun segreto è richiesto nel frontend.

Le passkey Supabase sono sperimentali. Prima di abilitarle verificare sul
progetto di prova registrazione, accesso, cancellazione, dominio/origini e
gestione dei dispositivi persi. Per la produzione usare un RP ID stabile
compatibile con `www.skeyapp.com`; gli URL di anteprima pages.dev non sono
equivalenti. Verificare anche le operazioni Auth dirette, inclusa registrazione
di credenziali da sessioni AAL1: il controllo del Data API non protegge gli
endpoint Auth. Conservare il fallback password.

## Enforcement e ordine di attivazione

La migration `20261021120000_optional_authenticator_enforcement.sql` prepara:

- verifica server dei fattori confermati in `auth.mfa_factors`, senza fidarsi
  di preferenze locali o metadati modificabili dall’utente;
- policy restrittive sulle tabelle pubbliche con RLS già abilitata;
- controllo `pgrst.db_pre_request` per richieste Data API, comprese RPC
  `SECURITY DEFINER`. La migration rifiuta di sovrascrivere un altro hook.

Le funzioni invito contatto, invito familiare e notifica rimborso verificano la
sessione utente tramite RPC **prima** delle operazioni privilegiate. La migration
deve precedere il loro rilascio: se manca la RPC, queste funzioni negano le
richieste. I processi amministrativi service-role e cron non richiedono TOTP.

Prima di qualsiasi attivazione reale:

1. Applicare e collaudare la migration in un progetto di prova, controllando
   privilegi del ruolo, hook preesistente, policy e piano di rollback.
2. Verificare due utenti, con e senza MFA: tabelle, letture/scritture, RPC
   amministrative, inviti e Realtime devono negare AAL1 soltanto all’utente
   protetto, consentire AAL2 e preservare l’isolamento fra famiglie.
3. Rilasciare le tre funzioni aggiornate dopo la migration, poi il frontend
   con iscrizione ancora disabilitata. Provare iscrizione, login, refresh,
   logout, codice errato/scaduto, riserva e disattivazione sul servizio reale
   di prova, inclusi smartphone e PWA.
4. Decidere la compatibilità del client Apple: al momento non implementa la
   richiesta TOTP. Non attivare MFA agli utenti che ne dipendono prima di
   avere una soluzione esplicita.
5. Solo dopo questi controlli abilitare volontariamente le iscrizioni MFA.
   Valutare e abilitare le passkey separatamente.

L’hook non protegge Storage né Realtime: per Realtime valgono le policy delle
tabelle. Nuove tabelle, nuovi endpoint privilegiati e un futuro uso di Storage
richiedono una revisione dedicata. L’archivio locale preesistente non viene
cifrato da questa modifica: MFA non protegge da chi controlla già il browser
o il dispositivo. La migration è stata eseguita e verificata sul progetto di
prova sopra indicato; questo non costituisce un collaudo completo delle
procedure Auth, delle Edge Function o del client sul provider.

Riferimenti ufficiali: [MFA](https://supabase.com/docs/guides/auth/auth-mfa),
[TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[passkey](https://supabase.com/docs/guides/auth/passkeys),
[controlli Data API](https://supabase.com/docs/guides/api/securing-your-api).
