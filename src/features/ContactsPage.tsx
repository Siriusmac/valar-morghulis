import { Check, Clock3, Mail, Trash2, UserRound, UsersRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CreatableLookup } from '../components/CreatableLookup'
import { debtCompensationAccountLabel, isPurchaseReimbursement } from '../lib/commissioned'
import { formatDate, formatMoney, makeId } from '../lib/format'
import type { AppData, Category, CommissionedPurchase, Contact, ContactInvitation, Movement, User } from '../types'

interface Props {
  data: AppData
  user: User
  contacts: Contact[]
  invitations: ContactInvitation[]
  purchases: CommissionedPurchase[]
  onInvite: (email: string) => Promise<void>
  onWithdrawInvitation: (invitationId: string) => Promise<void>
  onRemove: (contact: Contact) => Promise<void>
  onRespond: (purchase: CommissionedPurchase, accepted: boolean, categoryId?: string, accountId?: string, category?: Category) => Promise<void>
  onShowMovements: (title: string, filter: (movement: Movement) => boolean) => void
}

export function ContactsPage({ data, user, contacts, invitations, purchases, onInvite, onWithdrawInvitation, onRemove, onRespond, onShowMovements }: Props) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const incoming = purchases.filter((item) => item.recipientId === user.id && item.status === 'pending')
  const outgoing = purchases.filter((item) => item.payerId === user.id && item.status === 'pending')

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy('invite'); setError('')
    try { await onInvite(email); setEmail('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Invito non riuscito') }
    finally { setBusy('') }
  }

  const withdrawInvitation = async (invitation: ContactInvitation) => {
    if (!confirm(`Ritirare l’invito inviato a ${invitation.email}? Eventuali richieste d’acquisto ancora pendenti collegate all’invito verranno annullate.`)) return
    setBusy(invitation.id); setError('')
    try { await onWithdrawInvitation(invitation.id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Revoca non riuscita') }
    finally { setBusy('') }
  }

  const showContactMovements = (contact: Contact) => {
    const purchaseIds = new Set(purchases
      .filter((item) => item.payerId === contact.id || item.recipientId === contact.id)
      .map((item) => item.id))
    onShowMovements(`Movimenti con ${contact.name}`, (movement) => Boolean(movement.commissionedPurchaseId && purchaseIds.has(movement.commissionedPurchaseId)))
  }

  return <section className="page management-page contacts-page">
    <header className="page-heading"><div><span className="eyebrow">Cerchia personale</span><h1>Contatti</h1><p>I familiari sono già disponibili. Puoi invitare altri utenti per gli acquisti fatti per loro conto.</p></div></header>

    {incoming.length ? <section className="management-section"><div className="section-heading"><div><h2>Richieste da confermare</h2><p>Catalogale nella tua contabilità personale oppure rifiutale.</p></div></div><div className="management-list">
      {incoming.map((purchase) => <PurchaseReview key={purchase.id} purchase={purchase} data={data} userId={user.id} payer={contacts.find((item) => item.id === purchase.payerId)} busy={busy === purchase.id} onRespond={async (accepted, categoryId, accountId, category) => {
        setBusy(purchase.id); setError('')
        try { await onRespond(purchase, accepted, categoryId, accountId, category) }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Aggiornamento non riuscito') }
        finally { setBusy('') }
      }} />)}
    </div></section> : null}

    <section className="management-section"><div className="section-heading"><div><h2>La tua cerchia</h2><p>I membri delle famiglie sono contrassegnati e non vengono rimossi da qui.</p></div></div><div className="management-list">
      {contacts.map((contact) => <article className="management-row contact-row" key={`${contact.source}:${contact.id}`}>
        <button className="contact-row__main" type="button" onClick={() => showContactMovements(contact)}>
          <span className="management-row__icon">{contact.source === 'family' ? <UsersRound /> : <UserRound />}</span>
          <span><strong>{contact.name}</strong><small>{contact.source === 'family' ? `Famiglia · ${contact.familyNames?.join(', ') ?? ''}` : contact.email}</small></span>
        </button>
        {contact.source === 'friend' ? <button className="icon-button icon-button--danger" type="button" title="Rimuovi contatto" disabled={Boolean(busy)} onClick={() => {
          if (!confirm(`Rimuovere ${contact.name} dai contatti? I movimenti resteranno disponibili a entrambi.`)) return
          setBusy(contact.id); void onRemove(contact).catch((reason) => setError(reason instanceof Error ? reason.message : 'Rimozione non riuscita')).finally(() => setBusy(''))
        }}><Trash2 /></button> : null}
      </article>)}
      {!contacts.length ? <p className="empty-state">Non ci sono ancora contatti.</p> : null}
    </div></section>

    <section className="management-section contact-invite"><div className="section-heading"><div><h2>Invita un amico</h2><p>Riceverà un link personale per entrare nella tua cerchia.</p></div></div>
      <form className="invite-form" onSubmit={invite}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@email.it" required /></label><button className="button button--primary" disabled={Boolean(busy)}><Mail />Invia invito</button></form>
      {invitations.filter((item) => item.status === 'pending').map((item) => <div className="contact-invitation" key={item.id}><Clock3 /><span><strong>{item.email}</strong><small>Invito valido fino al {formatDate(item.expiresAt.slice(0, 10))}</small></span><button className="button button--ghost button--small" type="button" disabled={Boolean(busy)} onClick={() => void withdrawInvitation(item)}><Trash2 />Ritira invito</button></div>)}
      {outgoing.length ? <p className="privacy-note">{outgoing.length} {outgoing.length === 1 ? 'acquisto attende' : 'acquisti attendono'} la conferma del destinatario.</p> : null}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
    </section>
  </section>
}

export function PurchaseReview({ purchase, data, userId, payer, busy, onRespond }: {
  purchase: CommissionedPurchase
  data: AppData
  userId: string
  payer?: Contact
  busy: boolean
  onRespond: (accepted: boolean, categoryId?: string, accountId?: string, category?: Category) => Promise<void>
}) {
  const categories = useMemo(() => data.categories.filter((item) => item.movementType === 'expense' && item.scope === 'personal' && (!item.ownerId || item.ownerId === userId)), [data.categories, userId])
  const accounts = useMemo(() => data.accounts.filter((item) => item.scope === 'personal' && (!item.ownerId || item.ownerId === userId)), [data.accounts, userId])
  const [categoryQuery, setCategoryQuery] = useState(categories[0]?.name ?? '')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const settlesFamilyDebt = isPurchaseReimbursement(purchase)
  const categoryMatch = categories.find((item) => item.name.toLocaleLowerCase('it-IT') === categoryQuery.trim().toLocaleLowerCase('it-IT'))
  const selectedCategory = categoryQuery.trim() && !categoryMatch ? {
    id: makeId('category'), name: categoryQuery.trim(), scope: 'personal' as const,
    ownerId: userId, movementType: 'expense' as const, color: '#c64e2f',
  } : undefined
  const categoryId = selectedCategory?.id ?? categoryMatch?.id ?? ''
  return <article className="management-row purchase-review">
    <span className="management-row__icon"><Mail /></span>
    <div className="purchase-review__body"><strong>{purchase.description}</strong><small>{formatMoney(purchase.amount)} · {formatDate(purchase.purchaseDate)} · pagato da {payer?.name ?? 'un contatto'}</small><div className="purchase-review__controls"><CreatableLookup label="Categoria" value={categoryQuery} options={categories} placeholder="Inserisci categoria" onChange={setCategoryQuery} />{settlesFamilyDebt ? <label>Origine contabile<output>{debtCompensationAccountLabel}</output></label> : <label>Conto personale<select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}<button className="button button--ghost" type="button" disabled={busy} onClick={() => void onRespond(false)}><X />Rifiuta</button><button className="button button--primary" type="button" disabled={busy || !categoryId || (!settlesFamilyDebt && !accountId)} onClick={() => void onRespond(true, categoryId, settlesFamilyDebt ? undefined : accountId, selectedCategory)}><Check />Conferma e cataloga</button></div><small>{settlesFamilyDebt ? `L’acquisto entra nelle tue statistiche e compensa per intero il debito di ${payer?.name ?? 'chi lo ha effettuato'}, senza usare un conto.` : `Il movimento entra nelle tue statistiche e viene addebitato al conto scelto per rimborsare ${payer?.name ?? 'chi ha effettuato l’acquisto'}.`}</small></div>
  </article>
}
