// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

afterEach(cleanup)

function renderModal(onClose = vi.fn()) {
  function Harness() {
    const [open, setOpen] = useState(false)
    return <>
      <div data-testid="underlying"><button onClick={() => setOpen(true)}>Apri</button></div>
      {open ? <Modal title="Prova" onClose={() => { onClose(); setOpen(false) }}><input aria-label="Primo campo" /><button>Ultimo</button></Modal> : null}
    </>
  }
  const result = render(<Harness />)
  const opener = screen.getByRole('button', { name: 'Apri' })
  opener.focus()
  fireEvent.click(opener)
  return { ...result, opener, onClose }
}

describe('Modal', () => {
  it('sposta il focus nel dialogo e lo cicla con Tab e Shift+Tab', () => {
    renderModal()
    const close = screen.getByRole('button', { name: 'Chiudi' })
    const last = screen.getByRole('button', { name: 'Ultimo' })
    expect(document.activeElement).toBe(close)

    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('chiude con Escape', () => {
    const { onClose } = renderModal()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ripristina il focus all’elemento di apertura', () => {
    const { opener } = renderModal()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(document.activeElement).toBe(opener)
  })

  it('rende inerte e non focalizzabile il contenuto sottostante', () => {
    const { opener } = renderModal()
    expect(opener.parentElement?.inert).toBe(true)
    opener.focus()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
  })
})
