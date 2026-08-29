export function functionErrorMessage(error: unknown, fallback = '') {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const fields = ['message', 'details', 'hint', 'code'] as const
    const parts = fields.flatMap((field) => {
      const value = record[field]
      return typeof value === 'string' && value.trim() ? [value.trim()] : []
    })
    if (parts.length) return [...new Set(parts)].join(' · ')
  }
  return fallback
}

export async function invitationInvokeError(data: unknown, error: unknown) {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return data.error
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null
  if (context && typeof context === 'object' && 'clone' in context && typeof context.clone === 'function') {
    const payload = await (context.clone() as Response).json().catch(() => null) as { error?: unknown } | null
    if (typeof payload?.error === 'string') return payload.error
  }
  return functionErrorMessage(error, error ? 'Invito non inviato' : '')
}
