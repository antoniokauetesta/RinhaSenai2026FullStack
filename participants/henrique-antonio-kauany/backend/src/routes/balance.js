import { prisma } from '../db.js'

export default async function balanceRoutes(fastify) {
  // GET /api/balance
  fastify.get('/api/balance', async (request, reply) => {
    const [approvedAgg, declinedCount, refundedAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { status: 'approved' },
        _sum: { netAmount: true },
        _count: true,
      }),
      prisma.transaction.count({ where: { status: 'declined' } }),
      prisma.transaction.aggregate({
        where: { status: 'refunded' },
        _count: true,
      }),
    ])

    const balance = approvedAgg._sum.netAmount || 0

    return reply.send({
      balance,
      total_approved: approvedAgg._count,
      total_declined: declinedCount,
      total_refunded: refundedAgg._count,
    })
  })
}
