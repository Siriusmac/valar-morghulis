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

Mappare i codici errore SQL/RPC a errori italiani; non mostrare dettagli interni.

## Edge Function e record condivisi

`invite-family-member` riceve `familyId` ed `email` con sessione autenticata. Gestire gli stati non 2xx senza perdere il form.

Tipi condivisi: `movement`, `scheduled_payment`, `reimbursement`, `transfer`, `category`, `beneficiary`, `sender`, `directory_redirect`, `tag`. Le transazioni hanno `authorId` uguale all'utente autenticato. Un nuovo rimborso è forzato server-side a `pending`; solo la controparte lo risolve e lo stato server prevale sempre.

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

`AppData.version` è 3. Ogni nuova versione richiede decoder retrocompatibile, migrazione locale testata, backend compatibile con il client precedente e divieto di sovrascrivere snapshot di versione sconosciuta.
