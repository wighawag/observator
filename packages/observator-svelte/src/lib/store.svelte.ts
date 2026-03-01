import { createSubscriber } from 'svelte/reactivity';
import type { ObservableStore } from 'observator';
import type { NonPrimitive, Patches, Key } from 'observator';

/**
 * Built-in properties that should not create subscriptions
 */
const BUILTIN_PROPS = new Set(['length', 'constructor', 'prototype', 'toJSON', '__proto__']);

/**
 * ReactiveStore with reactive field getters and proxy-based granular reactivity
 * Combines the base class with dynamic field properties that support automatic keyed subscriptions
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
 * - **Field level**: Primitive fields have field-level subscriptions
 * - **Proxy-based keyed level**: Object/Array fields return proxies that create keyed subscriptions on property access
 *
 * @example
 * ```svelte
 * <script>
 *   import { createObservableStore } from 'observator';
 *   import { useSvelteReactivity } from 'observator-svelte';
 *
 *   const observableStore = createObservableStore({
 *     count: 0,
 *     user: { name: 'John', age: 30 },
 *     users: { alice: { name: 'Alice' } }
 *   });
 *   const store = useSvelteReactivity(observableStore);
 * </script>
 *
 * <!-- Reactive: re-renders when count changes -->
 * <p>{store.count}</p>
 *
 * <!-- Reactive with automatic keyed subscription: re-renders only when user.name changes -->
 * <p>{store.user.name}</p>
 *
 * <!-- Reactive with automatic keyed subscription: re-renders only when users.alice changes -->
 * <p>{store.users.alice?.name}</p>
 * ```
 */
export class ReactiveStore<T extends Record<string, unknown> & NonPrimitive> {
	private readonly fieldSubscribers: Map<keyof T, () => void> = new Map();
	private readonly keyedSubscribers: Map<string, () => void> = new Map();

	// Proxy caches to maintain object identity
	private readonly fieldProxyCache: Map<string, object> = new Map();
	private readonly propertyProxyCache: Map<string, object> = new Map();

	constructor(private readonly observableStore: ObservableStore<T>) {
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
	 * Get or create a keyed subscriber for a specific field and key.
	 * Creates a subscription via onKeyed for granular reactivity.
	 */
	private ensureKeyedSubscription(field: string, key: string | number | symbol): void {
		const cacheKey = `${field}:${String(key)}`;
		if (!this.keyedSubscribers.has(cacheKey)) {
			const subscriber = createSubscriber((update) => {
				const eventName = `${field}:updated` as `${string}:updated`;
				const unsubscribe = this.observableStore.onKeyed(eventName as any, key as Key, () => {
					update();
				});
				return () => unsubscribe();
			});
			this.keyedSubscribers.set(cacheKey, subscriber);
		}
		this.keyedSubscribers.get(cacheKey)!();
	}

	/**
	 * Create a FieldProxy for object/array field values.
	 * The proxy intercepts property access to create keyed subscriptions.
	 */
	private createFieldProxy<V extends object>(field: string, target: V): V {
		const cacheKey = field;
		if (this.fieldProxyCache.has(cacheKey)) {
			return this.fieldProxyCache.get(cacheKey) as V;
		}

		const store = this;
		const isArray = Array.isArray(target);
		const proxy = new Proxy(target, {
			get(target: V, prop: string | symbol, receiver: any): any {
				// Pass through symbols (iterators, etc.)
				if (typeof prop === 'symbol') {
					return Reflect.get(target, prop, receiver);
				}

				// Pass through built-in methods/properties
				if (BUILTIN_PROPS.has(prop)) {
					return Reflect.get(target, prop, receiver);
				}

				const value = Reflect.get(target, prop, receiver);

				// For arrays, convert numeric string keys to numbers
				// Patches from patch-recorder use numeric indices, not strings
				let key: string | number = prop;
				if (isArray && /^\d+$/.test(prop)) {
					key = Number(prop);
				}

				// Create keyed subscription for this property access
				store.ensureKeyedSubscription(field, key);

				// If value is an object, wrap in PropertyProxy for deeper access
				if (value !== null && typeof value === 'object') {
					return store.createPropertyProxy(field, key, value as object);
				}

				return value;
			},
			// Allow iteration
			ownKeys(target: V): (string | symbol)[] {
				return Reflect.ownKeys(target);
			},
			getOwnPropertyDescriptor(target: V, prop: string | symbol) {
				return Reflect.getOwnPropertyDescriptor(target, prop);
			},
			has(target: V, prop: string | symbol): boolean {
				return Reflect.has(target, prop);
			}
		});

		this.fieldProxyCache.set(cacheKey, proxy);
		return proxy as V;
	}

	/**
	 * Create a PropertyProxy for nested object values.
	 * Reuses the parent's keyed subscription for granularity.
	 */
	private createPropertyProxy<V extends object>(
		field: string,
		parentKey: string | number | symbol,
		target: V
	): V {
		const cacheKey = `${field}:${String(parentKey)}`;
		if (this.propertyProxyCache.has(cacheKey)) {
			return this.propertyProxyCache.get(cacheKey) as V;
		}

		const store = this;
		const proxy = new Proxy(target, {
			get(target: V, prop: string | symbol, receiver: any): any {
				// Pass through symbols
				if (typeof prop === 'symbol') {
					return Reflect.get(target, prop, receiver);
				}

				// Pass through built-in properties
				if (BUILTIN_PROPS.has(prop)) {
					return Reflect.get(target, prop, receiver);
				}

				// Ensure the parent keyed subscription is active
				store.ensureKeyedSubscription(field, parentKey);

				const value = Reflect.get(target, prop, receiver);

				// Wrap nested objects (reuse same parent key subscription)
				if (value !== null && typeof value === 'object') {
					// For deeper nesting, we still use the same parentKey subscription
					// Create unique cache key for this nested path
					const nestedCacheKey = `${field}:${String(parentKey)}:${prop}`;
					if (!store.propertyProxyCache.has(nestedCacheKey)) {
						const nestedProxy = new Proxy(value as object, {
							get(target, nestedProp, receiver) {
								if (typeof nestedProp === 'symbol' || BUILTIN_PROPS.has(nestedProp as string)) {
									return Reflect.get(target, nestedProp, receiver);
								}
								// Reuse parent's subscription
								store.ensureKeyedSubscription(field, parentKey);
								return Reflect.get(target, nestedProp, receiver);
							}
						});
						store.propertyProxyCache.set(nestedCacheKey, nestedProxy);
					}
					return store.propertyProxyCache.get(nestedCacheKey);
				}

				return value;
			},
			// Allow iteration
			ownKeys(target: V): (string | symbol)[] {
				return Reflect.ownKeys(target);
			},
			getOwnPropertyDescriptor(target: V, prop: string | symbol) {
				return Reflect.getOwnPropertyDescriptor(target, prop);
			},
			has(target: V, prop: string | symbol): boolean {
				return Reflect.has(target, prop);
			}
		});

		this.propertyProxyCache.set(cacheKey, proxy);
		return proxy as V;
	}

	/**
	 * Create reactive getters on `this` for each field in the state.
	 * - Primitives: Field-level subscription, return value directly
	 * - Objects/Arrays: Return FieldProxy for automatic keyed subscriptions (NO field-level sub)
	 */
	private createFieldGetters(): void {
		const state = this.observableStore.getState();

		for (const field of Object.keys(state) as Array<keyof T>) {
			Object.defineProperty(this, field, {
				get: () => {
					const value = this.observableStore.get(field);

					// For primitives, use field-level subscription
					if (value === null || typeof value !== 'object') {
						this.getOrCreateFieldSubscriber(field)();
						return value;
					}

					// For objects/arrays, return a FieldProxy for automatic keyed subscriptions
					// Do NOT trigger field-level subscription - keyed subs provide fine-grained reactivity
					return this.createFieldProxy(String(field), value as object);
				},
				enumerable: true,
				configurable: false
			});
		}
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
		// Clear proxy caches on update since state may have changed
		this.fieldProxyCache.clear();
		this.propertyProxyCache.clear();
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
 * For object/array fields, property access automatically creates keyed subscriptions
 * for granular reactivity:
 * - `store.users.alice` creates a keyed subscription for 'alice'
 * - `store.user.name` creates a keyed subscription for 'name'
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
 *   users: Record<string, { name: string; online: boolean }>;
 * };
 *
 * const observableStore = createObservableStore<State>({
 *   count: 0,
 *   user: { name: 'John', age: 30 },
 *   users: { alice: { name: 'Alice', online: true } }
 * });
 *
 * // Wrap with Svelte reactivity
 * const store = useSvelteReactivity(observableStore);
 *
 * // In a Svelte component:
 * // {store.count} - reactive (field-level)
 * // {store.user.name} - reactive (keyed subscription on 'name')
 * // {store.users.alice?.name} - reactive (keyed subscription on 'alice')
 * // store.update(s => { s.count += 1; }); - triggers update
 * ```
 */
export function useSvelteReactivity<T extends Record<string, unknown> & NonPrimitive>(
	observableStore: ObservableStore<T>
): ReactiveStoreWithFields<T> {
	return new ReactiveStore(observableStore) as ReactiveStoreWithFields<T>;
}
