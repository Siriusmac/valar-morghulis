import { ArrowRight, LockKeyhole, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { Brand } from './Brand'
import { users } from '../lib/seed'
import type { UserId } from '../types'

export function Login({ onLogin }: { onLogin: (id: UserId) => void }) {
  const [email, setEmail] = useState('simone@valarmorghulis.demo')
  const [password, setPassword] = useState('demo1234')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const user = users.find((item) => item.email === email)
    if (user && password) onLogin(user.id)
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <h1>Le spese di casa,<br />finalmente in equilibrio.</h1>
          <p>Spese personali private, conti condivisi chiari e nessun dubbio su chi offre la prossima volta.</p>
        </div>
        <div className="login-story__foot"><UsersRound /><span>Creato per Simone e Anna.<br />Pronto a crescere con altre famiglie.</span></div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <h2>Bentornato</h2>
          <p>Accedi al tuo spazio familiare.</p>
          <form onSubmit={submit}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
            <button className="button button--primary button--full" type="submit">Accedi <ArrowRight /></button>
          </form>
          <div className="demo-access">
            <span>Accesso rapido demo</span>
            <div>
              {users.map((user) => <button key={user.id} onClick={() => onLogin(user.id)}><i>{user.initials}</i>{user.name}</button>)}
            </div>
          </div>
          <small className="privacy-note"><LockKeyhole /> I dati personali restano visibili solo al proprietario.</small>
        </div>
      </section>
    </main>
  )
}
