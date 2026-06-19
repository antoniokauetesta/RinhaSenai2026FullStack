import { v4 as uuidv4 } from 'uuid'
import { prisma } from '../db.js'
import { withLock } from '../lock.js'
import {
  getBrandFromCardNumber,
  calculateInterest,
  calculateFee,
  isCardBlocked,
  last4,
  validateTransactionInput,
  DAILY_LIMIT_CENTS,
  MIN_INSTALLMENT_CENTS,
} from '../rules.js'

function toPublicTransaction(t) {
  return {
    id: t.id,
    status: t.status,
    card_last4: t.cardLast4,
    card_brand: t.cardBrand,
    holder_name: t.holderName,
    amount_cents: t.amountCents,
    installments: t.installments,
    installment_amount: t.installmentAmount,
    total_with_interest: t.totalWithInterest,
    fee_cents: t.feeCents,
    net_amount: t.netAmount,
    description: t.description,
    created_at: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
  }
}

function startOfTodayUTC() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function endOfTodayUTC() {
  const now = new Date()
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999)
  )
}

async function getDailyApprovedTotal(cardLast4) {
  const result = await prisma.transaction.aggregate({
    where: {
      cardLast4,
      status: 'approved',
      createdAt: {
        gte: startOfTodayUTC(),
        lte: endOfTodayUTC(),
      },
    },
    _sum: { amountCents: true },
  })
  return result._sum.amountCents || 0
}

export default async function transactionRoutes(fastify) {
  // POST /api/transactions
  fastify.post('/api/transactions', async (request, reply) => {
    const body = request.body || {}
    const idempotencyKey =
      request.headers['idempotency-key'] || body.idempotency_key || null

    const validation = validateTransactionInput(body)
    if (!validation.valid) {
      return reply.code(422).send({ error: validation.error })
    }

    const brand = getBrandFromCardNumber(body.card_number)
    if (!brand) {
      return reply.code(422).send({ error: 'invalid_card_brand' })
    }

    const installments = body.installments || 1
    const { totalWithInterest, installmentAmount } = calculateInterest(
      body.amount_cents,
      installments
    )

    if (installmentAmount < MIN_INSTALLMENT_CENTS) {
      return reply.code(422).send({ error: 'installment_below_minimum' })
    }

    const { feeCents, netAmount } = calculateFee(totalWithInterest, brand.fee)
    const cardLast4 = last4(body.card_number)

    // Lock por idempotency key (se fornecida) garante que requests
    // concorrentes com a mesma key resultem em UMA única transação.
    const runCreation = async () => {
      if (idempotencyKey) {
        const existing = await prisma.transaction.findUnique({
          where: { idempotencyKey },
        })
        if (existing) {
          return { transaction: existing, alreadyExisted: true }
        }
      }

      // Lock por cartão garante consistência do limite diário sob concorrência.
      const result = await withLock(`card:${cardLast4}`, async () => {
        let status = 'approved'

        if (isCardBlocked(body.card_number)) {
          status = 'declined'
        } else {
          const dailyTotal = await getDailyApprovedTotal(cardLast4)
          if (dailyTotal + body.amount_cents > DAILY_LIMIT_CENTS) {
            status = 'declined'
          }
        }

        try {
          const created = await prisma.transaction.create({
            data: {
              id: uuidv4(),
              status,
              cardLast4,
              cardBrand: brand.name,
              holderName: body.holder_name.trim(),
              amountCents: body.amount_cents,
              installments,
              installmentAmount,
              totalWithInterest,
              feeCents,
              netAmount,
              description: body.description.trim(),
              idempotencyKey: idempotencyKey || null,
            },
          })
          return created
        } catch (err) {
          // Corrida rara: outra request criou com a mesma idempotency key
          // entre o findUnique e o create. Retorna a existente.
          if (idempotencyKey && err.code === 'P2002') {
            const existing = await prisma.transaction.findUnique({
              where: { idempotencyKey },
            })
            if (existing) return existing
          }
          throw err
        }
      })

      return { transaction: result, alreadyExisted: false }
    }

    const { transaction, alreadyExisted } = idempotencyKey
      ? await withLock(`idem:${idempotencyKey}`, runCreation)
      : await runCreation()

    return reply
      .code(alreadyExisted ? 200 : 201)
      .send(toPublicTransaction(transaction))
  })

  // GET /api/transactions/:id
  fastify.get('/api/transactions/:id', async (request, reply) => {
    const { id } = request.params
    const transaction = await prisma.transaction.findUnique({ where: { id } })
    if (!transaction) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.send(toPublicTransaction(transaction))
  })

  // GET /api/transactions?page=&limit=
  fastify.get('/api/transactions', async (request, reply) => {
    let page = parseInt(request.query.page, 10)
    let limit = parseInt(request.query.limit, 10)

    if (!Number.isInteger(page) || page < 1) page = 1
    if (!Number.isInteger(limit) || limit < 1) limit = 10
    if (limit > 100) limit = 100

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count(),
    ])

    const totalPages = Math.max(1, Math.ceil(total / limit))

    return reply.send({
      data: items.map(toPublicTransaction),
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
      },
    })
  })

  // POST /api/transactions/:id/refund
  fastify.post('/api/transactions/:id/refund', async (request, reply) => {
    const { id } = request.params

    const result = await withLock(`refund:${id}`, async () => {
      const existing = await prisma.transaction.findUnique({ where: { id } })
      if (!existing) {
        return { notFound: true }
      }
      if (existing.status !== 'approved') {
        return { conflict: true, transaction: existing }
      }

      // Update condicional: apenas se ainda estiver 'approved'.
      // Sob o lock isso já é seguro, mas mantemos a condição como
      // defesa em profundidade (ex: múltiplas instâncias do processo).
      const updateResult = await prisma.transaction.updateMany({
        where: { id, status: 'approved' },
        data: { status: 'refunded' },
      })

      if (updateResult.count === 0) {
        const current = await prisma.transaction.findUnique({ where: { id } })
        return { conflict: true, transaction: current }
      }

      const refunded = await prisma.transaction.findUnique({ where: { id } })
      return { transaction: refunded }
    })

    if (result.notFound) {
      return reply.code(404).send({ error: 'not_found' })
    }
    if (result.conflict) {
      return reply
        .code(422)
        .send({ error: 'not_refundable', status: result.transaction.status })
    }

    return reply.send(toPublicTransaction(result.transaction))
  })
}
