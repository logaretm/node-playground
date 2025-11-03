import './instrument.ts';
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';
import { createStorage } from './storage.ts';
import { tracingChannelFixed } from './tracingChannelFixed.ts';
import type { Span } from '@sentry/node';
import {
  SEMANTIC_ATTRIBUTE_CACHE_KEY,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
} from '@sentry/core';
import { context, trace } from '@opentelemetry/api';

const storage = createStorage();

const fastify = Fastify({
  logger: true,
});

Sentry.setupFastifyErrorHandler(fastify);

// 🔧 INSTRUMENTATION CODE: Subscribe to the same channel the library uses
// This is where vendor-specific (Sentry/OTel) code lives
const unstorageChannel = tracingChannelFixed<
  { op: string; key: string; span?: Span; resolve?: () => void }
>('unjs.unstorage');

// 🔥 KEY: Bind AsyncLocalStorage - this is ONLY done by instrumentation code
// The library doesn't need to know about this
try {
  const contextManager = (context as any)._getContextManager();
  if (contextManager?._asyncLocalStorage) {
    console.log('✅ Binding OpenTelemetry AsyncLocalStorage to unstorage channel');
    unstorageChannel.bindStore(contextManager._asyncLocalStorage);
  } else {
    console.warn('⚠️  Could not access OpenTelemetry AsyncLocalStorage');
  }
} catch (err) {
  console.warn('⚠️  Error accessing context manager:', err);
}

unstorageChannel.subscribe({
  start: (data) => {
    console.log('🔹 unstorage start event:', data.op, data.key);
    
    // Debug: Check current context before creating span
    const currentActiveSpan = trace.getActiveSpan();
    console.log('🔍 Active span BEFORE startInactiveSpan:', currentActiveSpan?.spanContext().spanId || 'none');
    
    // 🔥 KEY: Start an inactive span and manually set it in context
    const span = Sentry.startInactiveSpan({
      name: 'unstorage',
      op: `${data.op} ${data.key}`,
      attributes: {
        [SEMANTIC_ATTRIBUTE_CACHE_KEY]: data.key,
        op: data.op,
      },
    });
    
    console.log('🔍 Span created with parent:', (span as any).parentSpanContext?.spanId || 'none');
    
    if (span) {
      console.log('🔹 unstorage span created:', data.op, data.key, 'spanId:', span.spanContext().spanId);
      data.span = span;
      
      // 🔥 Store the span in channel data so tracingChannelFixed can use it
      // Don't use enterWith here - let the fixed tracing channel handle context
      const newContext = trace.setSpan(context.active(), span as any);
      (data as any)._spanContext = newContext;
      console.log('✅ Span context prepared! spanId:', span.spanContext().spanId);
    }
  },
  asyncEnd(data) {
    // End the span
    data.span?.setStatus({ code: SPAN_STATUS_OK });
    data.span?.end();
    data.resolve?.();
  },
  error(data) {
    data.resolve?.();
    data.span?.setStatus({ code: SPAN_STATUS_ERROR });
    data.span?.end();
  },
  end() {},
  asyncStart() {},
});

fastify.get('/', async (_request, _reply) => {
  let value = await storage.getItem('count');
  if (!value) {
    value = 0;
  }
  value = (value as number) + 1;
  await storage.setItem('count', value);

  return { count: value };
});

// Run the server!
fastify.listen({ port: 3000 }, function (err, _address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
