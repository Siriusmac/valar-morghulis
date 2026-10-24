# Recupero password — prima implementazione web

Stato al 24 ottobre 2026: collaudo completato, rilascio web autorizzato.
Avviato collaudo reale su skey-test; URL di ritorno modificati su conferma
specifica. SMTP e template non modificati. L’utente ha cambiato personalmente
la password del solo account di prova, senza condividerla.

## Flusso

1. Dopo l’email di accesso, “Password dimenticata?” usa il provider Supabase
   esistente. Risposta neutra: non conferma se un account esiste, ricorda lo spam.
   Nessun reinvio automatico; pulsante disabilitato durante la richiesta.
2. Destinazione richiesta: stessa origine, `/?recovery=password`. Verificare
   la destinazione consentita nel progetto Auth prima del rilascio. Il ritorno
   legacy alla radice è riconosciuto anche tramite evento `PASSWORD_RECOVERY`.
3. La schermata di cambio password è separata dalla contabilità e passa sempre
   dal normale MfaGate. URL o stato UI non costituiscono una verifica del link:
   sessione, secondo fattore e permessi restano controllati da Supabase.
4. Nuova password di almeno 12 caratteri e conferma. Successo soltanto dopo
   risposta positiva di `auth.updateUser`, poi cancellazione dei campi dalla UI.
   Un errore mantiene il form disponibile e non dichiara riuscito l’aggiornamento.
5. Senza sessione valida viene proposta la richiesta di un nuovo link tramite
   il ritorno all’accesso. Il marcatore di recupero viene rimosso su annullamento
   o dopo il proseguimento esplicito dalla conferma di aggiornamento.

La prima lettura asincrona della sessione non può sovrascrivere un evento Auth
più recente. Nessuna chiamata Auth asincrona dentro la callback degli eventi.
Non vengono registrati password o token. Non si disattiva MFA e non vengono
rimossi fattori o passkey. Non è una procedura di recupero dell’autenticatore
perso, non aggiunge codici di riserva e non revoca automaticamente tutte le
sessioni: questi aspetti richiedono un progetto e collaudi separati.

## Verifiche

354 test in 45 file, lint, build cloud e diff-check superati. Test della pagina
e del routing con API simulate: conferma/password minima, fallimento, successo,
annullamento, sessione assente, evento recovery e gate MFA che impedisce il form.
Chrome/Playwright, API simulate, viewport 1280 e 390: riquadro impostazioni,
stili dei paragrafi identici, distanza dai pulsanti, dettagli espandibili,
validazione/successo recupero, nessun overflow o errore console/overlay.
Browser plugin non disponibile; harness temporaneo in /tmp/skey-security-qa.bJ7YeR.
Collaudo ospitato: una richiesta email accettata, Site URL localhost:5192 e
redirect esatto /?recovery=password autorizzati solo su skey-test. L’utente ha
confermato ricezione/apertura e reimpostazione riuscita della password il
24 ottobre, poi nuovo accesso riuscito con la password appena scelta. Nessuna
credenziale acquisita dall’agente. Riapertura del link usato da disconnesso:
l’utente vede il login, non un nuovo form. Non acquisito il codice del provider.
Correzione locale: callback otp_expired riconosciuti prima della pulizia SDK,
con avviso esplicito e senza modulo password anche se esiste un’altra sessione.
Quattro test aggiuntivi e prova CUA su errore sintetico superano il percorso
avviso → Continua → login. L’utente ha poi confermato l’avviso sul link usato.
Collaudo MFA reale completato dall’utente: codice richiesto prima del modulo,
cambio password riuscito e nuovo accesso con password aggiornata e autenticatore.
Nessun codice o password acquisito. Non certificato su PWA; redirect esatto e
invio email in produzione ancora da verificare. Nessuna nuova migrazione richiesta.

Fonti: [Supabase resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
[Password-based Auth](https://supabase.com/docs/guides/auth/passwords).
