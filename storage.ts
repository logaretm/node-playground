import { tracingChannelFixed } from './tracingChannelFixed.ts';
import { startSpan, getActiveSpan } from '@sentry/node';
import { SPAN_STATUS_OK } from '@sentry/core';

interface StorageData {
  op: string;
  key: string;
}

// 📚 LIBRARY CODE: Use tracingChannelFixed for proper context propagation
// Note: This is vendor-neutral - no binding, no spans, just event publishing
// The instrumentation code (index.ts) handles binding and span creation
const channel = tracingChannelFixed<StorageData>('unjs.unstorage');

export function createStorage() {
  const store = new Map<string, any>();

  async function getItem(key: string) {
    const channelData: StorageData = {
      op: 'getItem',
      key,
    };

    return channel.tracePromise(async () => {
      console.log('getItem - active span:', getActiveSpan()?.spanContext().spanId || 'none');

      return startSpan(
        {
          name: 'db.getItem',
          op: 'db.getItem',
        },
        async (s) => {
          await sleep(200);

          const result = store.get(key);
          s.setStatus({ code: SPAN_STATUS_OK });

          return result;
        }
      );
    }, channelData);
  }

  async function setItem(key: string, value: any) {
    const channelData: StorageData = {
      op: 'setItem',
      key,
    };

    return channel.tracePromise(async () => {
      console.log('setItem - active span:', getActiveSpan()?.spanContext().spanId || 'none');

      return startSpan(
        {
          name: 'db.setItem',
          op: 'db.setItem',
        },
        async (s) => {
          await sleep(400);
          store.set(key, value);
          s.setStatus({ code: SPAN_STATUS_OK });
        }
      );
    }, channelData);
  }

  return {
    getItem,
    setItem,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
