import { createClient } from 'npm:@supabase/supabase-js@2'
import { importPKCS8, SignJWT } from 'npm:jose@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

type PushDevice = {
  id: string
  user_id: string
  token: string
  environment: 'development' | 'production'
  bundle_id: string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authorization = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'authentication_required' }, 401)

  const body = await request.json().catch(() => ({})) as { familyId?: string; reimbursementId?: string }
  if (!body.familyId || !body.reimbursementId) return json({ error: 'invalid_request' }, 400)

  const { data: reimbursement, error: reimbursementError } = await userClient
    .from('family_shared_records')
    .select('created_by, data')
    .eq('family_id', body.familyId)
    .eq('record_type', 'reimbursement')
    .eq('record_id', body.reimbursementId)
    .maybeSingle()
  if (reimbursementError) return json({ error: reimbursementError.message }, 400)
  if (!reimbursement) return json({ error: 'reimbursement_not_found' }, 404)
  if (reimbursement.created_by !== user.id || reimbursement.data?.authorId !== user.id) {
    return json({ error: 'reimbursement_author_required' }, 403)
  }

  const fromID = reimbursement.data?.fromId as string | undefined
  const toID = reimbursement.data?.toId as string | undefined
  const recipientID = fromID === user.id ? toID : fromID
  if (!recipientID || recipientID === user.id) return json({ error: 'reimbursement_counterparty_required' }, 400)

  const { data: recipientMembership, error: memberError } = await adminClient
    .from('family_members')
    .select('user_id')
    .eq('family_id', body.familyId)
    .eq('user_id', recipientID)
    .maybeSingle()
  if (memberError) return json({ error: memberError.message }, 500)
  if (!recipientMembership) return json({ error: 'reimbursement_counterparty_required' }, 400)

  const { data: devices, error: deviceError } = await adminClient
    .from('push_device_tokens')
    .select('id, user_id, token, environment, bundle_id')
    .eq('user_id', recipientID)
  if (deviceError) return json({ error: deviceError.message }, 500)
  if (!devices?.length) return json({ attempted: 0, sent: 0, failed: 0, skipped: 0 })

  let jwt: string
  try {
    jwt = await makeAPNsJWT()
  } catch (error) {
    console.error('apns_configuration_invalid', error)
    return json({ error: 'push_service_not_configured' }, 503)
  }

  let sent = 0
  let failed = 0
  let skipped = 0
  for (const device of (devices ?? []) as PushDevice[]) {
    const claim = await adminClient.from('reimbursement_push_deliveries').insert({
      family_id: body.familyId,
      reimbursement_id: body.reimbursementId,
      recipient_id: device.user_id,
      device_token_id: device.id,
    })
    if (claim.error?.code === '23505') { skipped += 1; continue }
    if (claim.error) { failed += 1; continue }

    const result = await sendAPNs(device, jwt, {
      aps: {
        alert: {
          title: 'Nuovo rimborso',
          body: 'Un membro della famiglia ha registrato un rimborso da confermare.',
        },
        sound: 'default',
      },
      type: 'reimbursement',
      familyId: body.familyId,
      reimbursementId: body.reimbursementId,
    })
    if (result.ok) { sent += 1; continue }

    failed += 1
    await adminClient.from('reimbursement_push_deliveries').delete()
      .eq('family_id', body.familyId)
      .eq('reimbursement_id', body.reimbursementId)
      .eq('device_token_id', device.id)
    if (result.invalidToken) {
      await adminClient.from('push_device_tokens').delete().eq('id', device.id)
    }
  }

  return json({ attempted: devices?.length ?? 0, sent, failed, skipped })
})

async function makeAPNsJWT() {
  const keyID = requiredSecret('APNS_KEY_ID')
  const teamID = requiredSecret('APNS_TEAM_ID')
  const privateKey = requiredSecret('APNS_PRIVATE_KEY').replaceAll('\\n', '\n')
  const key = await importPKCS8(privateKey, 'ES256')
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyID })
    .setIssuer(teamID)
    .setIssuedAt()
    .sign(key)
}

async function sendAPNs(device: PushDevice, jwt: string, payload: unknown) {
  const host = device.environment === 'development'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com'
  try {
    const response = await fetch(`${host}/3/device/${device.token}`, {
      method: 'POST',
      headers: {
        authorization: `bearer ${jwt}`,
        'apns-topic': device.bundle_id,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    if (response.ok) return { ok: true, invalidToken: false }
    const detail = await response.json().catch(() => ({})) as { reason?: string }
    const invalidToken = response.status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(detail.reason ?? '')
    console.error('apns_delivery_failed', { status: response.status, reason: detail.reason })
    return { ok: false, invalidToken }
  } catch (error) {
    console.error('apns_request_failed', error)
    return { ok: false, invalidToken: false }
  }
}

function requiredSecret(name: string) {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`${name}_missing`)
  return value
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
