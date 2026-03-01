# Svelte Proxy-Based Reactivity Design

## Overview

This document describes a unified Proxy-based approach for the `observator-svelte` adapter that provides transparent granular reactivity without requiring explicit keyed accessor APIs.

## Goals

1. **Transparent API**: Users access state naturally (`store.users.alice`) without special methods
2. **Automatic Granularity**: Keyed subscriptions happen automatically for Record/Array fields
3. **Performance**: Minimal overhead from Proxy usage
4. **Backward Compatibility**: Existing `store.keyed` API continues to work (deprecated)
5. **Type Safety**: Full TypeScript support maintained

## Current Implementation Analysis

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ReactiveStore                              │
├─────────────────────────────────────────────────────────────────┤
│  Field Getters (defineProperty)                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  store.count  →  fieldSubscriber.count()                 │   │
│  │                  return observableStore.get('count')     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Keyed Accessors (explicit API)                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  store.keyed.users('alice')  →  keyedSubscriber()        │   │
│  │                                  return users['alice']   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Current Limitations

1. **Field-level is too coarse**: `store.user.name` triggers update on ANY `user` change
2. **Keyed API is verbose**: `store.keyed.users('alice')` instead of `store.users.alice`
3. **Inconsistent granularity**: Different syntax for different granularity levels

## Proposed Architecture

### Unified Proxy Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                      ReactiveStore v2                           │
├─────────────────────────────────────────────────────────────────┤
│  Field Getters (defineProperty)                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  store.count (primitive)                                  │   │
│  │    → fieldSubscriber('count')()                          │   │
│  │    → return value directly                               │   │
│  │                                                          │   │
│  │  store.users (object/array)                              │   │
│  │    → return FieldProxy(users)                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  FieldProxy (automatic keyed subscription)                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  proxy.alice  →  keyedSubscriber('users', 'alice')()     │   │
│  │               →  return PropertyProxy(users.alice)       │   │
│  │                                                          │   │
│  │  proxy[0]     →  keyedSubscriber('items', 0)()           │   │
│  │               →  return PropertyProxy(items[0])          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  PropertyProxy (path-filtered subscription)                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  proxy.name   →  pathSubscriber('users.alice.name')()    │   │
│  │               →  return value                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Subscription Hierarchy

| Access Pattern | Subscription Level | Implementation |
|---------------|-------------------|----------------|
| `store.count` | Field | `on('count:updated')` |
| `store.user` | Returns FieldProxy | No subscription yet |
| `store.user.name` | Keyed | `onKeyed('user:updated', 'name')` |
| `store.user.address` | Keyed | `onKeyed('user:updated', 'address')` |
| `store.user.address.city` | Keyed (2nd level) | `onKeyed('user:updated', 'address')` - triggers on any `address.*` change |
| `store.users` | Returns FieldProxy | No subscription yet |
| `store.users.alice` | Keyed | `onKeyed('users:updated', 'alice')` |
| `store.users.alice.name` | Keyed (2nd level) | `onKeyed('users:updated', 'alice')` - triggers on any `alice.*` change |
| `store.items[0]` | Keyed | `onKeyed('items:updated', 0)` |

**Note:** The Proxy-based approach provides automatic keyed subscriptions at the second level (field → key). Accessing properties deeper than the second level (e.g., `store.user.address.city`) will still use the second-level keyed subscription (`address`), meaning changes to any property within `address` will trigger the subscription. This is a deliberate trade-off: 2-level granularity covers most use cases while keeping implementation simple and performant.

## Detailed Design

### 1. Proxy Structure

#### FieldProxy

Wraps object/array field values. Intercepts property access to create keyed subscriptions.

```typescript
class FieldProxyHandler<T extends object> implements ProxyHandler<T> {
    constructor(
        private readonly field: string,
        private readonly store: ReactiveStore<any>
    ) {}
    
    get(target: T, prop: string | symbol, receiver: any): any {
        // Pass through symbols (iterators, etc.)
        if (typeof prop === 'symbol') {
            return Reflect.get(target, prop, receiver);
        }
        
        // Pass through built-in methods/properties
        if (this.isBuiltinProperty(prop)) {
            return Reflect.get(target, prop, receiver);
        }
        
        const value = Reflect.get(target, prop, receiver);
        
        // Always use keyed subscription for second-level access
        // This works for both:
        // - Records/Arrays: onKeyed('users:updated', 'alice')
        // - Plain objects: onKeyed('user:updated', 'name')
        this.store.ensureKeyedSubscription(this.field, prop);
        
        // If value is an object, wrap in PropertyProxy for deeper access
        // (PropertyProxy reuses the same keyed subscription)
        if (value !== null && typeof value === 'object') {
            return this.store.createPropertyProxy(this.field, prop, value);
        }
        
        return value;
    }
    
    private isBuiltinProperty(prop: string): boolean {
        return ['length', 'constructor', 'prototype'].includes(prop);
    }
}
```

#### PropertyProxy

Wraps nested object values (second level and beyond). Reuses parent subscription.

```typescript
class PropertyProxyHandler<T extends object> implements ProxyHandler<T> {
    constructor(
        private readonly field: string,
        private readonly parentKey: string | number,
        private readonly store: ReactiveStore<any>
    ) {}
    
    get(target: T, prop: string | symbol, receiver: any): any {
        if (typeof prop === 'symbol') {
            return Reflect.get(target, prop, receiver);
        }
        
        // Reuse parent's keyed subscription (no additional subscription needed)
        // The keyed subscription already covers all nested changes
        this.store.ensureKeyedSubscription(this.field, this.parentKey);
        
        return Reflect.get(target, prop, receiver);
    }
}
```

### 2. Subscription Management

```typescript
class ReactiveStore<T extends Record<string, unknown> & NonPrimitive> {
    // Cache for subscribers
    private readonly fieldSubscribers = new Map<string, () => void>();
    private readonly keyedSubscribers = new Map<string, () => void>();
    
    // Cache for proxies (prevents recreating on each access)
    private readonly fieldProxyCache = new Map<string, object>();
    private readonly propertyProxyCache = new Map<string, object>();
    
    /**
     * Field-level subscription for primitives.
     * Used when accessing store.count where count is a primitive.
     */
    ensureFieldSubscription(field: string): void {
        if (!this.fieldSubscribers.has(field)) {
            const subscriber = createSubscriber((update) => {
                return this.observableStore.on(`${field}:updated`, () => update());
            });
            this.fieldSubscribers.set(field, subscriber);
        }
        this.fieldSubscribers.get(field)!();
    }
    
    /**
     * Keyed subscription for second-level property access.
     * Used uniformly for both:
     * - Record/Array fields: store.users.alice -> onKeyed('users:updated', 'alice')
     * - Plain object fields: store.user.name -> onKeyed('user:updated', 'name')
     *
     * This leverages observator's existing keyed event system for consistency.
     */
    ensureKeyedSubscription(field: string, key: string | number): void {
        const cacheKey = `${field}:${key}`;
        if (!this.keyedSubscribers.has(cacheKey)) {
            const subscriber = createSubscriber((update) => {
                return this.observableStore.onKeyed(
                    `${field}:updated` as any,
                    key as Key,
                    () => update()
                );
            });
            this.keyedSubscribers.set(cacheKey, subscriber);
        }
        this.keyedSubscribers.get(cacheKey)!();
    }
}
```

**Why use `onKeyed` uniformly?**

Using `onKeyed` for all second-level access (both plain objects and Records/Arrays) provides:
1. **Consistency**: Same mechanism regardless of field type
2. **Simplicity**: No need to differentiate between object types
3. **Performance**: Leverages existing optimized keyed event infrastructure
4. **Correctness**: `onKeyed('user:updated', 'name')` correctly triggers only when `user.name` changes

### 3. Type Definitions

```typescript
/**
 * Determines if a type should use keyed subscriptions
 */
type IsKeyedField<T> = T extends Array<any> 
    ? true 
    : T extends Record<string, any> 
        ? true 
        : false;

/**
 * ReactiveStore with automatic proxy-based reactivity
 */
export type ReactiveStoreWithFields<T extends Record<string, unknown> & NonPrimitive> =
    ReactiveStore<T> & {
        readonly [K in keyof T]: T[K];
    };

/**
 * @deprecated Use direct property access instead: store.users.alice
 */
export type KeyedAccessors<T extends Record<string, unknown>> = {
    [K in keyof T]: (key: ExtractKeyType<T[K]>) => /* ... */;
};
```

## Edge Cases

### 1. Symbol Properties

**Problem**: Proxies intercept all property access, including symbols like `Symbol.iterator`.

**Solution**: Pass through symbol property access without creating subscriptions.

```typescript
if (typeof prop === 'symbol') {
    return Reflect.get(target, prop, receiver);
}
```

### 2. Built-in Properties

**Problem**: Properties like `length`, `constructor`, `prototype` should not create subscriptions.

**Solution**: Whitelist built-in properties.

```typescript
const BUILTIN_PROPS = new Set(['length', 'constructor', 'prototype', 'toJSON']);

if (BUILTIN_PROPS.has(prop)) {
    return Reflect.get(target, prop, receiver);
}
```

### 3. Method Calls on Arrays

**Problem**: `store.items.map()`, `store.items.filter()` etc.

**Solution**: Methods are passed through. The method access itself doesn't subscribe, but accessing elements inside the callback does.

```typescript
// This works naturally:
store.items.map((item, index) => {
    // Accessing store.items[index] creates keyed subscription
    return <li>{item.name}</li>;
});
```

### 4. Destructuring

**Problem**: `const { name, age } = store.user` - both properties accessed simultaneously.

**Solution**: Each property access creates its own subscription. This is actually optimal - you get subscriptions for exactly what you use.

```typescript
// Both subscriptions are created:
const { name, age } = store.user;
// Effect re-runs only when name OR age changes (not other user properties)
```

### 5. Spread Operator

**Problem**: `{...store.users}` - iterates all keys.

**Solution**: Iteration creates subscriptions for accessed keys. For full object spread, consider using `getRaw()`.

```typescript
// Creates subscriptions for all existing keys (may be many!)
const allUsers = {...store.users};

// Better for full object access (no subscriptions):
const allUsers = store.getRaw('users');
```

### 6. `instanceof` Checks

**Problem**: `store.user instanceof User` fails because Proxy wraps the object.

**Solution**: Document this limitation. Provide `getRaw()` for cases needing unwrapped objects.

```typescript
// Won't work as expected:
store.user instanceof User  // false (it's a Proxy)

// Use getRaw for type checks:
store.getRaw('user') instanceof User  // true
```

### 7. Object Identity

**Problem**: `store.user === store.user` - are proxies recreated each access?

**Solution**: Cache proxies by field to maintain identity.

```typescript
// Same proxy instance returned each time
const a = store.users;
const b = store.users;
console.log(a === b); // true (cached)
```

### 8. Null/Undefined Values

**Problem**: `store.users.alice` when alice doesn't exist.

**Solution**: Return undefined, but a subscription IS created. This is intentional so the component re-renders when alice is added.

```typescript
// Returns undefined, subscription IS created
// (so component re-renders when alice is later added)
const alice = store.users.alice; // undefined now, but reactive

store.update((state) => {
    state.users.alice = { name: 'Alice' };
});
// Component re-renders because subscription was created
```

**Rationale**: If you're accessing `store.users.alice`, you likely want to know when it becomes available. Creating the subscription ensures reactivity even for keys that don't exist yet.

### 9. Dynamic Key Access

**Problem**: Keys determined at runtime.

**Solution**: Works naturally with Proxy.

```typescript
const userId = 'alice';
store.users[userId]; // Works! Creates keyed subscription for 'alice'
```

### 10. Array Mutations and Stable ID-Based Subscriptions

**Problem**: `push`, `splice`, etc. change indices.

Index-based keyed subscriptions become stale after array mutations:

```typescript
// Subscribe to index 0
store.items[0]  // Alice

// After splice(0, 1), Alice is removed
// Index 0 now refers to Bob - wrong subscription!
```

**Solution: ID-Based Array Subscriptions**

patch-recorder supports `getItemId` configuration that attaches logical IDs to patches. This enables stable subscriptions that survive array mutations.

#### Current State

1. **patch-recorder**: ✅ Fully implements `getItemId`
   - Configured via `options.getItemId`
   - Patches include `id` field when configured
   
2. **observator**: ⚠️ Gap - doesn't pass options to patch-recorder
   - `ObservableStoreOptions` only has `createFunction`
   - No way to configure `getItemId`

3. **observator-svelte**: ❌ No ID-based subscription support yet

#### Proposed Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Configuration Flow                                 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  User configures getItemId:                                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  const store = createObservableStore(state, {                   │ │
│  │    getItemId: {                                                 │ │
│  │      items: (item) => item.id,  // Extract ID from array items  │ │
│  │      users: (user) => user.id,                                  │ │
│  │    }                                                            │ │
│  │  });                                                            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                           │                                           │
│                           ▼                                           │
│  observator passes to patch-recorder:                                │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  recordPatches(state, mutate, { getItemId: options.getItemId }) │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                           │                                           │
│                           ▼                                           │
│  Patches include ID:                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  { op: 'replace', path: ['items', 0, 'name'], value: 'Jane',   │ │
│  │    id: 'item-123' }  // <-- Stable ID!                          │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                           │                                           │
│                           ▼                                           │
│  observator emits keyed events by ID:                                │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  // Option A: Emit both index and ID keyed events               │ │
│  │  emitter.emitKeyed('items:updated', 0, patches);      // index  │ │
│  │  emitter.emitKeyed('items:updated', 'item-123', patches); // ID │ │
│  │                                                                  │ │
│  │  // Option B: Only emit ID keyed events when ID available       │ │
│  │  const key = patch.id ?? patch.path[1];                         │ │
│  │  emitter.emitKeyed('items:updated', key, patches);              │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                           │                                           │
│                           ▼                                           │
│  Svelte adapter subscribes by ID:                                    │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  store.items.byId('item-123')  // Subscribe by stable ID        │ │
│  │  store.items[0]                // Subscribe by index (fragile)  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### Implementation Steps

**Step 1: Extend observator options**

```typescript
// packages/observator/src/index.ts
export type ObservableStoreOptions = {
    createFunction?: CreateFunction;
    getItemId?: GetItemIdConfig;  // NEW: Pass to patch-recorder
};

function createFromPatchRecorder<T extends NonPrimitive>(
    state: T,
    mutate: (state: T) => void,
    options?: { getItemId?: GetItemIdConfig }  // Accept options
): [T, Patches] {
    return [state, recordPatches<T>(state, mutate, { getItemId: options?.getItemId })];
}
```

**Step 2: Modify keyed event emission to use ID**

```typescript
// In update() method
private extractKeysFromPatches(fieldPatches: Patches): Set<Key> {
    const keys = new Set<Key>();
    for (const patch of fieldPatches) {
        // Prefer ID over index when available
        if (patch.id !== undefined) {
            keys.add(patch.id);
        } else if (patch.path.length > 1) {
            keys.add(patch.path[1]);
        }
    }
    return keys;
}
```

**Step 3: Svelte adapter ID-based access**

```typescript
// packages/observator-svelte/src/lib/store.svelte.ts
class ReactiveStore<T> {
    // New: ID-based accessor for arrays
    public readonly byId: ByIdAccessors<T>;
    
    private createByIdAccessors(): ByIdAccessors<T> {
        const accessors = {} as ByIdAccessors<T>;
        for (const field of Object.keys(state)) {
            accessors[field] = (id: string | number) => {
                // Subscribe by ID instead of index
                this.ensureKeyedSubscription(field, id);
                // Find item by ID in array
                const arr = this.observableStore.get(field);
                if (Array.isArray(arr)) {
                    return arr.find(item =>
                        this.getItemIdFn(field)?.(item) === id
                    );
                }
                return undefined;
            };
        }
        return accessors;
    }
}
```

**Usage:**

```svelte
<script>
  // Configure getItemId
  const store = createObservableStore({
    items: [
      { id: 'a', name: 'Alice' },
      { id: 'b', name: 'Bob' }
    ]
  }, {
    getItemId: {
      items: (item) => item.id
    }
  });
  
  const reactive = useSvelteReactivity(store);
</script>

<!-- Index-based (fragile) -->
{reactive.items[0]?.name}

<!-- ID-based (stable) -->
{reactive.byId.items('a')?.name}  <!-- Always refers to Alice -->
```

#### Potential Issues

| Issue | Severity | Mitigation |
|-------|----------|------------|
| **ID not configured** | Low | Fall back to index-based subscriptions |
| **ID extraction fails** | Medium | Return undefined, log warning in dev |
| **Duplicate IDs** | Medium | First match wins, warn in dev |
| **Performance of find()** | Low | O(n) per access, acceptable for most arrays |
| **ID changes** | High | Treat as remove + add (new subscription) |
| **Type complexity** | Medium | Good TypeScript types needed |

#### Alternative: Transparent Proxy with ID Tracking

Instead of a separate `byId` accessor, the proxy could automatically detect ID-based arrays and subscribe by ID:

```typescript
// In FieldProxy get handler
get(target: T, prop: string | symbol, receiver: any): any {
    const isNumericKey = typeof prop === 'string' && !isNaN(Number(prop));
    
    if (Array.isArray(target) && isNumericKey) {
        const index = Number(prop);
        const item = target[index];
        const getIdFn = this.store.getItemIdFn(this.field);
        
        if (getIdFn && item) {
            // Subscribe by ID, not index!
            const id = getIdFn(item);
            if (id !== undefined) {
                this.store.ensureKeyedSubscription(this.field, id);
                return this.store.createPropertyProxy(this.field, id, item);
            }
        }
        
        // Fall back to index subscription
        this.store.ensureKeyedSubscription(this.field, index);
        return item;
    }
    // ... rest of handler
}
```

**Pros:**
- Transparent - `store.items[0]` automatically uses ID subscription
- No API change needed

**Cons:**
- Magic behavior (accessing [0] subscribes to ID 'a')
- Harder to understand/debug
- What if user intentionally wants index-based subscription?

#### Recommendation

**Implement explicit `byId` accessor** rather than transparent ID subscription:
1. Clear intent - user chooses between index and ID
2. No magic behavior
3. Type safety is easier
4. Can deprecate later if transparent approach proves better

### 11. Top-Level Field Replacement

**Problem**: When you replace an entire field, keyed subscriptions may not fire.

```typescript
// This update...
store.update((state) => {
  state.user = {name: 'John', address: {city: 'NYC'}};
});

// ...generates patch: { op: 'replace', path: ['user'], value: {...} }
// The path has length 1, no second-level key!
```

When the entire `user` object is replaced, the patch path is `['user']` (length 1). The keyed event extraction looks for `path[1]`, which doesn't exist. **Result**: If you're subscribed via `onKeyed('user:updated', 'name')`, you won't get notified!

**Solution Analysis:**

**Option A: Field-level subscription with patch filtering (in Svelte adapter)**

Subscribe to the field-level event and filter patches in the adapter:

```typescript
ensureKeyedSubscription(field: string, key: string | number): void {
    const cacheKey = `${field}:${key}`;
    if (!this.keyedSubscribers.has(cacheKey)) {
        const subscriber = createSubscriber((update) => {
            // Subscribe to field-level event, filter patches manually
            const fieldUnsub = this.observableStore.on(`${field}:updated`, (patches) => {
                const isRelevant = patches.some(p =>
                    p.path.length === 1 ||  // Whole field replaced
                    (p.path.length > 1 && p.path[1] === key)  // Specific key changed
                );
                if (isRelevant) update();
            });
            return () => fieldUnsub();
        });
        this.keyedSubscribers.set(cacheKey, subscriber);
    }
    this.keyedSubscribers.get(cacheKey)!();
}
```

**Option B: Enhance observator core to emit keyed events for field replacement**

Modify observator's `update()` method to emit keyed events when a field is replaced:

```typescript
// In observator core - enhanced version
if (this.emitter.hasKeyedListeners(eventName)) {
    const changedKeys = this.extractSecondKeysFromPatches(fieldPatches);
    
    // Also check for field-level replacements
    const hasFieldReplacement = fieldPatches.some(p => p.path.length === 1);
    if (hasFieldReplacement) {
        // Emit keyed events for all REGISTERED listeners (not all keys)
        const registeredKeys = this.emitter.getKeyedListenerKeys(eventName);
        for (const key of registeredKeys) {
            if (!changedKeys.has(key)) {
                this.emitter.emitKeyed(eventName, key, fieldPatches);
            }
        }
    }
    
    for (const changedKey of changedKeys) {
        this.emitter.emitKeyed(eventName, changedKey, fieldPatches);
    }
}
```

**Honest Comparison:**

| Aspect | Option A (Adapter) | Option B (Core) |
|--------|-------------------|-----------------|
| **Complexity** | Simple | Moderate |
| **Performance (10 subscribers)** | 10× patch filtering | 1× check + 10 emit |
| **Performance (1000 keys, field replacement)** | 10 filter checks | Only emits for registered keys |
| **DRY principle** | Adapter handles edge case | Core handles correctly for all consumers |
| **Other adapters (React, Vue)** | Each reimplements | Automatic |
| **Consistency** | `onKeyed` behaves differently than expected | `onKeyed` works correctly |
| **Maintainability** | Edge case in adapter | Clean separation |

**Analysis:**

1. **Option B is architecturally cleaner**: The core library should emit correct keyed events. Expecting every adapter to work around a core limitation violates DRY.

2. **Option B is more performant for many subscribers**: With Option A, if 10 components subscribe to different keys, every field update triggers 10 independent patch-filtering operations. With Option B, the core checks once and emits to the right listeners.

3. **The "many keyed events" concern in Option B is mitigated**: By only emitting to REGISTERED listener keys (not all object keys), we avoid the N-events-for-N-keys problem.

4. **Option B benefits all consumers**: Not just Svelte, but React, Vue, or any future adapter.

**Recommendation: Option B (core enhancement)**

Modify observator core to emit keyed events for registered listener keys when a field is replaced. This is the correct behavior - if you're listening for changes to `user.name`, you should be notified when `user` is replaced with a new object that has a different `name`.

The implementation cost is low (we control the core), and the benefits are significant (correctness, performance, consistency).

---

### 11.1 Field Replacement - Implementation Design (Option B)

Since observator core is under our control, we can implement the proper fix there.

#### Prerequisite: Add method to radiate to get registered keys

The `radiate` emitter needs a method to retrieve all keys that have active listeners:

```typescript
// In radiate package
class Emitter {
    // Existing methods...
    
    /**
     * Get all keys that have listeners for a keyed event
     * @param event - The event name
     * @returns Set of keys with active listeners
     */
    getKeyedListenerKeys<E extends keyof Events>(event: E): Set<Key> {
        // Implementation returns all registered keys for the event
    }
}
```

#### Step 1: Detect field replacement in observator

In observator's [`groupPatchesByField`](packages/observator/src/index.ts:482), we already separate patches by path length. A field replacement is a patch where `path.length === 1`:

```typescript
// packages/observator/src/index.ts - line 497
if (patch.path.length === 1 || patch.path.length === 2) {
    // path.length === 1 means field replacement: state.user = newUser
    // path.length === 2 means key-level: state.user.name = 'Jane'
```

Modify to track which fields were entirely replaced:

```typescript
private groupPatchesByField(patches: Patches): {
    topLevel: Map<string, Patches>;
    all: Map<string, Patches>;
    replacedFields: Set<string>;  // NEW: Track replaced fields
} {
    const replacedFields = new Set<string>();
    
    for (const patch of patches) {
        const fieldKey = patch.path[0] as string;
        
        // Field replacement detection
        if (patch.path.length === 1 && patch.op === 'replace') {
            replacedFields.add(fieldKey);
        }
        // ... rest of grouping logic
    }
    
    return { topLevel, all, replacedFields };
}
```

#### Step 2: Emit keyed events for registered listeners on field replacement

```typescript
// In update() method - enhanced version after line 146
for (const [fieldKey, fieldPatches] of all.entries()) {
    const eventName = `${fieldKey}:updated` as EventNames<T>;
    
    // Always emit field level event
    this.emitter.emit(eventName, fieldPatches);
    
    // Conditionally emit keyed events
    if (this.emitter.hasKeyedListeners(eventName)) {
        const changedKeys = this.extractSecondKeysFromPatches(fieldPatches);
        
        // NEW: If field was replaced, also notify all registered keyed listeners
        if (replacedFields.has(fieldKey)) {
            const registeredKeys = this.emitter.getKeyedListenerKeys(eventName);
            for (const key of registeredKeys) {
                changedKeys.add(key);  // Add registered keys to changed set
            }
        }
        
        for (const changedKey of changedKeys) {
            this.emitter.emitKeyed(eventName, changedKey, fieldPatches);
        }
    }
}
```

#### Behavior After Fix

```typescript
const store = createObservableStore({
    user: { name: 'John', age: 30, email: 'john@example.com' }
});

// Keyed listener for 'name'
store.onKeyed('user:updated', 'name', (patches) => {
    console.log('Name changed:', patches);
});

// Scenario 1: Direct property change
store.update(s => { s.user.name = 'Jane'; });
// Output: "Name changed: [{op:'replace', path:['user','name'], value:'Jane'}]"

// Scenario 2: Field replacement (FIXED)
store.update(s => { s.user = { name: 'Bob', age: 25, email: 'bob@example.com' }; });
// Output: "Name changed: [{op:'replace', path:['user'], value:{...}}]"
```

#### Edge Cases

| Case | Behavior |
|------|----------|
| Replace with same value | Still emits (can't efficiently diff objects) |
| Replace array field | All keyed listeners (by index or ID) notified |
| Replace with null/undefined | Type system prevents, but runtime should handle gracefully |
| Wildcard `*` listeners | Receives all changes as before |
| No keyed listeners | No change (hasKeyedListeners returns false) |

#### Alternative: Synthetic per-key patches

Instead of emitting the field-level patch to keyed listeners, generate synthetic per-key patches:

```typescript
// Instead of:
emitter.emitKeyed('user:updated', 'name', [{ op: 'replace', path: ['user'], value: newUser }]);

// Emit synthetic patch:
emitter.emitKeyed('user:updated', 'name', [{ op: 'replace', path: ['user', 'name'], value: newUser.name }]);
```

**Pros:** Consistent patch format, listeners always see key-specific patches
**Cons:** Overhead to generate synthetic patches, may lose context, complex

**Recommendation:** Start with emitting the field-level patch as-is. Listeners can check `patch.path.length === 1` to detect field replacement if needed. This is simpler and maintains patch integrity.

#### Implementation Tasks for Core

1. **radiate**: Add `getKeyedListenerKeys()` method
2. **observator**: Modify `groupPatchesByField()` to track `replacedFields`
3. **observator**: Update `update()` to emit keyed events for registered keys on field replacement
4. **tests**: Add tests for field replacement with keyed listeners

## Performance Considerations

### Proxy Overhead

| Operation | Cost | Mitigation |
|-----------|------|------------|
| Proxy creation | ~1μs | Cache proxies per field |
| Property access (get trap) | ~10ns | V8 optimizes repeated access |
| Subscription lookup | O(1) | Map-based cache |
| Patch filtering | O(n) | n = patches per update, typically small |

### Memory Usage

| Component | Memory Impact |
|-----------|--------------|
| Field proxies | 1 per field (cached) |
| Property proxies | 1 per nested object (cached) |
| Subscribers | 1 per unique subscription (deduplicated) |

### Benchmark Expectations

- Initial render: ~5% slower (proxy setup)
- Updates: Equal or faster (more granular = fewer re-renders)
- Memory: ~10% increase (proxy + cache overhead)

## Migration Path

### Phase 1: Add Proxy Support (Non-Breaking)

- Implement FieldProxy and PropertyProxy
- Keep existing `store.keyed` API working
- Add deprecation warning to `store.keyed`

### Phase 2: Documentation Update

- Update docs to recommend direct property access
- Add migration guide for `store.keyed` users
- Update examples in README

### Phase 3: Deprecation (Next Major Version)

- Mark `store.keyed` as `@deprecated` in types
- Emit console warning on first use
- Plan removal for v2.0

### Migration Examples

```typescript
// Before (v0.x):
{store.keyed.users('alice')?.name}

// After (v1.x):
{store.users.alice?.name}

// Both work in v1.x, only new style in v2.x
```

## API Changes Summary

### New Behavior (Automatic)

| Access | Old Behavior | New Behavior |
|--------|-------------|--------------|
| `store.count` | Field subscription | Field subscription (unchanged for primitives) |
| `store.user.name` | Field subscription (any user change) | Keyed subscription (only name changes) |
| `store.user.address.city` | Field subscription (any user change) | Keyed subscription (any address.* change) |
| `store.users.alice` | Field subscription (any users change) | Keyed subscription (only alice changes) |
| `store.users.alice.email` | Field subscription (any users change) | Keyed subscription (any alice.* change) |
| `store.items[0]` | Field subscription (any items change) | Keyed subscription (only index 0 changes) |

**Note:** The granularity stops at the second level. Changes to `store.user.address.city` trigger when ANY property of `address` changes, not just `city`. This is a deliberate trade-off for simplicity.

### Deprecated API

```typescript
// Deprecated - still works but emits warning
store.keyed.users('alice')

// Replacement
store.users.alice
```

### New Methods

```typescript
// Get raw value without proxy wrapping (useful for instanceof, spread)
store.getRaw('users')  // Already exists, unchanged

// Get entire field value with field-level subscription (opt-out of granularity)
store.getField('users')  // New: useful when you want all users changes
```

## Testing Strategy

### Unit Tests

1. **Proxy creation**: Verify proxies are created and cached correctly
2. **Subscription granularity**: Verify correct subscription type for each access pattern
3. **Edge cases**: Test all edge cases listed above
4. **Type safety**: Compile-time type checking tests

### Browser Integration Tests

1. **Reactivity**: Verify components re-render correctly
2. **Render counts**: Verify granular updates reduce unnecessary renders
3. **Array operations**: Test push, splice, etc.
4. **Dynamic keys**: Test runtime-determined keys

### Performance Tests

1. **Proxy overhead**: Measure property access latency
2. **Memory usage**: Track proxy and cache memory
3. **Update performance**: Compare render counts with/without proxies

## Implementation Checklist

- [ ] Create FieldProxyHandler class
- [ ] Create PropertyProxyHandler class
- [ ] Implement proxy caching
- [ ] Add path-filtered subscriptions
- [ ] Update field getters to return proxies
- [ ] Handle all edge cases
- [ ] Add deprecation to `store.keyed`
- [ ] Update TypeScript types
- [ ] Write unit tests for proxies
- [ ] Write browser integration tests
- [ ] Update documentation
- [ ] Add migration guide

## Open Questions

1. **Should we support deeper than 2-level path filtering?**
   - Current design: 2 levels (field + property/key)
   - Deeper would add complexity with diminishing returns

2. **Should `getField()` be added for explicit field-level subscription?**
   - Use case: When you intentionally want to re-render on any field change
   - Alternative: Use `getRaw()` and field-level `on()` manually

3. **How to handle Maps and Sets?**
   - Current: Not specifically handled
   - Could add support similar to Arrays with keyed subscriptions
