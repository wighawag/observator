# Plan: Enhance patch-recorder with oldValue for Array Length Changes

## Overview

Enhance `patch-recorder` to include `oldValue` in patches that modify array lengths. This enables consumers to detect array element removal without pre-snapshotting state.

## Problem Statement

When arrays are modified using `pop()`, `shift()`, `splice()`, or length assignment, `patch-recorder` generates a length change patch for efficiency:

```json
{
  "op": "replace",
  "path": ["items", "length"],
  "value": 2
}
```

Consumers cannot determine how many elements were removed without knowing the previous length.

## Solution

Add `oldValue` to replace patches for array length changes:

```json
{
  "op": "replace",
  "path": ["items", "length"],
  "value": 2,
  "oldValue": 5
}
```

## Implementation Steps

### Step 1: Update Patch Type Definition

Update the `Patch` type to include optional `oldValue`:

```typescript
type Patch = {
  op: 'add' | 'remove' | 'replace';
  path: PatchPath;
  value?: unknown;
  oldValue?: unknown;  // NEW: Previous value for replace operations
};
```

### Step 2: Capture Old Length in Array Proxy

When intercepting array length modifications in the proxy handler, capture the old length before applying the change:

```typescript
// In the set trap for array length
set(target, prop, value, receiver) {
  if (Array.isArray(target) && prop === 'length') {
    const oldLength = target.length;
    const result = Reflect.set(target, prop, value, receiver);
    
    if (value !== oldLength) {
      patches.push({
        op: 'replace',
        path: [...currentPath, 'length'],
        value: value,
        oldValue: oldLength  // Include old length
      });
    }
    
    return result;
  }
  // ... rest of handler
}
```

### Step 3: Handle Array Methods

Ensure array methods that affect length are properly tracked:

- `push()` - Increases length
- `pop()` - Decreases length
- `shift()` - Decreases length  
- `unshift()` - Increases length
- `splice()` - May increase or decrease length
- Direct length assignment

### Step 4: Update Tests

Add tests for the new `oldValue` property:

```typescript
it('should include oldValue in length change patches for pop', () => {
  const state = { items: [1, 2, 3] };
  const patches = recordPatches(state, (s) => {
    s.items.pop();
  });
  
  const lengthPatch = patches.find(p => 
    p.path.includes('length') && p.op === 'replace'
  );
  
  expect(lengthPatch).toBeDefined();
  expect(lengthPatch.value).toBe(2);
  expect(lengthPatch.oldValue).toBe(3);
});

it('should include oldValue in length change patches for push', () => {
  const state = { items: [1, 2] };
  const patches = recordPatches(state, (s) => {
    s.items.push(3, 4);
  });
  
  const lengthPatch = patches.find(p => 
    p.path.includes('length') && p.op === 'replace'
  );
  
  expect(lengthPatch).toBeDefined();
  expect(lengthPatch.value).toBe(4);
  expect(lengthPatch.oldValue).toBe(2);
});
```

### Step 5: Update Documentation

Update README to document the `oldValue` property:

- Explain when it's included
- Show example patches with `oldValue`
- Note compatibility with JSON Patch RFC 6902 (this is an extension)

## Considerations

### Performance

- Minimal overhead: Just capturing the length value before modification
- No additional memory allocation beyond the patch object property

### Scope

For this enhancement, focus on array `length` changes only. Consider expanding to other `replace` operations in a future enhancement if needed.

## Testing Checklist

- [ ] `pop()` generates correct oldValue
- [ ] `shift()` generates correct oldValue
- [ ] `push()` generates correct oldValue
- [ ] `unshift()` generates correct oldValue
- [ ] `splice()` generates correct oldValue
- [ ] Direct length assignment generates correct oldValue
- [ ] Multiple operations in single update work correctly
- [ ] Nested arrays work correctly
- [ ] Empty array operations work correctly

## Success Criteria

1. All array length change patches include `oldValue`
2. All existing tests still pass
3. New tests verify `oldValue` behavior
4. Documentation updated
