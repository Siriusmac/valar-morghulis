import { ArrowLeftRight } from 'lucide-react'
import { useState } from 'react'
import { accountBalance } from '../lib/calculations'
import { formatMoney, makeId, todayISO } from '../lib/format'
import type { AppData, Transfer, User } from '../types'

export function TransferForm({ data, user, onSubmit, onCancel }: { data: AppData; user: User; onSubmit: (transfer: Transfer) => void; onCancel: () => void }) {
  const accounts = data.accounts.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const [fromAccountId, setFrom] = useState(accounts[0]?.id ?? ''); const [toAccountId, setTo] = useState(accounts[1]?.id ?? ''); const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayISO()); const [description, setDescription] = useState('Giro fondi')
  const fromAccount = accounts.find((item) => item.id === fromAccountId)
  const toAccount = accounts.find((item) => item.id === toAccountId)
  const createsFamilyDebt = fromAccount?.scope === 'family' && toAccount?.scope === 'personal'
  const submit = (event: React.FormEvent) => { event.preventDefault(); const value = Number(amount.replace(',', '.')); if (value <= 0 || fromAccountId === toAccountId) return; onSubmit({ id: makeId('transfer'), authorId: user.id, fromAccountId, toAccountId, amount: value, date, description: description.trim() || 'Giro fondi' }) }
  return <form className="transfer-form" onSubmit={submit}><span className="reimbursement-form__icon"><ArrowLeftRight /></span><label>Dal conto<select value={fromAccountId} onChange={(e) => setFrom(e.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatMoney(accountBalance(data, item.id))}</option>)}</select></label><label>Al conto<select value={toAccountId} onChange={(e) => setTo(e.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{createsFamilyDebt ? <p className="transfer-note">Il conto di origine è condiviso: metà dell’importo verrà contabilizzata come debito del titolare del conto personale verso l’altro membro.</p> : null}<label>Importo<div className="money-input"><span>€</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div></label><label>Descrizione<input value={description} onChange={(e) => setDescription(e.target.value)} /></label><label>Data<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label><div className="form-actions"><button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit">Conferma giro fondi</button></div></form>
}
