# OpenTelemetry Reproduction

This reproduction uses the official OpenTelemetry SDK to test context propagation with `tracingChannel.tracePromise()`.

## What This Tests

This uses OpenTelemetry's context manager (which likely uses `AsyncLocalStorage` under the hood) to verify if the issue affects real-world tracing libraries.

## How to Run

```bash
npm install
node index.js
```

## What to Look For

The output includes:

1. **Detailed context information** - Shows OpenTelemetry's context objects
2. **Span IDs and parent relationships** - Logged at each step
3. **Console span export** - Shows the actual span data that would be exported

### Signs of the Bug

If you see:
- ❌ `Active span: undefined` inside the tracePromise callback
- ❌ `Parent span ID from context: undefined`
- ❌ Inner span not showing the channel-span as its parent in the export

### Expected Behavior

If working correctly:
- ✅ Active span available inside tracePromise callback
- ✅ Inner span correctly nested under channel-span
- ✅ Span export shows proper parent-child relationship

## Code Structure

```javascript
// 1. Setup OpenTelemetry provider and tracer
const provider = new NodeTracerProvider();
const tracer = trace.getTracer('test-tracer');

// 2. Subscribe to channel events
channel.subscribe({
  start: (data) => {
    const span = tracer.startSpan('channel-span');
    const ctx = trace.setSpan(context.active(), span);
    context.with(ctx, async () => { ... });
  }
});

// 3. Use tracePromise
channel.tracePromise(async () => {
  // Check if OTel context is available
  const activeSpan = trace.getActiveSpan(); // Should not be undefined!
  
  tracer.startActiveSpan('inner-operation', (innerSpan) => {
    // Should be child of channel-span
  });
}, channelData);
```

## Why This Matters

This shows whether the issue affects popular tracing libraries. If OTel is affected, many Node.js applications using distributed tracing will experience broken span hierarchies.

## Dependencies

- `@opentelemetry/api` - The OTel API
- `@opentelemetry/sdk-trace-node` - Node.js-specific tracer implementation
- `@opentelemetry/sdk-trace-base` - Core tracing functionality

All use AsyncLocalStorage for context propagation, so this is testing the same underlying mechanism as the bare reproduction but through a real-world API.

