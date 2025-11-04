import './instrument.ts';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { createStorage } from './storage.ts';
import { tracingChannel, setDebugFlag } from 'otel-tracing-channel';
import {
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
} from '@sentry/core';

const storage = createStorage();

const fastify = Fastify({
  logger: true,
});

Sentry.setupFastifyErrorHandler(fastify);

setDebugFlag(true);

const unstorageChannel = tracingChannel<{
  op: string;
  key: string;
  span?: any;
}>('unjs.unstorage');

// 🎯 Super clean API: Just return a span from start, context injection is automatic!
unstorageChannel.subscribe({
  start: (data) => {
    console.log('🔹 unstorage start event:', data.op, data.key);
    const span = Sentry.startSpanManual(
      {
        name: 'unstorage',
        op: `${data.op} ${data.key}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_CACHE_KEY]: data.key,
          op: data.op,
        },
      },
      (span) => span
    );

    data.span = span;

    // 🔥 Just return it, the library handles the rest
    return span;
  },
  asyncEnd: (data) => {
    data.span?.setStatus({ code: SPAN_STATUS_OK });
    data.span?.end();
  },
  error: (data) => {
    data.span?.setStatus({ code: SPAN_STATUS_ERROR });
    data.span?.end();
  },
});

fastify.get('/', async (_request, _reply) => {
  let ps = [storage.getItem('count'), storage.getItem('count2')];

  await Promise.all(ps);

  return { done: true };
});

// Run the server!
fastify.listen({ port: 3000 }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
