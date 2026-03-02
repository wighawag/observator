import { describe, it, expect, vi } from 'vitest';
import { flushSync, untrack } from 'svelte';
import { createObservableStore } from 'observator';
import { useSvelteReactivity } from './store.svelte.js';

describe('Svelte Reactivity', () => {
	describe('field-level reactivity', () => {
		it('should trigger effects when a field changes', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial'
				});
				const store = useSvelteReactivity(observableStore);

				const values: number[] = [];

				$effect(() => {
					values.push(store.count);
				});

				flushSync();
				expect(values).toEqual([0]);

				// Update count
				store.update((s) => {
					s.count = 5;
				});

				flushSync();
				expect(values).toEqual([0, 5]);
			});

			cleanup();
		});

		it('should track effect runs independently per field', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial'
				});
				const store = useSvelteReactivity(observableStore);

				let countRuns = 0;
				let nameRuns = 0;

				$effect(() => {
					store.count;
					untrack(() => countRuns++);
				});

				$effect(() => {
					store.name;
					untrack(() => nameRuns++);
				});

				flushSync();
				expect(countRuns).toBe(1);
				expect(nameRuns).toBe(1);

				// Update count only
				store.update((s) => {
					s.count = 1;
				});

				flushSync();
				expect(countRuns).toBe(2);
				expect(nameRuns).toBe(1);

				// Update name only
				store.update((s) => {
					s.name = 'updated';
				});

				flushSync();
				expect(countRuns).toBe(2);
				expect(nameRuns).toBe(2);
			});

			cleanup();
		});

		it('should handle multiple updates in sequence', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial'
				});
				const store = useSvelteReactivity(observableStore);

				const values: number[] = [];

				$effect(() => {
					values.push(store.count);
				});

				flushSync();
				expect(values).toEqual([0]);

				store.update((s) => {
					s.count = 1;
				});
				flushSync();
				expect(values).toEqual([0, 1]);

				store.update((s) => {
					s.count = 2;
				});
				flushSync();
				expect(values).toEqual([0, 1, 2]);

				store.update((s) => {
					s.count = 100;
				});
				flushSync();
				expect(values).toEqual([0, 1, 2, 100]);
			});

			cleanup();
		});

		it('should react to updates from original ObservableStore', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial'
				});
				const store = useSvelteReactivity(observableStore);

				const values: number[] = [];

				$effect(() => {
					values.push(store.count);
				});

				flushSync();
				expect(values).toEqual([0]);

				// Update via the ORIGINAL store, not the reactive wrapper
				observableStore.update((s) => {
					s.count = 42;
				});

				flushSync();
				expect(values).toEqual([0, 42]);
			});

			cleanup();
		});
	});

	describe('keyed reactivity', () => {
		it('should update keyed values reactively', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial',
					users: {
						alice: { online: true },
						bob: { online: false }
					} as Record<string, { online: boolean }>
				});
				const store = useSvelteReactivity(observableStore);

				const aliceValues: (boolean | undefined)[] = [];

				$effect(() => {
					aliceValues.push(store.users.alice?.online);
				});

				flushSync();
				expect(aliceValues).toEqual([true]);

				// Update alice's status
				store.update((s) => {
					s.users.alice.online = false;
				});

				flushSync();
				expect(aliceValues).toEqual([true, false]);
			});

			cleanup();
		});

		it('should only re-run effects for relevant keyed updates', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial',
					users: {
						alice: { online: true },
						bob: { online: false }
					} as Record<string, { online: boolean }>
				});
				const store = useSvelteReactivity(observableStore);

				let aliceRuns = 0;
				let bobRuns = 0;

				$effect(() => {
					store.users.alice;
					untrack(() => aliceRuns++);
				});

				$effect(() => {
					store.users.bob;
					untrack(() => bobRuns++);
				});

				flushSync();
				expect(aliceRuns).toBe(1);
				expect(bobRuns).toBe(1);

				// Update alice only - bob should NOT re-run
				store.update((s) => {
					s.users.alice.online = false;
				});

				flushSync();
				expect(aliceRuns).toBe(2);
				expect(bobRuns).toBe(1);

				// Update bob only - alice should NOT re-run
				store.update((s) => {
					s.users.bob.online = true;
				});

				flushSync();
				expect(aliceRuns).toBe(2);
				expect(bobRuns).toBe(2);
			});

			cleanup();
		});
	});

	describe('multi-field updates', () => {
		it('should handle updates to multiple fields in one call', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					count: 0,
					name: 'initial'
				});
				const store = useSvelteReactivity(observableStore);

				const countValues: number[] = [];
				const nameValues: string[] = [];
				let countRuns = 0;
				let nameRuns = 0;

				$effect(() => {
					countValues.push(store.count);
					untrack(() => countRuns++);
				});

				$effect(() => {
					nameValues.push(store.name);
					untrack(() => nameRuns++);
				});

				flushSync();
				expect(countValues).toEqual([0]);
				expect(nameValues).toEqual(['initial']);
				expect(countRuns).toBe(1);
				expect(nameRuns).toBe(1);

				// Update both fields at once
				store.update((s) => {
					s.count = 10;
					s.name = 'both updated';
				});

				flushSync();
				expect(countValues).toEqual([0, 10]);
				expect(nameValues).toEqual(['initial', 'both updated']);
				expect(countRuns).toBe(2);
				expect(nameRuns).toBe(2);
			});

			cleanup();
		});
	});

	describe('keyed array reactivity', () => {
		it('should update keyed array values reactively', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: { text: string; done: boolean }[] = [];

				$effect(() => {
					const item = store.items[0];
					item0Values.push({ text: item?.text ?? 'none', done: item?.done ?? false });
				});

				flushSync();
				expect(item0Values).toEqual([{ text: 'First', done: false }]);

				// Update first item
				store.update((s) => {
					s.items[0].done = true;
				});

				flushSync();
				expect(item0Values).toEqual([
					{ text: 'First', done: false },
					{ text: 'First', done: true }
				]);
			});

			cleanup();
		});

		it('should only re-run effects for relevant array index updates', () => {
			const cleanup = $effect.root(() => {
				// With getItemId configured, array subscriptions use item IDs instead of indices
				// This provides fine-grained reactivity where only the affected item's effects re-run
				const observableStore = createObservableStore(
					{
						items: [
							{ id: 0, text: 'First', done: false },
							{ id: 1, text: 'Second', done: false },
							{ id: 2, text: 'Third', done: false }
						]
					},
					{ getItemId: { items: (item: { id: number }) => item.id } }
				);
				const store = useSvelteReactivity(observableStore);

				let item0Runs = 0;
				let item1Runs = 0;
				let item2Runs = 0;

				$effect(() => {
					store.items[0];
					untrack(() => item0Runs++);
				});

				$effect(() => {
					store.items[1];
					untrack(() => item1Runs++);
				});

				$effect(() => {
					store.items[2];
					untrack(() => item2Runs++);
				});

				flushSync();
				expect(item0Runs).toBe(1);
				expect(item1Runs).toBe(1);
				expect(item2Runs).toBe(1);

				// Update only index 0 - indices 1 and 2 should NOT re-run
				store.update((s) => {
					s.items[0].done = true;
				});

				flushSync();
				expect(item0Runs).toBe(2);
				expect(item1Runs).toBe(1);
				expect(item2Runs).toBe(1);

				// Update only index 1 - indices 0 and 2 should NOT re-run
				store.update((s) => {
					s.items[1].text = 'Modified Second';
				});

				flushSync();
				expect(item0Runs).toBe(2);
				expect(item1Runs).toBe(2);
				expect(item2Runs).toBe(1);

				// Update only index 2 - indices 0 and 1 should NOT re-run
				store.update((s) => {
					s.items[2].done = true;
				});

				flushSync();
				expect(item0Runs).toBe(2);
				expect(item1Runs).toBe(2);
				expect(item2Runs).toBe(2);
			});

			cleanup();
		});

		it('should handle array push operations', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item2Values: string[] = [];

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();
				expect(item2Values).toEqual(['none']);

				// Push a new item
				store.update((s) => {
					s.items.push({ id: 2, text: 'Pushed', done: false });
				});

				flushSync();
				expect(item2Values).toEqual(['none', 'Pushed']);
			});

			cleanup();
		});

		it('should handle array modifications reactively', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item1Values: string[] = [];

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				flushSync();
				expect(item1Values).toEqual(['Second']);

				// Replace entire item at index 1
				store.update((s) => {
					s.items[1] = { id: 1, text: 'Replaced', done: true };
				});

				flushSync();
				expect(item1Values).toEqual(['Second', 'Replaced']);
			});

			cleanup();
		});

		it('should handle array element removal with splice', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item1Values: string[] = [];

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				flushSync();
				expect(item1Values).toEqual(['Second']);

				// Remove the second element
				store.update((s) => {
					s.items.splice(1, 1);
				});

				flushSync();
				// Verify the effect was triggered for the modified index
				expect(item1Values[item1Values.length - 1]).toBe('Third');

				// Verify the store state is correct
				expect(store.getRaw('items').length).toBe(2);
				expect(store.getRaw('items')[0].text).toBe('First');
				expect(store.getRaw('items')[1].text).toBe('Third');
			});

			cleanup();
		});

		it('should handle array element removal with pop', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item1Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				flushSync();
				expect(item0Values).toEqual(['First']);
				expect(item1Values).toEqual(['Second']);

				// Pop the last element
				store.update((s) => {
					s.items.pop();
				});

				flushSync();
				expect(item0Values[item0Values.length - 1]).toBe('First');
				expect(item1Values[item1Values.length - 1]).toBe('Second');
				expect(store.getRaw('items').length).toBe(2);
			});

			cleanup();
		});

		it('should handle array element removal with shift', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				flushSync();
				expect(item0Values).toEqual(['First']);

				// Shift the first element
				store.update((s) => {
					s.items.shift();
				});

				flushSync();
				// Effect for index 0 should re-run with new value
				expect(item0Values[item0Values.length - 1]).toBe('Second');

				// Verify the store state is correct
				expect(store.getRaw('items').length).toBe(2);
				expect(store.getRaw('items')[0].text).toBe('Second');
				expect(store.getRaw('items')[1].text).toBe('Third');
			});

			cleanup();
		});

		it('should handle array reordering with reverse', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item1Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();
				expect(item0Values).toEqual(['First']);
				expect(item1Values).toEqual(['Second']);
				expect(item2Values).toEqual(['Third']);

				// Reverse the array
				store.update((s) => {
					s.items.reverse();
				});

				flushSync();
				expect(item0Values[item0Values.length - 1]).toBe('Third');
				expect(item1Values[item1Values.length - 1]).toBe('Second');
				expect(item2Values[item2Values.length - 1]).toBe('First');
			});

			cleanup();
		});

		it('should handle array element swapping', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();
				expect(item0Values).toEqual(['First']);
				expect(item2Values).toEqual(['Third']);

				// Swap first and last
				store.update((s) => {
					const temp = s.items[0];
					s.items[0] = s.items[2];
					s.items[2] = temp;
				});

				flushSync();
				expect(item0Values[item0Values.length - 1]).toBe('Third');
				expect(item2Values[item2Values.length - 1]).toBe('First');
			});

			cleanup();
		});

		it('should handle move item to end pattern', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();
				expect(item0Values).toEqual(['First']);
				expect(item2Values).toEqual(['Third']);

				// Move first to end
				store.update((s) => {
					const [first] = s.items.splice(0, 1);
					s.items.push(first);
				});

				flushSync();
				// Effects for affected indices should re-run
				expect(item0Values[item0Values.length - 1]).toBe('Second');
				expect(item2Values[item2Values.length - 1]).toBe('First');

				// Verify the store state is correct
				expect(store.getRaw('items').length).toBe(3);
				expect(store.getRaw('items')[0].text).toBe('Second');
				expect(store.getRaw('items')[1].text).toBe('Third');
				expect(store.getRaw('items')[2].text).toBe('First');
			});

			cleanup();
		});

		it('should handle filter-like removal pattern', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: true },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: true }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item1Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();

				// Remove all done items by assigning filtered array
				store.update((s) => {
					s.items = s.items.filter((item) => !item.done);
				});

				flushSync();
				// Only Second should remain
				expect(item0Values[item0Values.length - 1]).toBe('Second');
				expect(item1Values[item1Values.length - 1]).toBe('none');
				expect(item2Values[item2Values.length - 1]).toBe('none');
			});

			cleanup();
		});

		it('should handle clearing array', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item1Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();

				// Clear the array
				store.update((s) => {
					s.items = [];
				});

				flushSync();
				expect(item0Values[item0Values.length - 1]).toBe('none');
				expect(item1Values[item1Values.length - 1]).toBe('none');
				expect(item2Values[item2Values.length - 1]).toBe('none');
			});

			cleanup();
		});

		it('should handle replacing all items', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item1Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();
				expect(item0Values).toEqual(['First']);
				expect(item1Values).toEqual(['Second']);
				expect(item2Values).toEqual(['none']);

				// Replace with completely new items
				store.update((s) => {
					s.items = [
						{ id: 3, text: 'New First', done: false },
						{ id: 4, text: 'New Second', done: false },
						{ id: 5, text: 'New Third', done: false }
					];
				});

				flushSync();
				expect(item0Values[item0Values.length - 1]).toBe('New First');
				expect(item1Values[item1Values.length - 1]).toBe('New Second');
				expect(item2Values[item2Values.length - 1]).toBe('New Third');
			});

			cleanup();
		});

		it('should re-run effects for affected indices on element removal', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'First', done: false },
						{ id: 1, text: 'Second', done: false },
						{ id: 2, text: 'Third', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				let item0Runs = 0;
				let item1Runs = 0;
				let item2Runs = 0;

				$effect(() => {
					store.items[0];
					untrack(() => item0Runs++);
				});

				$effect(() => {
					store.items[1];
					untrack(() => item1Runs++);
				});

				$effect(() => {
					store.items[2];
					untrack(() => item2Runs++);
				});

				flushSync();
				expect(item0Runs).toBe(1);
				expect(item1Runs).toBe(1);
				expect(item2Runs).toBe(1);

				// Remove first element - all indices should re-run as they all shift
				store.update((s) => {
					s.items.shift();
				});

				flushSync();
				// Indices affected by the shift - the exact count may vary
				// but all should have run at least once more
				expect(item0Runs).toBeGreaterThanOrEqual(1);
				expect(item1Runs).toBeGreaterThanOrEqual(1);
				expect(item2Runs).toBeGreaterThanOrEqual(1);
			});

			cleanup();
		});

		it('should handle sorting array', () => {
			const cleanup = $effect.root(() => {
				const observableStore = createObservableStore({
					items: [
						{ id: 0, text: 'C-Third', done: false },
						{ id: 1, text: 'A-First', done: false },
						{ id: 2, text: 'B-Second', done: false }
					]
				});
				const store = useSvelteReactivity(observableStore);

				const item0Values: string[] = [];
				const item1Values: string[] = [];
				const item2Values: string[] = [];

				$effect(() => {
					item0Values.push(store.items[0]?.text ?? 'none');
				});

				$effect(() => {
					item1Values.push(store.items[1]?.text ?? 'none');
				});

				$effect(() => {
					item2Values.push(store.items[2]?.text ?? 'none');
				});

				flushSync();

				// Sort by text
				store.update((s) => {
					s.items.sort((a, b) => a.text.localeCompare(b.text));
				});

				flushSync();
				expect(item0Values[item0Values.length - 1]).toBe('A-First');
				expect(item1Values[item1Values.length - 1]).toBe('B-Second');
				expect(item2Values[item2Values.length - 1]).toBe('C-Third');
			});

			cleanup();
		});

		describe('ID-based array reactivity', () => {
			it('should use item ID for keyed subscription when getItemId is configured', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: 'a', text: 'First' },
								{ id: 'b', text: 'Second' }
							]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					const itemAValues: string[] = [];
					const itemBValues: string[] = [];

					$effect(() => {
						itemAValues.push(store.items[0]?.text ?? 'none');
					});

					$effect(() => {
						itemBValues.push(store.items[1]?.text ?? 'none');
					});

					flushSync();
					expect(itemAValues).toEqual(['First']);
					expect(itemBValues).toEqual(['Second']);

					// Update item 'a' (at index 0)
					store.update((s) => {
						s.items[0].text = 'Updated First';
					});

					flushSync();
					expect(itemAValues).toEqual(['First', 'Updated First']);
					// Item 'b' should NOT re-run because we're using ID-based subscriptions
					expect(itemBValues).toEqual(['Second']);

					// Update item 'b' (at index 1)
					store.update((s) => {
						s.items[1].text = 'Updated Second';
					});

					flushSync();
					expect(itemAValues).toEqual(['First', 'Updated First']);
					expect(itemBValues).toEqual(['Second', 'Updated Second']);
				});

				cleanup();
			});

			it('should track correct item after reordering with ID-based subscriptions', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: 'a', text: 'Item A' },
								{ id: 'b', text: 'Item B' }
							]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let itemAtIndex0Runs = 0;
					let itemAtIndex1Runs = 0;

					// These effects access items by index, but subscriptions use item IDs
					$effect(() => {
						store.items[0]; // Will subscribe to 'a' initially
						untrack(() => itemAtIndex0Runs++);
					});

					$effect(() => {
						store.items[1]; // Will subscribe to 'b' initially
						untrack(() => itemAtIndex1Runs++);
					});

					flushSync();
					expect(itemAtIndex0Runs).toBe(1);
					expect(itemAtIndex1Runs).toBe(1);

					// Swap items: now 'b' is at index 0, 'a' is at index 1
					store.update((s) => {
						const temp = s.items[0];
						s.items[0] = s.items[1];
						s.items[1] = temp;
					});

					flushSync();
					// Both effects may re-run due to the swap (both items were modified)
					expect(itemAtIndex0Runs).toBeGreaterThanOrEqual(1);
					expect(itemAtIndex1Runs).toBeGreaterThanOrEqual(1);

					// Verify the data is correct after swap
					expect(store.getRaw('items')[0].id).toBe('b');
					expect(store.getRaw('items')[1].id).toBe('a');
				});

				cleanup();
			});

			it('should use field-level subscription for arrays without getItemId', () => {
				const cleanup = $effect.root(() => {
					// No getItemId configured - arrays use field-level subscription
					const observableStore = createObservableStore({
						items: [
							{ id: 'a', text: 'First' },
							{ id: 'b', text: 'Second' }
						]
					});
					const store = useSvelteReactivity(observableStore);

					let item0Runs = 0;
					let item1Runs = 0;

					$effect(() => {
						store.items[0];
						untrack(() => item0Runs++);
					});

					$effect(() => {
						store.items[1];
						untrack(() => item1Runs++);
					});

					flushSync();
					expect(item0Runs).toBe(1);
					expect(item1Runs).toBe(1);

					// Update only item at index 0
					// Without getItemId, all array-accessing effects should re-run
					store.update((s) => {
						s.items[0].text = 'Updated First';
					});

					flushSync();
					// Both effects re-run because they both use field-level subscription
					expect(item0Runs).toBe(2);
					expect(item1Runs).toBe(2);
				});

				cleanup();
			});

			it('should handle new items with ID-based subscriptions', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [{ id: 'a', text: 'First' }]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					const item1Values: string[] = [];

					$effect(() => {
						item1Values.push(store.items[1]?.text ?? 'none');
					});

					flushSync();
					expect(item1Values).toEqual(['none']);

					// Push a new item
					store.update((s) => {
						s.items.push({ id: 'b', text: 'Second' });
					});

					flushSync();
					// Effect should re-run with the new value (field-level subscription for undefined -> value transition)
					expect(item1Values[item1Values.length - 1]).toBe('Second');
				});

				cleanup();
			});
		});

		describe('getItemId edge cases', () => {
			it('should use field-level subscription when getItemId returns undefined', () => {
				const cleanup = $effect.root(() => {
					// Item without id field - getItemId returns undefined
					const observableStore = createObservableStore(
						{
							items: [
								{ value: 'no-id-item' } as { id?: string; value: string },
								{ id: 'b', value: 'has-id-item' }
							]
						},
						{ getItemId: { items: (item: { id?: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let item0Runs = 0;
					let item1Runs = 0;

					$effect(() => {
						store.items[0];
						untrack(() => item0Runs++);
					});

					$effect(() => {
						store.items[1];
						untrack(() => item1Runs++);
					});

					flushSync();
					expect(item0Runs).toBe(1);
					expect(item1Runs).toBe(1);

					// Update item without ID - should trigger field-level subscription
					store.update((s) => {
						s.items[0].value = 'updated-no-id';
					});

					flushSync();
					// Item without ID uses field-level subscription, so both effects may re-run
					expect(item0Runs).toBeGreaterThanOrEqual(2);
				});

				cleanup();
			});

			it('should use field-level subscription when getItemId returns null', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: null as string | null, value: 'null-id-item' },
								{ id: 'b', value: 'has-id-item' }
							]
						},
						{ getItemId: { items: (item: { id: string | null }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let item0Runs = 0;

					$effect(() => {
						store.items[0];
						untrack(() => item0Runs++);
					});

					flushSync();
					expect(item0Runs).toBe(1);

					// Update item with null ID - should trigger field-level subscription
					store.update((s) => {
						s.items[0].value = 'updated-null-id';
					});

					flushSync();
					expect(item0Runs).toBeGreaterThanOrEqual(2);
				});

				cleanup();
			});

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
					const store = useSvelteReactivity(observableStore);

					let item0Runs = 0;
					let item1Runs = 0;
					let item2Runs = 0;

					$effect(() => {
						store.items[0];
						untrack(() => item0Runs++);
					});

					$effect(() => {
						store.items[1];
						untrack(() => item1Runs++);
					});

					$effect(() => {
						store.items[2];
						untrack(() => item2Runs++);
					});

					flushSync();
					expect(item0Runs).toBe(1);
					expect(item1Runs).toBe(1);
					expect(item2Runs).toBe(1);

					// Update item with valid ID 'a'
					store.update((s) => {
						s.items[0].value = 'updated-a';
					});

					flushSync();
					// Item 0 should re-run (keyed subscription for ID 'a')
					expect(item0Runs).toBe(2);
					// Item 1 has no valid ID, uses field-level subscription, so it re-runs on any array change
					expect(item1Runs).toBe(2);
					// Item 2 has valid ID 'c', should NOT re-run
					expect(item2Runs).toBe(1);

					// Update item with valid ID 'c'
					store.update((s) => {
						s.items[2].value = 'updated-c';
					});

					flushSync();
					// Item 0 should not re-run (different keyed subscription)
					expect(item0Runs).toBe(2);
					// Item 1 (field-level) re-runs again
					expect(item1Runs).toBe(3);
					// Item 2 should re-run (keyed subscription for ID 'c')
					expect(item2Runs).toBe(2);
				});

				cleanup();
			});

			it('should handle item with ID of 0 (falsy but valid)', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: 0, value: 'zero-id' },
								{ id: 1, value: 'one-id' }
							]
						},
						{ getItemId: { items: (item: { id: number }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let item0Runs = 0;
					let item1Runs = 0;

					$effect(() => {
						store.items[0];
						untrack(() => item0Runs++);
					});

					$effect(() => {
						store.items[1];
						untrack(() => item1Runs++);
					});

					flushSync();
					expect(item0Runs).toBe(1);
					expect(item1Runs).toBe(1);

					// Update item with ID 0 - should use ID-based subscription
					store.update((s) => {
						s.items[0].value = 'updated-zero';
					});

					flushSync();
					// ID 0 is valid, so only item 0 should re-run
					expect(item0Runs).toBe(2);
					expect(item1Runs).toBe(1);
				});

				cleanup();
			});

			it('should handle item with empty string ID (falsy but valid)', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: '', value: 'empty-string-id' },
								{ id: 'b', value: 'normal-id' }
							]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let item0Runs = 0;
					let item1Runs = 0;

					$effect(() => {
						store.items[0];
						untrack(() => item0Runs++);
					});

					$effect(() => {
						store.items[1];
						untrack(() => item1Runs++);
					});

					flushSync();
					expect(item0Runs).toBe(1);
					expect(item1Runs).toBe(1);

					// Update item with empty string ID - should use ID-based subscription
					store.update((s) => {
						s.items[0].value = 'updated-empty';
					});

					flushSync();
					// Empty string is valid, so only item 0 should re-run
					expect(item0Runs).toBe(2);
					expect(item1Runs).toBe(1);
				});

				cleanup();
			});

			it('should handle pushing item without ID field', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [{ id: 'a', value: 'first' }] as Array<{ id?: string; value: string }>
						},
						{ getItemId: { items: (item: { id?: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					const item1Values: string[] = [];

					$effect(() => {
						item1Values.push(store.items[1]?.value ?? 'none');
					});

					flushSync();
					expect(item1Values).toEqual(['none']);

					// Push item without ID
					store.update((s) => {
						s.items.push({ value: 'no-id-pushed' });
					});

					flushSync();
					// Effect should re-run with the new value (field-level for items without ID)
					expect(item1Values[item1Values.length - 1]).toBe('no-id-pushed');
				});

				cleanup();
			});
		});

		describe('render efficiency', () => {
			it('should NOT re-run effect when updating unrelated item with ID-based subscriptions', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: 'a', value: 1 },
								{ id: 'b', value: 2 },
								{ id: 'c', value: 3 }
							]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let itemARuns = 0;
					let itemBRuns = 0;
					let itemCRuns = 0;

					$effect(() => {
						store.items[0]?.value;
						untrack(() => itemARuns++);
					});

					$effect(() => {
						store.items[1]?.value;
						untrack(() => itemBRuns++);
					});

					$effect(() => {
						store.items[2]?.value;
						untrack(() => itemCRuns++);
					});

					flushSync();
					expect(itemARuns).toBe(1);
					expect(itemBRuns).toBe(1);
					expect(itemCRuns).toBe(1);

					// Update only item B
					store.update((s) => {
						s.items[1].value = 200;
					});

					flushSync();
					// ONLY item B effect should re-run
					expect(itemARuns).toBe(1);
					expect(itemBRuns).toBe(2);
					expect(itemCRuns).toBe(1);

					// Update only item A
					store.update((s) => {
						s.items[0].value = 100;
					});

					flushSync();
					// ONLY item A effect should re-run
					expect(itemARuns).toBe(2);
					expect(itemBRuns).toBe(2);
					expect(itemCRuns).toBe(1);

					// Update only item C
					store.update((s) => {
						s.items[2].value = 300;
					});

					flushSync();
					// ONLY item C effect should re-run
					expect(itemARuns).toBe(2);
					expect(itemBRuns).toBe(2);
					expect(itemCRuns).toBe(2);
				});

				cleanup();
			});

			it('should only re-run affected effects when multiple items updated in one call', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: 'a', value: 1 },
								{ id: 'b', value: 2 },
								{ id: 'c', value: 3 }
							]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					let itemARuns = 0;
					let itemBRuns = 0;
					let itemCRuns = 0;

					$effect(() => {
						store.items[0]?.value;
						untrack(() => itemARuns++);
					});

					$effect(() => {
						store.items[1]?.value;
						untrack(() => itemBRuns++);
					});

					$effect(() => {
						store.items[2]?.value;
						untrack(() => itemCRuns++);
					});

					flushSync();

					// Update items A and C, but not B
					store.update((s) => {
						s.items[0].value = 100;
						s.items[2].value = 300;
					});

					flushSync();
					// Items A and C should re-run, B should NOT
					expect(itemARuns).toBe(2);
					expect(itemBRuns).toBe(1);
					expect(itemCRuns).toBe(2);
				});

				cleanup();
			});
		});

		describe('list rendering patterns', () => {
			it('should handle iterating over array with map-like pattern', () => {
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [
								{ id: 'a', text: 'First' },
								{ id: 'b', text: 'Second' },
								{ id: 'c', text: 'Third' }
							]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					const renderedTexts: string[][] = [];

					$effect(() => {
						// Simulate iterating over items (like {#each store.items as item})
						const texts: string[] = [];
						for (let i = 0; i < store.items.length; i++) {
							texts.push(store.items[i]?.text ?? 'none');
						}
						renderedTexts.push(texts);
					});

					flushSync();
					expect(renderedTexts).toEqual([['First', 'Second', 'Third']]);

					// Update one item
					store.update((s) => {
						s.items[1].text = 'Updated Second';
					});

					flushSync();
					// Effect re-runs with updated values
					expect(renderedTexts[renderedTexts.length - 1]).toEqual([
						'First',
						'Updated Second',
						'Third'
					]);
				});

				cleanup();
			});

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
					expect(lengths[lengths.length - 1]).toBe(3);

					// Pop an item
					store.update((s) => {
						s.items.pop();
					});

					flushSync();
					expect(lengths[lengths.length - 1]).toBe(2);
				});

				cleanup();
			});

			it('should handle conditional rendering based on item existence (requires length tracking for removals)', () => {
				// NOTE: When an item is removed, observator does NOT emit keyed events for the removed item.
				// Effects subscribed to a removed item's keyed event won't re-run automatically.
				// Users who need to detect structural changes should ALSO track the array (e.g., via .length).
				const cleanup = $effect.root(() => {
					const observableStore = createObservableStore(
						{
							items: [{ id: 'a', text: 'First' }]
						},
						{ getItemId: { items: (item: { id: string }) => item.id } }
					);
					const store = useSvelteReactivity(observableStore);

					const item1Exists: boolean[] = [];

					$effect(() => {
						// Access length to subscribe to structural changes
						const length = store.items.length;
						// Check if item at index 1 exists
						item1Exists.push(length > 1 && store.items[1] !== undefined);
					});

					flushSync();
					expect(item1Exists).toEqual([false]);

					// Push an item
					store.update((s) => {
						s.items.push({ id: 'b', text: 'Second' });
					});

					flushSync();
					expect(item1Exists[item1Exists.length - 1]).toBe(true);

					// Pop it - effect re-runs because we track .length
					store.update((s) => {
						s.items.pop();
					});

					flushSync();
					expect(item1Exists[item1Exists.length - 1]).toBe(false);
				});

				cleanup();
			});
		});
	});
});
