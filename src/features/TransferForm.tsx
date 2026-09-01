import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { accountBalance } from '../lib/calculations'
import { formatMoney, makeId, todayISO } from '../lib/format'
import type { AppData, Transfer, User } from '../types'

export function TransferForm({ data, user, memberCount = 2, onSubmit, onCancel }: { data: AppData; user: User; memberCount?: number; onSubmit: (transfer: Transfer) => void; onCancel: () => void }) {
  const accounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? '')
  const [toAccountId, setTo] = useState(() => accounts.find((item) => item.id !== accounts[0]?.id)?.id ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('Giro fondi')
  const [error, setError] = useState('')
  const fromAccount = accounts.find((item) => item.id === fromAccountId)
  const toAccount = accounts.find((item) => item.id === toAccountId)
  const createsFamilyDebt = fromAccount?.scope === 'family' && toAccount?.scope === 'personal'
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (accounts.length < 2) { setError('Per fare un giro fondi servono almeno due conti disponibili.'); return }
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) { setError('Scegli due conti diversi: uno di origine e uno di destinazione.'); return }
    if (!Number.isFinite(value) || value <= 0) { setError('Inserisci un importo maggiore di zero.'); return }
    setError('')
    onSubmit({ id: makeId('transfer'), authorId: user.id, fromAccountId, toAccountId, amount: value, date, description: description.trim() || 'Giro fondi' })
  }
  const otherMembersPercentage = new Intl.NumberFormat('it-IT', { style: 'percent', maximumFractionDigits: 2 }).format((memberCount - 1) / Math.max(memberCount, 1))
  return <form className="transfer-form composer-fields composer-fields--enter" onSubmit={submit}><span className="reimbursement-form__icon"><ArrowLeftRight /></span><label>Dal conto<select value={fromAccountId} onChange={(e) => { setFrom(e.target.value); setError('') }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(accountBalance(data, item.id))}</option>)}</select></label><label>Al conto<select value={toAccountId} onChange={(e) => { setTo(e.target.value); setError('') }}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{createsFamilyDebt ? <p className="transfer-note">Il conto di origine è condiviso: il {otherMembersPercentage} dell’importo verrà contabilizzato come debito del titolare del conto personale verso gli altri membri.</p> : null}<label>Importo<div className="money-input"><span>€</span><input aria-label="Importo" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError('') }} autoFocus /></div></label><label>Descrizione<input value={description} onChange={(e) => setDescription(e.target.value)} /></label><label>Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>{error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}<div className="form-actions"><button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">Conferma giro fondi</button></div></form>
}
