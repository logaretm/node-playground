import './instrument.ts'
import Fastify from 'fastify'
import * as Sentry from "@sentry/node";

const fastify = Fastify({
  logger: true
})

Sentry.setupFastifyErrorHandler(fastify);

fastify.get('/', async (request, reply) => {
  request.log.info('something')

  return { hello: 'world' }
})

// Run the server!
fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})


