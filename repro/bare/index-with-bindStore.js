/**
 * Testing if tracingChannel.bindStore() fixes the context propagation issue
 * 
 * According to Node.js docs, tracingChannel.bindStore() binds an AsyncLocalStorage
 * to the channel, making it manage context propagation automatically.
 */

import { tracingChannel } from 'node:diagnostics_channel';
import { AsyncLocalStorage } from 'node:async_hooks';

// Create an AsyncLocalStorage to track our "span" context manually
const spanStorage = new AsyncLocalStorage();

let spanIdCounter = 0;

class SimpleSpan {
  constructor(name, parentId = null) {
    this.id = ++spanIdCounter;
    this.name = name;
    this.parentId = parentId;
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'pending';
  }

  end() {
    this.endTime = Date.now();
    console.log(JSON.stringify({
      spanId: this.id,
      parentId: this.parentId,
      name: this.name,
      duration: this.endTime - this.startTime,
      status: this.status
    }, null, 2));
  }
}

// Helper to start a span
function startSpan(name, callback) {
  const currentSpan = spanStorage.getStore();
  const parentId = currentSpan?.id || null;
  
  console.log(`\n--- Starting span: "${name}" (parent: ${parentId || 'none'}) ---`);
  
  const span = new SimpleSpan(name, parentId);
  
  return spanStorage.run(span, () => {
    console.log(`Active span in context: ${spanStorage.getStore()?.id}`);
    const result = callback(span);
    
    // Handle async callbacks
    if (result && typeof result.then === 'function') {
      return result.then((value) => {
        span.status = 'ok';
        span.end();
        return value;
      }).catch((error) => {
        span.status = 'error';
        span.end();
        throw error;
      });
    }
    
    span.status = 'ok';
    span.end();
    return result;
  });
}

// Create a tracing channel
const myChannel = tracingChannel('test.channel');

// 🔥 KEY FIX: Bind the AsyncLocalStorage to the underlying channels
// A tracingChannel is composed of multiple regular channels (start, end, asyncStart, asyncEnd, error)
// We need to bind the store to each of them
console.log('Attempting to bind AsyncLocalStorage to tracing channel...');
try {
  // Try to access the underlying channels and bind the store
  // The tracingChannel has properties for each event channel
  if (myChannel.start && myChannel.start.bindStore) {
    myChannel.start.bindStore(spanStorage);
    console.log('✅ Bound to start channel');
  }
  if (myChannel.asyncStart && myChannel.asyncStart.bindStore) {
    myChannel.asyncStart.bindStore(spanStorage);
    console.log('✅ Bound to asyncStart channel');
  }
  if (myChannel.asyncEnd && myChannel.asyncEnd.bindStore) {
    myChannel.asyncEnd.bindStore(spanStorage);
    console.log('✅ Bound to asyncEnd channel');
  }
  if (myChannel.end && myChannel.end.bindStore) {
    myChannel.end.bindStore(spanStorage);
    console.log('✅ Bound to end channel');
  }
  if (myChannel.error && myChannel.error.bindStore) {
    myChannel.error.bindStore(spanStorage);
    console.log('✅ Bound to error channel');
  }
  console.log('   This should propagate context automatically!\n');
} catch (err) {
  console.log('❌ Could not bind store:', err.message);
  console.log('   Channels available:', Object.keys(myChannel));
}

// Subscribe to channel events
myChannel.subscribe({
  start: (data) => {
    console.log('\n========================================');
    console.log('=== CHANNEL START EVENT ===');
    console.log(`Current context span: ${spanStorage.getStore()?.id || 'none'}`);
    
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
    console.log(`Current context span: ${spanStorage.getStore()?.id || 'none'}`);
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
    console.log(`Current context span: ${spanStorage.getStore()?.id || 'none'}`);
  }
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
    console.log(`Active span in tracePromise callback: ${currentSpan?.id || 'NONE - CONTEXT LOST!'}`);
    
    if (currentSpan?.id) {
      console.log('✅ SUCCESS: Context is preserved with bindStore()!');
    } else {
      console.log('❌ FAILED: Context still lost even with bindStore()');
    }
    
    // This span should be a child of the channel-span
    // If context is lost, currentSpan will be null/undefined
    return startSpan('inner-operation', async (innerSpan) => {
      console.log(`Inner span ID: ${innerSpan.id}`);
      console.log(`Inner span parent ID: ${innerSpan.parentId || 'none - SHOULD BE channel-span ID!'}`);
      
      // Simulate some async work
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Even more nested operation
      return startSpan('deeply-nested-operation', async (deepSpan) => {
        console.log(`Deep span ID: ${deepSpan.id}`);
        console.log(`Deep span parent ID: ${deepSpan.parentId || 'none'}`);
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        return `Result for ${key}`;
      });
    });
  }, channelData);
}

// Run the test
async function main() {
  try {
    console.log('========================================');
    console.log('Testing tracePromise with bindStore()');
    console.log('========================================\n');
    
    const result = await simulateStorageOperation('test-key-1');
    
    console.log('\n========================================');
    console.log('OPERATION COMPLETED:', result);
    console.log('========================================\n');
    
    console.log('\n--- EXPECTED SPAN HIERARCHY ---');
    console.log('channel-span (ID: 1, parent: none)');
    console.log('  └─ inner-operation (ID: 2, parent: 1)');
    console.log('     └─ deeply-nested-operation (ID: 3, parent: 2)');
    
    console.log('\n--- WHAT TO LOOK FOR ---');
    console.log('1. Check if "inner-operation" has parentId = 1 (channel-span)');
    console.log('2. Check if "✅ SUCCESS" message appears');
    console.log('3. If parentId is 1, bindStore() FIXED the bug!');
    console.log('4. If parentId is null/none, bindStore() DID NOT fix it\n');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

main();

