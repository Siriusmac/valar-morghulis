# Contratto Supabase

## Principio

Usare il progetto Supabase esistente. URL e chiave pubblicabile arrivano dalla configurazione; la `service_role` non entra mai nell'app, in file versionati o nei log. Installare `supabase-swift` con Swift Package Manager, usare un solo `SupabaseClient` e PKCE per i redirect Auth.

## Tabelle client

| Tabella | Uso | Privacy |
|---|---|---|
| `profiles` | Profilo e membri | Sé e membri di famiglie comuni |
| `families` | Famiglie | Membri; modifica admin |
| `family_members` | Ruoli | Membri famiglia |
| `family_invitations` | Inviti | Admin |
| `accounts` | Conti | Personali al proprietario, familiari ai membri |
| `user_app_data` | Snapshot personale v3 | Solo proprietario |
| `family_user_app_data` | Dati privati per famiglia | Solo proprietario |
| `family_shared_records` | Record condivisi | Lettura membri; scrittura via RPC |
| `family_reimbursement_accounts` | Nomi conti pubblicati | Membri vedono solo ID e nome |
| `contact_invitations` | Inviti email alla rubrica | Solo mittente e destinatario autenticato |
| `contact_links` | Relazioni canoniche fra due utenti | Solo i due partecipanti |
| `commissioned_purchases` | Richieste e conferme di acquisti per conto terzi | Solo pagante e destinatario |

## RPC

- `registered_user_count()`
- `complete_personal_onboarding()`
- `create_family_with_optional_account(...)`
- `complete_family_onboarding(target_family_id)`
- `accept_family_invitation(invitation_token)`
- `decline_family_invitation(invitation_token)`
- `delete_declined_family_invitation(target_invitation_id)`
- `delete_family(target_family_id, preserve_authored_data)`
- `delete_my_account()`
- `sync_family_shared_records(target_family_id, records, owned_keys)`
- `set_reimbursement_account_families(account_id, account_name, target_family_ids)`
- `delete_family_directory_record(target_family_id, record_type, record_id, replacement_id)`
- `respond_to_family_reimbursement(target_family_id, target_reimbursement_id, accept_reimbursement, selected_account_id)`
- `accept_contact_invitation(invitation_token)` / `decline_contact_invitation(invitation_token)`
- `remove_contact(target_contact_id)`
- `create_commissioned_purchase(...)`
- `respond_to_commissioned_purchase(...)`

Mappare i codici errore SQL/RPC a errori italiani; non mostrare dettagli interni.

## Edge Function e record condivisi

`invite-family-member` riceve `familyId` ed `email` con sessione autenticata. Gestire gli stati non 2xx senza perdere il form.

`invite-contact` riceve soltanto l'email: l'accettazione crea un collegamento
personale e non una membership familiare. Se l'invito nasce dal primo acquisto,
la richiesta viene collegata automaticamente al profilo che lo accetta.

`withdraw_family_invitation` richiede un amministratore della famiglia e
accetta soltanto inviti non risolti. `withdraw_contact_invitation` richiede
l'autore dell'invito e annulla nello stesso passaggio le richieste d'acquisto
pending ancora prive di destinatario. Entrambe eliminano il record, rendendo
invalido il token già inviato per email.

Tipi condivisi: `movement`, `reimbursement`, `transfer`, `category`, `beneficiary`, `sender`, `directory_redirect`, `tag`. Lo schema accetta ancora `scheduled_payment` per compatibilità con record storici, ma i client non lo pubblicano più: il piano rateale completo resta nei dati privati dell'autore. Le transazioni hanno `authorId` uguale all'utente autenticato. Un nuovo rimborso è forzato server-side a `pending`; solo la controparte lo risolve e lo stato server prevale sempre.

## Caricamento

1. Ripristinare Auth.
2. Leggere profilo e appartenenze.
3. Caricare famiglie e conti condivisi.
4. Caricare `user_app_data`.
5. Per tutte le famiglie caricare dati privati e record condivisi.
6. Unire per ID applicando redirect e tombstone.
7. Pubblicare un unico snapshot coerente alla UI.
8. Materializzare rate scadute idempotentemente e sincronizzare.

## Scrittura ed evoluzione

- Personale: upsert `user_app_data`.
- Privato per famiglia: upsert `family_user_app_data`.
- Condiviso: RPC `sync_family_shared_records`.
- Conti: tabella `accounts` con RLS.
- Visibilità dei conti personali per i rimborsi: la RPC atomica
  `set_reimbursement_account_families` sostituisce l'insieme completo delle
  famiglie selezionate dopo aver verificato proprietà del conto e membership.
- Dopo approvazioni, inviti o eliminazioni: rilettura autorevole.
- Rettifiche dei rimborsi confermati: `request_family_reimbursement_change`
  crea una sola proposta pending; `respond_to_family_reimbursement_change`
  accetta risposte soltanto dall'altro partecipante e applica la modifica in
  modo atomico; `withdraw_family_reimbursement_change` è riservata al
  richiedente. La sincronizzazione ordinaria tratta ogni rimborso non pending
  come immutabile e non può eliminarlo.
- Dopo la revoca di un invito: rilettura autorevole; non conservare il token nel
  client né accodare la revoca offline.
- Contatti: eliminare solo `contact_links`; le righe di
  `commissioned_purchases` restano consultabili dai partecipanti.
- Compensazioni: `family_id` e `reimbursement_id` sono entrambi presenti oppure
  entrambi assenti; alla risposta la RPC verifica autore, partecipanti, stato e
  identificativo della richiesta prima di aggiornare il rimborso familiare. La
  migration `20260829230000_repair_reimbursement_responses.sql` mantiene
  vincolanti le identità delle parti, normalizza i soli metadati storici del
  collegamento e consente al destinatario di rifiutare una richiesta incoerente
  senza toccare un rimborso non corrispondente.
- Acquisti multipli: la migration
  `20260816170000_multiple_commissioned_purchase_allocations.sql` rimuove
  l'unicità del movimento pagante in `commissioned_purchases`, così uno stesso
  scontrino può generare richieste distinte per più parziali e contatti.

`AppData.version` è 3. Ogni nuova versione richiede decoder retrocompatibile, migrazione locale testata, backend compatibile con il client precedente e divieto di sovrascrivere snapshot di versione sconosciuta.
