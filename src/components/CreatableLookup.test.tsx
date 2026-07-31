// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreatableLookup } from './CreatableLookup'

afterEach(cleanup)

const options = [{ id: 'uno', name: 'Uno' }, { id: 'due', name: 'Due' }]

describe('CreatableLookup', () => {
  it('naviga le opzioni con le frecce e seleziona con Invio', () => {
    const onChange = vi.fn()
    render(<CreatableLookup label="Voce" value="" options={options} placeholder="Cerca" onChange={onChange} />)
    const input = screen.getByRole('combobox')

    fireEvent.focus(input)
    input.focus()
    const firstActive = input.getAttribute('aria-activedescendant')
    expect(firstActive).toBe(screen.getByRole('option', { name: 'Uno' }).id)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Due' }).id)
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith('Due')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(input)
  })

  it('chiude con Escape mantenendo il focus sul combobox', () => {
    render(<CreatableLookup label="Voce" value="" options={options} placeholder="Cerca" onChange={vi.fn()} />)
    const input = screen.getByRole('combobox')
    fireEvent.focus(input)
    input.focus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
    expect(document.activeElement).toBe(input)
  })

  it('associa gli errori solo allo stato non valido', () => {
    const { rerender } = render(<CreatableLookup label="Voce" value="" options={options} placeholder="Cerca" onChange={vi.fn()} error="Campo obbligatorio" />)
    const input = screen.getByRole('combobox')
    const errorId = input.getAttribute('aria-describedby')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(errorId).toBeTruthy()
    expect(document.getElementById(errorId!)?.textContent).toBe('Campo obbligatorio')

    rerender(<CreatableLookup label="Voce" value="" options={options} placeholder="Cerca" onChange={vi.fn()} />)
    expect(input.hasAttribute('aria-invalid')).toBe(false)
    expect(input.hasAttribute('aria-describedby')).toBe(false)
  })
})
