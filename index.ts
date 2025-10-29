import './instrument.ts';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { createStorage } from 'unstorage';
import redisDriver from 'unstorage/drivers/redis';
import { tracingChannel } from 'diagnostics_channel';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Span } from '@sentry/node';
import { SPAN_STATUS_ERROR, SPAN_STATUS_OK } from '@sentry/core';

const storage = createStorage({
  driver: redisDriver({
    base: 'unstorage',
    host: 'localhost',
    port: 6379,
  }),
});

const fastify = Fastify({
  logger: true,
});

Sentry.setupFastifyErrorHandler(fastify);

const unstorageChannel = tracingChannel<
  {},
  { op: string; key: string; span?: Span; done?: () => void }
>('unjs.unstorage');

unstorageChannel.subscribe({
  start: (data) => {
    console.log('==========');
    const promise = new Promise((resolve) => {
      data.done = () => {
        resolve(true);
        console.log('done!!!!!!');
      };
    });
    Sentry.startSpanManual(
      {
        name: `${data.op}: ${data.key}`,
        op: data.op,
        attributes: {
          ['cache.key']: data.key,
        },
      },
      async (span) => {
        data.span = span;
        await promise;
      }
    );

    console.log('start', data);
    console.log('==========');
  },
  end: (data) => {
    // NOTHING
  },
  asyncStart: (data) => {
    // NOTHING
  },
  asyncEnd: (data) => {
    console.log('==========');
    console.log('asyncEnd', data);
    const { span, done } = data;
    if (!span) {
      return;
    }

    span.setStatus({ code: SPAN_STATUS_OK });
    done?.();
    span.end();
    console.log('==========');
  },
  error: (data) => {
    // NOTHING
    const { span, done } = data;
    if (!span) {
      return;
    }

    span.setStatus({ code: SPAN_STATUS_ERROR });
    Sentry.captureException(data.error);
    done?.();
  },
});

fastify.get('/', async (request, reply) => {
  let value = await storage.getItem('count');
  if (value === null) {
    value = 0;
  }
  // value = (value as number) + 1;
  // await storage.setItem('count', value);

  return { count: value };
});

// Run the server!
fastify.listen({ port: 3000 }, function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
