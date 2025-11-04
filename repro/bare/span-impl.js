/**
 * Simple span implementation for testing
 * Mimics basic tracing span functionality
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// Shared span storage for all reproduction files
export const spanStorage = new AsyncLocalStorage();

let spanIdCounter = 0;

export class SimpleSpan {
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
    console.log(
      JSON.stringify(
        {
          spanId: this.id,
          parentId: this.parentId,
          name: this.name,
          duration: this.endTime - this.startTime,
          status: this.status,
        },
        null,
        2
      )
    );
  }
}

/**
 * Helper to start a span with automatic parent tracking
 */
export function startSpan(name, callback) {
  const currentSpan = spanStorage.getStore();
  const parentId = currentSpan?.id || null;

  console.log(
    `\n--- Starting span: "${name}" (parent: ${parentId || 'none'}) ---`
  );

  const span = new SimpleSpan(name, parentId);

  return spanStorage.run(span, () => {
    console.log(`Active span in context: ${spanStorage.getStore()?.id}`);
    const result = callback(span); // Pass span to callback

    // Handle async callbacks
    if (result && typeof result.then === 'function') {
      return result
        .then((value) => {
          span.status = 'ok';
          span.end();
          return value;
        })
        .catch((error) => {
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
