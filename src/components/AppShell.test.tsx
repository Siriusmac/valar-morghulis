// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { users } from '../lib/seed'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function setMobile(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
}

describe('AppShell sidebar', () => {
  it('rimuove dal focus la sidebar mobile chiusa e la riabilita quando aperta', () => {
    setMobile(true)
    const { container } = render(<AppShell page="dashboard" user={users[0]} onPageChange={vi.fn()} onAddMovement={vi.fn()} onLogout={vi.fn()}>Contenuto</AppShell>)
    const sidebar = container.querySelector('aside')!
    expect(sidebar.hasAttribute('inert')).toBe(true)
    expect(sidebar.getAttribute('aria-hidden')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Apri menu' }))
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(sidebar.hasAttribute('aria-hidden')).toBe(false)
    const navigation = screen.getByRole('navigation', { name: 'Navigazione principale' })
    const categories = within(navigation).getByRole('button', { name: 'Categorie' })
    const tags = within(navigation).getByRole('button', { name: 'Tag' })
    const beneficiaries = within(navigation).getByRole('button', { name: 'Beneficiari e mittenti' })
    expect(categories.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(tags.compareDocumentPosition(beneficiaries) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('mantiene navigabile la sidebar desktop chiusa', () => {
    setMobile(false)
    const { container } = render(<AppShell page="dashboard" user={users[0]} onPageChange={vi.fn()} onAddMovement={vi.fn()} onLogout={vi.fn()}>Contenuto</AppShell>)
    const sidebar = container.querySelector('aside')!
    expect(sidebar.hasAttribute('inert')).toBe(false)
    expect(sidebar.hasAttribute('aria-hidden')).toBe(false)
  })

  it('mostra sotto il logo il totale aggregato degli utenti iscritti', () => {
    setMobile(false)
    render(<AppShell page="dashboard" user={users[0]} registeredUserCount={27} onPageChange={vi.fn()} onAddMovement={vi.fn()} onLogout={vi.fn()}>Contenuto</AppShell>)

    expect(screen.getByText('27 utenti stanno utilizzando questa app')).toBeTruthy()
  })

  it('mostra lo stato cloud e permette di riprovare un salvataggio fallito', () => {
    setMobile(false)
    const onRetrySync = vi.fn()
    render(<AppShell page="dashboard" user={users[0]} syncStatus="error" onRetrySync={onRetrySync} onPageChange={vi.fn()} onAddMovement={vi.fn()} onLogout={vi.fn()}>Contenuto</AppShell>)

    fireEvent.click(screen.getByRole('button', { name: 'Riprova sincronizzazione' }))
    expect(screen.getByText('Sincronizzazione non riuscita')).toBeTruthy()
    expect(onRetrySync).toHaveBeenCalledOnce()
  })
})
