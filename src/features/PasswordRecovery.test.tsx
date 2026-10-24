// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PasswordRecovery } from './PasswordRecovery'

afterEach(cleanup)
function setup(updatePassword = vi.fn().mockResolvedValue(undefined)) {
  const onCompleted = vi.fn(), onCancel = vi.fn()
  render(<PasswordRecovery updatePassword={updatePassword} onCompleted={onCompleted} onCancel={onCancel} />)
  return { updatePassword, onCompleted, onCancel }
}
function fill(password = 'password-di-prova-unica', confirmation = password) {
  fireEvent.change(screen.getByLabelText('Nuova password'), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Conferma nuova password'), { target: { value: confirmation } })
  fireEvent.submit(screen.getByRole('button', { name: 'Salva nuova password' }).closest('form')!)
}
describe('password recovery', () => {
  it('validates length and confirmation without contacting the server', async () => {
    const { updatePassword } = setup()
    fill('breve')
    expect(screen.getByRole('alert').textContent).toContain('12 caratteri')
    fill('password-di-prova-unica', 'password-differente')
    expect(screen.getByRole('alert').textContent).toContain('non coincidono')
    expect(updatePassword).not.toHaveBeenCalled()
  })
  it('waits for server confirmation, clears fields and requires an explicit continue', async () => {
    const { updatePassword, onCompleted } = setup()
    fill()
    await screen.findByRole('heading', { name: 'Password aggiornata' })
    expect(updatePassword).toHaveBeenCalledWith('password-di-prova-unica')
    expect(screen.queryByLabelText('Nuova password')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('autenticatore')
    expect(onCompleted).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continua in sKey' }))
    expect(onCompleted).toHaveBeenCalledOnce()
  })
  it('keeps a failed or expired recovery retryable without claiming success', async () => {
    const { onCompleted } = setup(vi.fn().mockRejectedValue(new Error('expired')))
    fill()
    await screen.findByRole('alert')
    expect(screen.queryByRole('heading', { name: 'Password aggiornata' })).toBeNull()
    await waitFor(() => expect((screen.getByRole('button', { name: 'Salva nuova password' }) as HTMLButtonElement).disabled).toBe(false))
    expect(onCompleted).not.toHaveBeenCalled()
  })
  it('does not change credentials when canceled', () => {
    const { updatePassword, onCancel } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(updatePassword).not.toHaveBeenCalled()
  })
})
