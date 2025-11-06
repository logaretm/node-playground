import './instrument.ts';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { createStorage } from './storage.ts';
import { tracingChannel } from 'node:diagnostics_channel';
import { context, trace } from '@opentelemetry/api';
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

const channel = tracingChannel<{
  op: string;
  key: string;
  span?: any;
}>('unjs.unstorage');

// Get OTel's AsyncLocalStorage for bindStore
const otelStorage = (context as any)._getContextManager()._asyncLocalStorage;

if (otelStorage) {
  // Bind start - create span in the transform
  // @ts-ignore - bindStore types don't account for AsyncLocalStorage of different type
  channel.start.bindStore(otelStorage, (data) => {
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

    // Return the context to store in AsyncLocalStorage
    return trace.setSpan(context.active(), span);
  });
} else {
  console.warn('Could not access OTel AsyncLocalStorage\n');
}

// Subscribe to events (span already created in bindStore)
channel.subscribe({
  start: (data) => {},
  asyncStart: () => {},
  asyncEnd: (data) => {
    console.log('📍 AsyncEnd event - ending span');
    data.span?.setStatus({ code: SPAN_STATUS_OK });
    data.span?.end();
  },
  end: () => {},
  error: (data) => {
    console.log('📍 Error event');
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
