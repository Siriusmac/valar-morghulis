# Privacy, sicurezza e sincronizzazione

## Modello privacy

I dati personali sono visibili all'utente; gli altri membri ricevono solo le porzioni necessarie alla contabilità familiare. Gli sviluppatori non hanno una funzione applicativa per consultarli. Questo non equivale a cifratura end-to-end e non va comunicato come tale.

### Condivisibili

- Porzione condivisa di movimenti e rate.
- Directory familiari necessarie a interpretarla.
- Girofondi con un conto familiare.
- Rimborsi e stato.
- Solo nome e ID opaco dei conti personali pubblicati per i rimborsi.

### Da non condividere

- Saldi e movimenti esclusivamente personali.
- Numeri carta, IBAN, credenziali e dettagli bancari.
- Conti non pubblicati per i rimborsi.
- Token Auth o snapshot nei log.

## Credenziali

- Sessione Supabase nel Keychain tramite storage dell'SDK.
- Chiave pubblicabile in configurazione, non duplicata nel sorgente.
- Segreti server solo su Supabase/Cloudflare.
- `Secrets.xcconfig` locale escluso da Git; template senza valori versionato.
- Redazione di email, token, UUID e descrizioni nei log.

## Offline e conflitti

La cache conserva l'ultimo snapshot e una coda persistente. La UI mostra “Non sincronizzato” finché la modifica non arriva al server. Ogni elemento ha ID idempotente, utente/famiglia, tipo, payload minimo, data e tentativi.

Non accodare offline operazioni irreversibili come eliminazione account/famiglia, inviti o risposta definitiva a rimborso.

- Transazioni: solo autore; su conflitto ricaricare il record server.
- Directory: applicare redirect server senza ricreare record eliminati.
- Rimborsi: stato server sempre autorevole.
- Eliminazioni: tombstone/chiavi possedute, non sola assenza locale.
- Foreground, cambio famiglia e recupero rete: pull completo della porzione coinvolta.

## RLS

La UI non è un confine di sicurezza. Le restrizioni restano nelle RLS e funzioni validate. Testare con almeno due utenti e due famiglie per provare accessi vietati.

## Eliminazione ed export

Prima di eliminare l'account offrire JSON completo e CSV in più file o ZIP. XML ha senso solo con un requisito concreto. Il download deve terminare prima dell'RPC distruttiva.

Per eliminare una famiglia scegliere esplicitamente se trasformare in personali i dati creati oppure eliminare i dati condivisi.

## Checklist rilascio

- Nessuna `service_role`, password SMTP o token nel bundle.
- RLS testata con utenti non privilegiati.
- Universal Links limitati ai domini necessari; ATS senza eccezioni generiche.
- Informativa e manifest privacy coerenti con SDK e diagnostica.
- Export ed eliminazione provati con più famiglie.
