/**
 * Minimal OpenTelemetry reproduction showing tracePromise context propagation issue
 * 
 * Expected: The "inner-operation" span should be a child of the "channel-span"
 * Actual: The "inner-operation" span appears as a sibling or unrelated span
 */

import { tracingChannel } from 'node:diagnostics_channel';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { SimpleSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';

// Setup OpenTelemetry
const provider = new NodeTracerProvider();
provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
provider.register();

const tracer = trace.getTracer('test-tracer');

// Create a tracing channel
const myChannel = tracingChannel('test.channel');

// Subscribe to channel events
myChannel.subscribe({
  start: (data) => {
    console.log('\n=== START EVENT ===');
    console.log('Active context before span creation:', context.active());
    
    const promise = new Promise((resolve) => {
      data.resolve = resolve;
    });

    // Start a span in the start listener
    const span = tracer.startSpan('channel-span', {
      attributes: { phase: 'start', key: data.key }
    });
    
    // Store the span in the data
    data.span = span;
    
    // Make the span active
    const ctx = trace.setSpan(context.active(), span);
    console.log('Context with span:', ctx);
    console.log('Active span from context:', trace.getSpan(ctx)?.spanContext().spanId);
    
    // Run the promise continuation in the span context
    context.with(ctx, async () => {
      await promise;
      console.log('Promise resolved in context');
    });
  },
  asyncEnd: (data) => {
    console.log('\n=== ASYNC END EVENT ===');
    if (data.span) {
      data.span.setStatus({ code: SpanStatusCode.OK });
      data.span.end();
    }
    data.resolve?.();
  },
  error: (data) => {
    console.log('\n=== ERROR EVENT ===');
    if (data.span) {
      data.span.setStatus({ code: SpanStatusCode.ERROR });
      data.span.end();
    }
    data.resolve?.();
  },
  end: () => {},
  asyncStart: () => {}
});

// Simulate a storage operation
async function simulateStorageOperation(key) {
  console.log('\n======================================');
  console.log(`Starting operation for key: ${key}`);
  console.log('======================================');
  
  const channelData = { key };
  
  return myChannel.tracePromise(async () => {
    console.log('\n=== INSIDE TRACE PROMISE CALLBACK ===');
    console.log('Active context:', context.active());
    const activeSpan = trace.getActiveSpan();
    console.log('Active span:', activeSpan?.spanContext().spanId);
    
    // This span should be a child of the channel-span, but it might not be
    return tracer.startActiveSpan('inner-operation', async (innerSpan) => {
      console.log('\n=== INNER SPAN STARTED ===');
      console.log('Inner span ID:', innerSpan.spanContext().spanId);
      const parentSpanId = trace.getSpan(context.active())?.spanContext().spanId;
      console.log('Parent span ID from context:', parentSpanId);
      
      // Simulate some async work
      await new Promise(resolve => setTimeout(resolve, 100));
      
      innerSpan.setStatus({ code: SpanStatusCode.OK });
      innerSpan.end();
      
      return `Result for ${key}`;
    });
  }, channelData);
}

// Run the test
async function main() {
  try {
    const result = await simulateStorageOperation('test-key-1');
    console.log('\n======================================');
    console.log('Operation completed:', result);
    console.log('======================================\n');
    
    // Give spans time to flush
    await new Promise(resolve => setTimeout(resolve, 500));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await provider.shutdown();
  }
}

main();

