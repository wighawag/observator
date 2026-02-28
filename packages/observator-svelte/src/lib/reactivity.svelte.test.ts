import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { createObservableStore } from 'observator';
import { useSvelteReactivity } from './store.svelte.js';
import TestComponent from './TestComponent.test.svelte';
import TestArrayComponent from './TestArrayComponent.test.svelte';

describe('Svelte Reactivity', () => {
	afterEach(() => {
		cleanup();
	});

	describe('field-level reactivity', () => {
		it('should re-render when a field changes', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial'
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			// Initial state
			const countDisplay = page.getByTestId('count');
			await expect.element(countDisplay).toHaveTextContent('0');

			// Update count
			store.update((s) => {
				s.count = 5;
			});

			// Should re-render with new value
			await expect.element(countDisplay).toHaveTextContent('5');
		});

		it('should track render counts independently per field', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial'
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			const countRenders = page.getByTestId('count-renders');
			const nameRenders = page.getByTestId('name-renders');

			// Initial render
			await expect.element(countRenders).toHaveTextContent('1');
			await expect.element(nameRenders).toHaveTextContent('1');

			// Update count only
			store.update((s) => {
				s.count = 1;
			});

			// Count effect should re-run, name effect should NOT
			await expect.element(countRenders).toHaveTextContent('2');
			await expect.element(nameRenders).toHaveTextContent('1');

			// Update name only
			store.update((s) => {
				s.name = 'updated';
			});

			// Name effect should re-run, count effect should NOT
			await expect.element(countRenders).toHaveTextContent('2');
			await expect.element(nameRenders).toHaveTextContent('2');
		});

		it('should handle multiple updates in sequence', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial'
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			const countDisplay = page.getByTestId('count');

			// Multiple updates
			store.update((s) => {
				s.count = 1;
			});
			await expect.element(countDisplay).toHaveTextContent('1');

			store.update((s) => {
				s.count = 2;
			});
			await expect.element(countDisplay).toHaveTextContent('2');

			store.update((s) => {
				s.count = 100;
			});
			await expect.element(countDisplay).toHaveTextContent('100');
		});

		it('should react to updates from original ObservableStore', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial'
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			const countDisplay = page.getByTestId('count');
			await expect.element(countDisplay).toHaveTextContent('0');

			// Update via the ORIGINAL store, not the reactive wrapper
			observableStore.update((s) => {
				s.count = 42;
			});

			// Reactive store should still pick up the change
			await expect.element(countDisplay).toHaveTextContent('42');
		});
	});

	describe('keyed reactivity', () => {
		it('should update keyed values reactively', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial',
				users: {
					alice: { online: true },
					bob: { online: false }
				} as Record<string, { online: boolean }>
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			const aliceStatus = page.getByTestId('alice-status');
			await expect.element(aliceStatus).toHaveTextContent('online');

			// Update alice's status
			store.update((s) => {
				s.users.alice.online = false;
			});

			await expect.element(aliceStatus).toHaveTextContent('offline');
		});

		it('should only re-render for relevant keyed updates', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial',
				users: {
					alice: { online: true },
					bob: { online: false }
				} as Record<string, { online: boolean }>
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			const aliceRenders = page.getByTestId('alice-renders');
			const bobRenders = page.getByTestId('bob-renders');

			// Initial render
			await expect.element(aliceRenders).toHaveTextContent('1');
			await expect.element(bobRenders).toHaveTextContent('1');

			// Update alice only - bob should NOT re-render
			store.update((s) => {
				s.users.alice.online = false;
			});

			await expect.element(aliceRenders).toHaveTextContent('2');
			await expect.element(bobRenders).toHaveTextContent('1');

			// Update bob only - alice should NOT re-render
			store.update((s) => {
				s.users.bob.online = true;
			});

			await expect.element(aliceRenders).toHaveTextContent('2');
			await expect.element(bobRenders).toHaveTextContent('2');
		});
	});

	describe('multi-field updates', () => {
		it('should handle updates to multiple fields in one call', async () => {
			const observableStore = createObservableStore({
				count: 0,
				name: 'initial'
			});
			const store = useSvelteReactivity(observableStore);

			render(TestComponent, { store });

			const countDisplay = page.getByTestId('count');
			const nameDisplay = page.getByTestId('name');
			const countRenders = page.getByTestId('count-renders');
			const nameRenders = page.getByTestId('name-renders');

			// Update both fields at once
			store.update((s) => {
				s.count = 10;
				s.name = 'both updated';
			});

			await expect.element(countDisplay).toHaveTextContent('10');
			await expect.element(nameDisplay).toHaveTextContent('both updated');

			// Both effects should have re-run
			await expect.element(countRenders).toHaveTextContent('2');
			await expect.element(nameRenders).toHaveTextContent('2');
		});
	});

	describe('keyed array reactivity', () => {
		it('should update keyed array values reactively', async () => {
			const observableStore = createObservableStore({
				items: [
					{ id: 0, text: 'First', done: false },
					{ id: 1, text: 'Second', done: false },
					{ id: 2, text: 'Third', done: false }
				]
			});
			const store = useSvelteReactivity(observableStore);

			render(TestArrayComponent, { store });

			// Initial state
			const item0Text = page.getByTestId('item0-text');
			const item0Done = page.getByTestId('item0-done');
			await expect.element(item0Text).toHaveTextContent('First');
			await expect.element(item0Done).toHaveTextContent('pending');

			// Update first item
			store.update((s) => {
				s.items[0].done = true;
			});

			await expect.element(item0Done).toHaveTextContent('done');
		});

		it('should only re-render for relevant array index updates', async () => {
			const observableStore = createObservableStore({
				items: [
					{ id: 0, text: 'First', done: false },
					{ id: 1, text: 'Second', done: false },
					{ id: 2, text: 'Third', done: false }
				]
			});
			const store = useSvelteReactivity(observableStore);

			render(TestArrayComponent, { store });

			const item0Renders = page.getByTestId('item0-renders');
			const item1Renders = page.getByTestId('item1-renders');
			const item2Renders = page.getByTestId('item2-renders');

			// Initial render
			await expect.element(item0Renders).toHaveTextContent('1');
			await expect.element(item1Renders).toHaveTextContent('1');
			await expect.element(item2Renders).toHaveTextContent('1');

			// Update only index 0 - indices 1 and 2 should NOT re-render
			store.update((s) => {
				s.items[0].done = true;
			});

			await expect.element(item0Renders).toHaveTextContent('2');
			await expect.element(item1Renders).toHaveTextContent('1');
			await expect.element(item2Renders).toHaveTextContent('1');

			// Update only index 1 - indices 0 and 2 should NOT re-render
			store.update((s) => {
				s.items[1].text = 'Modified Second';
			});

			await expect.element(item0Renders).toHaveTextContent('2');
			await expect.element(item1Renders).toHaveTextContent('2');
			await expect.element(item2Renders).toHaveTextContent('1');

			// Update only index 2 - indices 0 and 1 should NOT re-render
			store.update((s) => {
				s.items[2].done = true;
			});

			await expect.element(item0Renders).toHaveTextContent('2');
			await expect.element(item1Renders).toHaveTextContent('2');
			await expect.element(item2Renders).toHaveTextContent('2');
		});

		it('should handle array push operations', async () => {
			const observableStore = createObservableStore({
				items: [
					{ id: 0, text: 'First', done: false },
					{ id: 1, text: 'Second', done: false }
				]
			});
			const store = useSvelteReactivity(observableStore);

			render(TestArrayComponent, { store });

			// Initially item2 doesn't exist
			const item2Text = page.getByTestId('item2-text');
			await expect.element(item2Text).toHaveTextContent('none');

			// Push a new item
			store.update((s) => {
				s.items.push({ id: 2, text: 'Pushed', done: false });
			});

			// Now item2 should exist and have the new text
			await expect.element(item2Text).toHaveTextContent('Pushed');
		});

		it('should handle array modifications reactively', async () => {
			const observableStore = createObservableStore({
				items: [
					{ id: 0, text: 'First', done: false },
					{ id: 1, text: 'Second', done: false },
					{ id: 2, text: 'Third', done: false }
				]
			});
			const store = useSvelteReactivity(observableStore);

			render(TestArrayComponent, { store });

			const item1Text = page.getByTestId('item1-text');
			await expect.element(item1Text).toHaveTextContent('Second');

			// Replace entire item at index 1
			store.update((s) => {
				s.items[1] = { id: 1, text: 'Replaced', done: true };
			});

			await expect.element(item1Text).toHaveTextContent('Replaced');
		});
	});
});
