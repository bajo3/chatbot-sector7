import { prisma } from '../db/prisma.js';

type ConversationState = 'BOT_ON' | 'HUMAN_TAKEOVER';
type LeadStatus = 'NEW' | 'COLD' | 'WARM' | 'HOT_WAITING' | 'HOT' | 'HUMAN' | 'CLOSED_WON' | 'CLOSED_LOST' | 'HOT_LOST';

/**
 * Try to assign a conversation to an online seller WITHOUT silencing the bot.
 * - Does not require HUMAN_TAKEOVER state.
 * - If no sellers online, it only records an event.
 */
export async function tryAssignSeller(conversationId: string) {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) return;
  if (convo.assignedUserId) return;

  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER', isActive: true, isOnline: true },
    select: { id: true, name: true }
  });

  type SellerLite = { id: string; name: string };

  if (sellers.length === 0) {
    await prisma.conversationEvent.create({ data: { conversationId, kind: 'NO_SELLERS_ONLINE', payload: {} } });
    return;
  }

  // Choose seller with least active takeovers
  const counts = await Promise.all((sellers as SellerLite[]).map(async (s: SellerLite) => {
    const c = await prisma.conversation.count({
      where: { assignedUserId: s.id, state: 'HUMAN_TAKEOVER' as ConversationState }
    });
    return { seller: s, count: c };
  }));
  counts.sort((a, b) => a.count - b.count);

  const chosen = counts[0].seller;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedUserId: chosen.id, leadStatus: 'HOT' as LeadStatus }
  });

  await prisma.conversationEvent.create({
    data: { conversationId, kind: 'ASSIGNED_SELLER', payload: { sellerId: chosen.id, sellerName: chosen.name } }
  });
}


/**
 * Assign conversation to an online seller.
 * - If there are online sellers, assign round‑robin by least assigned open takeovers.
 * - If none, keep waiting and record event.
 */
export async function requestHandoffIfNeeded(conversationId: string) {
  const convo = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!convo) return;
  if (convo.state !== ('HUMAN_TAKEOVER' as ConversationState)) return;
 

  if (convo.assignedUserId) return;

  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER', isActive: true, isOnline: true },
    select: { id: true, name: true }
  });

  type SellerLite = { id: string; name: string };

  if (sellers.length === 0) {
    await prisma.conversationEvent.create({ data: { conversationId, kind:'NO_SELLERS_ONLINE', payload: {} } });
    return;
  }

  // Choose seller with least active takeovers
  const counts = await Promise.all((sellers as SellerLite[]).map(async (s: SellerLite) => {
    const c = await prisma.conversation.count({
      where: { assignedUserId: s.id, state: 'HUMAN_TAKEOVER' as ConversationState }
    });
    return { seller: s, count: c };
  }));
  counts.sort((a,b)=>a.count-b.count);

  const chosen = counts[0].seller;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedUserId: chosen.id, leadStatus: 'HUMAN' as LeadStatus }
  });

  await prisma.conversationEvent.create({
    data: { conversationId, kind:'ASSIGNED_SELLER', payload: { sellerId: chosen.id, sellerName: chosen.name } }
  });
}
