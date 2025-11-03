/**
 * Fixed implementation of tracingChannel that properly propagates AsyncLocalStorage context
 * 
 * This implementation fixes the bug where context is lost between the start event
 * and the tracePromise callback by using runStores() to propagate context.
 */

import { channel } from 'node:diagnostics_channel';
import { AsyncLocalStorage } from 'node:async_hooks';

export class TracingChannelFixed {
  constructor(name) {
    this.name = name;
    
    // Create the underlying channels
    this.start = channel(`${name}.start`);
    this.end = channel(`${name}.end`);
    this.asyncStart = channel(`${name}.asyncStart`);
    this.asyncEnd = channel(`${name}.asyncEnd`);
    this.error = channel(`${name}.error`);
    
    // Store bound AsyncLocalStorage instances
    this._boundStores = new Set();
  }
  
  /**
   * Bind an AsyncLocalStorage to this tracing channel
   * This allows automatic context propagation
   */
  bindStore(storage) {
    if (!(storage instanceof AsyncLocalStorage)) {
      throw new TypeError('storage must be an AsyncLocalStorage instance');
    }
    
    this._boundStores.add(storage);
    
    // Also bind to the underlying channels so runStores works
    this.start.bindStore(storage);
    this.asyncStart.bindStore(storage);
    this.asyncEnd.bindStore(storage);
    this.end.bindStore(storage);
    this.error.bindStore(storage);
  }
  
  /**
   * Unbind an AsyncLocalStorage from this tracing channel
   */
  unbindStore(storage) {
    this._boundStores.delete(storage);
    
    this.start.unbindStore(storage);
    this.asyncStart.unbindStore(storage);
    this.asyncEnd.unbindStore(storage);
    this.end.unbindStore(storage);
    this.error.unbindStore(storage);
  }
  
  /**
   * Subscribe to tracing channel events
   */
  subscribe(subscribers) {
    if (subscribers.start) {
      this.start.subscribe(subscribers.start);
    }
    if (subscribers.end) {
      this.end.subscribe(subscribers.end);
    }
    if (subscribers.asyncStart) {
      this.asyncStart.subscribe(subscribers.asyncStart);
    }
    if (subscribers.asyncEnd) {
      this.asyncEnd.subscribe(subscribers.asyncEnd);
    }
    if (subscribers.error) {
      this.error.subscribe(subscribers.error);
    }
  }
  
  /**
   * Unsubscribe from tracing channel events
   */
  unsubscribe(subscribers) {
    if (subscribers.start) {
      this.start.unsubscribe(subscribers.start);
    }
    if (subscribers.end) {
      this.end.unsubscribe(subscribers.end);
    }
    if (subscribers.asyncStart) {
      this.asyncStart.unsubscribe(subscribers.asyncStart);
    }
    if (subscribers.asyncEnd) {
      this.asyncEnd.unsubscribe(subscribers.asyncEnd);
    }
    if (subscribers.error) {
      this.error.unsubscribe(subscribers.error);
    }
  }
  
  /**
   * Check if any channel has subscribers
   */
  hasSubscribers() {
    return this.start.hasSubscribers ||
           this.end.hasSubscribers ||
           this.asyncStart.hasSubscribers ||
           this.asyncEnd.hasSubscribers ||
           this.error.hasSubscribers;
  }
  
  /**
   * FIXED: tracePromise that properly propagates context
   * 
   * Key fix: After start event, we capture context and restore it when running callback
   */
  async tracePromise(callback, ...args) {
    if (!this.hasSubscribers()) {
      return await callback(...args);
    }
    
    // Create the context object
    const context = args[0] || {};
    
    // Publish start event
    if (this.start.hasSubscribers) {
      this.start.publish(context);
    }
    
    // 🔥 KEY FIX: Capture the context from all bound stores AFTER start event
    // Store both the storage instance and its current value
    const capturedContexts = [];
    for (const storage of this._boundStores) {
      const value = storage.getStore();
      if (value !== undefined) {
        capturedContexts.push({ storage, value });
      }
    }
    
    // Publish asyncStart event
    if (this.asyncStart.hasSubscribers) {
      this.asyncStart.publish(context);
    }
    
    try {
      // 🔥 KEY FIX: Execute callback with restored context
      let result;
      
      if (capturedContexts.length > 0) {
        // Recursively nest storage.run() calls to restore all contexts
        const runWithContexts = async (index) => {
          if (index >= capturedContexts.length) {
            // All contexts restored, run the actual callback
            return await callback(...args);
          }
          
          const { storage, value } = capturedContexts[index];
          return await storage.run(value, async () => {
            return await runWithContexts(index + 1);
          });
        };
        
        result = await runWithContexts(0);
      } else {
        // No context to restore
        result = await callback(...args);
      }
      
      // Publish asyncEnd event
      if (this.asyncEnd.hasSubscribers) {
        this.asyncEnd.publish(context);
      }
      
      // Publish end event
      if (this.end.hasSubscribers) {
        this.end.publish(context);
      }
      
      return result;
    } catch (error) {
      // Publish error event
      if (this.error.hasSubscribers) {
        this.error.publish({ ...context, error });
      }
      
      // Publish end event even on error
      if (this.end.hasSubscribers) {
        this.end.publish(context);
      }
      
      throw error;
    }
  }
  
  /**
   * Helper to run a function with multiple AsyncLocalStorage contexts restored
   */
  async _runWithContexts(contextsMap, callback) {
    // Convert Map to Array for easier iteration
    const entries = Array.from(contextsMap.entries());
    
    if (entries.length === 0) {
      return await callback();
    }
    
    // Recursively nest AsyncLocalStorage.run() calls
    const runNested = async (index) => {
      if (index >= entries.length) {
        return await callback();
      }
      
      const [storage, context] = entries[index];
      return await storage.run(context, async () => {
        return await runNested(index + 1);
      });
    };
    
    return await runNested(0);
  }
  
  /**
   * Synchronous version of trace (for completeness)
   */
  traceSync(callback, ...args) {
    if (!this.hasSubscribers()) {
      return callback(...args);
    }
    
    const context = args[0] || {};
    
    // Publish start event
    if (this.start.hasSubscribers) {
      this.start.publish(context);
    }
    
    try {
      const result = callback(...args);
      
      // Publish end event
      if (this.end.hasSubscribers) {
        this.end.publish(context);
      }
      
      return result;
    } catch (error) {
      // Publish error event
      if (this.error.hasSubscribers) {
        this.error.publish({ ...context, error });
      }
      
      // Publish end event even on error
      if (this.end.hasSubscribers) {
        this.end.publish(context);
      }
      
      throw error;
    }
  }
  
  /**
   * Callback version of trace (for completeness)
   */
  traceCallback(callback, position = -1, ...args) {
    if (!this.hasSubscribers()) {
      return callback;
    }
    
    return (...callbackArgs) => {
      const context = args[0] || {};
      
      // Publish start event
      if (this.start.hasSubscribers) {
        this.start.publish(context);
      }
      
      // Publish asyncStart event
      if (this.asyncStart.hasSubscribers) {
        this.asyncStart.publish(context);
      }
      
      try {
        const result = callback(...callbackArgs);
        
        // Publish asyncEnd event
        if (this.asyncEnd.hasSubscribers) {
          this.asyncEnd.publish(context);
        }
        
        // Publish end event
        if (this.end.hasSubscribers) {
          this.end.publish(context);
        }
        
        return result;
      } catch (error) {
        // Publish error event
        if (this.error.hasSubscribers) {
          this.error.publish({ ...context, error });
        }
        
        // Publish end event even on error
        if (this.end.hasSubscribers) {
          this.end.publish(context);
        }
        
        throw error;
      }
    };
  }
}

/**
 * Factory function to create a fixed tracing channel
 */
export function tracingChannelFixed(name) {
  return new TracingChannelFixed(name);
}

