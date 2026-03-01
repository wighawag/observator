// Main exports for observator-svelte
export {
	useSvelteReactivity,
	ReactiveStore,
	type ReactiveStoreWithFields
} from './store.svelte.js';

// Re-export useful types from observator
export type {
	ObservableStore,
	ObservableStoreOptions,
	Patches,
	Patch,
	PatchOp,
	NonPrimitive,
	ExtractKeyType,
	Key
} from 'observator';
