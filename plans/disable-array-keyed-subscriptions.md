# Disable Array Keyed Subscriptions

This document describes the changes made to disable keyed subscriptions for array fields in observator. These changes can be reverted if we decide to re-enable array keyed subscriptions later.

## Rationale

Array keyed subscriptions were disabled because:

1. **Position vs Identity**: Array indices are positional, not identity-based
2. **Misleading after mutations**: After `shift()`, index 1 refers to a different item
3. **Incomplete tracking**: `shift()` only produced patches for index 0, but technically ALL indices changed
4. **UI frameworks handle identity**: Svelte uses `{#each items as item (item.id)}` for identity tracking

## Files Changed

### 1. packages/observator/src/types.ts

Added types to filter out array fields from keyed subscriptions:

```typescript
/**
 * Check if a type is an array type
 */
export type IsArray<T> = T extends Array<unknown> ? true : false;

/**
 * Extract non-array field keys from a state type.
 * Keyed subscriptions are only supported for non-array fields because
 * array indices are positional (not identity-based).
 */
export type NonArrayKeys<T> = {
	[K in keyof T]: IsArray<T[K]> extends true ? never : K;
}[keyof T];
```

Modified `ExtractKeyType` to return `never` for arrays:

```typescript
export type ExtractKeyType<T> =
	// Arrays return never - keyed subscriptions not supported for arrays
	T extends Array<unknown>
		? never
		: // Records with string keys
			T extends Record<infer K, unknown>
			? K extends string | number | symbol
				? K
				: never
			: // Objects - use keyof
				keyof T;
```

Modified `KeyedSubscriptionsMap` to only include non-array fields:

```typescript
export type KeyedSubscriptionsMap<T extends Record<string, unknown> & NonPrimitive> = {
	readonly [K in keyof T as K extends NonArrayKeys<T> ? K : never]: (
		key: ExtractKeyType<T[K]>,
	) => (callback: (value: Readonly<T[K]>) => void) => () => void;
};
```

### 2. packages/observator/src/index.ts

Updated method signatures to use `NonArrayKeys<T>`:

```typescript
// onKeyed - changed K constraint from keyof T to NonArrayKeys<T>
onKeyed<K extends NonArrayKeys<T> & string>(
	event: EventName<K>,
	key: '*',
	callback: (key: ExtractKeyType<T[K]>, patches: Patches) => void,
): () => void;
onKeyed<K extends NonArrayKeys<T> & string>(
	event: EventName<K>,
	key: ExtractKeyType<T[K]>,
	callback: (patches: Patches) => void,
): () => void;

// offKeyed - same changes
offKeyed<K extends NonArrayKeys<T> & string>(
	event: EventName<K>,
	key: ExtractKeyType<T[K]> | '*',
	callback: ((patches: Patches) => void) | ((key: ExtractKeyType<T[K]>, patches: Patches) => void),
): void;

// onceKeyed - same changes
onceKeyed<K extends NonArrayKeys<T> & string>(
	event: EventName<K>,
	key: '*',
	callback: (key: ExtractKeyType<T[K]>, patches: Patches) => void,
): () => void;
onceKeyed<K extends NonArrayKeys<T> & string>(
	event: EventName<K>,
	key: ExtractKeyType<T[K]>,
	callback: (patches: Patches) => void,
): () => void;
```

Updated `createKeyedSubscribeHandlers()` to skip array fields at runtime:

```typescript
private createKeyedSubscribeHandlers(): KeyedSubscriptionsMap<T> {
	const handlers = {} as Record<string, (key: Key) => (callback: (value: unknown) => void) => () => void>;
	const state = this.state;
	for (const fieldName of Object.keys(state)) {
		const fieldValue = state[fieldName as keyof T];
		
		// Skip array fields - keyed subscriptions not supported for arrays
		if (Array.isArray(fieldValue)) {
			continue;
		}
		
		handlers[fieldName] = (key: Key) => {
			// ... implementation
		};
	}
	return handlers as KeyedSubscriptionsMap<T>;
}
```

### 3. packages/observator/test/index.test.ts

Removed tests that used array keyed subscriptions:

1. **"Array removal keyed events" describe block** - Entire block removed
2. **"should work with array fields using numeric keys"** - Removed
3. **"should emit keyed events for affected indices when element is removed"** - Removed
4. **"should emit keyed events for affected indices when elements are reordered"** - Removed
5. **"Keyed events for array operations" describe block** - Renamed to "Patch behavior for array operations"
   - Removed: "should emit keyed event for index when pushed"
   - Removed: "should emit keyed events when using splice to remove"
   - Removed: "should emit keyed events for replacement at specific index"
   - Removed: "should handle push cycles with keyed listener"
   - Kept: Tests using field-level subscriptions

Added comments documenting that array keyed subscriptions are not supported:

```typescript
// Note: Array keyed subscriptions are no longer supported.
// Array indices are positional, not identity-based, so use field-level subscriptions instead.
```

## How to Re-enable

To re-enable array keyed subscriptions:

### Step 1: Update types.ts

Remove the `IsArray` and `NonArrayKeys` types, or modify `ExtractKeyType` to return `number` for arrays:

```typescript
export type ExtractKeyType<T> =
	// Arrays use numeric keys
	T extends Array<unknown>
		? number
		: // Records with string keys
			T extends Record<infer K, unknown>
			? K extends string | number | symbol
				? K
				: never
			: // Objects - use keyof
				keyof T;
```

Revert `KeyedSubscriptionsMap` to include all fields:

```typescript
export type KeyedSubscriptionsMap<T extends Record<string, unknown> & NonPrimitive> = {
	readonly [K in keyof T]: (
		key: ExtractKeyType<T[K]>,
	) => (callback: (value: Readonly<T[K]>) => void) => () => void;
};
```

### Step 2: Update index.ts

Change method signatures back to use `keyof T` instead of `NonArrayKeys<T>`:

```typescript
onKeyed<K extends keyof T & string>(...): () => void;
offKeyed<K extends keyof T & string>(...): void;
onceKeyed<K extends keyof T & string>(...): () => void;
```

Remove the array check in `createKeyedSubscribeHandlers()`:

```typescript
// Remove this check:
if (Array.isArray(fieldValue)) {
	continue;
}
```

### Step 3: Re-add tests

Add back the array keyed subscription tests to verify behavior.

## Recommended Pattern for Arrays

Instead of keyed subscriptions for arrays, use:

1. **Field-level subscriptions** for arrays:
   ```typescript
   store.on('items:updated', (patches) => {
     // React to any changes to the items array
   });
   ```

2. **Record<id, Item>** for identity-based keyed subscriptions:
   ```typescript
   type State = {
     items: Record<string, { id: string; text: string }>;
   };
   // Now keyed subscriptions work by identity!
   store.onKeyed('items:updated', 'item-123', callback);
   ```

3. **UI framework identity tracking**:
   ```svelte
   {#each items as item (item.id)}
     <!-- Svelte tracks by item.id -->
   {/each}
   ```

## Future Considerations

### Complete Position Tracking

To enable complete position-based tracking, patch-recorder would need to provide `previousLength` info so all affected indices can be computed after shift/splice operations.

### Identity Tracking

patch-recorder has `getItemId` capability for identity-based tracking, but it would require changes for shift/splice operations to work correctly.

Both enhancements would require changes to patch-recorder before they could be exposed in observator.
