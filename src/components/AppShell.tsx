import {
  Building2, CreditCard, HandCoins, LayoutDashboard, LogOut, Menu, Plus,
  ReceiptText, Tags, UsersRound, X,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Brand } from './Brand'
import type { PageId, User } from '../types'

const items: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Bacheca', icon: LayoutDashboard },
  { id: 'expenses', label: 'Spese', icon: ReceiptText },
  { id: 'accounts', label: 'Conti', icon: CreditCard },
  { id: 'categories', label: 'Categorie', icon: Tags },
  { id: 'beneficiaries', label: 'Beneficiari', icon: Building2 },
]

interface Props {
  children: ReactNode
  page: PageId
  user: User
  onPageChange: (page: PageId) => void
  onAddExpense: () => void
  onLogout: () => void
}

export function AppShell({ children, page, user, onPageChange, onAddExpense, onLogout }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const selectPage = (id: PageId) => {
    onPageChange(id)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__top">
          <Brand />
          <button className="icon-button sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu"><X /></button>
        </div>
        <nav className="sidebar__nav" aria-label="Navigazione principale">
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => selectPage(id)}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="profile-mini">
            <span className="avatar">{user.initials}</span>
            <span><strong>{user.name}</strong><small>{user.email}</small></span>
          </div>
          <button className="nav-item" onClick={onLogout}><LogOut aria-hidden="true" /><span>Esci</span></button>
        </div>
      </aside>
      {menuOpen ? <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu" /> : null}
      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Apri menu"><Menu /></button>
          <div className="mobile-brand"><Brand compact /></div>
          <button className="button button--primary topbar__action" onClick={onAddExpense}><Plus /> <span>Aggiungi spesa</span></button>
        </header>
        {children}
        <button className="fab" onClick={onAddExpense} aria-label="Aggiungi spesa"><Plus /></button>
        <nav className="bottom-nav" aria-label="Navigazione mobile">
          {items.slice(0, 4).map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'bottom-nav__item bottom-nav__item--active' : 'bottom-nav__item'} onClick={() => selectPage(id)}>
              <Icon /><span>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  )
}

export const pageIcon = {
  balance: HandCoins,
  accounts: UsersRound,
}
