/**
 * Bare Node.js reproduction showing tracePromise context propagation issue
 *
 * This uses only Node.js built-ins (diagnostics_channel and async_hooks) to demonstrate
 * the issue without any third-party dependencies.
 *
 * Expected: The nested async operation should maintain the context from the start listener
 * Actual: The context may be lost when the tracePromise callback executes
 */

import { tracingChannel } from 'node:diagnostics_channel';
import { spanStorage, SimpleSpan, startSpan } from './span-impl.js';

// Create a tracing channel
const myChannel = tracingChannel('test.channel');

// Subscribe to channel events
myChannel.subscribe({
  start: (data) => {
    console.log('\n========================================');
    console.log('=== CHANNEL START EVENT ===');
    console.log(
      `Current context span: ${spanStorage.getStore()?.id || 'none'}`
    );

    const promise = new Promise((resolve) => {
      data.resolve = resolve;
    });

    // Create the "parent" span that should wrap everything
    startSpan('channel-span', (span) => {
      data.span = span;
      console.log(`Channel span created: ${span.id}`);
      console.log(`Context after span creation: ${spanStorage.getStore()?.id}`);

      // Return the promise to keep the span active
      return promise;
    });
  },
  asyncEnd: (data) => {
    console.log('\n=== CHANNEL ASYNC END EVENT ===');
    console.log(
      `Current context span: ${spanStorage.getStore()?.id || 'none'}`
    );
    if (data.span) {
      data.span.status = 'ok';
    }
    data.resolve?.();
  },
  error: (data) => {
    console.log('\n=== CHANNEL ERROR EVENT ===');
    if (data.span) {
      data.span.status = 'error';
    }
    data.resolve?.();
  },
  end: () => {},
  asyncStart: () => {
    console.log('\n=== CHANNEL ASYNC START EVENT ===');
    console.log(
      `Current context span: ${spanStorage.getStore()?.id || 'none'}`
    );
  },
});

// Simulate a storage operation
async function simulateStorageOperation(key) {
  console.log('\n========================================');
  console.log(`STARTING OPERATION FOR KEY: ${key}`);
  console.log('========================================');

  const channelData = { key };

  return myChannel.tracePromise(async () => {
    console.log('\n=== INSIDE TRACE PROMISE CALLBACK ===');
    const currentSpan = spanStorage.getStore();
    console.log(
      `Active span in tracePromise callback: ${
        currentSpan?.id || 'NONE - CONTEXT LOST!'
      }`
    );

    // This span should be a child of the channel-span
    // If context is lost, currentSpan will be null/undefined
    return startSpan('inner-operation', async (innerSpan) => {
      console.log(`Inner span ID: ${innerSpan.id}`);
      console.log(
        `Inner span parent ID: ${
          innerSpan.parentId || 'none - SHOULD BE channel-span ID!'
        }`
      );

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Even more nested operation
      return startSpan('deeply-nested-operation', async (deepSpan) => {
        console.log(`Deep span ID: ${deepSpan.id}`);
        console.log(`Deep span parent ID: ${deepSpan.parentId || 'none'}`);

        await new Promise((resolve) => setTimeout(resolve, 50));

        return `Result for ${key}`;
      });
    });
  }, channelData);
}

// Run the test
async function main() {
  try {
    console.log('Starting test...\n');

    const result = await simulateStorageOperation('test-key-1');

    console.log('\n========================================');
    console.log('OPERATION COMPLETED:', result);
    console.log('========================================\n');

    console.log('\n--- EXPECTED SPAN HIERARCHY ---');
    console.log('channel-span (ID: 1, parent: none)');
    console.log('  └─ inner-operation (ID: 2, parent: 1)');
    console.log('     └─ deeply-nested-operation (ID: 3, parent: 2)');

    console.log('\n--- WHAT TO LOOK FOR ---');
    console.log(
      '1. Check if "inner-operation" has parentId = 1 (channel-span)'
    );
    console.log('2. Check if context is lost (shows "NONE - CONTEXT LOST!")');
    console.log('3. If parentId is null/none, the bug is confirmed\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
