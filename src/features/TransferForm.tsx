import { ArrowLeftRight, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { accountBalance } from '../lib/calculations'
import { formatMoney, makeId, todayISO } from '../lib/format'
import { functionErrorMessage } from '../lib/functionErrors'
import type { AppData, Transfer, User } from '../types'

interface Props {
  data: AppData
  user: User
  memberCount?: number
  initial?: Transfer
  onSubmit: (transfer: Transfer) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  onCancel: () => void
}

export function TransferForm({ data, user, memberCount = 2, initial, onSubmit, onDelete, onCancel }: Props) {
  const accounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [fromAccountId, setFrom] = useState(initial?.fromAccountId ?? accounts[0]?.id ?? '')
  const [toAccountId, setTo] = useState(() => initial?.toAccountId ?? accounts.find((item) => item.id !== accounts[0]?.id)?.id ?? '')
  const [amount, setAmount] = useState(() => initial ? initial.amount.toFixed(2).replace('.', ',') : '')
  const [date, setDate] = useState(initial?.date ?? todayISO())
  const [description, setDescription] = useState(initial?.description ?? 'Giro fondi')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fromAccount = accounts.find((item) => item.id === fromAccountId)
  const toAccount = accounts.find((item) => item.id === toAccountId)
  const createsFamilyDebt = fromAccount?.scope === 'family' && toAccount?.scope === 'personal'
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (accounts.length < 2) { setError('Per fare un giro fondi servono almeno due conti disponibili.'); return }
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) { setError('Scegli due conti diversi: uno di origine e uno di destinazione.'); return }
    if (!Number.isFinite(value) || value <= 0) { setError('Inserisci un importo maggiore di zero.'); return }
    setError('')
    setBusy(true)
    try {
      await onSubmit({ id: initial?.id ?? makeId('transfer'), authorId: initial?.authorId ?? user.id, fromAccountId, toAccountId, amount: value, date, description: description.trim() || 'Giro fondi' })
    } catch (reason) {
      setError(functionErrorMessage(reason, 'Non è stato possibile salvare il giro fondi. Riprova tra poco.'))
    } finally {
      setBusy(false)
    }
  }
  const otherMembersPercentage = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 }).format((memberCount - 1) / Math.max(memberCount, 1))
  return <form className="transfer-form composer-fields composer-fields--enter" onSubmit={submit}><span className="reimbursement-form__icon"><ArrowLeftRight /></span><label>Dal conto<select value={fromAccountId} disabled={busy} onChange={(e) => { setFrom(e.target.value); setError('') }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(accountBalance(data, item.id))}</option>)}</select></label><label>Al conto<select value={toAccountId} disabled={busy} onChange={(e) => { setTo(e.target.value); setError('') }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{createsFamilyDebt ? <p className="transfer-note">Il conto di origine è condiviso: il {otherMembersPercentage} dell’importo verrà contabilizzato come debito del titolare del conto personale verso gli altri membri.</p> : null}<label>Importo<div className="money-input"><span>€</span><input aria-label="Importo" inputMode="decimal" value={amount} disabled={busy} onChange={(e) => { setAmount(e.target.value); setError('') }} autoFocus /></div></label><label>Descrizione<input value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} /></label><label>Data<input type="date" value={date} disabled={busy} onChange={(e) => setDate(e.target.value)} /></label>{error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}<div className={`form-actions ${initial ? 'form-actions--edit' : ''}`}>{initial && onDelete ? <button className="button button--danger form-actions__delete" type="button" disabled={busy} onClick={() => confirm('Eliminare questo giro fondi? I saldi dei conti verranno aggiornati.') && void onDelete(initial.id)}><Trash2 />Elimina giro fondi</button> : null}<button type="button" className="button button--ghost" disabled={busy} onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit" disabled={busy}>{busy ? 'Salvataggio…' : initial ? 'Salva modifiche' : 'Conferma giro fondi'}</button></div></form>
}
