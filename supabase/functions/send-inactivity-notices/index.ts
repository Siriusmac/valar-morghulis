import { createClient } from 'npm:@supabase/supabase-js@2'
import { deliverInactivityNotices, inactivityMail, type InactivityNotice } from '../_shared/inactivity-mail.ts'

// Optional Resend adapter. No account is provisioned; activation requires explicit configuration.
// Scheduler sends x-inactivity-secret. Never accept a caller-supplied recipient or deadline.
Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const secret = Deno.env.get('INACTIVITY_JOB_SECRET')
  const provided = request.headers.get('x-inactivity-secret') ?? ''
  if (!secret || !await sameSecret(secret, provided)) return json({ error: 'unauthorized' }, 401)
  if (Deno.env.get('INACTIVITY_MAIL_ENABLED') !== 'true') return json({ status: 'disabled' })
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('INACTIVITY_FROM_EMAIL')
  if (!apiKey || !from || !/^[a-zA-Z0-9._+-]+@skeyapp\.com$/.test(from)) {
    return json({ error: 'mail_configuration_required' }, 503)
  }
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    const result = await deliverInactivityNotices({
      async prepare() {
        const { error } = await client.rpc('prepare_inactivity_notices')
        if (error) throw new Error('prepare_failed')
      },
      async claim() {
        const { data, error } = await client.rpc('claim_inactivity_notice')
        if (error) throw new Error('claim_failed')
        return data?.[0] as InactivityNotice | undefined
      },
      async finish(id, accepted) {
        const { error } = await client.rpc('finish_inactivity_notice', { target_id: id, accepted })
        if (error) throw new Error('finish_failed')
      },
    }, async (notice) => {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `inactivity/${notice.notice_id}` },
        body: JSON.stringify({ from: `sKey <${from}>`, to: [notice.recipient], ...inactivityMail(notice.review_after) }),
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error('delivery_not_accepted')
      const receipt = await response.json() as { id?: string }
      if (!receipt.id) throw new Error('delivery_receipt_missing')
    })
    return json(result)
  } catch {
    // Do not log recipients, provider responses, tokens or financial data.
    return json({ error: 'inactivity_job_failed' }, 502)
  }
})

async function sameSecret(expected: string, actual: string) {
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  const [a, b] = await Promise.all([digest(expected), digest(actual)])
  const left = new Uint8Array(a), right = new Uint8Array(b)
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i]
  return difference === 0
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
