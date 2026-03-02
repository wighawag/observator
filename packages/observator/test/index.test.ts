import {describe, it, expect, vi} from 'vitest';
import {createObservableStore} from '../src/index.js';
import {PatchPath} from '../src/types.js';

describe('ObservableStore', () => {
	describe('Basic functionality', () => {
		it('should create an emitter with initial state', () => {
			type State = {
				count: {value: number};
				name: {value: string};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
				name: {value: 'test'},
			});

			expect(store.get('count')).toEqual({value: 0});
			expect(store.get('name')).toEqual({value: 'test'});
		});

		it('should get entire state', () => {
			type State = {
				count: {value: number};
				name: {value: string};
			};

			const store = createObservableStore<State>({
				count: {value: 42},
				name: {value: 'test'},
			});

			const state = store.getState();
			expect(state).toEqual({count: {value: 42}, name: {value: 'test'}});
			expect(state).not.toBe(store.getState()); // Should be a shallow copy
		});
	});

	describe('Update functionality', () => {
		it('should update a field and emit event', () => {
			type State = {
				count: number;
				name: string;
			};

			const store = createObservableStore<State>({
				count: 0,
				name: 'test',
			});

			const callback = vi.fn();
			store.on('count:updated', callback);

			store.update((state) => {
				state.count += 1;
			});

			expect(store.get('count')).toEqual(1);
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith([
				{
					op: 'replace',
					path: ['count'],
					value: 1,
				},
			]);
		});

		it('should update nested objects', () => {
			type State = {
				user: {
					name: string;
					age: number;
				};
			};

			const store = createObservableStore<State>({
				user: {name: 'John', age: 30},
			});

			const callback = vi.fn();
			store.on('user:updated', callback);

			store.update((state) => {
				state.user.name = 'Jane';
				state.user.age = 31;
			});

			expect(store.get('user')).toEqual({name: 'Jane', age: 31});
			expect(callback).toHaveBeenCalledTimes(1);
			const patches = callback.mock.calls[0][0];
			expect(patches).toHaveLength(2);
			expect(patches[0]).toEqual({
				op: 'replace',
				path: ['user', 'name'],
				value: 'Jane',
			});
			expect(patches[1]).toEqual({
				op: 'replace',
				path: ['user', 'age'],
				value: 31,
			});
		});

		it('should update arrays', () => {
			type State = {
				items: number[];
			};

			const store = createObservableStore<State>({
				items: [1, 2, 3],
			});

			const callback = vi.fn();
			store.on('items:updated', callback);

			store.update((state) => {
				state.items.push(4);
			});

			expect(store.get('items')).toEqual([1, 2, 3, 4]);
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should handle multiple updates to same field', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback = vi.fn();
			store.on('count:updated', callback);

			store.update((state) => {
				state.count.value += 1;
			});
			store.update((state) => {
				state.count.value += 1;
			});

			expect(store.get('count')).toEqual({value: 2});
			expect(callback).toHaveBeenCalledTimes(2);
		});

		it('should handle updates to different fields independently', () => {
			type State = {
				count: {value: number};
				name: {value: string};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
				name: {value: 'test'},
			});

			const countCallback = vi.fn();
			const nameCallback = vi.fn();

			store.on('count:updated', countCallback);
			store.on('name:updated', nameCallback);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(countCallback).toHaveBeenCalledTimes(1);
			expect(nameCallback).toHaveBeenCalledTimes(0);

			store.update((state) => {
				state.name.value = 'updated';
			});

			expect(countCallback).toHaveBeenCalledTimes(1);
			expect(nameCallback).toHaveBeenCalledTimes(1);
		});

		it('should update multiple fields in single update call', () => {
			type State = {
				count: {value: number};
				name: {value: string};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
				name: {value: 'test'},
			});

			const countCallback = vi.fn();
			const nameCallback = vi.fn();

			store.on('count:updated', countCallback);
			store.on('name:updated', nameCallback);

			store.update((state) => {
				state.count.value += 1;
				state.name.value = 'updated';
			});

			expect(store.get('count')).toEqual({value: 1});
			expect(store.get('name')).toEqual({value: 'updated'});
			expect(countCallback).toHaveBeenCalledTimes(1);
			expect(nameCallback).toHaveBeenCalledTimes(1);
		});
	});

	describe('Event subscription', () => {
		it('should allow multiple subscribers to same event', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback1 = vi.fn();
			const callback2 = vi.fn();

			store.on('count:updated', callback1);
			store.on('count:updated', callback2);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(1);
		});

		it('should allow unsubscribing from events', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback = vi.fn();
			const unsubscribe = store.on('count:updated', callback);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback).toHaveBeenCalledTimes(1);

			unsubscribe();

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should allow unsubscribing specific listener using off', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback1 = vi.fn();
			const callback2 = vi.fn();

			store.on('count:updated', callback1);
			store.on('count:updated', callback2);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(1);

			store.off('count:updated', callback1);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback1).toHaveBeenCalledTimes(1); // Unsubscribed
			expect(callback2).toHaveBeenCalledTimes(2); // Still listening
		});

		it('should support once for single emission', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback = vi.fn();
			store.once('count:updated', callback);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback).toHaveBeenCalledTimes(1);

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback).toHaveBeenCalledTimes(1); // Still only once
		});

		it('should allow unsubscribing once listener before it fires', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback = vi.fn();
			const unsubscribe = store.once('count:updated', callback);

			unsubscribe();

			store.update((state) => {
				state.count.value += 1;
			});

			expect(callback).toHaveBeenCalledTimes(0);
		});

		it('should allow subscriber to subscribe to multiple events', () => {
			type State = {
				count: {value: number};
				name: {value: string};
				flag: {value: boolean};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
				name: {value: 'test'},
				flag: {value: false},
			});

			const allCallback = vi.fn();

			store.on('count:updated', allCallback);
			store.on('name:updated', allCallback);
			store.on('flag:updated', allCallback);

			store.update((state) => {
				state.count.value += 1;
			});
			store.update((state) => {
				state.name.value = 'updated';
			});
			store.update((state) => {
				state.flag.value = true;
			});

			expect(allCallback).toHaveBeenCalledTimes(3);
		});
	});

	describe('Type safety', () => {
		it('should only accept valid event names in on', () => {
			type State = {
				count: {value: number};
				name: {value: string};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
				name: {value: 'test'},
			});

			// @ts-expect-error - Invalid event name
			store.on('invalid:updated', (patches) => {
				// This should cause a type error
			});
		});

		it('should provide correct types in callbacks', () => {
			type State = {
				user: {
					name: string;
					age: number;
				};
			};

			const store = createObservableStore<State>({
				user: {name: 'John', age: 30},
			});

			store.on('user:updated', (patches) => {
				// patches should be of type Patches<true>
				expect(Array.isArray(patches)).toBe(true);
			});
		});

		it('should prevent primitive types at top level', () => {
			// @ts-expect-error - Primitive type not allowed
			const store = createObservableStore<number>(0);
		});
	});

	describe('Edge cases', () => {
		it('should handle no changes gracefully', () => {
			type State = {
				count: {value: number};
			};

			const store = createObservableStore<State>({
				count: {value: 0},
			});

			const callback = vi.fn();
			store.on('count:updated', callback);

			store.update((state) => {
				// No changes
			});

			// patch-recorder will still emit patches even if no changes occurred
			// but patches array should be empty
			expect(store.get('count')).toEqual({value: 0});
		});

		it('should handle complex nested structures', () => {
			type State = {
				data: {
					users: {
						byId: Record<string, {name: string; email: string}>;
						ids: string[];
					};
				};
			};

			const store = createObservableStore<State>({
				data: {
					users: {
						byId: {
							'1': {name: 'John', email: 'john@example.com'},
						},
						ids: ['1'],
					},
				},
			});

			const callback = vi.fn();
			store.on('data:updated', callback);

			store.update((state) => {
				state.data.users.byId['2'] = {name: 'Jane', email: 'jane@example.com'};
				state.data.users.ids.push('2');
			});

			expect(store.get('data').users.ids).toHaveLength(2);
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should handle removing properties', () => {
			type State = {
				items: Record<string, number>;
			};

			const store = createObservableStore<State>({
				items: {a: 1, b: 2, c: 3},
			});

			const callback = vi.fn();
			store.on('items:updated', callback);

			store.update((state) => {
				delete state.items.b;
			});

			expect(store.get('items')).toEqual({a: 1, c: 3});
			expect(callback).toHaveBeenCalledTimes(1);
			const patches = callback.mock.calls[0][0];
			expect(
				patches.some(
					(p: {op: string; path?: PatchPath}) =>
						p.op === 'remove' && p.path?.[0] === 'items' && p.path?.[1] === 'b',
				),
			).toBe(true);
		});

		describe('Keyed events', () => {
			it('should subscribe to specific key changes', () => {
				type State = {
					users: Record<string, {name: string; email: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John', email: 'john@example.com'},
						'user-2': {name: 'Jane', email: 'jane@example.com'},
					},
				});

				const callback = vi.fn();
				store.onKey('users:updated', 'user-1', callback);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches).toEqual([
					{
						op: 'replace',
						path: ['users', 'user-1', 'name'],
						value: 'Johnny',
					},
				]);
			});

			it('should not trigger keyed callback for different keys', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
						'user-2': {name: 'Jane'},
					},
				});

				const callback = vi.fn();
				store.onKey('users:updated', 'user-1', callback);

				store.update((state) => {
					state.users['user-2'].name = 'Janet';
				});

				expect(callback).toHaveBeenCalledTimes(0);
			});

			it('should support wildcard subscription to all keys', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
						'user-2': {name: 'Jane'},
					},
				});

				const callback = vi.fn();
				store.onKey('users:updated', '*', (key, patches) => {
					callback(key, patches);
				});

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				store.update((state) => {
					state.users['user-2'].name = 'Janet';
				});

				expect(callback).toHaveBeenCalledTimes(2);
				expect(callback).toHaveBeenNthCalledWith(1, 'user-1', expect.any(Array));
				expect(callback).toHaveBeenNthCalledWith(2, 'user-2', expect.any(Array));
			});

			it('should allow multiple subscribers to same key', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const callback1 = vi.fn();
				const callback2 = vi.fn();

				store.onKey('users:updated', 'user-1', callback1);
				store.onKey('users:updated', 'user-1', callback2);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(callback1).toHaveBeenCalledTimes(1);
				expect(callback2).toHaveBeenCalledTimes(1);
			});

			it('should allow unsubscribing from keyed events', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const callback = vi.fn();
				const unsubscribe = store.onKey('users:updated', 'user-1', callback);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(callback).toHaveBeenCalledTimes(1);

				unsubscribe();

				store.update((state) => {
					state.users['user-1'].name = 'John';
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should support onceKey for single emission', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const callback = vi.fn();
				store.onceKey('users:updated', 'user-1', callback);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(callback).toHaveBeenCalledTimes(1);

				store.update((state) => {
					state.users['user-1'].name = 'John';
				});

				expect(callback).toHaveBeenCalledTimes(1); // Still only once
			});

			it('should support onceKey with wildcard', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
						'user-2': {name: 'Jane'},
					},
				});

				const callback = vi.fn();
				store.onceKey('users:updated', '*', (key, patches) => {
					callback(key, patches);
				});

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				store.update((state) => {
					state.users['user-2'].name = 'Janet';
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should support offKey for specific listener removal', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const callback1 = vi.fn();
				const callback2 = vi.fn();

				store.onKey('users:updated', 'user-1', callback1);
				store.onKey('users:updated', 'user-1', callback2);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(callback1).toHaveBeenCalledTimes(1);
				expect(callback2).toHaveBeenCalledTimes(1);

				store.offKey('users:updated', 'user-1', callback1);

				store.update((state) => {
					state.users['user-1'].name = 'John';
				});

				expect(callback1).toHaveBeenCalledTimes(1); // Unsubscribed
				expect(callback2).toHaveBeenCalledTimes(2); // Still listening
			});

			it('should work with array fields (with getItemId)', () => {
				type State = {
					todos: Array<{id: number; text: string; done: boolean}>;
				};

				const store = createObservableStore<State>(
					{
						todos: [
							{id: 1, text: 'Task 1', done: false},
							{id: 2, text: 'Task 2', done: false},
						],
					},
					{getItemId: {todos: (item) => item.id}},
				);

				const callback = vi.fn();
				// Now subscribe using item ID instead of index
				store.onItemId('todos:updated', 1, callback);

				store.update((state) => {
					state.todos[0].done = true;
				});

				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				// Verify the patches include the expected operation
				expect(patches.length).toBe(1);
				expect(patches[0]).toMatchObject({
					op: 'replace',
					path: ['todos', 0, 'done'],
					value: true,
					id: 1, // patch.id is now included
				});
			});

			it('should not emit keyed events when there are no keyed listeners', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				// No keyed listeners, only regular listener
				const regularCallback = vi.fn();
				store.on('users:updated', regularCallback);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(regularCallback).toHaveBeenCalledTimes(1);
				// Should not have any performance overhead from keyed events
			});

			it('should emit keyed events only when keyed listeners exist', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const regularCallback = vi.fn();
				store.on('users:updated', regularCallback);

				// First update without keyed listeners
				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				expect(regularCallback).toHaveBeenCalledTimes(1);

				// Add keyed listener
				const keyedCallback = vi.fn();
				store.onKey('users:updated', 'user-1', keyedCallback);

				// Second update with keyed listeners
				store.update((state) => {
					state.users['user-1'].name = 'John';
				});

				expect(regularCallback).toHaveBeenCalledTimes(2);
				expect(keyedCallback).toHaveBeenCalledTimes(1);
			});

			it('should handle empty patches gracefully', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const callback = vi.fn();
				store.onKey('users:updated', 'user-1', callback);

				store.update((state) => {
					// No changes
				});

				// Empty patches should not trigger keyed events
				expect(callback).toHaveBeenCalledTimes(0);
			});

			it('should handle patches with no path elements', () => {
				type State = {
					data: Record<string, number>;
				};

				const store = createObservableStore<State>({
					data: {a: 1, b: 2},
				});

				const callback = vi.fn();
				store.onKey('data:updated', 'any-key', callback);

				// If patches have no path, no keyed events should be emitted
				store.update((state) => {
					// should generate patches with path
					Object.assign(state, {a: 9});
				});

				// This should still emit regular events
				const regularCallback = vi.fn();
				store.on('data:updated', regularCallback);
				store.update((state) => {
					state.data.a = 2;
				});
				expect(regularCallback).toHaveBeenCalled();
			});

			it('should handle Object.assign on nested objects', () => {
				type State = {
					user: {name: string; age: number};
				};

				const store = createObservableStore<State>({
					user: {name: 'John', age: 30},
				});

				const callback = vi.fn();
				store.on('user:updated', callback);

				store.update((state) => {
					Object.assign(state.user, {name: 'Jane', age: 31});
				});
				// The state should be updated correctly
				expect(store.get('user')).toEqual({name: 'Jane', age: 31});
				expect(callback).toHaveBeenCalled();
			});

			it('should handle Object.assign on top level', () => {
				type State = {
					user: {name: string; age: number};
				};

				const store = createObservableStore<State>({
					user: {name: 'John', age: 30},
				});

				const callback = vi.fn();
				store.on('user:updated', callback);

				store.update((state) => {
					Object.assign(state, {user: {name: 'Bob', age: 25}});
				});

				expect(store.get('user')).toEqual({name: 'Bob', age: 25});
				expect(callback).toHaveBeenCalled();
			});

			it('should emit one keyed event per unique key', () => {
				type State = {
					users: Record<string, {name: string; email: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John', email: 'john@example.com'},
						'user-2': {name: 'Jane', email: 'jane@example.com'},
					},
				});

				const callback1 = vi.fn();
				const callback2 = vi.fn();

				store.onKey('users:updated', 'user-1', callback1);
				store.onKey('users:updated', 'user-2', callback2);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
					state.users['user-1'].email = 'johnny@example.com';
					state.users['user-2'].name = 'Janet';
				});

				// Each keyed listener should fire once
				expect(callback1).toHaveBeenCalledTimes(1);
				expect(callback2).toHaveBeenCalledTimes(1);

				// Patches should contain all changes
				const patches1 = callback1.mock.calls[0][0];
				expect(patches1).toHaveLength(3); // 3 total patches
			});

			it('should maintain backward compatibility with regular events', () => {
				type State = {
					users: Record<string, {name: string}>;
				};

				const store = createObservableStore<State>({
					users: {
						'user-1': {name: 'John'},
					},
				});

				const regularCallback = vi.fn();
				store.on('users:updated', regularCallback);

				const keyedCallback = vi.fn();
				store.onKey('users:updated', 'user-1', keyedCallback);

				store.update((state) => {
					state.users['user-1'].name = 'Johnny';
				});

				// Both should receive events
				expect(regularCallback).toHaveBeenCalledTimes(1);
				expect(keyedCallback).toHaveBeenCalledTimes(1);
			});

			it('should work with numeric keys (converted to strings in patches)', () => {
				type State = {
					items: Record<number, {value: string}>;
				};

				const store = createObservableStore<State>({
					items: {
						1: {value: 'one'},
						2: {value: 'two'},
					},
				});

				const callback = vi.fn();
				// Note: patch-recorder converts numeric keys to strings in patch paths
				store.onKey('items:updated', '1', callback);

				store.update((state) => {
					state.items[1].value = 'ONE';
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			// TODO
			// symbol seems to be supported at runtime but not in the type system
			// Technically  support them though its type system does not seem to
			// it('should handle symbol keys', () => {
			// 	type State = {
			// 		items: Record<symbol, { value: string }>;
			// 	};

			// 	const key1 = Symbol('key1');
			// 	const key2 = Symbol('key2');

			// 	const store = createObservableStore<State>({
			// 		items: {
			// 			[key1]: { value: 'one' },
			// 			[key2]: { value: 'two' }
			// 		}
			// 	});

			// 	const callback = vi.fn();
			// 	store.onKeyed('items:updated', key1, callback);

			// 	store.update((state) => {
			// 		state[key1].value = 'ONE';
			// 	});

			// 	expect(callback).toHaveBeenCalledTimes(1);
			// });

			describe('field replacement with keyed listeners', () => {
				it('emits keyed events when field is replaced', () => {
					type State = {user: {name: string; age: number}};
					const store = createObservableStore<State>({
						user: {name: 'John', age: 30},
					});

					const callback = vi.fn();
					store.onKey('user:updated', 'name', callback);

					store.update((s) => {
						s.user = {name: 'Bob', age: 25}; // Full replacement
					});

					expect(callback).toHaveBeenCalledTimes(1);
					expect(callback).toHaveBeenCalledWith([
						{op: 'replace', path: ['user'], value: {name: 'Bob', age: 25}},
					]);
				});

				it('emits to multiple keyed listeners on field replacement', () => {
					type State = {user: {name: string; age: number}};
					const store = createObservableStore<State>({
						user: {name: 'John', age: 30},
					});

					const nameCallback = vi.fn();
					const ageCallback = vi.fn();
					store.onKey('user:updated', 'name', nameCallback);
					store.onKey('user:updated', 'age', ageCallback);

					store.update((s) => {
						s.user = {name: 'Bob', age: 25};
					});

					expect(nameCallback).toHaveBeenCalledTimes(1);
					expect(ageCallback).toHaveBeenCalledTimes(1);
				});

				it('emits keyed events for both replaced field and nested change in same update', () => {
					type State = {
						users: Record<string, {name: string}>;
						settings: {theme: string};
					};
					const store = createObservableStore<State>({
						users: {'user-1': {name: 'John'}},
						settings: {theme: 'dark'},
					});

					const usersCallback = vi.fn();
					const settingsCallback = vi.fn();
					store.onKey('users:updated', 'user-1', usersCallback);
					store.onKey('settings:updated', 'theme', settingsCallback);

					store.update((s) => {
						s.users = {'user-1': {name: 'Jane'}, 'user-2': {name: 'Bob'}}; // Full replacement
						s.settings.theme = 'light'; // Nested change
					});

					expect(usersCallback).toHaveBeenCalledTimes(1);
					expect(settingsCallback).toHaveBeenCalledTimes(1);
				});

				it('emits keyed events for Record field when replaced', () => {
					type State = {users: Record<string, {name: string}>};
					const store = createObservableStore<State>({
						users: {
							'user-1': {name: 'John'},
							'user-2': {name: 'Jane'},
						},
					});

					const callback1 = vi.fn();
					const callback2 = vi.fn();
					const callback3 = vi.fn();
					store.onKey('users:updated', 'user-1', callback1);
					store.onKey('users:updated', 'user-2', callback2);
					store.onKey('users:updated', 'user-3', callback3); // Not in original, but subscribed

					store.update((s) => {
						s.users = {'user-3': {name: 'Bob'}}; // Full replacement with different keys
					});

					// All registered keyed listeners should fire on full replacement
					expect(callback1).toHaveBeenCalledTimes(1);
					expect(callback2).toHaveBeenCalledTimes(1);
					expect(callback3).toHaveBeenCalledTimes(1);
				});

				it('throws when using onItemId for array field without getItemId (arrays without getItemId cannot use keyed events)', () => {
					type State = {todos: Array<{text: string; done: boolean}>};
					const store = createObservableStore<State>({
						todos: [
							{text: 'Task 1', done: false},
							{text: 'Task 2', done: false},
						],
					});

					// onItemId throws when getItemId is not configured
					expect(() => {
						store.onItemId('todos:updated', 0, vi.fn());
					}).toThrow("onItemId requires getItemId configuration for field 'todos'");
				});

				it('does not double-emit for keys that are both registered and in patches', () => {
					type State = {users: Record<string, {name: string}>};
					const store = createObservableStore<State>({
						users: {'user-1': {name: 'John'}},
					});

					const callback = vi.fn();
					store.onKey('users:updated', 'user-1', callback);

					// This update will replace the users field AND user-1 is a key in the patch
					// We use a Set for changedKeys, so it should only fire once
					store.update((s) => {
						s.users = {'user-1': {name: 'Bob'}};
					});

					expect(callback).toHaveBeenCalledTimes(1);
				});
			});
		});
	});

	describe('Subscribe API (value-based)', () => {
		it('should subscribe to a field and receive immediate callback', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			store.subscriptions.counter(callback);

			// Callback should be called immediately with current value
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith({value: 0});
		});

		it('should call callback on field update', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			store.subscriptions.counter(callback);

			// Reset after initial call
			callback.mockClear();

			// Update the field
			store.update((state) => {
				state.counter.value += 1;
			});

			// Callback should be called with new value
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith({value: 1});
		});

		it('should return unsubscribe function', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			const unsubscribe = store.subscriptions.counter(callback);

			expect(typeof unsubscribe).toBe('function');
		});

		it('should unsubscribe from field updates', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			const unsubscribe = store.subscriptions.counter(callback);

			// Reset after initial call
			callback.mockClear();

			// First update
			store.update((state) => {
				state.counter.value += 1;
			});
			expect(callback).toHaveBeenCalledTimes(1);

			// Unsubscribe
			unsubscribe();

			// Second update should not trigger callback
			store.update((state) => {
				state.counter.value += 1;
			});
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should allow multiple subscribers to same field', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback1 = vi.fn();
			const callback2 = vi.fn();

			store.subscriptions.counter(callback1);
			store.subscriptions.counter(callback2);

			// Reset after initial calls
			callback1.mockClear();
			callback2.mockClear();

			store.update((state) => {
				state.counter.value += 1;
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(1);
		});

		it('should handle multiple fields independently', () => {
			type State = {
				counter: {value: number};
				user: {name: string};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
				user: {name: 'John'},
			});

			const counterCallback = vi.fn();
			const userCallback = vi.fn();

			store.subscriptions.counter(counterCallback);
			store.subscriptions.user(userCallback);

			// Reset after initial calls
			counterCallback.mockClear();
			userCallback.mockClear();

			// Update counter
			store.update((state) => {
				state.counter.value += 1;
			});

			expect(counterCallback).toHaveBeenCalledTimes(1);
			expect(userCallback).toHaveBeenCalledTimes(0);

			// Update user
			store.update((state) => {
				state.user.name = 'Jane';
			});

			expect(counterCallback).toHaveBeenCalledTimes(1);
			expect(userCallback).toHaveBeenCalledTimes(1);
		});

		it('should receive updated value on each change', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			store.subscriptions.counter(callback);

			// Reset after initial call
			callback.mockClear();

			store.update((state) => {
				state.counter.value = 10;
			});
			expect(callback).toHaveBeenNthCalledWith(1, {value: 10});

			store.update((state) => {
				state.counter.value = 20;
			});
			expect(callback).toHaveBeenNthCalledWith(2, {value: 20});

			store.update((state) => {
				state.counter.value = 30;
			});
			expect(callback).toHaveBeenNthCalledWith(3, {value: 30});
		});

		it('should work with complex nested objects', () => {
			type State = {
				user: {
					name: string;
					age: number;
					address: {street: string; city: string};
				};
			};

			const store = createObservableStore<State>({
				user: {
					name: 'John',
					age: 30,
					address: {street: 'Main St', city: 'NYC'},
				},
			});

			const callback = vi.fn();
			store.subscriptions.user(callback);

			// Reset after initial call
			callback.mockClear();

			store.update((state) => {
				state.user.name = 'Jane';
				state.user.age = 31;
			});

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith({
				name: 'Jane',
				age: 31,
				address: {street: 'Main St', city: 'NYC'},
			});
		});

		it('should work with array fields', () => {
			type State = {
				todos: Array<{id: number; text: string; done: boolean}>;
			};

			const store = createObservableStore<State>({
				todos: [],
			});

			const callback = vi.fn();
			store.subscriptions.todos(callback);

			// Reset after initial call
			callback.mockClear();

			store.update((state) => {
				state.todos.push({id: 1, text: 'Task 1', done: false});
			});

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith([{id: 1, text: 'Task 1', done: false}]);
		});

		it('should provide readonly values', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			store.subscriptions.counter(callback);

			// Reset after initial call
			callback.mockClear();

			store.update((state) => {
				state.counter.value += 1;
			});

			// The callback receives the value, which should be readonly in practice
			// (enforced by TypeScript types)
			const receivedValue = callback.mock.calls[0][0];
			expect(receivedValue).toEqual({value: 1});
		});

		it('should handle unsubscribe during callback', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			const callback = vi.fn();
			let unsubscribe: (() => void) | null = null;

			const wrappedCallback = (value: {value: number}) => {
				callback(value);
				if (value.value === 1 && unsubscribe) {
					unsubscribe();
					unsubscribe = null;
				}
			};

			unsubscribe = store.subscriptions.counter(wrappedCallback);

			// Reset after initial call
			callback.mockClear();

			// First update - callback fires and unsubscribes
			store.update((state) => {
				state.counter.value = 1;
			});
			expect(callback).toHaveBeenCalledTimes(1);

			// Second update - callback should not fire (unsubscribed)
			store.update((state) => {
				state.counter.value = 2;
			});
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should handle rapid updates correctly', () => {
			type State = {
				counter: {value: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
			});

			// Record values as they are received (capturing snapshots at call time)
			const recordedValues: Array<{value: number}> = [];
			store.subscriptions.counter((v) => {
				recordedValues.push({...v});
			});

			// Skip the initial call (value: 0)
			recordedValues.length = 0;

			// Rapid updates
			for (let i = 1; i <= 10; i++) {
				store.update((state) => {
					state.counter.value = i;
				});
			}

			expect(recordedValues).toHaveLength(10);
			// Verify each value was received correctly
			for (let i = 1; i <= 10; i++) {
				expect(recordedValues[i - 1]).toEqual({value: i});
			}
		});

		it('should handle Record fields correctly', () => {
			type State = {
				users: Record<string, {name: string; email: string}>;
			};

			const store = createObservableStore<State>({
				users: {
					'user-1': {name: 'John', email: 'john@example.com'},
				},
			});

			const callback = vi.fn();
			store.subscriptions.users(callback);

			// Reset after initial call
			callback.mockClear();

			store.update((state) => {
				state.users['user-2'] = {name: 'Jane', email: 'jane@example.com'};
			});

			expect(callback).toHaveBeenCalledTimes(1);
			const result = callback.mock.calls[0][0];
			expect(result['user-1']).toEqual({name: 'John', email: 'john@example.com'});
			expect(result['user-2']).toEqual({name: 'Jane', email: 'jane@example.com'});
		});
	});

	describe('Subscribe API type safety', () => {
		it('should only accept valid field names in subscribe', () => {
			type State = {
				counter: {value: number};
				user: {name: string};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
				user: {name: 'John'},
			});

			// Type safety is enforced at compile time by TypeScript
			// Invalid field names will cause TypeScript errors
			// We can't test this at runtime without causing errors
			expect(store.subscriptions).toBeDefined();
		});

		it('should provide correct types in subscribe callbacks', () => {
			type State = {
				counter: {value: number};
				user: {name: string; age: number};
			};

			const store = createObservableStore<State>({
				counter: {value: 0},
				user: {name: 'John', age: 30},
			});

			store.subscriptions.counter((counter) => {
				// counter should be of type { value: number }
				expect(counter.value).toBeTypeOf('number');
			});

			store.subscriptions.user((user) => {
				// user should be of type { name: string; age: number }
				expect(user.name).toBeTypeOf('string');
				expect(user.age).toBeTypeOf('number');
			});
		});
	});

	describe('Keyed Subscriptions API (value-based)', () => {
		it('should subscribe to a keyed field and receive immediate callback', () => {
			type State = {
				users: Record<string, {name: string; email: string}>;
			};

			const store = createObservableStore<State>({
				users: {
					'user-1': {name: 'John', email: 'john@example.com'},
					'user-2': {name: 'Jane', email: 'jane@example.com'},
				},
			});

			const callback = vi.fn();
			store.keySubscriptions.users('user-1')(callback);

			// Callback should be called immediately with current value
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith({
				'user-1': {name: 'John', email: 'john@example.com'},
				'user-2': {name: 'Jane', email: 'jane@example.com'},
			});
		});

		it('should call callback when specific key is updated', () => {
			type State = {
				users: Record<string, {name: string; email: string}>;
			};

			const store = createObservableStore<State>({
				users: {
					'user-1': {name: 'John', email: 'john@example.com'},
				},
			});

			const callback = vi.fn();
			store.keySubscriptions.users('user-1')(callback);

			// Reset after initial call
			callback.mockClear();

			// Update the key we're subscribed to
			store.update((state) => {
				state.users['user-1'].name = 'Johnny';
			});

			// Callback should be called with new value
			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith({
				'user-1': {name: 'Johnny', email: 'john@example.com'},
			});
		});

		it('should not call callback when different key is updated', () => {
			type State = {
				users: Record<string, {name: string}>;
			};

			const store = createObservableStore<State>({
				users: {
					'user-1': {name: 'John'},
					'user-2': {name: 'Jane'},
				},
			});

			const callback = vi.fn();
			store.keySubscriptions.users('user-1')(callback);

			// Reset after initial call
			callback.mockClear();

			// Update a different key
			store.update((state) => {
				state.users['user-2'].name = 'Janet';
			});

			// Callback should not be called
			expect(callback).toHaveBeenCalledTimes(0);
		});

		it('should return unsubscribe function', () => {
			type State = {
				users: Record<string, {name: string}>;
			};

			const store = createObservableStore<State>({
				users: {'user-1': {name: 'John'}},
			});

			const callback = vi.fn();
			const unsubscribe = store.keySubscriptions.users('user-1')(callback);

			expect(typeof unsubscribe).toBe('function');
		});

		it('should unsubscribe from keyed field updates', () => {
			type State = {
				users: Record<string, {name: string}>;
			};

			const store = createObservableStore<State>({
				users: {'user-1': {name: 'John'}},
			});

			const callback = vi.fn();
			const unsubscribe = store.keySubscriptions.users('user-1')(callback);

			// Reset after initial call
			callback.mockClear();

			// First update
			store.update((state) => {
				state.users['user-1'].name = 'Johnny';
			});
			expect(callback).toHaveBeenCalledTimes(1);

			// Unsubscribe
			unsubscribe();

			// Second update should not trigger callback
			store.update((state) => {
				state.users['user-1'].name = 'John';
			});
			expect(callback).toHaveBeenCalledTimes(1);
		});

		it('should allow multiple subscribers to same key', () => {
			type State = {
				users: Record<string, {name: string}>;
			};

			const store = createObservableStore<State>({
				users: {'user-1': {name: 'John'}},
			});

			const callback1 = vi.fn();
			const callback2 = vi.fn();

			store.keySubscriptions.users('user-1')(callback1);
			store.keySubscriptions.users('user-1')(callback2);

			// Reset after initial calls
			callback1.mockClear();
			callback2.mockClear();

			store.update((state) => {
				state.users['user-1'].name = 'Johnny';
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(1);
		});

		it('should work with array fields using item IDs (with getItemId)', () => {
			type State = {
				todos: Array<{id: number; text: string; done: boolean}>;
			};

			const store = createObservableStore<State>(
				{
					todos: [
						{id: 1, text: 'Task 1', done: false},
						{id: 2, text: 'Task 2', done: false},
					],
				},
				{getItemId: {todos: (item) => item.id}},
			);

			const callback = vi.fn();
			// Now use item ID instead of index
			store.itemIdSubscriptions.todos(1)(callback);

			// Reset after initial call
			callback.mockClear();

			// Update first todo (id: 1)
			store.update((state) => {
				state.todos[0].done = true;
			});

			expect(callback).toHaveBeenCalledTimes(1);
			expect(callback).toHaveBeenCalledWith([
				{id: 1, text: 'Task 1', done: true},
				{id: 2, text: 'Task 2', done: false},
			]);
		});

		it('should handle updates to multiple keys independently', () => {
			type State = {
				users: Record<string, {name: string}>;
			};

			const store = createObservableStore<State>({
				users: {
					'user-1': {name: 'John'},
					'user-2': {name: 'Jane'},
				},
			});

			const callback1 = vi.fn();
			const callback2 = vi.fn();

			store.keySubscriptions.users('user-1')(callback1);
			store.keySubscriptions.users('user-2')(callback2);

			// Reset after initial calls
			callback1.mockClear();
			callback2.mockClear();

			// Update user-1
			store.update((state) => {
				state.users['user-1'].name = 'Johnny';
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(0);

			// Update user-2
			store.update((state) => {
				state.users['user-2'].name = 'Janet';
			});

			expect(callback1).toHaveBeenCalledTimes(1);
			expect(callback2).toHaveBeenCalledTimes(1);
		});

		it('should provide readonly values', () => {
			type State = {
				users: Record<string, {name: string}>;
			};

			const store = createObservableStore<State>({
				users: {'user-1': {name: 'John'}},
			});

			const callback = vi.fn();
			store.keySubscriptions.users('user-1')(callback);

			// Reset after initial call
			callback.mockClear();

			store.update((state) => {
				state.users['user-1'].name = 'Johnny';
			});

			// The callback receives the value, which should be readonly in practice
			const receivedValue = callback.mock.calls[0][0];
			expect(receivedValue).toEqual({'user-1': {name: 'Johnny'}});
		});

		describe('Wildcard event "*"', () => {
			it('should subscribe to all updates with wildcard event', () => {
				type State = {
					count: {value: number};
					name: {value: string};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
					name: {value: 'test'},
				});

				const callback = vi.fn();
				store.on('*', callback);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches).toEqual([
					{
						op: 'replace',
						path: ['count', 'value'],
						value: 1,
					},
				]);
			});

			it('should receive all patches from multiple field updates', () => {
				type State = {
					count: {value: number};
					name: {value: string};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
					name: {value: 'test'},
				});

				const callback = vi.fn();
				store.on('*', callback);

				store.update((state) => {
					state.count.value += 1;
					state.name.value = 'updated';
				});

				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches).toHaveLength(2);
				expect(patches[0]).toEqual({
					op: 'replace',
					path: ['count', 'value'],
					value: 1,
				});
				expect(patches[1]).toEqual({
					op: 'replace',
					path: ['name', 'value'],
					value: 'updated',
				});
			});

			it('should allow multiple wildcard subscribers', () => {
				type State = {
					count: {value: number};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
				});

				const callback1 = vi.fn();
				const callback2 = vi.fn();

				store.on('*', callback1);
				store.on('*', callback2);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback1).toHaveBeenCalledTimes(1);
				expect(callback2).toHaveBeenCalledTimes(1);
			});

			it('should allow unsubscribing from wildcard event', () => {
				type State = {
					count: {value: number};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
				});

				const callback = vi.fn();
				const unsubscribe = store.on('*', callback);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback).toHaveBeenCalledTimes(1);

				unsubscribe();

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should support once for wildcard event', () => {
				type State = {
					count: {value: number};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
				});

				const callback = vi.fn();
				store.once('*', callback);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback).toHaveBeenCalledTimes(1);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback).toHaveBeenCalledTimes(1); // Still only once
			});

			it('should support off for wildcard event', () => {
				type State = {
					count: {value: number};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
				});

				const callback1 = vi.fn();
				const callback2 = vi.fn();

				store.on('*', callback1);
				store.on('*', callback2);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback1).toHaveBeenCalledTimes(1);
				expect(callback2).toHaveBeenCalledTimes(1);

				store.off('*', callback1);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback1).toHaveBeenCalledTimes(1); // Unsubscribed
				expect(callback2).toHaveBeenCalledTimes(2); // Still listening
			});

			it('should allow unsubscribing once listener before it fires', () => {
				type State = {
					count: {value: number};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
				});

				const callback = vi.fn();
				const unsubscribe = store.once('*', callback);

				unsubscribe();

				store.update((state) => {
					state.count.value += 1;
				});

				expect(callback).toHaveBeenCalledTimes(0);
			});

			it('should work alongside field-specific events', () => {
				type State = {
					count: {value: number};
					name: {value: string};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
					name: {value: 'test'},
				});

				const wildcardCallback = vi.fn();
				const countCallback = vi.fn();

				store.on('*', wildcardCallback);
				store.on('count:updated', countCallback);

				store.update((state) => {
					state.count.value += 1;
				});

				expect(wildcardCallback).toHaveBeenCalledTimes(1);
				expect(countCallback).toHaveBeenCalledTimes(1);
			});

			it('should receive all patches across multiple updates', () => {
				type State = {
					count: {value: number};
				};

				const store = createObservableStore<State>({
					count: {value: 0},
				});

				const callback = vi.fn();
				store.on('*', callback);

				store.update((state) => {
					state.count.value = 1;
				});

				store.update((state) => {
					state.count.value = 2;
				});

				store.update((state) => {
					state.count.value = 3;
				});

				expect(callback).toHaveBeenCalledTimes(3);

				// Check first update
				expect(callback.mock.calls[0][0]).toEqual([
					{op: 'replace', path: ['count', 'value'], value: 1},
				]);

				// Check second update
				expect(callback.mock.calls[1][0]).toEqual([
					{op: 'replace', path: ['count', 'value'], value: 2},
				]);

				// Check third update
				expect(callback.mock.calls[2][0]).toEqual([
					{op: 'replace', path: ['count', 'value'], value: 3},
				]);
			});

			it('should handle complex nested structures', () => {
				type State = {
					data: {
						users: {
							byId: Record<string, {name: string; email: string}>;
							ids: string[];
						};
					};
				};

				const store = createObservableStore<State>({
					data: {
						users: {
							byId: {
								'1': {name: 'John', email: 'john@example.com'},
							},
							ids: ['1'],
						},
					},
				});

				const callback = vi.fn();
				store.on('*', callback);

				store.update((state) => {
					state.data.users.byId['2'] = {name: 'Jane', email: 'jane@example.com'};
					state.data.users.ids.push('2');
				});

				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches.length).toBeGreaterThan(0);
				expect(patches.some((p: {path: PatchPath}) => p.path[0] === 'data')).toBe(true);
			});
		});
	});

	describe('Array operations', () => {
		describe('Array element removal', () => {
			it('should emit patches when array element is removed with splice', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.splice(1, 1); // Remove second element
				});

				expect(store.get('items')).toEqual([
					{id: 1, text: 'First'},
					{id: 3, text: 'Third'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				// Should contain patches for the removal
				expect(patches.length).toBeGreaterThan(0);
			});

			it('should emit patches when array element is removed with pop', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.pop();
				});

				expect(store.get('items')).toEqual([
					{id: 1, text: 'First'},
					{id: 2, text: 'Second'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches.length).toBeGreaterThan(0);
			});

			it('should emit patches when array element is removed with shift', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.shift();
				});

				expect(store.get('items')).toEqual([
					{id: 2, text: 'Second'},
					{id: 3, text: 'Third'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches.length).toBeGreaterThan(0);
			});

			it('should throw when using onItemId for arrays without getItemId', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				// onItemId throws when getItemId is not configured
				expect(() => {
					store.onItemId('items:updated', 0, vi.fn());
				}).toThrow("onItemId requires getItemId configuration for field 'items'");
			});

			it('should handle removing multiple elements at once', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
						{id: 4, text: 'Fourth'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.splice(1, 2); // Remove second and third elements
				});

				expect(store.get('items')).toEqual([
					{id: 1, text: 'First'},
					{id: 4, text: 'Fourth'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle filter-like removal pattern', () => {
				type State = {
					items: Array<{id: number; text: string; done: boolean}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First', done: true},
						{id: 2, text: 'Second', done: false},
						{id: 3, text: 'Third', done: true},
						{id: 4, text: 'Fourth', done: false},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					// Remove all done items by iterating backwards
					for (let i = state.items.length - 1; i >= 0; i--) {
						if (state.items[i].done) {
							state.items.splice(i, 1);
						}
					}
				});

				expect(store.get('items')).toEqual([
					{id: 2, text: 'Second', done: false},
					{id: 4, text: 'Fourth', done: false},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle assigning a new filtered array', () => {
				type State = {
					items: Array<{id: number; text: string; done: boolean}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First', done: true},
						{id: 2, text: 'Second', done: false},
						{id: 3, text: 'Third', done: true},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items = state.items.filter((item) => !item.done);
				});

				expect(store.get('items')).toEqual([{id: 2, text: 'Second', done: false}]);
				expect(callback).toHaveBeenCalledTimes(1);
			});
		});

		describe('Array element reordering', () => {
			it('should emit patches when array elements are swapped', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					// Swap first and last elements
					const temp = state.items[0];
					state.items[0] = state.items[2];
					state.items[2] = temp;
				});

				expect(store.get('items')).toEqual([
					{id: 3, text: 'Third'},
					{id: 2, text: 'Second'},
					{id: 1, text: 'First'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
				const patches = callback.mock.calls[0][0];
				expect(patches.length).toBeGreaterThan(0);
			});

			it('should emit patches when array is reversed', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.reverse();
				});

				expect(store.get('items')).toEqual([
					{id: 3, text: 'Third'},
					{id: 2, text: 'Second'},
					{id: 1, text: 'First'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should emit patches when array is sorted', () => {
				type State = {
					items: Array<{id: number; text: string; priority: number}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'Low', priority: 3},
						{id: 2, text: 'High', priority: 1},
						{id: 3, text: 'Medium', priority: 2},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.sort((a, b) => a.priority - b.priority);
				});

				expect(store.get('items')).toEqual([
					{id: 2, text: 'High', priority: 1},
					{id: 3, text: 'Medium', priority: 2},
					{id: 1, text: 'Low', priority: 3},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should throw when using onItemId for arrays without getItemId (reorder example)', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				// onItemId throws when getItemId is not configured
				expect(() => {
					store.onItemId('items:updated', 0, vi.fn());
				}).toThrow("onItemId requires getItemId configuration for field 'items'");
			});

			it('should handle move item to end pattern', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					// Move first item to end
					const [first] = state.items.splice(0, 1);
					state.items.push(first);
				});

				expect(store.get('items')).toEqual([
					{id: 2, text: 'Second'},
					{id: 3, text: 'Third'},
					{id: 1, text: 'First'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle move item to beginning pattern', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					// Move last item to beginning
					const last = state.items.pop();
					if (last) state.items.unshift(last);
				});

				expect(store.get('items')).toEqual([
					{id: 3, text: 'Third'},
					{id: 1, text: 'First'},
					{id: 2, text: 'Second'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle splice-based reordering', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
						{id: 4, text: 'Fourth'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					// Move item from index 3 to index 1
					const [item] = state.items.splice(3, 1);
					state.items.splice(1, 0, item);
				});

				expect(store.get('items')).toEqual([
					{id: 1, text: 'First'},
					{id: 4, text: 'Fourth'},
					{id: 2, text: 'Second'},
					{id: 3, text: 'Third'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle reassigning sorted array', () => {
				type State = {
					items: Array<{id: number; text: string; priority: number}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'Low', priority: 3},
						{id: 2, text: 'High', priority: 1},
						{id: 3, text: 'Medium', priority: 2},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					// Create a new sorted array
					state.items = [...state.items].sort((a, b) => a.priority - b.priority);
				});

				expect(store.get('items')).toEqual([
					{id: 2, text: 'High', priority: 1},
					{id: 3, text: 'Medium', priority: 2},
					{id: 1, text: 'Low', priority: 3},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});
		});

		describe('Combined array operations', () => {
			it('should handle adding and removing in same update', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.splice(1, 1); // Remove second
					state.items.push({id: 4, text: 'Fourth'}); // Add new one
				});

				expect(store.get('items')).toEqual([
					{id: 1, text: 'First'},
					{id: 3, text: 'Third'},
					{id: 4, text: 'Fourth'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle replacing all items', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items = [
						{id: 3, text: 'New First'},
						{id: 4, text: 'New Second'},
						{id: 5, text: 'New Third'},
					];
				});

				expect(store.get('items')).toEqual([
					{id: 3, text: 'New First'},
					{id: 4, text: 'New Second'},
					{id: 5, text: 'New Third'},
				]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle clearing array', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.length = 0;
				});

				expect(store.get('items')).toEqual([]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle clearing array with splice', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items.splice(0, state.items.length);
				});

				expect(store.get('items')).toEqual([]);
				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should handle reassigning empty array', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
					],
				});

				const callback = vi.fn();
				store.on('items:updated', callback);

				store.update((state) => {
					state.items = [];
				});

				expect(store.get('items')).toEqual([]);
				expect(callback).toHaveBeenCalledTimes(1);
			});
		});

		describe('Array operations without getItemId (use field-level subscriptions)', () => {
			it('should verify patches contain correct operations for push', () => {
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
					],
				});

				const allPatches: Array<{op: string; path: unknown[]; value?: unknown}> = [];
				store.on('items:updated', (patches) => {
					allPatches.push(...patches);
				});

				// Push a new element
				store.update((state) => {
					state.items.push({id: 3, text: 'Third'});
				});

				// Verify patches exist and reference the new index
				expect(allPatches.length).toBeGreaterThan(0);
				// Check that patches reference index 2 (the added element)
				const referencesIndex2 = allPatches.some((p) => p.path.includes(2) || p.path.includes('2'));
				expect(referencesIndex2).toBe(true);
			});

			// TODO show that it use length, but we could also add a test with arrayLengthAssignment=false (patch-recorder)
			it('documents pop behavior: patches may not reference removed index directly', () => {
				// IMPORTANT: This test documents the actual behavior of patch-recorder.
				// When using pop(), the patches generated may not directly reference
				// the removed index. This is because patch-recorder tracks mutations
				// and pop simply removes the last element without "replacing" it.
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const allPatches: Array<{op: string; path: unknown[]; value?: unknown}> = [];
				store.on('items:updated', (patches) => {
					allPatches.push(...patches);
				});

				// Pop the last element
				store.update((state) => {
					state.items.pop();
				});

				// The field-level event fires
				expect(allPatches.length).toBeGreaterThan(0);
				// The array is correctly updated
				expect(store.get('items')).toEqual([
					{id: 1, text: 'First'},
					{id: 2, text: 'Second'},
				]);
			});

			it('should use field-level subscriptions for arrays without getItemId', () => {
				// For arrays without getItemId, use field-level subscriptions.
				// onItemId requires getItemId configuration.
				type State = {
					items: Array<{id: number; text: string}>;
				};

				const store = createObservableStore<State>({
					items: [
						{id: 1, text: 'First'},
						{id: 2, text: 'Second'},
						{id: 3, text: 'Third'},
					],
				});

				const fieldCallback = vi.fn();
				store.on('items:updated', fieldCallback);

				// All these operations trigger the field-level event
				store.update((state) => {
					state.items.pop();
				});
				expect(fieldCallback).toHaveBeenCalledTimes(1);

				store.update((state) => {
					state.items.push({id: 4, text: 'Fourth'});
				});
				expect(fieldCallback).toHaveBeenCalledTimes(2);

				store.update((state) => {
					state.items.shift();
				});
				expect(fieldCallback).toHaveBeenCalledTimes(3);

				store.update((state) => {
					state.items.reverse();
				});
				expect(fieldCallback).toHaveBeenCalledTimes(4);

				// Field-level subscription is the reliable pattern for arrays without getItemId
			});
		});

		describe('onItemId requires getItemId configuration', () => {
			it('should throw error when onItemId is used without getItemId config', () => {
				type State = {
					items: Array<{id: number}>;
				};

				const store = createObservableStore<State>({
					items: [{id: 1}, {id: 2}, {id: 3}],
				});

				expect(() => {
					store.onItemId('items:updated', 2, vi.fn());
				}).toThrow("onItemId requires getItemId configuration for field 'items'");
			});

			it('should throw error when onItemId with wildcard is used without getItemId config', () => {
				type State = {
					items: Array<{id: number}>;
				};

				const store = createObservableStore<State>({
					items: [{id: 1}, {id: 2}, {id: 3}],
				});

				expect(() => {
					store.onItemId('items:updated', '*', vi.fn());
				}).toThrow("onItemId requires getItemId configuration for field 'items'");
			});

			it('should throw error when onceItemId is used without getItemId config', () => {
				type State = {
					items: Array<{id: number}>;
				};

				const store = createObservableStore<State>({
					items: [{id: 1}, {id: 2}, {id: 3}],
				});

				expect(() => {
					store.onceItemId('items:updated', 2, vi.fn());
				}).toThrow("onceItemId requires getItemId configuration for field 'items'");
			});

			it('should not emit keyed events when no keyed listeners exist (performance)', () => {
				type State = {
					items: Array<{id: number}>;
				};

				const store = createObservableStore<State>({
					items: [{id: 1}, {id: 2}, {id: 3}],
				});

				const fieldCallback = vi.fn();
				store.on('items:updated', fieldCallback);

				// No keyed listeners - should not cause any keyed event overhead
				store.update((s) => s.items.pop());

				// Only field callback fires
				expect(fieldCallback).toHaveBeenCalledTimes(1);
			});
		});

		describe('ID-based keyed events for arrays (with getItemId)', () => {
			it('should emit keyed event using patch.id for array', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 'a', value: 1},
							{id: 'b', value: 2},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callback = vi.fn();
				store.onItemId('items:updated', 'a', callback);

				store.update((s) => {
					s.items[0].value = 10;
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should fire callback for correct item after reorder', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 'a', value: 1},
							{id: 'b', value: 2},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callbackA = vi.fn();
				store.onItemId('items:updated', 'a', callbackA);

				// Reorder: move 'b' to first position
				store.update((s) => {
					const b = s.items.splice(1, 1)[0];
					s.items.unshift(b);
				});

				// 'a' is now at index 1, update it
				store.update((s) => {
					s.items[1].value = 100;
				});

				// Callback should fire because 'a' was updated
				expect(callbackA).toHaveBeenCalled();
			});

			it('should throw error when using onItemId for arrays without getItemId', () => {
				type State = {items: number[]};

				const store = createObservableStore<State>({items: [1, 2, 3]});
				// No getItemId configured

				// onItemId should throw when getItemId is not configured
				expect(() => {
					store.onItemId('items:updated', 0, vi.fn());
				}).toThrow("onItemId requires getItemId configuration for field 'items'");
			});

			it('should continue to emit keyed events for Records using key', () => {
				type State = {users: Record<string, {name: string}>};

				const store = createObservableStore<State>({
					users: {u1: {name: 'Alice'}},
				});

				const callback = vi.fn();
				store.onKey('users:updated', 'u1', callback);

				store.update((s) => {
					s.users['u1'].name = 'Bob';
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should NOT emit keyed event when item is removed', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 'a', value: 1},
							{id: 'b', value: 2},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callbackA = vi.fn();
				store.onItemId('items:updated', 'a', callbackA);

				store.update((s) => {
					s.items.shift();
				}); // Removes 'a'

				// patch-recorder does NOT include patch.id for removals
				// So no keyed event fires - this is intentional
				expect(callbackA).not.toHaveBeenCalled();
			});

			it('should NOT emit keyed event when item is replaced (patch.id only for property updates, not full item replacement)', () => {
				// Note: patch-recorder populates patch.id when a property of an existing item is updated,
				// but NOT when an entire item is replaced. This is because the replacement patch
				// is a 'replace' operation at the array index level, not an update to the item itself.
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 'a', value: 1},
							{id: 'b', value: 2},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callbackA = vi.fn();
				const callbackC = vi.fn();
				store.onItemId('items:updated', 'a', callbackA);
				store.onItemId('items:updated', 'c', callbackC);

				// Replace item at index 0 (id: 'a') with new item (id: 'c')
				store.update((s) => {
					s.items[0] = {id: 'c', value: 100};
				});

				// No keyed events fire for full item replacement - use field-level subscription instead
				expect(callbackA).not.toHaveBeenCalled();
				expect(callbackC).not.toHaveBeenCalled();
			});

			it('should NOT emit keyed events when entire array field is replaced', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{id: 'a', value: 1}]},
					{getItemId: {items: (item) => item.id}},
				);

				const callbackA = vi.fn();
				store.onItemId('items:updated', 'a', callbackA);

				// Replace entire array
				store.update((s) => {
					s.items = [{id: 'b', value: 2}];
				});

				// No keyed events for arrays on field replacement
				expect(callbackA).not.toHaveBeenCalled();
			});

			it('should work with wildcard keyed listeners using patch.id', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 'a', value: 1},
							{id: 'b', value: 2},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const wildcardCallback = vi.fn();
				store.onItemId('items:updated', '*', wildcardCallback);

				store.update((s) => {
					s.items[0].value = 100;
				});

				// Wildcard listener should receive the item ID
				expect(wildcardCallback).toHaveBeenCalled();
				const lastCall = wildcardCallback.mock.calls[wildcardCallback.mock.calls.length - 1];
				expect(lastCall[0]).toBe('a'); // The item ID, not the index
			});

			it('should emit field event even when keyed events are disabled for arrays without getItemId', () => {
				type State = {items: number[]};

				const store = createObservableStore<State>({items: [1, 2, 3]});

				const fieldCallback = vi.fn();
				store.on('items:updated', fieldCallback);

				store.update((s) => {
					s.items[0] = 10;
				});

				// Field-level event should still fire
				expect(fieldCallback).toHaveBeenCalledTimes(1);
			});

			it('should support numeric IDs', () => {
				type State = {items: Array<{id: number; value: string}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 1, value: 'a'},
							{id: 2, value: 'b'},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callback = vi.fn();
				store.onItemId('items:updated', 1, callback);

				store.update((s) => {
					s.items[0].value = 'updated';
				});

				expect(callback).toHaveBeenCalledTimes(1);
			});

			it('should not create keyed subscriptions for arrays without getItemId in itemIdSubscriptions', () => {
				type State = {items: number[]};

				const store = createObservableStore<State>({items: [1, 2, 3]});

				// itemIdSubscriptions for array fields without getItemId should not exist
				expect(store.itemIdSubscriptions.items).toBeUndefined();
			});

			it('should create keyed subscriptions for arrays with getItemId', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{id: 'a', value: 1}]},
					{getItemId: {items: (item) => item.id}},
				);

				// itemIdSubscriptions should exist for this field
				expect(store.itemIdSubscriptions.items).toBeDefined();
			});
		});

		describe('getItemId edge cases', () => {
			it('should NOT emit keyed event when getItemId returns undefined', () => {
				type State = {items: Array<{id?: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{value: 1}, {id: 'b', value: 2}]}, // First item has no id
					{getItemId: {items: (item) => item.id}}, // Returns undefined for first item
				);

				const wildcardCallback = vi.fn();
				store.onItemId('items:updated', '*', wildcardCallback);

				// Update item without ID
				store.update((s) => {
					s.items[0].value = 100;
				});

				// No keyed event should be emitted for item without ID
				expect(wildcardCallback).not.toHaveBeenCalled();
			});

			it('should NOT emit keyed event when getItemId returns null', () => {
				type State = {items: Array<{id: string | null; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: null, value: 1},
							{id: 'b', value: 2},
						],
					}, // First item has null id
					{getItemId: {items: (item) => item.id}}, // Returns null for first item
				);

				const wildcardCallback = vi.fn();
				store.onItemId('items:updated', '*', wildcardCallback);

				// Update item with null ID
				store.update((s) => {
					s.items[0].value = 100;
				});

				// No keyed event should be emitted for item with null ID
				expect(wildcardCallback).not.toHaveBeenCalled();
			});

			it('should emit keyed event only for items with valid IDs in mixed array', () => {
				type State = {items: Array<{id?: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{value: 1}, {id: 'b', value: 2}]}, // Mixed: one without ID, one with ID
					{getItemId: {items: (item) => item.id}},
				);

				const callbackB = vi.fn();
				const wildcardCallback = vi.fn();
				store.onItemId('items:updated', 'b', callbackB);
				store.onItemId('items:updated', '*', wildcardCallback);

				// Update item with valid ID
				store.update((s) => {
					s.items[1].value = 200;
				});

				// Keyed events should be emitted for item with valid ID
				expect(callbackB).toHaveBeenCalledTimes(1);
				expect(wildcardCallback).toHaveBeenCalledTimes(1);
			});

			it('should still emit field-level event even when item has no valid ID', () => {
				type State = {items: Array<{id?: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{value: 1}]}, // Item without ID
					{getItemId: {items: (item) => item.id}},
				);

				const fieldCallback = vi.fn();
				store.on('items:updated', fieldCallback);

				// Update item without ID
				store.update((s) => {
					s.items[0].value = 100;
				});

				// Field-level event should still fire
				expect(fieldCallback).toHaveBeenCalledTimes(1);
			});

			it('should handle pushing item without ID field', () => {
				type State = {items: Array<{id?: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{id: 'a', value: 1}]},
					{getItemId: {items: (item) => item.id}},
				);

				const wildcardCallback = vi.fn();
				const fieldCallback = vi.fn();
				store.onItemId('items:updated', '*', wildcardCallback);
				store.on('items:updated', fieldCallback);

				// Push item without ID
				store.update((s) => {
					s.items.push({value: 2}); // No id field
				});

				// Field-level event should fire
				expect(fieldCallback).toHaveBeenCalledTimes(1);
				// No keyed event since the new item has no ID
				expect(wildcardCallback).not.toHaveBeenCalled();
			});

			it('should handle getItemId that throws an error', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{items: [{id: 'a', value: 1}]},
					{
						getItemId: {
							items: (item) => {
								if (item.value === 100) {
									throw new Error('Test error');
								}
								return item.id;
							},
						},
					},
				);

				const wildcardCallback = vi.fn();
				store.onItemId('items:updated', '*', wildcardCallback);

				// This should throw because getItemId throws
				expect(() => {
					store.update((s) => {
						s.items[0].value = 100;
					});
				}).toThrow('Test error');
			});

			it('should support nested getItemId config for nested arrays', () => {
				type State = {
					users: Array<{
						id: string;
						posts: Array<{postId: string; title: string}>;
					}>;
				};

				const store = createObservableStore<State>(
					{
						users: [
							{
								id: 'user1',
								posts: [{postId: 'post1', title: 'Hello'}],
							},
						],
					},
					{
						getItemId: {
							users: {
								posts: (post) => post.postId,
							},
						},
					},
				);

				const fieldCallback = vi.fn();
				store.on('users:updated', fieldCallback);

				// Update nested post
				store.update((s) => {
					s.users[0].posts[0].title = 'Updated';
				});

				// Field-level event should fire
				expect(fieldCallback).toHaveBeenCalledTimes(1);
			});

			it('should handle empty array with getItemId configured', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{items: []},
					{getItemId: {items: (item) => item.id}},
				);

				const wildcardCallback = vi.fn();
				const fieldCallback = vi.fn();
				store.onItemId('items:updated', '*', wildcardCallback);
				store.on('items:updated', fieldCallback);

				// Push first item
				store.update((s) => {
					s.items.push({id: 'a', value: 1});
				});

				// Field-level event should fire
				expect(fieldCallback).toHaveBeenCalledTimes(1);
				// Push doesn't include id in patch (it's adding a NEW item, not modifying existing)
				// so no keyed event is emitted
				expect(wildcardCallback).not.toHaveBeenCalled();
			});

			it('should handle updating newly pushed item with valid ID', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{items: []},
					{getItemId: {items: (item) => item.id}},
				);

				// First push an item
				store.update((s) => {
					s.items.push({id: 'a', value: 1});
				});

				const callbackA = vi.fn();
				store.onItemId('items:updated', 'a', callbackA);

				// Now update the item
				store.update((s) => {
					s.items[0].value = 100;
				});

				// Keyed event should fire for the update
				expect(callbackA).toHaveBeenCalledTimes(1);
			});

			it('should handle item with ID of 0 (falsy but valid)', () => {
				type State = {items: Array<{id: number; value: string}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: 0, value: 'first'},
							{id: 1, value: 'second'},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callback0 = vi.fn();
				store.onItemId('items:updated', 0, callback0);

				// Update item with ID 0
				store.update((s) => {
					s.items[0].value = 'updated';
				});

				// Keyed event should fire for ID 0
				expect(callback0).toHaveBeenCalledTimes(1);
			});

			it('should handle item with ID of empty string (falsy but valid)', () => {
				type State = {items: Array<{id: string; value: number}>};

				const store = createObservableStore<State>(
					{
						items: [
							{id: '', value: 1},
							{id: 'b', value: 2},
						],
					},
					{getItemId: {items: (item) => item.id}},
				);

				const callbackEmpty = vi.fn();
				store.onItemId('items:updated', '', callbackEmpty);

				// Update item with empty string ID
				store.update((s) => {
					s.items[0].value = 100;
				});

				// Keyed event should fire for empty string ID
				expect(callbackEmpty).toHaveBeenCalledTimes(1);
			});
		});
	});
});

// Test to document behavioral difference between Records and Arrays for onKey/onItemId
describe('onKey vs onItemId behavioral difference: Records vs Arrays', () => {
	it('Record: onKey FIRES when key is deleted', () => {
		type State = {items: Record<string, {value: number}>};
		const store = createObservableStore<State>({
			items: {a: {value: 1}, b: {value: 2}},
		});

		const callbackA = vi.fn();
		const callbackB = vi.fn();
		store.onKey('items:updated', 'a', callbackA);
		store.onKey('items:updated', 'b', callbackB);

		// Delete key 'a'
		store.update((s) => {
			delete s.items.a;
		});

		// callbackA FIRES for Record deletion
		expect(callbackA).toHaveBeenCalledTimes(1);
		expect(callbackB).not.toHaveBeenCalled();
	});

	it('Array with getItemId: onItemId does NOT fire when item is removed', () => {
		type State = {items: Array<{id: string; value: number}>};
		const store = createObservableStore<State>(
			{
				items: [
					{id: 'a', value: 1},
					{id: 'b', value: 2},
				],
			},
			{getItemId: {items: (item) => item.id}},
		);

		const callbackA = vi.fn();
		const callbackB = vi.fn();
		store.onItemId('items:updated', 'a', callbackA);
		store.onItemId('items:updated', 'b', callbackB);

		// Remove item 'a' via shift
		store.update((s) => {
			s.items.shift();
		});

		// callbackA does NOT fire for Array removal (patch-recorder doesn't include patch.id for removals)
		expect(callbackA).not.toHaveBeenCalled();
		expect(callbackB).not.toHaveBeenCalled();
	});
});

// Type safety tests for onKey and onItemId API
describe('Type Safety: onKey and onItemId', () => {
	it('onKey should only accept Record field names (not Array fields)', () => {
		type State = {
			users: Record<string, {name: string}>;
			items: Array<{id: string; value: number}>;
			counter: number;
		};

		const store = createObservableStore<State>(
			{
				users: {a: {name: 'Alice'}},
				items: [{id: '1', value: 10}],
				counter: 0,
			},
			{getItemId: {items: (item) => item.id}},
		);

		// Valid: onKey with Record field
		const cb = vi.fn();
		store.onKey('users:updated', 'a', cb);

		// @ts-expect-error - onKey should not accept Array fields
		store.onKey('items:updated', '1', vi.fn());

		// @ts-expect-error - onKey should not accept Primitive fields
		store.onKey('counter:updated', '1', vi.fn());
	});

	it('onItemId throws at runtime when used with Record fields (no getItemId configured)', () => {
		type State = {
			users: Record<string, {name: string}>;
			items: Array<{id: string; value: number}>;
			counter: number;
		};

		const store = createObservableStore<State>(
			{
				users: {a: {name: 'Alice'}},
				items: [{id: '1', value: 10}],
				counter: 0,
			},
			{getItemId: {items: (item) => item.id}},
		);

		// Valid: onItemId with Array field that has getItemId
		const cb = vi.fn();
		store.onItemId('items:updated', '1', cb);

		// Runtime error: onItemId throws when getItemId is not configured for the field
		// @ts-expect-error - onItemId should not accept Record fields at the type level
		expect(() => store.onItemId('users:updated', 'a', vi.fn())).toThrow(
			"onItemId requires getItemId configuration for field 'users'",
		);
	});

	it('offKey should only accept Record field names', () => {
		type State = {
			users: Record<string, {name: string}>;
			items: Array<{id: string; value: number}>;
		};

		const store = createObservableStore<State>(
			{
				users: {a: {name: 'Alice'}},
				items: [{id: '1', value: 10}],
			},
			{getItemId: {items: (item) => item.id}},
		);

		// Valid: offKey with Record field
		const cb = vi.fn();
		store.onKey('users:updated', 'a', cb);
		store.offKey('users:updated', 'a', cb);

		// @ts-expect-error - offKey should not accept Array fields
		store.offKey('items:updated', '1', vi.fn());
	});

	it('offItemId should only accept Array field names', () => {
		type State = {
			users: Record<string, {name: string}>;
			items: Array<{id: string; value: number}>;
		};

		const store = createObservableStore<State>(
			{
				users: {a: {name: 'Alice'}},
				items: [{id: '1', value: 10}],
			},
			{getItemId: {items: (item) => item.id}},
		);

		// Valid: offItemId with Array field
		const cb = vi.fn();
		store.onItemId('items:updated', '1', cb);
		store.offItemId('items:updated', '1', cb);

		// Note: offItemId doesn't throw at runtime for Record fields (it's a no-op),
		// but ideally TypeScript should reject this at compile time.
		// TODO: Improve type safety to prevent this at compile time
	});

	it('onceKey should only accept Record field names', () => {
		type State = {
			users: Record<string, {name: string}>;
			items: Array<{id: string; value: number}>;
		};

		const store = createObservableStore<State>(
			{
				users: {a: {name: 'Alice'}},
				items: [{id: '1', value: 10}],
			},
			{getItemId: {items: (item) => item.id}},
		);

		// Valid: onceKey with Record field
		store.onceKey('users:updated', 'a', vi.fn());

		// @ts-expect-error - onceKey should not accept Array fields
		store.onceKey('items:updated', '1', vi.fn());
	});

	it('onceItemId throws at runtime when used with Record fields', () => {
		type State = {
			users: Record<string, {name: string}>;
			items: Array<{id: string; value: number}>;
		};

		const store = createObservableStore<State>(
			{
				users: {a: {name: 'Alice'}},
				items: [{id: '1', value: 10}],
			},
			{getItemId: {items: (item) => item.id}},
		);

		// Valid: onceItemId with Array field
		store.onceItemId('items:updated', '1', vi.fn());

		// Runtime error: onceItemId throws when getItemId is not configured for the field
		// @ts-expect-error - onceItemId should not accept Record fields at the type level
		expect(() => store.onceItemId('users:updated', 'a', vi.fn())).toThrow(
			"onceItemId requires getItemId configuration for field 'users'",
		);
	});
});
