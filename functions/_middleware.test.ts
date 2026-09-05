import { describe, expect, it, vi } from 'vitest'
import { onRequest } from './_middleware.js'

describe('redirect dominio storico', () => {
  it.each(['valarmorghulis.it', 'www.valarmorghulis.it'])(
    'reindirizza %s sul dominio sKey conservando percorso e query',
    async (host) => {
      const next = vi.fn()
      const response = await onRequest({
        request: new Request(`https://${host}/rimborsi?stato=attesi`),
        next,
      })

      expect(response.status).toBe(308)
      expect(response.headers.get('location')).toBe('https://www.skeyapp.com/rimborsi?stato=attesi')
      expect(next).not.toHaveBeenCalled()
    },
  )

  it('lascia proseguire le richieste sul nuovo dominio', async () => {
    const expected = new Response('ok')
    const next = vi.fn().mockResolvedValue(expected)

    await expect(onRequest({
      request: new Request('https://www.skeyapp.com/guida'),
      next,
    })).resolves.toBe(expected)
  })
})
