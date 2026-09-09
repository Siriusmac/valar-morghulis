// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu } from './ActionMenu'

afterEach(cleanup)

describe('ActionMenu', () => {
  it('closes after selecting an item', () => {
    const onSelect = vi.fn()
    render(<ActionMenu label="Azioni" items={[{ label: 'Modifica', onSelect }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Azioni' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Modifica' }))
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('closes when clicking outside or pressing Escape', () => {
    render(<><ActionMenu label="Azioni" items={[{ label: 'Modifica', onSelect: vi.fn() }]} /><button type="button">Fuori</button></>)
    const trigger = screen.getByRole('button', { name: 'Azioni' })
    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Fuori' }))
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
