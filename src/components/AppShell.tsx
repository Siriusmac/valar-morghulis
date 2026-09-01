import {
  BookOpen, Building2, CalendarClock, ContactRound, CreditCard, HandCoins, LayoutDashboard, LogOut, Menu, Plus,
  ReceiptText, Tag, Tags, X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Brand } from './Brand'
import type { PageId, User } from '../types'

const items: { id: PageId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Bacheca', icon: LayoutDashboard },
  { id: 'movements', label: 'Spese ed Entrate', icon: ReceiptText },
  { id: 'scheduled', label: 'Pagamenti programmati', icon: CalendarClock },
  { id: 'reimbursements', label: 'Rimborsi e prestiti', icon: HandCoins },
  { id: 'accounts', label: 'Conti', icon: CreditCard },
  { id: 'categories', label: 'Categorie', icon: Tags },
  { id: 'beneficiaries', label: 'Beneficiari e mittenti', icon: Building2 },
  { id: 'tags', label: 'Tag', icon: Tag },
  { id: 'contacts', label: 'Contatti', icon: ContactRound },
  { id: 'guide', label: 'Guida', icon: BookOpen },
]

interface Props {
  children: ReactNode
  page: PageId
  user: User
  registeredUserCount?: number
  contactsEnabled?: boolean
  onPageChange: (page: PageId) => void
  onAddMovement: () => void
  onLogout: () => void
}

export function AppShell({ children, page, user, registeredUserCount, contactsEnabled = false, onPageChange, onAddMovement, onLogout }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileLayout, setMobileLayout] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 720px)').matches)
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 720px)')
    if (!media) return
    const updateLayout = () => setMobileLayout(media.matches)
    updateLayout()
    media.addEventListener('change', updateLayout)
    return () => media.removeEventListener('change', updateLayout)
  }, [])
  const selectPage = (id: PageId) => {
    onPageChange(id)
    setMenuOpen(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`} inert={mobileLayout && !menuOpen ? true : undefined} aria-hidden={mobileLayout && !menuOpen ? true : undefined}>
        <div className="sidebar__top">
          <div className="sidebar__brand">
            <Brand />
            {registeredUserCount !== undefined
              ? <small className="app-usage">{registeredUserCount} utenti stanno utilizzando questa app</small>
              : null}
          </div>
          <button className="icon-button sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu"><X /></button>
        </div>
        <nav className="sidebar__nav" aria-label="Navigazione principale">
          {items.filter((item) => item.id !== 'contacts' || contactsEnabled).map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => selectPage(id)}>
              <Icon aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">
          <button type="button" className={page === 'account' ? 'profile-mini profile-mini--active' : 'profile-mini'} onClick={() => selectPage('account')} aria-label="Gestisci account e famiglie">
            <span className="avatar">{user.initials}</span>
            <span><strong>{user.name}</strong><small>{user.email}</small></span>
          </button>
          <button className="nav-item" onClick={onLogout}><LogOut aria-hidden="true" /><span>Esci</span></button>
        </div>
      </aside>
      {menuOpen ? <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Chiudi menu" /> : null}
      <main className="main">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Apri menu"><Menu /></button>
          <div className="mobile-brand"><Brand compact /></div>
          <button className="button button--primary topbar__action" onClick={onAddMovement}><Plus /> <span>Aggiungi movimento</span></button>
        </header>
        {children}
        <button className="fab" onClick={onAddMovement} aria-label="Aggiungi movimento"><Plus /></button>
        <nav className="bottom-nav" aria-label="Navigazione mobile">
          {items.filter((item) => ['dashboard', 'movements', 'accounts', 'categories'].includes(item.id)).map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? 'bottom-nav__item bottom-nav__item--active' : 'bottom-nav__item'} onClick={() => selectPage(id)}>
              <Icon /><span>{label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  )
}
