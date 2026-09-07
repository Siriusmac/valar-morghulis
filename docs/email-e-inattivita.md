# Email sKey e preavvisi di inattività

Stato al 7 settembre 2026: template Auth, migration e Edge Function pubblicati.
Gli avvisi di inattività restano **disattivati**: nessun cron, invio o esecutore
di cancellazione account è configurato.

## Configurazione Auth e dominio

`supabase/email-templates/settings.json` descrive i cinque template, gli oggetti
e il nome mittente richiesto: **Attivazione sKey**. È un manifest documentale,
non un file che Supabase applica automaticamente. I cinque template sono stati
copiati nel progetto ospitato e SMTP > Sender name risulta **Attivazione sKey**.
Il nome SMTP è comune alle mail Auth; avere un mittente diverso per ciascun
tipo richiederebbe un Send Email Hook, attualmente non necessario.

Il progetto usa SMTP Tophost su `mail.tophost.it:587`; indirizzo From,
credenziali e password restano esclusi da chat e Git. Il precedente nome
“Jagen H'ghar” è stato sostituito nel pannello ospitato.

Site URL e APP_URL attesi: `https://www.skeyapp.com`. Confermare gli URL di
redirect autorizzati per web, sviluppo e futuri Universal Links Apple. Il
frontend usa l'origine corrente per recupero password e il percorso corrente
per signup, così conserva eventuali parametri di invito. Gli inviti costruiscono
il redirect lato server da APP_URL; il client non può indicare una destinazione.

Prima dell'uso del nuovo From verificare SPF, DKIM e DMARC con il provider
scelto; non creare un secondo record SPF e non cambiare gli MX Tophost senza
una migrazione esplicita della casella. Disabilitare il tracciamento dei clic
sui link Auth. Non aggiungere pixel o informazioni contabili ai template.

## Flussi di iscrizione e invito

| Caso | Invio | Passaggio successivo |
|---|---|---|
| Iscrizione ordinaria | Confirm signup | Conferma email, poi onboarding |
| Nuovo invitato | Invite user | Conferma email e scelta password |
| Account già completo | Magic Link | Accesso e scelta accetta/rifiuta |
| Invito reinviato prima del completamento | Magic Link | Completamento password e scelta accetta/rifiuta |
| Password dimenticata | Reset password | Scelta nuova password |
| Cambio email | Change email | Conferme previste dalla configurazione Auth |

Famiglia e contatto restano separati (`invite` / `contactInvite`): accedere non
accetta automaticamente l'invito. Il testo Magic Link ora copre anche un account
incompleto, senza promettere erroneamente che non servirà una password.
Il link Auth è monouso e ha scadenza propria; i sette giorni del record di invito
non rendono valido per sette giorni il link Auth. Revoca e reinvio conservano
le verifiche server e il ripristino dell'invito precedente se l'invio fallisce.

## Politica proposta

- Preavviso dopo **180 giorni** senza attività; **30 giorni** per tornare.
- Sono valori proposti, configurabili nella tabella privata `inactivity_policy`.
  I limiti minimi sono 120 e 30 giorni; la politica nasce disabilitata.
- Basta aprire l'app autenticata. Nessun movimento o acquisto è obbligatorio.
  Il ritorno annulla ogni preavviso anche entro le 12 ore di throttling.
- La web app segnala avvio visibile, ritorno in primo piano, ritorno online e
  permanenza visibile prolungata. Apple segnala accesso iniziale in primo piano e
  ritorno della scena attiva. I refresh tecnici del token non inviano segnali.
- La data considerata è la più recente fra iscrizione, ultimo login Auth e
  ultima apertura rilevata. Account non confermati o con onboarding incompleto
  richiedono una politica separata e non ricevono questi avvisi.
- In questa prima versione sono esclusi amministratori globali, membri di
  qualunque famiglia, utenti con collegamenti di rubrica o acquisti commissionati.
  È una scelta conservativa: l'inattività non autorizza a danneggiare lo storico
  o i crediti di un'altra persona, anche se un rapporto è già stato saldato.

180+30 dà margine per un uso stagionale e per leggere l'avviso, più del precedente
esempio 120+6. Non è una soglia imposta dalla legge. Prima dell'attivazione il
titolare deve approvare criteri e informativa, modalità di conservazione dei
dati condivisi, responsabilità e condizioni del fornitore di posta.

## Implementazione e operatività

La migration `20260905220000_inactivity_notices.sql`, applicata in produzione,
prepara tabelle private,
RPC riservate e annullamento al ritorno. Non crea alcun job e non elimina utenti.
Il client può consultare gli avvisi solo attraverso una RPC riservata
all'amministratore globale: `platform_admin_inactivity_overview()`.
Il contatore storico “120 giorni” della console è un indicatore di utilizzo,
non la soglia operativa della politica di avviso.

La Edge Function `send-inactivity-notices` è distribuita ma inattiva e richiede una chiave dedicata
`INACTIVITY_JOB_SECRET` nell'header `x-inactivity-secret`; va distribuita con la
verifica JWT gateway disattivata, perché verifica autonomamente quella chiave.
Non richiamarla dal browser e non inserire il segreto nel client. Un eventuale
scheduler privato giornaliero dovrà usare il segreto da un secret store.

Sono richiesti **entrambi** `inactivity_policy.enabled = true` e
`INACTIVITY_MAIL_ENABLED=true`. Senza configurazione l'invio non parte e non
viene consumata la coda. È predisposto un adapter opzionale Resend con
`RESEND_API_KEY` e `INACTIVITY_FROM_EMAIL` (casella verificata `@skeyapp.com`).
Non è stato scelto o creato un account Resend; se il titolare preferisce SMTP
Tophost o un altro servizio, sostituire l'adapter, conservando il contratto
`deliverInactivityNotices` e le garanzie della coda.

Ogni run prepara al massimo 100 avvisi e ne tenta al massimo 20, uno per volta.
La prenotazione atomica con `SKIP LOCKED` impedisce che due job prendano lo stesso
avviso. La data di revisione viene fissata al tentativo di invio, non alla
creazione della coda. Il corpo non contiene token di login, dati finanziari o
informazioni familiari: l'utente apre il sito e accede normalmente.

`sent` significa che il provider ha accettato il messaggio, **non che sia stato
consegnato**. Errori/timeout vanno in `delivery_unknown`; un worker interrotto
lascia `sending`, riconosciuto come incerto dopo 15 minuti al run successivo.
Non c'è retry automatico di tali avvisi: verificare la consegna presso il provider
prima di qualunque reinvio. La chiave idempotente del provider è una protezione
aggiuntiva; quella persistente nel database non scade dopo 24 ore.
Disabilitare la politica annulla gli avvisi al successivo job di preparazione;
nessuno di essi può comunque avviare una cancellazione.

L'audit non duplica email, IP, user agent, contenuti o risposte del provider.
Conserva ID utente, stato e date; gli avvisi annullati sono rimossi dopo 90 giorni
durante la preparazione. Quelli attivi/incerti restano per la revisione operativa.

## Cancellazione

**Non esiste un esecutore di cancellazioni automatiche in questa modifica.**
La scadenza è una data di revisione amministrativa, come dichiarato nel testo
dell'email. Il successivo intervento dovrà prima verificare consegna/bounce,
assenza di attività più recente, periodo minimo effettivamente concesso,
rapporti condivisi, esportazione e conseguenze sulle controparti. Non usare la
sola risposta HTTP di invio per autorizzare un'eliminazione.
Una riapertura concorrente con la richiesta HTTP può rendere l'email già in
volo superata: il database annulla il preavviso e l'email spiega che il ritorno
già effettuato non richiede altre azioni.

## Verifiche prima dell'attivazione

Test locali: template senza token applicativi, date italiane, numero massimo
di invii, esiti incerti, errore database dopo invio, rilevamento in primo piano.
Esito: 217 test web, lint, build Vite e build iOS Simulator non firmata superati.
Questi controlli non eseguono SQL/RLS né la Edge Function nel runtime Deno.
Prima del rilascio restano da collaudare in staging, con autorizzazione:

1. Migration e permessi con anon, utenti normali, amministratore e service role.
2. Policy disabilitata; soglie 179/180/181 giorni; data di iscrizione come fallback.
3. Due job concorrenti, ritorno dell'utente durante il job, cambio email,
   esclusioni e assenza di destinatari duplicati.
4. Invii reali a caselle di prova: signup, account nuovo/esistente/incompleto,
   invito familiare/contatto, reinvio, revoca, recupero e cambio email.
5. Scadenze link Auth, client email desktop/mobile, clic filtrati dagli scanner,
   dominio e intestazioni SPF/DKIM/DMARC.
6. Aperture reali web/iOS/macOS, login e refresh token separati.

Fonti tecniche: [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[template Auth](https://supabase.com/docs/guides/auth/auth-email-templates),
[idempotenza Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
