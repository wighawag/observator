import { createSubscriber } from 'svelte/reactivity';
import type { ObservableStore } from 'observator';
import type { NonPrimitive, ExtractKeyType, Patches, Key } from 'observator';

/**
 * Type for keyed accessors - provides functions to access specific keys within Record/Array fields
 */
export type KeyedAccessors<T extends Record<string, unknown>> = {
	[K in keyof T]: (
		key: ExtractKeyType<T[K]>
	) => T[K] extends Array<infer V>
		? V | undefined
		: T[K] extends Record<any, infer V>
			? V | undefined
			: T[K] | undefined;
};

/**
 * ReactiveStore with reactive field getters
 * Combines the base class with dynamic field properties
 */
export type ReactiveStoreWithFields<T extends Record<string, unknown> & NonPrimitive> =
	ReactiveStore<T> & {
		readonly [K in keyof T]: T[K];
	};

/**
 * ReactiveStore wraps an existing ObservableStore with Svelte 5 reactive getters.
 *
 * Uses `createSubscriber` from `svelte/reactivity` to integrate ObservableStore's
 * event system with Svelte's reactivity. Getters become reactive when read inside effects.
 *
 * Reactivity granularity:
 * - **Field level**: Each top-level field has its own subscription
 * - **Keyed level**: For Record/Array fields, specific keys can be subscribed individually
 *
 * @example
 * ```svelte
 * <script>
 *   import { createObservableStore } from 'observator';
 *   import { useSvelteReactivity } from 'observator-svelte';
 *
 *   const observableStore = createObservableStore({ count: 0, user: { name: 'John' } });
 *   const store = useSvelteReactivity(observableStore);
 * </script>
 *
 * <!-- Reactive: re-renders when count changes -->
 * <p>{store.count}</p>
 *
 * <!-- Reactive: re-renders when user changes (any property) -->
 * <p>{store.user.name}</p>
 * ```
 */
export class ReactiveStore<T extends Record<string, unknown> & NonPrimitive> {
	private readonly fieldSubscribers: Map<keyof T, () => void> = new Map();
	private readonly keyedSubscribers: Map<string, () => void> = new Map();

	/**
	 * Keyed access for Record/Array fields.
	 * Returns a function that takes a key and returns the value at that key.
	 *
	 * @example
	 * ```svelte
	 * <!-- Only re-renders when user 'alice' changes -->
	 * <p>{store.keyed.users('alice')?.name}</p>
	 * ```
	 */
	public readonly keyed: KeyedAccessors<T>;

	constructor(private readonly observableStore: ObservableStore<T>) {
		this.keyed = this.createKeyedAccessors();

		// Create reactive getters for each field
		this.createFieldGetters();
	}

	/**
	 * Get or create a subscriber for a field using createSubscriber.
	 * The subscription only activates when the getter is read inside an effect.
	 */
	private getOrCreateFieldSubscriber<K extends keyof T>(field: K): () => void {
		if (!this.fieldSubscribers.has(field)) {
			const subscriber = createSubscriber((update) => {
				// Subscribe to field:updated event
				const eventName = `${String(field)}:updated` as `${string}:updated`;
				const unsubscribe = this.observableStore.on(eventName as any, () => {
					update(); // Trigger re-run of any effects reading this field
				});

				// Cleanup when all effects are destroyed
				return () => unsubscribe();
			});

			this.fieldSubscribers.set(field, subscriber);
		}
		return this.fieldSubscribers.get(field)!;
	}

	/**
	 * Create reactive getters on `this` for each field in the state.
	 * Uses Object.defineProperty to create getters that:
	 * 1. Call the subscriber (making the read reactive)
	 * 2. Return the current value from ObservableStore
	 */
	private createFieldGetters(): void {
		const state = this.observableStore.getState();

		for (const field of Object.keys(state) as Array<keyof T>) {
			Object.defineProperty(this, field, {
				get: () => {
					// Make this read reactive by calling the subscriber
					this.getOrCreateFieldSubscriber(field)();
					// Return current value
					return this.observableStore.get(field);
				},
				enumerable: true,
				configurable: false
			});
		}
	}

	/**
	 * Create keyed accessors for Record/Array fields.
	 * Provides fine-grained reactivity for specific keys.
	 */
	private createKeyedAccessors(): KeyedAccessors<T> {
		const accessors = {} as KeyedAccessors<T>;
		const state = this.observableStore.getState();

		for (const field of Object.keys(state) as Array<keyof T>) {
			accessors[field] = ((key: ExtractKeyType<T[typeof field]>) => {
				const cacheKey = `${String(field)}:${String(key)}`;

				if (!this.keyedSubscribers.has(cacheKey)) {
					const subscriber = createSubscriber((update) => {
						const eventName = `${String(field)}:updated` as `${string}:updated`;
						const unsubscribe = this.observableStore.onKeyed(eventName as any, key as Key, () => {
							update();
						});
						return () => unsubscribe();
					});
					this.keyedSubscribers.set(cacheKey, subscriber);
				}

				// Make read reactive
				this.keyedSubscribers.get(cacheKey)!();

				// Return value at key
				const fieldValue = this.observableStore.get(field);
				if (Array.isArray(fieldValue)) {
					return fieldValue[key as number];
				} else if (fieldValue && typeof fieldValue === 'object') {
					return (fieldValue as Record<any, any>)[key];
				}
				return undefined;
			}) as any;
		}

		return accessors;
	}

	/**
	 * Update state - delegates to ObservableStore.
	 * After mutation, affected field subscribers will trigger re-renders.
	 *
	 * @param mutate - Mutation function that receives the state
	 * @returns Array of patches describing the changes
	 *
	 * @example
	 * ```ts
	 * store.update((state) => {
	 *   state.count += 1;
	 *   state.user.name = 'Jane';
	 * });
	 * ```
	 */
	public update(mutate: (state: T) => void): Patches {
		return this.observableStore.update(mutate);
	}

	/**
	 * Get raw value without triggering reactivity.
	 * Useful when you need the value but don't want to subscribe.
	 *
	 * @param field - The field key to retrieve
	 * @returns The current value of the field
	 */
	public getRaw<K extends keyof T>(field: K): Readonly<T[K]> {
		return this.observableStore.get(field);
	}

	/**
	 * Get entire state without triggering per-field reactivity.
	 *
	 * @returns A shallow copy of the current state
	 */
	public getState(): Readonly<T> {
		return this.observableStore.getState();
	}

	/**
	 * Access the underlying ObservableStore for advanced usage.
	 * Useful for event-based subscriptions, patches, etc.
	 */
	public get raw(): ObservableStore<T> {
		return this.observableStore;
	}
}

/**
 * Wrap an existing ObservableStore with Svelte 5 reactive getters.
 *
 * Each field in the state becomes a reactive getter that:
 * - Returns the current value from ObservableStore
 * - Subscribes to `field:updated` events when read inside Svelte effects
 * - Automatically unsubscribes when effects are destroyed
 *
 * @param observableStore - An existing ObservableStore instance
 * @returns A ReactiveStore with reactive field getters
 *
 * @example
 * ```typescript
 * import { createObservableStore } from 'observator';
 * import { useSvelteReactivity } from 'observator-svelte';
 *
 * type State = {
 *   count: number;
 *   user: { name: string; age: number };
 *   items: string[];
 * };
 *
 * const observableStore = createObservableStore<State>({
 *   count: 0,
 *   user: { name: 'John', age: 30 },
 *   items: []
 * });
 *
 * // Wrap with Svelte reactivity
 * const store = useSvelteReactivity(observableStore);
 *
 * // In a Svelte component:
 * // {store.count} - reactive
 * // {store.user.name} - reactive (whole user field)
 * // store.update(s => { s.count += 1; }); - triggers update
 * ```
 */
export function useSvelteReactivity<T extends Record<string, unknown> & NonPrimitive>(
	observableStore: ObservableStore<T>
): ReactiveStoreWithFields<T> {
	return new ReactiveStore(observableStore) as ReactiveStoreWithFields<T>;
}
