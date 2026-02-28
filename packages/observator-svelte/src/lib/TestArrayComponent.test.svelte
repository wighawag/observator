<script lang="ts">
	import { untrack } from 'svelte';
	import type { ReactiveStoreWithFields } from './store.svelte.js';

	type State = {
		items: Array<{ id: number; text: string; done: boolean }>;
	};

	interface Props {
		store: ReactiveStoreWithFields<State>;
	}

	let { store }: Props = $props();

	// Track render counts for keyed array items
	let item0RenderCount = $state(0);
	let item1RenderCount = $state(0);
	let item2RenderCount = $state(0);

	// Effects for keyed array access - subscribe to specific indices
	$effect(() => {
		store.keyed.items(0); // Subscribe to index 0 keyed event only
		untrack(() => {
			item0RenderCount++;
		});
	});

	$effect(() => {
		store.keyed.items(1); // Subscribe to index 1 keyed event only
		untrack(() => {
			item1RenderCount++;
		});
	});

	$effect(() => {
		store.keyed.items(2); // Subscribe to index 2 keyed event only
		untrack(() => {
			item2RenderCount++;
		});
	});
</script>

<div>
	<div data-testid="item0-text">{store.keyed.items(0)?.text ?? 'none'}</div>
	<div data-testid="item0-done">{store.keyed.items(0)?.done ? 'done' : 'pending'}</div>
	<div data-testid="item1-text">{store.keyed.items(1)?.text ?? 'none'}</div>
	<div data-testid="item1-done">{store.keyed.items(1)?.done ? 'done' : 'pending'}</div>
	<div data-testid="item2-text">{store.keyed.items(2)?.text ?? 'none'}</div>
	<div data-testid="item2-done">{store.keyed.items(2)?.done ? 'done' : 'pending'}</div>
	<div data-testid="item0-renders">{item0RenderCount}</div>
	<div data-testid="item1-renders">{item1RenderCount}</div>
	<div data-testid="item2-renders">{item2RenderCount}</div>
</div>
