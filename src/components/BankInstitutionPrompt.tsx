import { useState } from 'react'
import type { Account } from '../types'
import { Modal } from './Modal'

interface Props {
  account: Account
  onConfirm: (institution: string) => void
  onCancel: () => void
}

export function BankInstitutionPrompt({ account, onConfirm, onCancel }: Props) {
  const [institution, setInstitution] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const cleanInstitution = institution.trim()

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (!cleanInstitution) return
    onConfirm(cleanInstitution)
  }

  return <Modal title="Completa i dati del conto" onClose={onCancel}>
    <form className="institution-prompt" onSubmit={submit}>
      <p>Il conto bancario <strong>{account.name}</strong> non ha un istituto associato.</p>
      <p className="field-help">Questo dato è necessario per identificare correttamente il conto e classificare le eventuali spese bancarie nella categoria “Commissioni &lt;Istituto&gt;”.</p>
      <label>Istituto
        <input autoFocus autoComplete="organization" value={institution} onChange={(event) => setInstitution(event.target.value)} aria-invalid={submitted && !cleanInstitution} />
        {submitted && !cleanInstitution ? <small className="field-error">Inserisci il nome dell’istituto.</small> : null}
      </label>
      <div className="form-actions">
        <button type="button" className="button button--ghost" onClick={onCancel}>Annulla</button>
        <button type="submit" className="button button--primary">Salva e continua</button>
      </div>
    </form>
  </Modal>
}
