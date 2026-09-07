import { describe, expect, it, vi } from 'vitest'
import { deliverInactivityNotices, inactivityMail, type InactivityNotice } from './inactivity-mail'

const notice: InactivityNotice = { notice_id: 'notice-1', recipient: 'test@example.test', review_after: '2027-04-05T12:00:00Z' }

describe('inactivity notices', () => {
  it('uses a public login URL without authentication tokens or tracking parameters', () => {
    const mail = inactivityMail(notice.review_after)
    expect(mail.text).toContain('5 aprile 2027')
    expect(mail.text).toContain('14:00')
    expect(mail.html.match(/href="[^"]+"/g)).toEqual(['href="https://www.skeyapp.com/"'])
    expect(mail.text).toContain('Non occorre registrare un movimento')
    expect(mail.text).toContain('previa verifica amministrativa')
    expect(() => inactivityMail('invalid')).toThrow('invalid_notice_date')
  })

  it('finishes only after acceptance and stops when the queue is empty', async () => {
    const events: string[] = []
    const claim = vi.fn().mockResolvedValueOnce(notice).mockResolvedValue(undefined)
    const result = await deliverInactivityNotices({
      prepare: async () => { events.push('prepare') }, claim,
      finish: async (id, accepted) => { events.push(`${id}:${accepted}`) },
    }, async () => { events.push('send') })
    expect(events).toEqual(['prepare', 'send', 'notice-1:true'])
    expect(result).toEqual({ accepted: 1, uncertain: 0 })
  })

  it('does not retry a timeout or keep sending after provider failure', async () => {
    const claim = vi.fn().mockResolvedValue(notice)
    const finish = vi.fn().mockResolvedValue(undefined)
    const send = vi.fn().mockRejectedValue(new Error('timeout'))
    expect(await deliverInactivityNotices({ prepare: async () => {}, claim, finish }, send))
      .toEqual({ accepted: 0, uncertain: 1 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith('notice-1', false)
  })

  it('stops if persistence fails after acceptance; it does not resend', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await expect(deliverInactivityNotices({
      prepare: async () => {}, claim: async () => notice,
      finish: async () => { throw new Error('database unavailable') },
    }, send)).rejects.toThrow('database unavailable')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('bounds each run to twenty notices', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await deliverInactivityNotices({ prepare: async () => {}, claim: async () => notice, finish: async () => {} }, send)
    expect(send).toHaveBeenCalledTimes(20)
  })
})
