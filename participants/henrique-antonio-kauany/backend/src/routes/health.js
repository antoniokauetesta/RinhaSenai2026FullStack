export default async function healthRoutes(fastify) {
  fastify.get('/api/health', async (request, reply) => {
    return reply.send({ status: 'ok' })
  })
}
