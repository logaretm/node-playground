# Bare Node.js Reproduction

This is a minimal reproduction using **only Node.js built-in modules** (no dependencies).

## What This Tests

This reproduction uses `AsyncLocalStorage` from `async_hooks` to manually track span context, demonstrating whether Node.js's `tracingChannel.tracePromise()` properly propagates async context from the `start` listener to the promise callback.

## How to Run

```bash
node index.js
```

No dependencies needed!

## What to Look For

The output will show:

1. **Context in start event** - Shows the span created in the `start` listener
2. **Context in tracePromise callback** - Should show the SAME span, but might show "CONTEXT LOST!"
3. **Parent-child relationships** - Inner spans should reference the channel span as their parent

### Signs of the Bug

If you see:
- ❌ `Active span in tracePromise callback: NONE - CONTEXT LOST!`
- ❌ `Inner span parent ID: none - SHOULD BE channel-span ID!`
- ❌ Parent ID showing `null` instead of `1`

Then the bug is confirmed.

### Expected Behavior

If working correctly:
- ✅ `Active span in tracePromise callback: 1`
- ✅ `Inner span parent ID: 1`
- ✅ Proper span hierarchy as shown at the end

## Code Structure

```javascript
// 1. Create AsyncLocalStorage for tracking context
const spanStorage = new AsyncLocalStorage();

// 2. Subscribe to channel events
channel.subscribe({
  start: (data) => {
    // Create span and store in AsyncLocalStorage
    spanStorage.run(span, () => { ... });
  }
});

// 3. Use tracePromise
channel.tracePromise(async () => {
  // Check if context is still available
  const currentSpan = spanStorage.getStore(); // Should not be null!
}, channelData);
```

## Why This Matters

This is the most fundamental test. If this shows context loss, it's a Node.js core issue with `diagnostics_channel` and/or `async_hooks` integration.

