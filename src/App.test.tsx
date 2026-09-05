// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('filtered movement editor navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.stubGlobal('confirm', () => true)
    window.history.replaceState({}, '', '/?demo=simone&page=accounts')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('returns to the same account movement list after saving an edit', async () => {
    render(<App />)

    const accountName = await screen.findByText('Conto corrente')
    const accountRow = accountName.closest('article')
    expect(accountRow).not.toBeNull()
    fireEvent.click(within(accountRow!).getByRole('button', { name: 'Movimenti' }))

    const movementList = await screen.findByRole('dialog', { name: 'Movimenti · Conto corrente' })
    fireEvent.click(await within(movementList).findByRole('button', { name: 'Modifica Spesa settimanale' }))

    const editor = await screen.findByRole('dialog', { name: 'Modifica movimento' })
    fireEvent.click(await within(editor).findByRole('button', { name: 'Salva modifiche' }))

    const restoredList = await screen.findByRole('dialog', { name: 'Movimenti · Conto corrente' })
    expect(within(restoredList).getByText('Spesa settimanale')).not.toBeNull()
  })

  it('allows editing and deleting movements from a category result list', async () => {
    window.history.replaceState({}, '', '/?demo=simone&page=categories')
    render(<App />)

    const categoryName = await screen.findByText('Alimentari')
    const categoryRow = categoryName.closest('article')
    expect(categoryRow).not.toBeNull()
    fireEvent.click(categoryRow!)

    const movementList = await screen.findByRole('dialog', { name: 'Movimenti · Alimentari' })
    expect(await within(movementList).findByRole('button', { name: 'Elimina Spesa settimanale' })).not.toBeNull()
    fireEvent.click(within(movementList).getByRole('button', { name: 'Modifica Spesa settimanale' }))

    const editor = await screen.findByRole('dialog', { name: 'Modifica movimento' })
    fireEvent.click(await within(editor).findByRole('button', { name: 'Salva modifiche' }))

    const restoredList = await screen.findByRole('dialog', { name: 'Movimenti · Alimentari' })
    expect(within(restoredList).getByText('Spesa settimanale')).not.toBeNull()
    fireEvent.click(within(restoredList).getByRole('button', { name: 'Elimina Spesa settimanale' }))

    await waitFor(() => expect(within(restoredList).queryByText('Spesa settimanale')).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Movimenti · Alimentari' })).not.toBeNull()
  })
})
