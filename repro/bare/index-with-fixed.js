/**
 * Testing our FIXED tracingChannel implementation
 *
 * This mirrors index.js but uses our fixed implementation that properly
 * propagates AsyncLocalStorage context through tracePromise
 */

import { tracingChannelFixed } from './tracingChannelFixed.js';
import { spanStorage, SimpleSpan, startSpan } from './span-impl.js';

// Create a FIXED tracing channel
const myChannel = tracingChannelFixed('test.channel');

// Bind the AsyncLocalStorage to enable automatic context propagation
myChannel.bindStore(spanStorage);

console.log('========================================');
console.log('Using FIXED tracingChannel implementation');
console.log('AsyncLocalStorage bound to channel');
console.log('========================================\n');

// Subscribe to channel events
myChannel.subscribe({
  start: (data) => {
    console.log('\n========================================');
    console.log('=== CHANNEL START EVENT ===');
    console.log(
      `Current context span: ${spanStorage.getStore()?.id || 'none'}`
    );

    // Create a span
    const span = new SimpleSpan('channel-span');
    data.span = span;

    // 🔥 KEY: Use enterWith() instead of run() to set context that persists
    // This makes the context available outside this callback
    spanStorage.enterWith(span);

    console.log(`Channel span created: ${span.id}`);
    console.log(`Context after span creation: ${spanStorage.getStore()?.id}`);

    // Create promise for resolving later
    data.promise = new Promise((resolve) => {
      data.resolve = resolve;
    });
  },
  asyncEnd: (data) => {
    console.log('\n=== CHANNEL ASYNC END EVENT ===');
    console.log(
      `Current context span: ${spanStorage.getStore()?.id || 'none'}`
    );
    if (data.span) {
      data.span.status = 'ok';
      data.span.end();
    }
    // Clear the context
    spanStorage.enterWith(undefined);
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

    if (currentSpan?.id) {
      console.log(
        '🎉 SUCCESS: Context is preserved with fixed implementation!'
      );
    } else {
      console.log('❌ FAILED: Context still lost');
    }

    // This span should be a child of the channel-span
    return startSpan('inner-operation', async (innerSpan) => {
      console.log(`Inner span ID: ${innerSpan.id}`);
      console.log(`Inner span parent ID: ${innerSpan.parentId || 'none'}`);

      if (innerSpan.parentId === 1) {
        console.log('✅ CORRECT: Inner span has channel-span as parent!');
      } else {
        console.log('❌ WRONG: Inner span parent should be 1');
      }

      // Simulate some async work
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Even more nested operation
      return startSpan('deeply-nested-operation', async (deepSpan) => {
        console.log(`Deep span ID: ${deepSpan.id}`);
        console.log(`Deep span parent ID: ${deepSpan.parentId || 'none'}`);

        if (deepSpan.parentId === 2) {
          console.log('✅ CORRECT: Deep span has inner-operation as parent!');
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        return `Result for ${key}`;
      });
    });
  }, channelData);
}

// Run the test
async function main() {
  try {
    console.log('Starting test with FIXED implementation...\n');

    const result = await simulateStorageOperation('test-key-1');

    console.log('\n========================================');
    console.log('OPERATION COMPLETED:', result);
    console.log('========================================\n');

    console.log('\n--- EXPECTED SPAN HIERARCHY ---');
    console.log('channel-span (ID: 1, parent: none)');
    console.log('  └─ inner-operation (ID: 2, parent: 1)');
    console.log('     └─ deeply-nested-operation (ID: 3, parent: 2)');

    console.log('\n--- VERIFICATION ---');
    console.log('Look for these success indicators:');
    console.log('  🎉 SUCCESS: Context is preserved');
    console.log('  ✅ CORRECT: Inner span has channel-span as parent!');
    console.log('  ✅ CORRECT: Deep span has inner-operation as parent!');
    console.log('\nIf you see all three, the fix WORKS! 🎊\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
