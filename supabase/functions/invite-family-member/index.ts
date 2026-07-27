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

  const body = await request.json().catch(() => ({})) as { familyId?: string; email?: string }
  const email = body.email?.trim().toLowerCase()
  if (!body.familyId || !email || !email.includes('@')) return json({ error: 'invalid_request' }, 400)

  const { data: membership } = await userClient
    .from('family_members')
    .select('role')
    .eq('family_id', body.familyId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (membership?.role !== 'admin') return json({ error: 'admin_required' }, 403)

  const { data: invitedProfile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (invitedProfile) {
    const { data: existingMember } = await adminClient
      .from('family_members')
      .select('user_id')
      .eq('family_id', body.familyId)
      .eq('user_id', invitedProfile.id)
      .maybeSingle()
    if (existingMember) return json({ error: 'user_already_in_family' }, 409)
  }

  const { data: existingInvitation, error: existingError } = await userClient
    .from('family_invitations')
    .select('id, token, expires_at, declined_at')
    .eq('family_id', body.familyId)
    .eq('email', email)
    .is('accepted_at', null)
    .maybeSingle()
  if (existingError) return json({ error: existingError.message }, 400)
  if (existingInvitation?.declined_at) {
    return json({ error: 'invitation_declined_requires_removal' }, 409)
  }

  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const previousInvitation = existingInvitation
    ? { token: existingInvitation.token, expires_at: existingInvitation.expires_at }
    : null
  const invitationResult = existingInvitation
    ? await adminClient.from('family_invitations')
      .update({ token, expires_at: expiresAt })
      .eq('id', existingInvitation.id)
      .select('id, token, expires_at')
      .single()
    : await userClient.from('family_invitations')
      .insert({ family_id: body.familyId, email, invited_by: user.id, token, expires_at: expiresAt })
      .select('id, token, expires_at')
      .single()
  if (invitationResult.error) {
    const duplicate = invitationResult.error.code === '23505'
    return json({ error: duplicate ? 'invitation_already_pending' : invitationResult.error.message }, duplicate ? 409 : 400)
  }
  const invitation = invitationResult.data
  const redirectTo = `${appUrl.replace(/\/$/, '')}/?invite=${invitation.token}&setup=password`
  const { error: mailError } = await adminClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  })
  if (mailError) {
    console.error('invite_email_delivery_failed', { code: mailError.code, status: mailError.status })
    if (previousInvitation) {
      await adminClient.from('family_invitations').update(previousInvitation).eq('id', invitation.id)
    } else {
      await adminClient.from('family_invitations').delete().eq('id', invitation.id)
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
