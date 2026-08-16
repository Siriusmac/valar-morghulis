import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const appUrl = Deno.env.get('APP_URL')!
  const authorization = request.headers.get('Authorization') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json({ error: 'authentication_required' }, 401)

  const body = await request.json().catch(() => ({})) as { email?: string }
  const email = body.email?.trim().toLowerCase()
  if (!email || !email.includes('@')) return json({ error: 'invalid_request' }, 400)

  const { data: ownProfile } = await adminClient.from('profiles').select('email').eq('id', user.id).single()
  if (ownProfile?.email?.toLowerCase() === email) return json({ error: 'cannot_add_self' }, 409)

  const { data: invitedProfile } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle()
  if (invitedProfile) {
    const first = user.id < invitedProfile.id ? user.id : invitedProfile.id
    const second = user.id < invitedProfile.id ? invitedProfile.id : user.id
    const { data: existing } = await adminClient.from('contact_links')
      .select('user_id_a').eq('user_id_a', first).eq('user_id_b', second).maybeSingle()
    if (existing) return json({ error: 'contact_already_exists' }, 409)
  }

  const { data: existingInvitation, error: existingError } = await userClient
    .from('contact_invitations')
    .select('id, token, expires_at, declined_at')
    .eq('invited_by', user.id).eq('email', email).is('accepted_at', null).is('declined_at', null).maybeSingle()
  if (existingError) return json({ error: existingError.message }, 400)

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const result = existingInvitation
    ? await adminClient.from('contact_invitations').update({ token, expires_at: expiresAt })
      .eq('id', existingInvitation.id).select('id, token, expires_at').single()
    : await userClient.from('contact_invitations')
      .insert({ invited_by: user.id, email, token, expires_at: expiresAt })
      .select('id, token, expires_at').single()
  if (result.error) return json({ error: result.error.message }, 400)

  const invitation = result.data
  const redirectTo = `${appUrl.replace(/\/$/, '')}/?contactInvite=${invitation.token}&setup=password`
  const { error: mailError } = await adminClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  })
  if (mailError) {
    console.error('contact_invite_email_delivery_failed', { code: mailError.code, status: mailError.status })
    if (existingInvitation) {
      await adminClient.from('contact_invitations').update({
        token: existingInvitation.token,
        expires_at: existingInvitation.expires_at,
      }).eq('id', existingInvitation.id)
    } else {
      await adminClient.from('contact_invitations').delete().eq('id', invitation.id)
    }
    return json({ error: 'email_delivery_failed' }, 502)
  }
  return json({ invitation, redirectTo, resent: Boolean(existingInvitation) })
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
