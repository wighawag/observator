# Final Implementation Plan

## Status Summary

| Package | Status |
|---------|--------|
| **radiate** | ✅ Done - `getKeyedListenerKeys()` added (v0.3.2) |
| **observator** | 🔴 1 change needed |
| **observator-svelte** | 🔴 1 change needed |

## Implementation Order

### 1. observator: Field Replacement Keyed Event Emission

**Priority: HIGH** - This is a bug fix. Currently, keyed listeners don't fire when a field is replaced entirely.

**Files to modify:**
- `packages/observator/src/index.ts`
- `packages/observator/test/index.test.ts`

**Changes:**

#### 1a. Modify `groupPatchesByField()` to track replaced fields

```typescript
// Line 482-518 - Change return type and implementation
private groupPatchesByField(patches: Patches): {
    topLevel: Map<string, Patches>;
    all: Map<string, Patches>;
    replacedFields: Set<string>;  // NEW
} {
    const topLevel: Map<string, Patches> = new Map();
    const all: Map<string, Patches> = new Map();
    const replacedFields = new Set<string>();  // NEW

    for (const patch of patches) {
        if (patch.path.length === 0) {
            throw new Error(
                'This should never happen, we cannot set the root state in the mutate function',
            );
        }

        const fieldKey = patch.path[0] as string;
        
        // NEW: Track field replacements
        if (patch.path.length === 1) {
            replacedFields.add(fieldKey);
        }
        
        if (patch.path.length === 1 || patch.path.length === 2) {
            // ... existing logic
        }
        // ... existing logic
    }

    return { topLevel, all, replacedFields };  // Add replacedFields
}
```

#### 1b. Modify `update()` to emit keyed events for replaced fields

```typescript
// Line 127 - Destructure replacedFields
const { all, topLevel, replacedFields } = this.groupPatchesByField(patches);

// Lines 139-146 - Enhance keyed event emission
if (this.emitter.hasKeyedListeners(eventName)) {
    const changedKeys = this.extractSecondKeysFromPatches(fieldPatches);
    
    // NEW: If field was replaced, notify all registered keyed listeners
    if (replacedFields.has(fieldKey)) {
        const registeredKeys = this.emitter.getKeyedListenerKeys(eventName);
        for (const key of registeredKeys) {
            changedKeys.add(key);
        }
    }
    
    for (const changedKey of changedKeys) {
        this.emitter.emitKeyed(eventName, changedKey as any, fieldPatches as any);
    }
}
```

#### 1c. Add tests

```typescript
describe('field replacement with keyed listeners', () => {
    it('emits keyed events when field is replaced', () => {
        type State = { user: { name: string; age: number } };
        const store = createObservableStore<State>({
            user: { name: 'John', age: 30 }
        });
        
        const callback = vi.fn();
        store.onKeyed('user:updated', 'name', callback);
        
        store.update(s => {
            s.user = { name: 'Bob', age: 25 };  // Full replacement
        });
        
        expect(callback).toHaveBeenCalledWith([
            { op: 'replace', path: ['user'], value: { name: 'Bob', age: 25 } }
        ]);
    });
    
    it('emits to multiple keyed listeners on field replacement', () => {
        type State = { user: { name: string; age: number } };
        const store = createObservableStore<State>({
            user: { name: 'John', age: 30 }
        });
        
        const nameCallback = vi.fn();
        const ageCallback = vi.fn();
        store.onKeyed('user:updated', 'name', nameCallback);
        store.onKeyed('user:updated', 'age', ageCallback);
        
        store.update(s => {
            s.user = { name: 'Bob', age: 25 };
        });
        
        expect(nameCallback).toHaveBeenCalled();
        expect(ageCallback).toHaveBeenCalled();
    });
});
```

---

### 2. observator-svelte: Proxy-Based Reactivity

**Priority: HIGH** - Main feature for granular reactivity.

**Files to modify:**
- `packages/observator-svelte/src/lib/store.svelte.ts`
- `packages/observator-svelte/src/lib/store.svelte.test.ts`
- `packages/observator-svelte/src/lib/index.ts`

**Design Reference:** See [`plans/svelte-proxy-reactivity-design.md`](svelte-proxy-reactivity-design.md) for detailed design.

**Key Implementation Points:**

1. **FieldProxyHandler**: Wraps object/array fields, creates keyed subscriptions on property access
2. **PropertyProxyHandler**: Wraps nested objects, reuses parent keyed subscription
3. **Proxy caching**: Cache proxies by field/key to maintain object identity
4. **Built-in property handling**: Pass through `length`, `constructor`, `prototype`, symbols
5. **Null/undefined handling**: Return undefined but create subscription (reactivity for new keys)

**API Change:**
- Remove the explicit `store.keyed` API (no users yet, no deprecation needed)
- Replace with transparent Proxy-based property access

---

## Decisions (Confirmed)

### Decision 1: Version bump strategy

**Decision: Option A - Minor version bump (0.1.2 → 0.2.0)**

Field replacement fix is a behavior change that could theoretically affect existing code.

### Decision 2: Dead code

**Decision: Keep as is**

Don't remove dead code (`specificListeners`, `collectPatchesForSpecificListeners`, `topLevel`) - may be used in future

---

## Summary of Concrete Actions

| # | Task | Package | Files | Complexity |
|---|------|---------|-------|------------|
| 1 | Field replacement keyed events | observator | index.ts, test | Medium |
| 2 | Proxy-based reactivity | observator-svelte | store.svelte.ts, test | High |

**Implementation order:** 1 → 2

**Version:** 0.2.0 (minor bump)

Ready to switch to code mode for implementation?
