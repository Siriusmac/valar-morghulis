export async function invitationInvokeError(data: unknown, error: unknown) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null
  if (context && typeof context === 'object' && 'clone' in context && typeof context.clone === 'function') {
    const payload = await (context.clone() as Response).json().catch(() => null) as { error?: unknown } | null
    if (typeof payload?.error === 'string') return payload.error
  }
  if (error instanceof Error) return error.message
  return error ? 'Invito non inviato' : ''
}
