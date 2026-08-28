// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GuidePage } from './GuidePage'

afterEach(cleanup)

describe('GuidePage', () => {
  it('renders an indexed introduction and all guide chapters', () => {
    render(<GuidePage />)

    expect(screen.getByRole('heading', { name: 'Guida', level: 1 })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Indice della guida' })).toBeTruthy()

    const chapterLinks = screen.getAllByRole('link')
    expect(chapterLinks).toHaveLength(10)
    expect(chapterLinks[0].getAttribute('href')).toBe('#iniziare')
    expect(chapterLinks[6].getAttribute('href')).toBe('#rimborsi')
    expect(chapterLinks[9].getAttribute('href')).toBe('#famiglia')

    expect(screen.getByRole('heading', { name: 'Primi passi e Bacheca' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Contatti e acquisti per altri' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Categorie, beneficiari, mittenti e tag' })).toBeTruthy()
    expect(screen.getByText(/Esistono molte app per gestire le finanze personali/)).toBeTruthy()
    expect(screen.getAllByText(/rimborso.*tramite acquisto/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Account, famiglie e privacy' })).toBeTruthy()
    expect(screen.getByText(/Prima di eliminare definitivamente l’account/)).toBeTruthy()
  })
})
