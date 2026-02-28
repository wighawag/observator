<script lang="ts">
	import { untrack } from 'svelte';
	import type { ReactiveStoreWithFields } from './store.svelte.js';

	type State = {
		count: number;
		name: string;
		users?: Record<string, { online: boolean }>;
	};

	interface Props {
		store: ReactiveStoreWithFields<State>;
	}

	let { store }: Props = $props();

	// Track render counts for each field
	let countRenderCount = $state(0);
	let nameRenderCount = $state(0);
	let aliceRenderCount = $state(0);
	let bobRenderCount = $state(0);

	// Effect for count field
	$effect(() => {
		store.count; // Subscribe to count
		untrack(() => {
			countRenderCount++;
		});
	});

	// Effect for name field
	$effect(() => {
		store.name; // Subscribe to name
		untrack(() => {
			nameRenderCount++;
		});
	});

	// We need to check if users exists at the store level without triggering reactivity
	const hasUsers = () => store.getRaw('users') !== undefined;

	// Effects for keyed access (alice and bob) - only subscribe to keyed, not the whole field
	$effect(() => {
		// Only subscribe to keyed alice - don't read the whole users field
		const users = untrack(() => store.getRaw('users'));
		if (users) {
			store.keyed.users?.('alice'); // Subscribe to alice keyed event only
		}
		untrack(() => {
			aliceRenderCount++;
		});
	});

	$effect(() => {
		// Only subscribe to keyed bob - don't read the whole users field
		const users = untrack(() => store.getRaw('users'));
		if (users) {
			store.keyed.users?.('bob'); // Subscribe to bob keyed event only
		}
		untrack(() => {
			bobRenderCount++;
		});
	});
</script>

<div>
	<div data-testid="count">{store.count}</div>
	<div data-testid="name">{store.name}</div>
	<div data-testid="count-renders">{countRenderCount}</div>
	<div data-testid="name-renders">{nameRenderCount}</div>

	{#if hasUsers()}
		<div data-testid="alice-status">
			{store.keyed.users?.('alice')?.online ? 'online' : 'offline'}
		</div>
		<div data-testid="bob-status">
			{store.keyed.users?.('bob')?.online ? 'online' : 'offline'}
		</div>
		<div data-testid="alice-renders">{aliceRenderCount}</div>
		<div data-testid="bob-renders">{bobRenderCount}</div>
	{/if}
</div>
