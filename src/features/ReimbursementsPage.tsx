import { HandCoins } from 'lucide-react'
import { useState } from 'react'
import { ReimbursementReview } from './Dashboard'
import type { AppData, Reimbursement, User } from '../types'

interface Props {
  data: AppData
  user: User
  members: User[]
  onRespond?: (reimbursementId: string, accepted: boolean, selectedAccountId?: string) => Promise<void>
}

export function ReimbursementsPage({ data, user, members, onRespond }: Props) {
  const [section, setSection] = useState<'expected' | 'owed'>('expected')
  const reimbursements = data.reimbursements
    .filter((item) => section === 'expected' ? item.toId === user.id : item.fromId === user.id)
    .toSorted((left, right) => right.date.localeCompare(left.date))

  return <div className="page reimbursements-page">
    <div className="page-heading"><div><h1>Rimborsi</h1><p>Controlla i rimborsi che attendi e quelli che devi corrispondere.</p></div></div>
    <div className="tabs reimbursement-tabs" role="tablist" aria-label="Tipo di rimborso">
      <button type="button" role="tab" aria-selected={section === 'expected'} className={section === 'expected' ? 'active' : ''} onClick={() => setSection('expected')}>Attesi</button>
      <button type="button" role="tab" aria-selected={section === 'owed'} className={section === 'owed' ? 'active' : ''} onClick={() => setSection('owed')}>Dovuti</button>
    </div>
    {reimbursements.length ? <div className="reimbursement-review-list">
      {reimbursements.map((reimbursement: Reimbursement) => <ReimbursementReview
        key={reimbursement.id}
        reimbursement={reimbursement}
        data={data}
        user={user}
        members={members}
        onRespond={onRespond}
      />)}
    </div> : <div className="empty-state"><HandCoins /><h3>Nessun rimborso {section === 'expected' ? 'atteso' : 'dovuto'}</h3><p>I movimenti compariranno qui quando verranno registrati.</p></div>}
  </div>
}
