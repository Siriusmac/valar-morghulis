# Modello dati e regole contabili

## Convenzioni

- ID remoti `UUID` quando garantito; ID dei record JSON `String`.
- Denaro: `Money(cents: Int64, currency: .eur)`, conversione a `Decimal` solo ai bordi.
- Date contabili `YYYY-MM-DD` senza fuso; timestamp tecnici UTC.
- Enum `Codable` con gestione esplicita dei valori sconosciuti.

## Entità

| Entità | Campi essenziali | Note |
|---|---|---|
| Profile | id, firstName, lastName, email | Utente e membri visibili |
| Family | id, name, createdBy | Ruolo nella relazione |
| Account | ownerId, familyId, type, scope, saldo/data iniziali | personal/family |
| Category | name, scope, ownerId, movementType, color | Cataloghi entrata/spesa |
| Beneficiary / Sender | name, scope, ownerId | Spese / entrate |
| Tag | name, scope, ownerId, color | Sempre selezionabile |
| Movement | tipo, autore, membro, importo, data, conto, directory | Commenti, rate e parziali |
| MovementSplit | amount, categoryId, beneficiaryId, shared | Il residuo resta sul principale |
| ScheduledPayment | planId, dueDate, numero/totale, status | Materializzazione idempotente |
| Transfer | conti, importo, data | Escluso dalle statistiche |
| Reimbursement | utenti, conti, importo, status | pending/confirmed/rejected |
| ContactLink / ContactInvitation | coppia utenti o email, stato | Nessun accesso implicito alle famiglie |
| CommissionedPurchase | pagante, destinatario/invito, importo, descrizione, stato | Può compensare un rimborso |

## Invarianti

1. Importo positivo e conto esistente.
2. Somma parziali non superiore al totale.
3. Il residuo appartiene a categoria, beneficiario e condivisione principali.
4. Un'entrata non ha beneficiario; una spesa non ha mittente.
5. Solo l'autore modifica o elimina il proprio movimento.
6. L'editing conserva l'ID; non crea copie.
7. Eliminare la prima rata elimina il piano; modificarla aggiorna le rate future.
8. `affectsAccountBalance == false` conserva il record solo per statistiche.
9. Una spesa su commissione del pagante ha `excludeFromReports == true`; il
   movimento classificato dal destinatario ha `affectsAccountBalance == false`.
10. La rimozione di un contatto non elimina acquisti o movimenti pregressi.

## Saldo conto

```text
saldo = saldo iniziale + entrate - spese
      + girofondi in entrata - girofondi in uscita
      + rimborsi confermati in entrata - rimborsi confermati in uscita
```

Arrotondare ai centesimi. I movimenti anteriori alla data del saldo iniziale seguono la scelta esplicita dell'utente tramite `affectsAccountBalance`.

## Condivisione

Se esiste `sharedSettlementAmount`, usarlo soltanto se principale o almeno un parziale è condiviso; altrimenti sommare le sole allocazioni condivise. Un movimento da conto familiare è visibile ma escluso dal credito/debito personale.

Con `N >= 2`, quota personale `1/N`, quota degli altri `(N-1)/N`. Per una spesa da conto personale chi paga acquisisce credito per la quota degli altri; ciascun altro membro assume la propria quota. Per un'entrata il verso si inverte.

I rimborsi contano solo se confermati. Verso un conto familiare riconoscono a chi versa la sola quota degli altri. Un trasferimento da familiare a personale produce l'effetto opposto.

Un rimborso con `settlementMethod = purchase` usa la richiesta di acquisto
collegata come conferma: il rimborso regola il saldo familiare soltanto quando
il destinatario accetta, ma non aggiunge un secondo movimento di conto al
pagante. Il destinatario registra una copia personale classificata che non
incide nuovamente sul saldo del proprio conto.

## Rate

- Prima rata immediata, successive programmate nello stesso giorno dei mesi seguenti, adeguato alla fine mese.
- Materializzazione idempotente con identità deterministica/`paidMovementId`.
- Spesa personale: saldo solo per rate pagate.
- Spesa familiare: debito condiviso sull'intero importo subito; rate future con regolazione condivisa zero.

## Casi obbligatori

| Caso | Risultato |
|---|---|
| Due membri: A spende 30 €, B 50 € | A è in debito di 10 €; quota finale 40 € ciascuno |
| Tre membri: A paga 90 € | A credito 60 €; B e C debito 30 € |
| 100 € da conto familiare | Nessuna attribuzione personale |
| Rimborso 100 € su conto familiare, due membri | Debito del versante diminuisce 50 € |
| Conto familiare → personale A, 100 €, due membri | A acquisisce debito 50 € |
| Spesa 100 €, parziale condiviso 30 € | Solo 30 € nel bilancio condiviso |
