import './instrument.ts';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { createStorage } from './storage.ts';
import { tracingChannel } from 'diagnostics_channel';
import type { Span } from '@sentry/node';
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

const unstorageChannel = tracingChannel<
  {},
  { op: string; key: string; span?: Span; resolve?: () => void }
>('unjs.unstorage');

unstorageChannel.subscribe({
  start: (data) => {
    const p = new Promise<void>((resolve) => {
      data.resolve = resolve;
    });

    Sentry.startSpanManual(
      {
        name: 'unstorage',
        op: `${data.op} ${data.key}`,
        attributes: {
          [SEMANTIC_ATTRIBUTE_CACHE_KEY]: data.key,
          op: data.op,
        },
      },
      async (s) => {
        data.span = s;
        await p;
      }
    );
  },
  asyncEnd(data) {
    data.resolve?.();
    data.span?.setStatus({ code: SPAN_STATUS_OK });
    data.span?.end();
  },
  error(data) {
    data.resolve?.();
    data.span?.setStatus({ code: SPAN_STATUS_ERROR });
    data.span?.end();
  },
  end() {},
  asyncStart() {},
});

fastify.get('/', async (request, reply) => {
  let value = await storage.getItem('count');
  if (!value) {
    value = 0;
  }
  value = (value as number) + 1;
  await storage.setItem('count', value);

  return { count: value };
});

// Run the server!
fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
