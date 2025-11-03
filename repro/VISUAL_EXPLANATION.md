# Visual Explanation of the Bug

## The Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  1. Application calls channel.tracePromise()                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Node.js emits START event                               │
│                                                              │
│  channel.subscribe({                                        │
│    start: (data) => {                                       │
│      // Create span and set in AsyncLocalStorage           │
│      asyncLocalStorage.run({ spanId: 1 }, () => {          │
│        console.log('Context active: spanId=1');  ✅         │
│        data.resolve = createPromiseResolver();              │
│      });                                                    │
│    }                                                        │
│  });                                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Node.js executes tracePromise callback                  │
│                                                              │
│  channel.tracePromise(async () => {                         │
│    // ❌ BUG: Context is LOST here!                         │
│    console.log(asyncLocalStorage.getStore()); // undefined │
│                                                              │
│    // Any spans created here are orphaned                  │
│    createSpan('child-span'); // parent: undefined ❌        │
│                                                              │
│    return result;                                           │
│  }, channelData);                                           │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Node.js emits ASYNC_END event                           │
│                                                              │
│  asyncEnd: (data) => {                                      │
│    console.log(asyncLocalStorage.getStore()); // undefined │
│    data.resolve();                                          │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

## Expected vs Actual Context Propagation

### ✅ Expected Behavior

```
AsyncLocalStorage Context Timeline:

START event │───────────────────────────────────────────────────│
            │ Context: { spanId: 1 }                           │
            │                                                   │
            └─────┬─────────────────────────────────────────────┘
                  │
                  │ Context SHOULD propagate here
                  │
                  ▼
Callback    │───────────────────────────────────────────────────│
            │ Context: { spanId: 1 }  ✅ PRESERVED             │
            │                                                   │
            │ createSpan('child')                               │
            │   └─ parent: spanId 1  ✅                         │
            └───────────────────────────────────────────────────┘

Result: Proper span hierarchy
  span-1 (parent)
    └─ child-span
```

### ❌ Actual Behavior (Bug)

```
AsyncLocalStorage Context Timeline:

START event │───────────────────────────────────────────────────│
            │ Context: { spanId: 1 }                           │
            │                                                   │
            └─────┐                                             │
                  │                                             │
                  │ Context is LOST here! ❌                    │
                  │                                             │
                  ▼                                             │
Callback    │───────────────────────────────────────────────────│
            │ Context: undefined  ❌ LOST!                      │
            │                                                   │
            │ createSpan('child')                               │
            │   └─ parent: undefined  ❌ ORPHANED              │
            └───────────────────────────────────────────────────┘

Result: Broken span hierarchy
  span-1 (isolated)
  child-span (orphaned, no parent)
```

## Code Comparison

### What Developers Write

```javascript
const channel = tracingChannel('my.channel');

channel.subscribe({
  start: (data) => {
    // Start a span and make it active
    const span = startSpan('parent-span');
    makeSpanActive(span); // Sets in AsyncLocalStorage
    
    // Store resolver for later
    const promise = new Promise(resolve => {
      data.resolve = resolve;
    });
    
    // Keep span active during promise
    return promise;
  },
  asyncEnd: (data) => {
    data.resolve();
  }
});

// Use the channel
await channel.tracePromise(async () => {
  // Expected: parent-span is active here
  // Actual: NO span is active (context lost)
  
  const childSpan = startSpan('child-span');
  // Expected: childSpan.parent = parent-span
  // Actual: childSpan.parent = undefined
  
  await doWork();
  return result;
}, {});
```

### What Should Happen Internally (Pseudo-code)

```javascript
// This is what tracePromise SHOULD be doing internally:

async function tracePromise(callback, channelData) {
  // 1. Capture the current AsyncLocalStorage context
  const currentContext = asyncLocalStorage.getStore();
  
  // 2. Emit start event (may modify context)
  this.start.publish(channelData);
  
  // 3. Capture the context AFTER start event
  const startContext = asyncLocalStorage.getStore();
  
  try {
    // 4. Run callback WITH the context from start event
    const result = await asyncLocalStorage.run(startContext, async () => {
      return await callback();  // ✅ Context available here
    });
    
    // 5. Emit asyncEnd
    this.asyncEnd.publish(channelData);
    
    return result;
  } catch (error) {
    // 6. Emit error
    this.error.publish({ ...channelData, error });
    throw error;
  }
}
```

### What's Happening Instead

```javascript
// This is what appears to be happening:

async function tracePromise(callback, channelData) {
  // 1. Emit start event (context set here)
  this.start.publish(channelData);
  
  try {
    // 2. Run callback WITHOUT preserving context
    const result = await callback();  // ❌ Context lost!
    
    // 3. Emit asyncEnd
    this.asyncEnd.publish(channelData);
    
    return result;
  } catch (error) {
    this.error.publish({ ...channelData, error });
    throw error;
  }
}
```

## Real-World Example

### Distributed Tracing Scenario

```javascript
// Express/Fastify endpoint
app.get('/user/:id', async (req, res) => {
  // Incoming request creates root span
  return withRequestSpan('GET /user/:id', async () => {
    
    // Database operation with tracing channel
    const user = await channel.tracePromise(async () => {
      
      // Expected trace:
      // GET /user/:id
      //   └─ db.query         ← Should be child
      //      └─ db.connect    ← Should be grandchild
      
      // Actual trace (bug):
      // GET /user/:id
      // db.query              ← ORPHANED!
      //   └─ db.connect       ← Only this parent-child works
      
      return startSpan('db.query', async () => {
        return startSpan('db.connect', async () => {
          return db.findUser(req.params.id);
        });
      });
    }, { op: 'getUser' });
    
    return { user };
  });
});
```

### Visual Impact

```
✅ Expected Trace View:
GET /user/:id [200ms]
  └─ db.query [150ms]
     └─ db.connect [100ms]

❌ Actual Trace View (Bug):
GET /user/:id [200ms]
db.query [150ms]          ← Shows as separate trace!
  └─ db.connect [100ms]
```

## Why This Matters

1. **Lost context = broken traces**
   - Can't see which operations belong to which request
   - Performance bottlenecks are hidden
   - Error tracking is incomplete

2. **Defeats the purpose of instrumentation**
   - `tracePromise` is meant to simplify tracing
   - But it breaks the most important feature: parent-child relationships

3. **Affects production systems**
   - OpenTelemetry is industry standard
   - Sentry uses OTel under the hood
   - Many APM tools rely on this

## Test It Yourself

```bash
cd bare
node index.js
```

Look for these lines:

```
Context after span creation: 1                           ← ✅ Active in start
Active span in tracePromise callback: NONE - CONTEXT LOST!  ← ❌ Lost in callback
Inner span parent ID: none - SHOULD BE channel-span ID!  ← ❌ No parent
```

If you see "CONTEXT LOST", the bug is present in your Node.js version.

