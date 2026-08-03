// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    expect(screen.getByRole('navigation', { name: 'Navigazione principale' })).toBeTruthy()
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
})
