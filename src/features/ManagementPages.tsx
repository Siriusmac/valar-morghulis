import { Building2, CreditCard, Landmark, LockKeyhole, Plus, Share2, Tags, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { accountBalance } from '../lib/calculations'
import { formatMoney, makeId } from '../lib/format'
import type { Account, AppData, Beneficiary, Category, User } from '../types'

interface BaseProps { data: AppData; user: User }

export function AccountsPage({ data, user, onAdd }: BaseProps & { onAdd: (account: Account) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [institution, setInstitution] = useState('')
  const [balance, setBalance] = useState('')
  const [type, setType] = useState<Account['type']>('bank')
  const accounts = data.accounts.filter((item) => item.ownerId === user.id)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    onAdd({ id: makeId('account'), ownerId: user.id, name: name.trim(), institution: institution.trim() || 'Conto personale', type, openingBalance: Number(balance.replace(',', '.')) || 0 })
    setName(''); setInstitution(''); setBalance(''); setShowForm(false)
  }

  return (
    <div className="page">
      <div className="page-heading"><div><h1>I tuoi conti</h1><p>Solo tu puoi vedere questi dati e i relativi saldi.</p></div><button className="button button--primary desktop-action" onClick={() => setShowForm(true)}><Plus />Aggiungi conto</button></div>
      {showForm ? <InlineForm title="Nuovo conto" onSubmit={submit} onCancel={() => setShowForm(false)}>
        <label>Nome conto<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Conto principale" autoFocus /></label>
        <label>Istituto o dettaglio<input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="Es. Banca, ultime 4 cifre" /></label>
        <label>Tipo<select value={type} onChange={(e) => setType(e.target.value as Account['type'])}><option value="bank">Conto bancario</option><option value="credit">Carta di credito</option><option value="cash">Contanti</option></select></label>
        <label>Saldo iniziale<input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0,00" /></label>
      </InlineForm> : null}
      <div className="management-list">
        {accounts.map((account) => (
          <article className="management-row" key={account.id}>
            <span className="management-row__icon">{account.type === 'bank' ? <Landmark /> : account.type === 'credit' ? <CreditCard /> : <WalletCards />}</span>
            <div><strong>{account.name}</strong><small>{account.institution}</small></div>
            <div className="management-row__value"><small>Saldo calcolato</small><b>{formatMoney(accountBalance(data, account.id))}</b></div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function CategoriesPage({ data, user, onAdd }: BaseProps & { onAdd: (category: Category) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'family' | 'personal'>('family')
  const categories = data.categories.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim()) return
    onAdd({ id: makeId('category'), name: name.trim(), scope, ownerId: scope === 'personal' ? user.id : undefined, color: '#c64e2f' })
    setName(''); setShowForm(false)
  }
  return <DirectoryPage title="Categorie" subtitle="Organizza le spese personali e familiari." addLabel="Nuova categoria" showForm={showForm} setShowForm={setShowForm}>
    {showForm ? <InlineForm title="Nuova categoria" onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    <div className="directory-grid">{categories.map((item) => <article key={item.id}><span className="category-dot" style={{ background: item.color }} /><div><strong>{item.name}</strong><small>{item.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div></article>)}</div>
  </DirectoryPage>
}

export function BeneficiariesPage({ data, user, onAdd }: BaseProps & { onAdd: (beneficiary: Beneficiary) => void }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<'family' | 'personal'>('family')
  const beneficiaries = data.beneficiaries.filter((item) => item.scope === 'family' || item.ownerId === user.id)
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim()) return
    onAdd({ id: makeId('beneficiary'), name: name.trim(), scope, ownerId: scope === 'personal' ? user.id : undefined })
    setName(''); setShowForm(false)
  }
  return <DirectoryPage title="Beneficiari" subtitle="Negozi, fornitori e destinatari dei pagamenti." addLabel="Nuovo beneficiario" showForm={showForm} setShowForm={setShowForm}>
    {showForm ? <InlineForm title="Nuovo beneficiario" onSubmit={submit} onCancel={() => setShowForm(false)}><label>Nome<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label><ScopeSelect value={scope} onChange={setScope} /></InlineForm> : null}
    <div className="directory-grid">{beneficiaries.map((item) => <article key={item.id}><span className="directory-icon"><Building2 /></span><div><strong>{item.name}</strong><small>{item.scope === 'family' ? <><Share2 /> Famiglia</> : <><LockKeyhole /> Personale</>}</small></div></article>)}</div>
  </DirectoryPage>
}

function DirectoryPage({ title, subtitle, addLabel, showForm, setShowForm, children }: { title: string; subtitle: string; addLabel: string; showForm: boolean; setShowForm: (value: boolean) => void; children: React.ReactNode }) {
  return <div className="page"><div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="button button--primary desktop-action" onClick={() => setShowForm(!showForm)}><Plus />{addLabel}</button></div>{children}</div>
}

function InlineForm({ title, onSubmit, onCancel, children }: { title: string; onSubmit: (event: React.FormEvent) => void; onCancel: () => void; children: React.ReactNode }) {
  return <form className="inline-form" onSubmit={onSubmit}><div><h2>{title}</h2><p>I campi restano modificabili in seguito.</p></div><div className="inline-form__fields">{children}</div><div className="inline-form__actions"><button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button><button className="button button--primary" type="submit"><Plus />Aggiungi</button></div></form>
}

function ScopeSelect({ value, onChange }: { value: 'family' | 'personal'; onChange: (value: 'family' | 'personal') => void }) {
  return <label>Visibilità<select value={value} onChange={(e) => onChange(e.target.value as 'family' | 'personal')}><option value="family">Famiglia</option><option value="personal">Solo personale</option></select></label>
}

export const managementIcons = { Tags }
