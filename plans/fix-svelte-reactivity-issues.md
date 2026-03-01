# Fix Svelte Reactivity Issues

This document describes 3 issues found during code review of the `observator-svelte` package. Each issue has a failing test that documents the expected behavior.

## Overview

Run failing tests with:
```bash
cd packages/observator-svelte && pnpm test
```

All issues are in [`packages/observator-svelte/src/lib/store.svelte.ts`](../packages/observator-svelte/src/lib/store.svelte.ts)

---

## Issue 1: Array `.length` Access Not Reactive

### Problem
Accessing `store.items.length` through the FieldProxy doesn't trigger field-level subscription, so effects don't re-run when array length changes.

### Failing Test
File: `packages/observator-svelte/src/lib/reactivity.svelte.test.ts:1581`
Test: "should handle accessing array length"

```typescript
it('should handle accessing array length', () => {
    const cleanup = $effect.root(() => {
        const observableStore = createObservableStore({
            items: [
                { id: 0, text: 'First' },
                { id: 1, text: 'Second' }
            ]
        });
        const store = useSvelteReactivity(observableStore);

        const lengths: number[] = [];

        $effect(() => {
            lengths.push(store.items.length);
        });

        flushSync();
        expect(lengths).toEqual([2]);

        // Push an item
        store.update((s) => {
            s.items.push({ id: 2, text: 'Third' });
        });

        flushSync();
        expect(lengths[lengths.length - 1]).toBe(3); // FAILS: still 2
    });
    cleanup();
});
```

### Root Cause
In `createFieldProxy()` at line 167, `BUILTIN_PROPS` includes `'length'`:

```typescript
const BUILTIN_PROPS = new Set(['length', 'constructor', 'prototype', 'toJSON', '__proto__']);

// In proxy get handler:
if (BUILTIN_PROPS.has(prop)) {
    return Reflect.get(target, prop, receiver); // No subscription!
}
```

### Proposed Fix
For arrays, `.length` should trigger field-level subscription:

```typescript
// In FieldProxy get handler:
if (BUILTIN_PROPS.has(prop)) {
    // For arrays, .length should be reactive
    if (isArray && prop === 'length') {
        store.getOrCreateFieldSubscriber(field as keyof T)();
    }
    return Reflect.get(target, prop, receiver);
}
```

---

## Issue 2: Stale Proxy Cache After Array Mutations

### Problem
After `pop()`, `shift()`, or `splice()`, accessing a now-empty index returns stale cached value instead of `undefined`.

### Failing Test
File: `packages/observator-svelte/src/lib/reactivity.svelte.test.ts:1620`
Test: "should handle conditional rendering based on item existence"

```typescript
it('should handle conditional rendering based on item existence', () => {
    const cleanup = $effect.root(() => {
        const observableStore = createObservableStore(
            { items: [{ id: 'a', text: 'First' }] },
            { getItemId: { items: (item: { id: string }) => item.id } }
        );
        const store = useSvelteReactivity(observableStore, {
            getItemId: { items: (item: { id: string }) => item.id }
        });

        const item1Exists: boolean[] = [];

        $effect(() => {
            item1Exists.push(store.items[1] !== undefined);
        });

        flushSync();
        expect(item1Exists).toEqual([false]);

        store.update((s) => {
            s.items.push({ id: 'b', text: 'Second' });
        });

        flushSync();
        expect(item1Exists[item1Exists.length - 1]).toBe(true);

        // Pop it
        store.update((s) => {
            s.items.pop();
        });

        flushSync();
        expect(item1Exists[item1Exists.length - 1]).toBe(false); // FAILS: still true
    });
    cleanup();
});
```

### Root Cause
The `fieldProxyCache` and `propertyProxyCache` are cleared on `update()`, but the proxy objects themselves reference old target arrays. When an effect accesses `store.items[1]`, it may be getting a stale proxy that points to old data.

The FieldProxy is created once and cached:
```typescript
private createFieldProxy<V extends object>(field: string, target: V): V {
    const cacheKey = field;
    if (this.fieldProxyCache.has(cacheKey)) {
        return this.fieldProxyCache.get(cacheKey) as V;  // Returns stale proxy!
    }
    // ...
}
```

But the `target` (the array) is the OLD array reference from when the proxy was created.

### Proposed Fix
The FieldProxy's get handler should always get the CURRENT value from the store, not the cached target:

```typescript
const proxy = new Proxy(target, {
    get(target: V, prop: string | symbol, receiver: any): any {
        // Always get current state from store, not cached target
        const currentValue = store.observableStore.get(field as keyof T);
        const currentTarget = currentValue as object;
        
        // ...rest of handler using currentTarget instead of target
        const value = Reflect.get(currentTarget, prop, receiver);
    }
});
```

Alternatively, invalidate the cache after field-level changes, not just on `update()`.

---

## Issue 3: Mixed Items Over-Rendering (Expected Behavior?)

### Problem
When array items without valid IDs fall back to field-level subscription, they re-run on ANY field update to that array, even if a different item was updated.

### Failing Test
File: `packages/observator-svelte/src/lib/reactivity.svelte.test.ts:1211`
Test: "should handle mixed items - some with valid IDs, some without"

```typescript
it('should handle mixed items - some with valid IDs, some without', () => {
    const cleanup = $effect.root(() => {
        const observableStore = createObservableStore(
            {
                items: [
                    { id: 'a', value: 'has-id' },
                    { value: 'no-id' } as { id?: string; value: string },
                    { id: 'c', value: 'has-id-too' }
                ]
            },
            { getItemId: { items: (item: { id?: string }) => item.id } }
        );
        const store = useSvelteReactivity(observableStore, {
            getItemId: { items: (item: { id?: string }) => item.id }
        });

        let item0Runs = 0;
        let item1Runs = 0;
        let item2Runs = 0;

        $effect(() => {
            store.items[0];
            untrack(() => item0Runs++);
        });

        $effect(() => {
            store.items[1];  // This item has no ID, uses field-level subscription
            untrack(() => item1Runs++);
        });

        $effect(() => {
            store.items[2];
            untrack(() => item2Runs++);
        });

        flushSync();

        // Update item with valid ID 'a'
        store.update((s) => {
            s.items[0].value = 'updated-a';
        });

        flushSync();
        expect(item0Runs).toBe(2);
        expect(item1Runs).toBe(1);  // FAILS: Got 2 (field-level sub triggered)
        expect(item2Runs).toBe(1);
    });
    cleanup();
});
```

### Root Cause
Items without valid IDs fall back to field-level subscription at line 188-190:

```typescript
// No getItemId or no ID - use field-level subscription for arrays
store.getOrCreateFieldSubscriber(field as keyof T)();
```

Field-level subscription fires on ANY change to the field (any array item update).

### Analysis
This might be **expected behavior** rather than a bug. When an item doesn't have a valid ID, there's no way to create a granular keyed subscription for it. Options:

1. **Accept the behavior** - Document that items without valid IDs use field-level subscription and will re-render on any array change.

2. **Use index-based fallback** - For items without ID, fall back to index-based keyed subscription (but this has its own issues with array mutations).

3. **Require all items have IDs** - Make it a requirement that if `getItemId` is configured, all items must have valid IDs.

### Proposed Fix
Option 1 is likely the best approach. Update the test to reflect expected behavior:

```typescript
// Update item with valid ID 'a'
store.update((s) => {
    s.items[0].value = 'updated-a';
});

flushSync();
expect(item0Runs).toBe(2);
// Items without valid IDs use field-level subscription, so they re-run on any change
expect(item1Runs).toBe(2);  // Expected: field-level subscription triggers
expect(item2Runs).toBe(1);
```

---

## Summary of Fixes

| Issue | Priority | Fix Complexity |
|-------|----------|----------------|
| 1. Array `.length` not reactive | High | Easy (add subscription for length) |
| 2. Stale proxy cache | High | Medium (fix proxy target reference) |
| 3. Mixed items over-rendering | Low | None (document expected behavior) |

### Files to Modify
- `packages/observator-svelte/src/lib/store.svelte.ts`
- `packages/observator-svelte/src/lib/reactivity.svelte.test.ts` (for Issue 3, update test expectation)

### Verification
After fixes, run:
```bash
cd packages/observator-svelte && pnpm test
```

All tests should pass.
