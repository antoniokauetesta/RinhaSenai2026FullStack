import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import transactionRoutes from './routes/transactions.js'
import balanceRoutes from './routes/balance.js'
import healthRoutes from './routes/health.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'warn',
  },
})

// Trata erros de parse de JSON do body como 422 (campos inválidos)
// em vez de deixar vazar um 500.
fastify.setErrorHandler((error, request, reply) => {
  if (error.statusCode === 400 && /json/i.test(error.message || '')) {
    return reply.code(422).send({ error: 'invalid_json_body' })
  }
  request.log.error(error)
  return reply.code(500).send({ error: 'internal_server_error' })
})

await fastify.register(transactionRoutes)
await fastify.register(balanceRoutes)
await fastify.register(healthRoutes)

// Serve o frontend buildado (Vite -> dist) como SPA.
const frontendDist = path.resolve(__dirname, '../../frontend/dist')

await fastify.register(fastifyStatic, {
  root: frontendDist,
  index: 'index.html',
  wildcard: false,
})

// SPA fallback: qualquer rota que não seja /api/* e não bata em um
// arquivo estático devolve index.html, para o React Router cuidar
// de deep links como /history?page=3 e reloads em /transaction/:id.
fastify.setNotFoundHandler((request, reply) => {
  if (request.raw.url && request.raw.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'not_found' })
  }
  return reply.sendFile('index.html', frontendDist)
})

const PORT = parseInt(process.env.PORT || '3000', 10)

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`Gateway de pagamentos rodando na porta ${PORT}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
