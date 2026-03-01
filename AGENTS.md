# AGENTS.md

This document provides guidance for AI agents working on the `observator` project.

## Project Overview

**observator** is a TypeScript library that provides a type-safe observable store. It uses:
- [patch-recorder](https://github.com/wighawag/patch-recorder) for mutable state updates and patch generation
- [radiate](https://github.com/wighawag/radiate) for type-safe event emission

The store emits events for each top-level field change with JSON Patch arrays, enabling fine-grained reactivity.

## Development Workflow

### 1. Write Failing Test First

Before implementing any feature or fix, write a failing test that demonstrates the expected behavior:

```typescript
// In packages/observator/test/index.test.ts
it('should do something new', () => {
  // Arrange
  const store = createObservableStore({ ... });
  
  // Act
  store.update((state) => { ... });
  
  // Assert
  expect(...).toBe(...);
});
```

### 2. Build

```bash
pnpm build
```

### 3. Test

```bash
pnpm test
```

### 4. Iterate

Repeat until tests pass and the feature is complete.

## File Structure

```
packages/observator/
├── src/
│   ├── index.ts       # Main implementation (ObservableStore class)
│   └── types.ts       # Type utilities (EventName, Patches, etc.)
└── test/
    └── index.test.ts  # Comprehensive test suite
```

## Key Commands

- `pnpm build` - Build the project
- `pnpm test` - Run tests
- `pnpm dev` - Watch mode for development
- `pnpm format` - Format code with Prettier

## Important Notes

- Always maintain type safety with generic type `T`
- Test with both objects and arrays
- Test keyed events and value-based subscriptions
- Use `// @ts-expect-error` for testing type safety violations
