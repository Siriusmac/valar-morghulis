import { getSupabase } from './supabase'
import type { CommissionedPurchase, Contact, ContactInvitation, User, UserId } from '../types'

export interface ContactData {
  friends: Contact[]
  invitations: ContactInvitation[]
  purchases: CommissionedPurchase[]
}

export async function loadContactData(userId: UserId): Promise<ContactData> {
  const supabase = getSupabase()
  const [linksResult, invitationsResult, purchasesResult] = await Promise.all([
    supabase.from('contact_links').select('user_id_a, user_id_b')
      .or(`user_id_a.eq.${userId},user_id_b.eq.${userId}`),
    supabase.from('contact_invitations')
      .select('id, email, created_at, expires_at, accepted_at, declined_at')
      .eq('invited_by', userId).is('accepted_at', null),
    supabase.from('commissioned_purchases').select('*')
      .or(`payer_id.eq.${userId},recipient_id.eq.${userId}`).order('created_at', { ascending: false }),
  ])
  const error = linksResult.error ?? invitationsResult.error ?? purchasesResult.error
  if (error) throw error

  const friendIds = (linksResult.data ?? []).map((link) => link.user_id_a === userId ? link.user_id_b : link.user_id_a)
  const profilesResult = friendIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name, full_name, email').in('id', friendIds)
    : { data: [], error: null }
  if (profilesResult.error) throw profilesResult.error

  return {
    friends: (profilesResult.data ?? []).map((profile) => contactFromProfile(profile)),
    invitations: (invitationsResult.data ?? []).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      status: (invitation.declined_at ? 'declined' : new Date(invitation.expires_at).getTime() <= Date.now() ? 'expired' : 'pending') as ContactInvitation['status'],
      createdAt: invitation.created_at,
      expiresAt: invitation.expires_at,
    })),
    purchases: (purchasesResult.data ?? []).map((purchase) => ({
      id: purchase.id,
      payerId: purchase.payer_id,
      recipientId: purchase.recipient_id ?? undefined,
      invitationId: purchase.invitation_id ?? undefined,
      familyId: purchase.family_id ?? undefined,
      reimbursementId: purchase.reimbursement_id ?? undefined,
      payerMovementId: purchase.payer_movement_id,
      amount: Number(purchase.amount),
      purchaseDate: purchase.purchase_date,
      description: purchase.description,
      status: purchase.status as CommissionedPurchase['status'],
      recipientMovementId: purchase.recipient_movement_id ?? undefined,
      recipientCategoryId: purchase.recipient_category_id ?? undefined,
      recipientAccountId: purchase.recipient_account_id ?? undefined,
      createdAt: purchase.created_at,
    })),
  }
}

export async function inviteContact(email: string) {
  const { data, error } = await getSupabase().functions.invoke('invite-contact', {
    body: { email: email.trim().toLowerCase() },
  })
  if (error || data?.error) throw new Error(data?.error ?? error?.message ?? 'contact_invitation_failed')
  return data as { invitation: { id: string }; redirectTo: string }
}

export async function withdrawContactInvitation(invitationId: string) {
  const { error } = await getSupabase().rpc('withdraw_contact_invitation', {
    target_invitation_id: invitationId,
  })
  if (error) throw error
}

export async function removeContact(contactId: UserId) {
  const { error } = await getSupabase().rpc('remove_contact', { target_contact_id: contactId })
  if (error) throw error
}

export async function createCommissionedPurchase(input: {
  id: string
  recipientId?: UserId
  invitationId?: string
  familyId?: string
  reimbursementId?: string
  payerMovementId: string
  amount: number
  purchaseDate: string
  description: string
}) {
  const { error } = await getSupabase().rpc('create_commissioned_purchase', {
    purchase_id: input.id,
    target_recipient_id: input.recipientId ?? null,
    target_invitation_id: input.invitationId ?? null,
    target_family_id: input.familyId ?? null,
    target_reimbursement_id: input.reimbursementId ?? null,
    target_payer_movement_id: input.payerMovementId,
    purchase_amount: input.amount,
    target_purchase_date: input.purchaseDate,
    purchase_description: input.description,
  })
  if (error) throw error
}

export async function respondToCommissionedPurchase(input: {
  id: string
  accepted: boolean
  movementId?: string
  categoryId?: string
  accountId?: string
}) {
  const { error } = await getSupabase().rpc('respond_to_commissioned_purchase', {
    target_purchase_id: input.id,
    accept_purchase: input.accepted,
    target_recipient_movement_id: input.movementId ?? null,
    target_category_id: input.categoryId ?? null,
    target_account_id: input.accountId ?? null,
  })
  if (error) throw error
}

export function familyContacts(members: User[], currentUserId: UserId, familyName: string): Contact[] {
  return members.filter((member) => member.id !== currentUserId).map((member) => ({
    ...member,
    source: 'family' as const,
    familyNames: [familyName],
  }))
}

function contactFromProfile(profile: {
  id: string
  first_name?: string | null
  last_name?: string | null
  full_name: string
  email: string
}): Contact {
  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || profile.full_name
  return {
    id: profile.id,
    name,
    email: profile.email,
    initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join(''),
    source: 'friend',
  }
}
