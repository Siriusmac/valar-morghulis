import { ArrowDownLeft, ArrowUpRight, Check, Plus, Repeat2 } from 'lucide-react'
import { useState } from 'react'
import { ActionMenu } from '../components/ActionMenu'
import { formatDate, formatMoney, makeId, todayISO } from '../lib/format'
import { recurringFrequencyLabels, recurringIsDueSoon } from '../lib/recurring'
import type { AppData, RecurringFrequency, RecurringMovement, User } from '../types'

interface Props {
  data: AppData
  user: User
  personalOnly?: boolean
  onSave: (movement: RecurringMovement) => void
  onDelete: (id: string) => void
  onToggle: (id: string) => void
  onSkip: (id: string) => void
  onConfirm: (movement: RecurringMovement) => void
}

export function RecurringMovementsSection({ data, user, personalOnly = false, onSave, onDelete, onToggle, onSkip, onConfirm }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RecurringMovement | undefined>()
  const recurring = data.recurringMovements.filter((item) => item.authorId === user.id).toSorted((a, b) => a.nextDate.localeCompare(b.nextDate))
  const today = todayISO()
  const closeForm = () => { setShowForm(false); setEditing(undefined) }

  return <section className="scheduled-section">
    <div className="section-title-row"><div><h2>Movimenti ricorrenti</h2><p>Entrate e spese vengono registrate soltanto dopo la tua conferma.</p></div><button type="button" className="button button--primary" onClick={() => { setEditing(undefined); setShowForm(true) }}><Plus />Nuovo ricorrente</button></div>
    {showForm ? <RecurringMovementForm key={editing?.id ?? 'new'} data={data} user={user} personalOnly={personalOnly} initial={editing} onSave={(item) => { onSave(item); closeForm() }} onCancel={closeForm} /> : null}
    {!recurring.length ? <div className="empty-state empty-state--compact"><Repeat2 /><h3>Nessuna ricorrenza</h3><p>Aggiungi affitto, utenze, stipendio o altri movimenti periodici.</p></div> : <div className="recurring-list">{recurring.map((item) => {
      const account = data.accounts.find((accountItem) => accountItem.id === item.accountId)
      const counterparty = item.type === 'expense'
        ? data.beneficiaries.find((entry) => entry.id === item.beneficiaryId)
        : data.senders.find((entry) => entry.id === item.senderId)
      const dueSoon = recurringIsDueSoon(item, today)
      const overdue = item.nextDate < today
      return <article className={`recurring-card${item.status === 'paused' ? ' recurring-card--paused' : ''}${dueSoon ? ' recurring-card--due' : ''}`} key={item.id}>
        <span className={`recurring-card__icon recurring-card__icon--${item.type}`}>{item.type === 'expense' ? <ArrowUpRight /> : <ArrowDownLeft />}</span>
        <div className="recurring-card__body"><strong>{item.description}</strong><small>{counterparty?.name ?? (item.type === 'expense' ? 'Nessun beneficiario' : 'Nessun mittente')} · {account?.name ?? 'Conto eliminato'}</small><span>{recurringFrequencyLabels[item.frequency]} · prossima {formatDate(item.nextDate)}{item.amountMode === 'variable' ? ' · importo da verificare' : ''}</span></div>
        <div className="recurring-card__amount"><small>{item.type === 'expense' ? 'Uscita' : 'Entrata'} indicativa</small><b>{formatMoney(item.amount)}</b>{item.status === 'paused' ? <em>In pausa</em> : dueSoon ? <em>{overdue ? 'Scaduto' : 'In scadenza'}</em> : null}</div>
        <div className="recurring-card__actions">{dueSoon ? <button type="button" className="button button--primary button--small" onClick={() => onConfirm(item)}><Check />Conferma</button> : null}<ActionMenu label={`Azioni per ${item.description}`} items={[
          { label: 'Modifica', onSelect: () => { setEditing(item); setShowForm(true) } },
          { label: item.status === 'paused' ? 'Riattiva' : 'Metti in pausa', onSelect: () => onToggle(item.id) },
          { label: 'Salta questa scadenza', disabled: item.status === 'paused', onSelect: () => onSkip(item.id) },
          { label: 'Elimina ricorrenza', danger: true, onSelect: () => confirm(`Eliminare la ricorrenza “${item.description}”? I movimenti già registrati resteranno invariati.`) && onDelete(item.id) },
        ]} /></div>
      </article>
    })}</div>}
  </section>
}

function RecurringMovementForm({ data, user, personalOnly, initial, onSave, onCancel }: { data: AppData; user: User; personalOnly: boolean; initial?: RecurringMovement; onSave: (item: RecurringMovement) => void; onCancel: () => void }) {
  const [type, setType] = useState(initial?.type ?? 'expense')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [amount, setAmount] = useState(initial?.amount.toString().replace('.', ',') ?? '')
  const [amountMode, setAmountMode] = useState<RecurringMovement['amountMode']>(initial?.amountMode ?? 'variable')
  const [nextDate, setNextDate] = useState(initial?.nextDate ?? todayISO())
  const [frequency, setFrequency] = useState<RecurringFrequency>(initial?.frequency ?? 'monthly')
  const availableAccounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [accountId, setAccountId] = useState(initial?.accountId ?? availableAccounts[0]?.id ?? '')
  const categories = data.categories.filter((item) => item.movementType === type && ((!personalOnly && item.scope === 'family') || item.ownerId === user.id))
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '')
  const [counterpartyId, setCounterpartyId] = useState(initial?.beneficiaryId ?? initial?.senderId ?? '')
  const [tagId, setTagId] = useState(initial?.tagId ?? initial?.tagIds?.[0] ?? '')
  const [comments, setComments] = useState(initial?.comments ?? '')
  const [shared, setShared] = useState(initial?.shared ?? !personalOnly)
  const selectedAccount = availableAccounts.find((item) => item.id === accountId)
  const counterparties = type === 'expense' ? data.beneficiaries : data.senders

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const numericAmount = Number(amount.replace(',', '.'))
    if (!description.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !nextDate || !accountId || !categoryId) return
    onSave({
      id: initial?.id ?? makeId('recurring'), authorId: initial?.authorId ?? user.id, memberId: user.id,
      type, amount: Math.round(numericAmount * 100) / 100, amountMode, nextDate, frequency,
      anchorDay: nextDate === initial?.nextDate ? initial.anchorDay ?? Number(nextDate.slice(8, 10)) : Number(nextDate.slice(8, 10)),
      description: description.trim(), categoryId,
      beneficiaryId: type === 'expense' ? counterpartyId || undefined : undefined,
      senderId: type === 'income' ? counterpartyId || undefined : undefined,
      accountId, tagId: tagId || undefined, tagIds: tagId ? [tagId] : undefined,
      comments: comments.trim() || undefined,
      shared: selectedAccount?.scope === 'family' || (!personalOnly && shared),
      status: initial?.status ?? 'active', createdAt: initial?.createdAt ?? new Date().toISOString(),
    })
  }

  return <form className="inline-form recurring-form" onSubmit={submit}>
    <div className="inline-form__heading"><Repeat2 /><div><strong>{initial ? 'Modifica ricorrenza' : 'Nuovo movimento ricorrente'}</strong><small>Riceverai un avviso tre giorni prima e potrai correggere i dati prima di registrarlo.</small></div></div>
    <label>Tipo<select value={type} onChange={(event) => { setType(event.target.value as RecurringMovement['type']); setCategoryId(''); setCounterpartyId('') }}><option value="expense">Spesa</option><option value="income">Entrata</option></select></label>
    <label>Descrizione<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={type === 'expense' ? 'Es. Affitto' : 'Es. Stipendio'} required /></label>
    <label>Importo indicativo<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" required /></label>
    <label>Gestione importo<select value={amountMode} onChange={(event) => setAmountMode(event.target.value as RecurringMovement['amountMode'])}><option value="variable">Da verificare ogni volta</option><option value="fixed">Normalmente fisso</option></select></label>
    <label>Prossima scadenza<input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} required /></label>
    <label>Frequenza<select value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}>{Object.entries(recurringFrequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Conto<select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>{availableAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Categoria<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="">Seleziona</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>{type === 'expense' ? 'Beneficiario' : 'Mittente'}<select value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)}><option value="">Nessuno</option>{counterparties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Tag<select value={tagId} onChange={(event) => setTagId(event.target.value)}><option value="">Nessuno</option>{data.tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {!personalOnly && selectedAccount?.scope !== 'family' ? <label className="checkbox-field"><input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />Condiviso con la famiglia</label> : null}
    <label className="recurring-form__comments">Commenti<textarea value={comments} onChange={(event) => setComments(event.target.value)} rows={2} /></label>
    <div className="inline-form__actions"><button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button><button className="button button--primary"><Check />{initial ? 'Salva modifiche' : 'Crea ricorrenza'}</button></div>
  </form>
}
