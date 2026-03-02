import {createEmitter, type Emitter, type KeyedEventMap} from 'radiate';
import {recordPatches} from 'patch-recorder';
import {
	EventName,
	EventNames,
	ExtractKeyType,
	ExtractRecordFields,
	ExtractArrayFields,
	ExtractRecordKeyType,
	ExtractItemIdType,
	Key,
	KeyedObservableEventMap,
	KeySubscriptionsMap,
	ItemIdSubscriptionsMap,
	NonPrimitive,
	Patches,
	SubscriptionsMap,
	CreateFunction,
	PatchPath,
	GetItemIdConfig,
} from './types.js';

// Re-export types for consumers
export type {
	EventName,
	EventNames,
	ExtractKeyType,
	ExtractRecordFields,
	ExtractArrayFields,
	ExtractRecordKeyType,
	ExtractItemIdType,
	Key,
	KeyedObservableEventMap,
	KeySubscriptionsMap,
	ItemIdSubscriptionsMap,
	NonPrimitive,
	Patches,
	Patch,
	PatchOp,
	PatchPath,
	SubscriptionsMap,
	CreateFunction,
	GetItemIdConfig,
	GetItemIdFunction,
} from './types.js';

function createFromPatchRecorder<T extends NonPrimitive>(
	state: T,
	mutate: (state: T) => void,
	getItemId?: GetItemIdConfig,
): [T, Patches] {
	return [state, recordPatches<T>(state, mutate, {getItemId})];
}

export type ObservableStoreOptions = {
	createFunction?: CreateFunction;
	getItemId?: GetItemIdConfig;
};

type RecursiveMap<Key, Value> = Map<Key, {value?: Value; children?: RecursiveMap<Key, Value>}>;

/**
 * Type-safe observable store that emits events for each top-level field change.
 *
 * The state can contain any values including primitives, objects, and arrays.
 * Updates apply to the full state, and events are emitted for each field that changed.
 *
 * @example
 * ```ts
 * type State = {
 *   user: { name: string; age: number };
 *   count: number;
 *   items: string[];
 * };
 *
 * const store = createObservableStore<State>({
 *   user: { name: 'John', age: 30 },
 *   count: 0,
 *   items: ['a', 'b']
 * });
 *
 * // Subscribe to user field changes
 * store.on('user:updated', (patches) => {
 *   console.log('User changed:', patches);
 * });
 *
 * // Subscribe to count field changes
 * store.on('count:updated', (patches) => {
 *   console.log('Count changed:', patches);
 * });
 *
 * // Update multiple fields at once
 * store.update((state) => {
 *   state.user.name = 'Jane';
 *   state.count += 1;
 *   state.items.push('c');
 *   // Emits 'user:updated', 'count:updated', and 'items:updated' events
 * });
 * ```
 */
export class ObservableStore<T extends Record<string, unknown> & NonPrimitive> {
	private emitter: Emitter<any, any>;

	public subscriptions: SubscriptionsMap<T>;
	public keySubscriptions: KeySubscriptionsMap<T>;
	public itemIdSubscriptions: ItemIdSubscriptionsMap<T>;

	private create: CreateFunction;

	private specificListeners: RecursiveMap<PatchPath, {listeners: ((patches: Patches) => void)[]}> =
		new Map();

	private arrayFields: Set<string>;

	constructor(
		protected state: T,
		protected options?: ObservableStoreOptions,
	) {
		this.create = options?.createFunction ?? createFromPatchRecorder;
		this.emitter = createEmitter();
		this.arrayFields = this.detectArrayFields();
		this.subscriptions = this.createSubscribeHandlers();
		this.keySubscriptions = this.createKeySubscribeHandlers();
		this.itemIdSubscriptions = this.createItemIdSubscribeHandlers();
	}

	/**
	 * Detect which fields in the state are arrays
	 */
	private detectArrayFields(): Set<string> {
		const fields = new Set<string>();
		for (const key of Object.keys(this.state)) {
			if (Array.isArray(this.state[key as keyof T])) {
				fields.add(key);
			}
		}
		return fields;
	}

	/**
	 * Update the full state and emit events for each field that changed
	 *
	 * @param mutate - Mutation function that receives a state of the full state
	 *
	 * @example
	 * ```ts
	 * // Update multiple fields at once
	 * store.update((state) => {
	 *   state.user.name = 'Jane';
	 *   state.count += 1;
	 *   state.items.push('c');
	 * });
	 * ```
	 */
	public update(mutate: (state: T) => void): Patches {
		const [newState, patches] = this.create(this.state, mutate, this.options?.getItemId);
		this.state = newState;

		// Group patches by top-level field key
		const {all, topLevel, replacedFields, lengthReductions} = this.groupPatchesByField(patches);

		// Emit wildcard event with all patches
		this.emitter.emit('*', patches);

		// Emit events for each field that changed
		for (const [fieldKey, fieldPatches] of all.entries()) {
			const eventName = `${fieldKey}:updated` as EventNames<T>;

			// Always emit field level event
			this.emitter.emit(eventName, fieldPatches);

			// Conditionally emit keyed events only when there are listeners (performance optimization)
			if (this.emitter.hasKeyedListeners(eventName)) {
				const isArrayField = this.arrayFields.has(fieldKey);

				// For arrays without getItemId, skip keyed events entirely
				if (isArrayField && !this.options?.getItemId?.[fieldKey]) {
					continue; // Skip keyed events for this array field
				}

				const changedKeys = this.extractSecondKeysFromPatches(fieldPatches, isArrayField);

				// For NON-array fields only: handle field replacement and length reductions
				if (!isArrayField) {
					// If field was replaced, notify all registered keyed listeners
					if (replacedFields.has(fieldKey)) {
						const registeredKeys = this.emitter.getKeyedListenerKeys(eventName);
						for (const key of registeredKeys) {
							changedKeys.add(key as Key);
						}
					}

					// Handle length reductions (only for Records, not arrays)
					const reduction = lengthReductions.get(fieldKey);
					if (reduction) {
						for (let i = reduction.newLength; i < reduction.oldLength; i++) {
							changedKeys.add(i);
						}
					}
				}
				// For array fields: changedKeys only contains IDs from patches that have patch.id
				// No special handling for field replacement or length reductions - those don't have patch.id

				for (const changedKey of changedKeys) {
					// Type assertions needed due to TypeScript limitations with generic string literals
					this.emitter.emitKeyed(eventName, changedKey as any, fieldPatches as any);
				}
			}
		}

		// TODO
		// we have a private field RecursiveMap<PatchPath, Listener<Patches>[]> that record listener for specific path
		//   this even support object keys and symbol
		//   if we have at least one listener like that (we should have a boolean acting as a cache or something)
		// if (hasSpecificListeners()) {
		//  then we collect the patches corresponding to the specific listeners
		//  TODO this map need to be crated to reflect the current listeners, adding an empty array for each path a listener is registered
		//    we could also instead use the listener map to also store the patches to be used: RecursiveMap<PatchPath, {listeners: ((patches: Patches) => void)[], patches: Patches}>
		//    if so we would need to reset them to empty array before proceeding
		//  This should be easy as it would follow the same RecursiveMap structure
		// 	const mapOfSpecificListener: RecursiveMap<PatchPath, Patches> = new Map();
		//  then we already implemented collectPatchesForSpecificListeners
		// 	this.collectPatchesForSpecificListeners(patches, mapOfSpecificListener);
		//  finally we recurse through both map and execute the listeners with the respective path
		// 	recurseThroughPatchesAndExecuteListener(mapOfSpecificListener)
		// }

		return patches;
	}

	/**
	 * Get the current value of a field
	 *
	 * @param name - The field key to retrieve
	 * @returns The current value of the field
	 */
	public get<K extends keyof T>(name: K): Readonly<T[K]> {
		return this.state[name];
	}

	/**
	 * Subscribe to updates for a specific field
	 *
	 * @param event - The event name in format `${fieldName}:updated` or '*' to listen to all updates
	 * @param callback - Callback function that receives the patches array
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```ts
	 * const unsubscribe = store.on('user:updated', (patches) => {
	 *   console.log('User changed:', patches);
	 * });
	 *
	 * // Later: unsubscribe();
	 * ```
	 */
	public on(event: EventNames<T>, callback: (patches: Patches) => void): () => void {
		return this.emitter.on(event, callback);
	}

	/**
	 * Unsubscribe from a specific field event
	 *
	 * @param event - The event name in format `${fieldName}:updated` or '*' to unsubscribe from the wildcard event
	 * @param callback - The exact callback function to remove
	 *
	 * @example
	 * ```ts
	 * const callback = (patches) => console.log('User changed:', patches);
	 * store.on('user:updated', callback);
	 *
	 * // Later:
	 * store.off('user:updated', callback);
	 * ```
	 */
	public off(event: EventNames<T>, callback: (patches: Patches) => void): void {
		this.emitter.off(event, callback);
	}

	/**
	 * Subscribe to updates for a specific field for a single emission only
	 *
	 * @param event - The event name in format `${fieldName}:updated` or '*' to listen to all updates for a single emission
	 * @param callback - Callback function that receives the patches array
	 * @returns Unsubscribe function to remove listener before it fires
	 *
	 * @example
	 * ```ts
	 * // Subscribe for single emission
	 * const unsubscribe = store.once('user:updated', (patches) => {
	 *   console.log('User changed once:', patches);
	 * });
	 *
	 * // Callback will fire once, then automatically unsubscribe
	 * ```
	 */
	public once(event: EventNames<T>, callback: (patches: Patches) => void): () => void {
		return this.emitter.once(event, callback);
	}

	// ========================================================================
	// onKey / offKey / onceKey - For Record fields only
	// ========================================================================

	/**
	 * Subscribe to updates for a specific key in a Record field.
	 *
	 * NOTE: This method is for Record fields only. For arrays, use `onItemId`.
	 * Fires when: key is updated, key is deleted, or the entire field is replaced.
	 *
	 * @param event - Record field event name in format `${fieldName}:updated`
	 * @param key - The specific Record key to listen for
	 * @param callback - Callback function that receives the patches array
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```ts
	 * // Subscribe to specific user changes in a Record
	 * const unsubscribe = store.onKey('users:updated', 'user-123', (patches) => {
	 *   console.log('User 123 changed:', patches);
	 * });
	 *
	 * // Later: unsubscribe();
	 * ```
	 */
	public onKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: Key,
		callback: (patches: Patches) => void,
	): () => void;

	/**
	 * Subscribe to all keys in a Record field (wildcard subscription)
	 *
	 * @param event - Record field event name in format `${fieldName}:updated`
	 * @param key - Use '*' to listen to all keys
	 * @param callback - Callback function that receives the key and patches array
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```ts
	 * // Subscribe to all user changes (userId is inferred as string)
	 * const unsubscribe = store.onKey('users:updated', '*', (userId, patches) => {
	 *   console.log(`User ${userId} changed:`, patches);
	 * });
	 * ```
	 */
	public onKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: '*',
		callback: (key: ExtractRecordKeyType<T[K]>, patches: Patches) => void,
	): () => void;

	/** @internal */
	public onKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: Key | '*',
		callback: (...args: any[]) => void,
	): () => void {
		// Type assertions needed due to TypeScript limitations with generic string literals
		return this.emitter.onKeyed(event as any, key as any, callback as any);
	}

	/**
	 * Unsubscribe from a Record field key event
	 *
	 * @param event - Record field event name in format `${fieldName}:updated`
	 * @param key - The specific key to unsubscribe from
	 * @param callback - The exact callback function to remove
	 *
	 * @example
	 * ```ts
	 * const callback = (patches) => console.log('Changed:', patches);
	 * store.onKey('users:updated', 'user-123', callback);
	 *
	 * // Later:
	 * store.offKey('users:updated', 'user-123', callback);
	 * ```
	 */
	public offKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: Key,
		callback: (patches: Patches) => void,
	): void {
		// Type assertions needed due to TypeScript limitations with Key and generic string literals
		this.emitter.offKeyed(event as any, key as any, callback as any);
	}

	/**
	 * Subscribe to a Record field key event for a single emission only
	 *
	 * @param event - Record field event name in format `${fieldName}:updated`
	 * @param key - The specific key to listen for
	 * @param callback - Callback function that receives the patches array
	 * @returns Unsubscribe function to remove listener before it fires
	 *
	 * @example
	 * ```ts
	 * const unsubscribe = store.onceKey('users:updated', 'user-123', (patches) => {
	 *   console.log('User 123 changed once:', patches);
	 * });
	 * ```
	 */
	public onceKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: Key,
		callback: (patches: Patches) => void,
	): () => void;

	/**
	 * Subscribe to all keys in a Record field for a single emission only (wildcard)
	 *
	 * @param event - Record field event name in format `${fieldName}:updated`
	 * @param key - Use '*' to listen to all keys
	 * @param callback - Callback function that receives the key and patches array
	 * @returns Unsubscribe function to remove listener before it fires
	 *
	 * @example
	 * ```ts
	 * const unsubscribe = store.onceKey('users:updated', '*', (userId, patches) => {
	 *   console.log(`User ${userId} changed once:`, patches);
	 * });
	 * ```
	 */
	public onceKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: '*',
		callback: (key: ExtractRecordKeyType<T[K]>, patches: Patches) => void,
	): () => void;

	/** @internal */
	public onceKey<K extends ExtractRecordFields<T>>(
		event: EventName<K & string>,
		key: Key | '*',
		callback: (...args: any[]) => void,
	): () => void {
		// Type assertions needed due to TypeScript limitations with generic string literals
		return this.emitter.onceKeyed(event as any, key as any, callback as any);
	}

	// ========================================================================
	// onItemId / offItemId / onceItemId - For Array fields with getItemId only
	// ========================================================================

	/**
	 * Subscribe to updates for a specific item ID in an Array field.
	 *
	 * NOTE: This method requires getItemId to be configured for the array field.
	 * For Record fields, use `onKey` instead.
	 *
	 * IMPORTANT: This callback ONLY fires when the item's properties are updated,
	 * NOT when the item is removed or the array is replaced. Use `on` for those cases.
	 *
	 * @param event - Array field event name in format `${fieldName}:updated`
	 * @param itemId - The item ID to listen for (as returned by getItemId)
	 * @param callback - Callback function that receives the patches array
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```ts
	 * const store = createObservableStore(
	 *   { todos: [{ id: 'todo-1', text: 'Hello' }] },
	 *   { getItemId: { todos: item => item.id } }
	 * );
	 *
	 * // Subscribe to specific todo item changes
	 * const unsubscribe = store.onItemId('todos:updated', 'todo-1', (patches) => {
	 *   console.log('Todo 1 updated:', patches);
	 * });
	 * ```
	 */
	public onItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: string | number,
		callback: (patches: Patches) => void,
	): () => void;

	/**
	 * Subscribe to all item IDs in an Array field (wildcard subscription)
	 *
	 * @param event - Array field event name in format `${fieldName}:updated`
	 * @param itemId - Use '*' to listen to all item IDs
	 * @param callback - Callback function that receives the item ID and patches array
	 * @returns Unsubscribe function
	 *
	 * @example
	 * ```ts
	 * const unsubscribe = store.onItemId('todos:updated', '*', (itemId, patches) => {
	 *   console.log(`Todo ${itemId} updated:`, patches);
	 * });
	 * ```
	 */
	public onItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: '*',
		callback: (itemId: string | number, patches: Patches) => void,
	): () => void;

	/** @internal */
	public onItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: string | number | '*',
		callback: (...args: any[]) => void,
	): () => void {
		// Validate that getItemId is configured for this array field
		const fieldName = (event as string).replace(':updated', '');
		if (!this.options?.getItemId?.[fieldName]) {
			throw new Error(
				`onItemId requires getItemId configuration for field '${fieldName}'. ` +
					`Configure it when creating the store: createObservableStore(state, { getItemId: { ${fieldName}: item => item.id } })`,
			);
		}
		// Type assertions needed due to TypeScript limitations with generic string literals
		return this.emitter.onKeyed(event as any, itemId as any, callback as any);
	}

	/**
	 * Unsubscribe from an Array field item ID event
	 *
	 * @param event - Array field event name in format `${fieldName}:updated`
	 * @param itemId - The item ID to unsubscribe from
	 * @param callback - The exact callback function to remove
	 *
	 * @example
	 * ```ts
	 * const callback = (patches) => console.log('Changed:', patches);
	 * store.onItemId('todos:updated', 'todo-1', callback);
	 *
	 * // Later:
	 * store.offItemId('todos:updated', 'todo-1', callback);
	 * ```
	 */
	public offItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: string | number,
		callback: (patches: Patches) => void,
	): void {
		// Type assertions needed due to TypeScript limitations
		this.emitter.offKeyed(event as any, itemId as any, callback as any);
	}

	/**
	 * Subscribe to an Array field item ID event for a single emission only
	 *
	 * @param event - Array field event name in format `${fieldName}:updated`
	 * @param itemId - The item ID to listen for
	 * @param callback - Callback function that receives the patches array
	 * @returns Unsubscribe function to remove listener before it fires
	 *
	 * @example
	 * ```ts
	 * const unsubscribe = store.onceItemId('todos:updated', 'todo-1', (patches) => {
	 *   console.log('Todo 1 updated once:', patches);
	 * });
	 * ```
	 */
	public onceItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: string | number,
		callback: (patches: Patches) => void,
	): () => void;

	/**
	 * Subscribe to all item IDs in an Array field for a single emission only (wildcard)
	 *
	 * @param event - Array field event name in format `${fieldName}:updated`
	 * @param itemId - Use '*' to listen to all item IDs
	 * @param callback - Callback function that receives the item ID and patches array
	 * @returns Unsubscribe function to remove listener before it fires
	 *
	 * @example
	 * ```ts
	 * const unsubscribe = store.onceItemId('todos:updated', '*', (itemId, patches) => {
	 *   console.log(`Todo ${itemId} updated once:`, patches);
	 * });
	 * ```
	 */
	public onceItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: '*',
		callback: (itemId: string | number, patches: Patches) => void,
	): () => void;

	/** @internal */
	public onceItemId<K extends ExtractArrayFields<T>>(
		event: EventName<K & string>,
		itemId: string | number | '*',
		callback: (...args: any[]) => void,
	): () => void {
		// Validate that getItemId is configured for this array field
		const fieldName = (event as string).replace(':updated', '');
		if (!this.options?.getItemId?.[fieldName]) {
			throw new Error(
				`onceItemId requires getItemId configuration for field '${fieldName}'. ` +
					`Configure it when creating the store: createObservableStore(state, { getItemId: { ${fieldName}: item => item.id } })`,
			);
		}
		// Type assertions needed due to TypeScript limitations with generic string literals
		return this.emitter.onceKeyed(event as any, itemId as any, callback as any);
	}

	/**
	 * Get the entire current state
	 *
	 * @returns A shallow copy of the current state
	 */
	public getState(): Readonly<T> {
		return {...this.state};
	}

	/**
	 * Get the getItemId configuration for this store
	 *
	 * @returns The getItemId configuration or undefined if not set
	 */
	public getItemIdConfig(): GetItemIdConfig | undefined {
		return this.options?.getItemId;
	}

	// ------------------------------------------------------------------------
	// INTERNAL
	// ------------------------------------------------------------------------

	/**
	 * Create subscribe handlers for all fields in the state
	 * Each handler:
	 * 1. Calls the callback immediately with the current value
	 * 2. Subscribes to field updates to call the callback on each change
	 * 3. Returns an unsubscribe function
	 */
	private createSubscribeHandlers(): SubscriptionsMap<T> {
		const subscriptions = {} as SubscriptionsMap<T>;

		for (const key of Object.keys(this.state) as Array<keyof T>) {
			subscriptions[key] = (callback: (value: Readonly<T[keyof T]>) => void) => {
				// Call immediately with current value
				callback(this.get(key));

				// Subscribe to updates and call callback with new value on each change
				const eventName = `${String(key)}:updated` as EventNames<T>;
				const unsubscribe = this.emitter.on(eventName, () => {
					callback(this.get(key));
				});

				return unsubscribe;
			};
		}

		return subscriptions;
	}

	/**
	 * Create key subscribe handlers for Record fields in the state
	 * Each handler:
	 * 1. Takes a key as parameter
	 * 2. Calls the callback immediately with the current value
	 * 3. Subscribes to key field updates to call the callback on each change
	 * 4. Returns an unsubscribe function
	 *
	 * Note: Only non-array fields are included.
	 */
	private createKeySubscribeHandlers(): KeySubscriptionsMap<T> {
		const keySubscriptions = {} as KeySubscriptionsMap<T>;

		for (const key of Object.keys(this.state) as Array<keyof T>) {
			const fieldValue = this.state[key];

			// Skip array fields - they use itemIdSubscriptions instead
			if (Array.isArray(fieldValue)) {
				continue;
			}

			(keySubscriptions as any)[key] = (subscriptionKey: ExtractRecordKeyType<T[typeof key]>) => {
				return (callback: (value: Readonly<T[keyof T]>) => void) => {
					// Call immediately with current value
					callback(this.get(key));

					// Subscribe to keyed updates and call callback with new value on each change
					const eventName = `${String(key)}:updated` as EventNames<T>;
					const unsubscribe = this.emitter.onKeyed(eventName as any, subscriptionKey as any, () => {
						callback(this.get(key));
					});

					return unsubscribe;
				};
			};
		}

		return keySubscriptions;
	}

	/**
	 * Create item ID subscribe handlers for Array fields with getItemId configuration
	 * Each handler:
	 * 1. Takes an item ID as parameter
	 * 2. Calls the callback immediately with the current value
	 * 3. Subscribes to item ID updates to call the callback on each change
	 * 4. Returns an unsubscribe function
	 *
	 * Note: Only array fields with getItemId configuration are included.
	 */
	private createItemIdSubscribeHandlers(): ItemIdSubscriptionsMap<T> {
		const itemIdSubscriptions = {} as ItemIdSubscriptionsMap<T>;

		for (const key of Object.keys(this.state) as Array<keyof T>) {
			const fieldValue = this.state[key];

			// Only include array fields with getItemId configuration
			if (!Array.isArray(fieldValue) || !this.options?.getItemId?.[key as string]) {
				continue;
			}

			(itemIdSubscriptions as any)[key] = (itemId: string | number) => {
				return (callback: (value: Readonly<T[keyof T]>) => void) => {
					// Call immediately with current value
					callback(this.get(key));

					// Subscribe to item ID updates and call callback with new value on each change
					const eventName = `${String(key)}:updated` as EventNames<T>;
					const unsubscribe = this.emitter.onKeyed(eventName as any, itemId as any, () => {
						callback(this.get(key));
					});

					return unsubscribe;
				};
			};
		}

		return itemIdSubscriptions;
	}

	/**
	 * Extract unique keys from patches
	 * For arrays with getItemId, uses patch.id instead of array index
	 * @param patches - Array of JSON patches
	 * @param isArrayField - Whether this field is an array
	 * @returns Set of unique keys found in patch paths or patch.id for arrays
	 */
	private extractSecondKeysFromPatches(patches: Patches, isArrayField: boolean): Set<Key> {
		const keys = new Set<Key>();
		for (const patch of patches) {
			if (isArrayField) {
				// For arrays, use patch.id if available
				if (patch.id !== undefined && patch.id !== null) {
					keys.add(patch.id);
				}
				// If no patch.id, don't add any key (arrays without getItemId don't support keyed events)
			} else {
				// For non-arrays, use the second path element as before
				if (patch.path.length > 1) {
					keys.add(patch.path[1]);
				}
			}
		}
		return keys;
	}

	/**
	 * Group patches by their top-level field key
	 * @param patches - Array of JSON patches for the full state
	 * @returns Object mapping field keys to their respective patches
	 */
	private groupPatchesByField(patches: Patches): {
		topLevel: Map<string, Patches>;
		all: Map<string, Patches>;
		replacedFields: Set<string>;
		lengthReductions: Map<string, {oldLength: number; newLength: number}>;
	} {
		const topLevel: Map<string, Patches> = new Map();
		const all: Map<string, Patches> = new Map();
		const replacedFields = new Set<string>();
		const lengthReductions = new Map<string, {oldLength: number; newLength: number}>();

		for (const patch of patches) {
			if (patch.path.length === 0) {
				throw new Error(
					'This should never happen, we cannot set the root state in the mutate function',
				);
			}

			const fieldKey = patch.path[0] as string; // top level is string, type enforce it, we could throw upon initialisation ?

			// Track field replacements (patches with path.length === 1)
			if (patch.path.length === 1) {
				replacedFields.add(fieldKey);
			}

			// Detect array length reductions for keyed events
			if (
				patch.path.length === 2 &&
				patch.path[1] === 'length' &&
				patch.op === 'replace' &&
				typeof patch.oldValue === 'number' &&
				typeof patch.value === 'number' &&
				patch.value < patch.oldValue
			) {
				lengthReductions.set(fieldKey, {
					oldLength: patch.oldValue,
					newLength: patch.value,
				});
			}

			if (patch.path.length === 1 || patch.path.length === 2) {
				// we are dealing with patch affecting the field directly
				let topLevelGroup = topLevel.get(fieldKey);
				if (!topLevelGroup) {
					topLevelGroup = [];
					topLevel.set(fieldKey, topLevelGroup);
				}

				// Create a new patch with path relative to the field
				topLevelGroup.push(patch);
			}
			// we are dealing with patch affecting a nested field
			let allGroup = all.get(fieldKey);
			if (!allGroup) {
				allGroup = [];
				all.set(fieldKey, allGroup);
			}
			allGroup.push(patch);
		}

		return {topLevel, all, replacedFields, lengthReductions};
	}

	private collectPatchesForSpecificListeners(
		patches: Patches,
		mapOfSpecificListeners: RecursiveMap<Key, Patches>,
	) {
		for (const patch of patches) {
			let currentMap = mapOfSpecificListeners;
			for (const key of patch.path) {
				if (currentMap.has(key)) {
					const node = currentMap.get(key);
					if (node?.children) {
						currentMap = node.children;
					}
					if (node?.value) {
						node.value?.push(patch);
					}
				}
			}
		}
	}
}

/**
 * Create an ObservableStore instance with the given initial state
 *
 * @param state - The initial state object
 * @returns A new ObservableStore instance
 *
 * @example
 * ```ts
 * const store = createObservableStore({
 *   user: { name: 'John', age: 30 },
 *   counter: { value: 0 }
 * });
 * ```
 */
export function createObservableStore<T extends Record<string, unknown> & NonPrimitive>(
	state: T,
	options?: ObservableStoreOptions,
): ObservableStore<T> {
	return new ObservableStore(state, options);
}

export function createObservableStoreFactory(factoryOptions: ObservableStoreOptions) {
	return function createObservableStore<T extends Record<string, unknown> & NonPrimitive>(
		state: T,
		options?: ObservableStoreOptions,
	): ObservableStore<T> {
		return new ObservableStore(state, options ? {...factoryOptions, ...options} : factoryOptions);
	};
}
