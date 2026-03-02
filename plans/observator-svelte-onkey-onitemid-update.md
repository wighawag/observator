# observator-svelte: onKey/onItemId API Update Plan

## Context

The `observator` package has been refactored to split the generic `onKeyed` method into two distinct methods:

1. **`onKey`** - For Record fields (fires on key updates, deletions, and replacements)
2. **`onItemId`** - For Array fields with `getItemId` configuration (fires only on item property updates, NOT on removal)

This plan documents the changes needed in `observator-svelte` to adopt the new API.

## Current State

The `observator-svelte` package uses `onKeyed` in `store.svelte.ts`:

```typescript
// packages/observator-svelte/src/lib/store.svelte.ts, line ~145-160
/**
 * Get or create a keyed subscriber for a specific field and key.
 * Creates a subscription via onKeyed for granular reactivity.
 */
private ensureKeyedSubscription(field: string, key: string | number | symbol): void {
    const cacheKey = `${field}:${String(key)}`;
    if (!this.keyedSubscribers.has(cacheKey)) {
        const subscriber = createSubscriber((update) => {
            const eventName = `${field}:updated` as `${string}:updated`;
            const unsubscribe = this.observableStore.onKeyed(eventName as any, key as Key, () => {
                update();
            });
            return () => unsubscribe();
        });
        this.keyedSubscribers.set(cacheKey, subscriber);
    }
    this.keyedSubscribers.get(cacheKey)!();
}
```

## Required Changes

### 1. Update `ensureKeyedSubscription` Method

The method needs to determine whether to use `onKey` or `onItemId` based on the field type:

```typescript
/**
 * Get or create a keyed subscriber for a specific field and key.
 * Uses onKey for Record fields, onItemId for Array fields with getItemId.
 */
private ensureKeyedSubscription(field: string, key: string | number | symbol, isArrayWithGetItemId: boolean): void {
    const cacheKey = `${field}:${String(key)}`;
    if (!this.keyedSubscribers.has(cacheKey)) {
        const subscriber = createSubscriber((update) => {
            const eventName = `${field}:updated` as `${string}:updated`;
            let unsubscribe: () => void;
            
            if (isArrayWithGetItemId) {
                // Use onItemId for arrays with getItemId config
                unsubscribe = this.observableStore.onItemId(eventName as any, key as Key, () => {
                    update();
                });
            } else {
                // Use onKey for Record fields
                unsubscribe = this.observableStore.onKey(eventName as any, key as Key, () => {
                    update();
                });
            }
            
            return () => unsubscribe();
        });
        this.keyedSubscribers.set(cacheKey, subscriber);
    }
    this.keyedSubscribers.get(cacheKey)!();
}
```

### 2. Update Callers of `ensureKeyedSubscription`

The method signature now requires an additional parameter. Update all call sites:

#### In `createFieldProxy` (Record field access):
```typescript
// For Record field access, pass false
store.ensureKeyedSubscription(field, prop, false);
```

#### In Array access with `getItemId`:
```typescript
// For Array access with getItemId, pass true
store.ensureKeyedSubscription(field, itemId, true);
```

### 3. Update Comment/Documentation

Update the JSDoc comment to reflect the new API:

```typescript
/**
 * Get or create a keyed subscriber for a specific field and key.
 * - For Record fields: uses onKey (fires on update, delete, replace)
 * - For Array fields with getItemId: uses onItemId (fires only on property updates)
 * 
 * @param field - The field name
 * @param key - The key (Record key) or item ID (Array item ID)
 * @param isArrayWithGetItemId - Whether this is an array field with getItemId configured
 */
```

### 4. Update Tests

Update any tests in `store.svelte.test.ts` and `reactivity.svelte.test.ts` that reference the old `onKeyed` behavior.

## Implementation Steps

1. [ ] Read current `store.svelte.ts` to understand the full context
2. [ ] Update `ensureKeyedSubscription` method signature and implementation
3. [ ] Find all call sites of `ensureKeyedSubscription` and update them
4. [ ] Update JSDoc comments
5. [ ] Run existing tests to verify nothing breaks
6. [ ] Update any tests that reference `onKeyed`
7. [ ] Build and test the observator-svelte package

## API Behavioral Differences

| Scenario | `onKey` (Records) | `onItemId` (Arrays) |
|----------|-------------------|---------------------|
| Property update | ✅ Fires | ✅ Fires |
| Key/item deletion | ✅ Fires | ❌ Does NOT fire |
| Key/item replacement | ✅ Fires | ❌ Does NOT fire |
| Field replacement | ✅ Fires | ❌ Does NOT fire |

This behavioral difference is intentional and should be documented in the Svelte integration.

## Testing Checklist

- [ ] Record field subscriptions work with `onKey`
- [ ] Array field subscriptions with `getItemId` work with `onItemId`
- [ ] Structural changes (add/remove) still trigger field-level subscriptions
- [ ] Property updates on array items trigger `onItemId` subscriptions
- [ ] No TypeScript errors after the update
- [ ] All existing tests pass
