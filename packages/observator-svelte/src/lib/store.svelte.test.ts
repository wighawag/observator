import { describe, it, expect, vi } from 'vitest';
import { createObservableStore } from 'observator';
import { useSvelteReactivity } from './store.svelte.js';

describe('useSvelteReactivity', () => {
	describe('basic usage', () => {
		it('should wrap an ObservableStore with reactive getters', () => {
			const observableStore = createObservableStore({
				count: 0,
				user: { name: 'John', age: 30 }
			});
			const store = useSvelteReactivity(observableStore);

			expect(store.getRaw('count')).toBe(0);
			expect(store.getRaw('user')).toEqual({ name: 'John', age: 30 });
		});

		it('should have field getters', () => {
			const observableStore = createObservableStore({
				count: 0,
				user: { name: 'John', age: 30 }
			});
			const store = useSvelteReactivity(observableStore);

			// Field getters exist
			expect(store.count).toBe(0);
			expect(store.user).toEqual({ name: 'John', age: 30 });
		});

		it('should expose the original ObservableStore via raw', () => {
			const observableStore = createObservableStore({
				count: 0
			});
			const store = useSvelteReactivity(observableStore);

			expect(store.raw).toBe(observableStore);
		});
	});

	describe('update', () => {
		it('should update state and return patches', () => {
			const observableStore = createObservableStore({
				count: 0,
				user: { name: 'John', age: 30 }
			});
			const store = useSvelteReactivity(observableStore);

			const patches = store.update((state) => {
				state.count = 1;
			});

			expect(store.getRaw('count')).toBe(1);
			expect(patches).toBeDefined();
			expect(patches.length).toBeGreaterThan(0);
		});

		it('should update multiple fields in one call', () => {
			const observableStore = createObservableStore({
				count: 0,
				user: { name: 'John', age: 30 }
			});
			const store = useSvelteReactivity(observableStore);

			const patches = store.update((state) => {
				state.count = 1;
				state.user.name = 'Jane';
			});

			expect(store.getRaw('count')).toBe(1);
			expect(store.getRaw('user').name).toBe('Jane');
			expect(patches.length).toBeGreaterThan(0);
		});

		it('should update the original ObservableStore', () => {
			const observableStore = createObservableStore({
				count: 0
			});
			const store = useSvelteReactivity(observableStore);

			store.update((state) => {
				state.count = 5;
			});

			// Both the reactive store and original store should have the update
			expect(store.count).toBe(5);
			expect(observableStore.get('count')).toBe(5);
		});
	});

	describe('getState', () => {
		it('should return the entire state', () => {
			const observableStore = createObservableStore({
				count: 0,
				user: { name: 'John', age: 30 }
			});
			const store = useSvelteReactivity(observableStore);

			const state = store.getState();
			expect(state).toEqual({
				count: 0,
				user: { name: 'John', age: 30 }
			});
		});

		it('should return updated state after mutation', () => {
			const observableStore = createObservableStore({
				count: 0,
				user: { name: 'John', age: 30 }
			});
			const store = useSvelteReactivity(observableStore);

			store.update((state) => {
				state.count = 5;
			});

			const state = store.getState();
			expect(state.count).toBe(5);
		});
	});

	describe('raw ObservableStore access', () => {
		it('should allow subscribing via raw store', () => {
			const observableStore = createObservableStore({
				count: 0
			});
			const store = useSvelteReactivity(observableStore);

			const callback = vi.fn();
			store.raw.on('count:updated', callback);

			store.update((state) => {
				state.count = 1;
			});

			expect(callback).toHaveBeenCalled();
		});

		it('should allow updating via original ObservableStore', () => {
			const observableStore = createObservableStore({
				count: 0
			});
			const store = useSvelteReactivity(observableStore);

			// Update via the original store
			observableStore.update((state) => {
				state.count = 10;
			});

			// Reactive store should reflect the change
			expect(store.count).toBe(10);
		});
	});

	describe('proxy-based property access', () => {
		it('should access Record field properties directly', () => {
			const observableStore = createObservableStore({
				users: {
					alice: { name: 'Alice', online: true },
					bob: { name: 'Bob', online: false }
				} as Record<string, { name: string; online: boolean }>
			});
			const store = useSvelteReactivity(observableStore);

			// Direct property access via proxy
			expect(store.users.alice).toEqual({ name: 'Alice', online: true });
			expect(store.users.bob).toEqual({ name: 'Bob', online: false });
			expect(store.users.unknown).toBeUndefined();
		});

		it('should access Array field elements directly', () => {
			const observableStore = createObservableStore({
				items: ['a', 'b', 'c']
			});
			const store = useSvelteReactivity(observableStore);

			// Direct index access via proxy
			expect(store.items[0]).toBe('a');
			expect(store.items[1]).toBe('b');
			expect(store.items[2]).toBe('c');
			expect(store.items[10]).toBeUndefined();
		});

		it('should access nested properties', () => {
			const observableStore = createObservableStore({
				user: {
					name: 'John',
					address: { city: 'NYC', zip: '10001' }
				}
			});
			const store = useSvelteReactivity(observableStore);

			// Nested property access
			expect(store.user.name).toBe('John');
			expect(store.user.address.city).toBe('NYC');
			expect(store.user.address.zip).toBe('10001');
		});

		it('should return updated values after mutation', () => {
			const observableStore = createObservableStore({
				users: {
					alice: { name: 'Alice', online: true }
				} as Record<string, { name: string; online: boolean }>
			});
			const store = useSvelteReactivity(observableStore);

			store.update((state) => {
				state.users.alice.online = false;
			});

			expect(store.users.alice?.online).toBe(false);
		});

		it('should maintain proxy identity for field access', () => {
			const observableStore = createObservableStore({
				users: {
					alice: { name: 'Alice' }
				} as Record<string, { name: string }>
			});
			const store = useSvelteReactivity(observableStore);

			// Same proxy instance should be returned
			const users1 = store.users;
			const users2 = store.users;
			expect(users1).toBe(users2);
		});

		it('should pass through array length property', () => {
			const observableStore = createObservableStore({
				items: ['a', 'b', 'c']
			});
			const store = useSvelteReactivity(observableStore);

			expect(store.items.length).toBe(3);
		});

		it('should allow iteration with for...of', () => {
			const observableStore = createObservableStore({
				items: ['a', 'b', 'c']
			});
			const store = useSvelteReactivity(observableStore);

			const result: string[] = [];
			for (const item of store.items) {
				result.push(item);
			}
			expect(result).toEqual(['a', 'b', 'c']);
		});

		it('should allow array methods like map', () => {
			const observableStore = createObservableStore({
				items: [1, 2, 3]
			});
			const store = useSvelteReactivity(observableStore);

			const doubled = store.items.map((x: number) => x * 2);
			expect(doubled).toEqual([2, 4, 6]);
		});

		it('should allow Object.keys on proxied objects', () => {
			const observableStore = createObservableStore({
				users: {
					alice: { name: 'Alice' },
					bob: { name: 'Bob' }
				} as Record<string, { name: string }>
			});
			const store = useSvelteReactivity(observableStore);

			const keys = Object.keys(store.users);
			expect(keys).toContain('alice');
			expect(keys).toContain('bob');
		});

		it('should handle undefined nested values gracefully', () => {
			const observableStore = createObservableStore({
				users: {} as Record<string, { name: string }>
			});
			const store = useSvelteReactivity(observableStore);

			// Accessing non-existent key returns undefined
			expect(store.users.unknown).toBeUndefined();
		});

		it('should handle newly added keys after update', () => {
			const observableStore = createObservableStore({
				users: {} as Record<string, { name: string }>
			});
			const store = useSvelteReactivity(observableStore);

			// Initially undefined
			expect(store.users.alice).toBeUndefined();

			// Add the key
			store.update((state) => {
				state.users.alice = { name: 'Alice' };
			});

			// Now should have the value
			expect(store.users.alice?.name).toBe('Alice');
		});
	});

	describe('type safety', () => {
		it('should maintain type safety for field access', () => {
			type State = {
				count: number;
				user: { name: string; age: number };
				items: string[];
			};

			const observableStore = createObservableStore<State>({
				count: 0,
				user: { name: 'John', age: 30 },
				items: []
			});
			const store = useSvelteReactivity(observableStore);

			// These should compile
			const count: number = store.count;
			const user: { name: string; age: number } = store.user;
			const items: string[] = store.items;

			expect(count).toBe(0);
			expect(user.name).toBe('John');
			expect(items).toEqual([]);
		});

		it('should maintain type safety for nested access', () => {
			type State = {
				users: Record<string, { name: string }>;
				items: number[];
			};

			const observableStore = createObservableStore<State>({
				users: { john: { name: 'John' } },
				items: [1, 2, 3]
			});
			const store = useSvelteReactivity(observableStore);

			// Record property access
			const john = store.users.john;
			expect(john?.name).toBe('John');

			// Array index access
			const item = store.items[0];
			expect(item).toBe(1);
		});
	});
});
