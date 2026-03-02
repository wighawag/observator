import type {KeyedEventMap} from 'radiate';

export type NonPrimitive = object | Array<unknown>;

/**
 * Generate event name for a field key
 * @example EventName<'user'> // 'user:updated'
 */
export type EventName<K extends string> = `${K}:updated`;

/**
 * Extract event names from state type
 * @example EventNames<{ a: string, b: number }> // 'a:updated' | 'b:updated'
 */
export type EventNames<T extends Record<string, unknown>> =
	| {
			[K in keyof T]: EventName<K & string>;
	  }[keyof T]
	| '*';

export type Key = string | number | symbol | object;

/**
 * Extract only Record field names from state type (excludes Array fields)
 * @example ExtractRecordFields<{ users: Record<string, User>, items: string[] }> // 'users'
 */
export type ExtractRecordFields<T extends Record<string, unknown>> = {
	[K in keyof T]: T[K] extends Array<any> ? never : K;
}[keyof T];

/**
 * Extract only Array field names from state type
 * @example ExtractArrayFields<{ users: Record<string, User>, items: string[] }> // 'items'
 */
export type ExtractArrayFields<T extends Record<string, unknown>> = {
	[K in keyof T]: T[K] extends Array<any> ? K : never;
}[keyof T];

/**
 * Event names for Record fields only
 */
export type RecordEventNames<T extends Record<string, unknown>> = EventName<
	ExtractRecordFields<T> & string
>;

/**
 * Event names for Array fields only
 */
export type ArrayEventNames<T extends Record<string, unknown>> = EventName<
	ExtractArrayFields<T> & string
>;

/**
 * Extract key type from a field type
 * - For Record<K, V>, extracts K as the key type (constrained to Key)
 * - For Array<V>, extracts number as the key type (array indices)
 * - For other types, falls back to string
 *
 * Note: JSON Patch paths only support string and number, not symbol
 */
export type ExtractKeyType<T> =
	T extends Array<any>
		? number
		: T extends Record<infer K, any>
			? K extends Key
				? K
				: string
			: string;

/**
 * Extract key type for Records - only allows Key types
 * Returns never for array types
 */
export type ExtractRecordKeyType<T> = T extends Array<any>
	? never
	: T extends Record<infer K, any>
		? K extends Key
			? K
			: string
		: never;

/**
 * Extract ID type from array items (always string | number from getItemId)
 */
export type ExtractItemIdType<T> = T extends Array<any> ? string | number : never;

/**
 * Keyed event map type for fine-grained subscriptions
 * Maps event names to their key and patch data structure
 */
export type KeyedObservableEventMap<T extends Record<string, unknown>> = KeyedEventMap<{
	[K in keyof T as EventName<K & string>]: {
		id: ExtractKeyType<T[K]>;
		data: Patches;
	};
}>;

/**
 * Subscriptions map type for value-based subscriptions
 * Maps each field key to a subscribe function that:
 * - Executes the callback immediately with the current value
 * - Executes the callback on every field update
 * - Returns an unsubscribe function
 *
 * @example
 * ```ts
 * type State = { counter: { value: number }, user: { name: string } };
 * type SubscriptionsMap = SubscriptionsMap<State>;
 * // {
 * //   counter: (callback: (value: { value: number }) => void) => () => void;
 * //   user: (callback: (value: { name: string }) => void) => () => void;
 * // }
 * ```
 */
export type SubscriptionsMap<T extends Record<string, unknown>> = {
	[K in keyof T]: (callback: (value: Readonly<T[K]>) => void) => () => void;
};

/**
 * Key subscriptions map type for value-based subscriptions on Record fields
 * Maps each Record field key to a function that takes a key and returns a subscribe function
 * The subscribe function:
 * - Executes the callback immediately with the current value
 * - Executes the callback on every field update for that specific key
 * - Returns an unsubscribe function
 *
 * @example
 * ```ts
 * type State = { users: Record<string, { name: string }> };
 * type KeySubscriptionsMap = KeySubscriptionsMap<State>;
 * // {
 * //   users: {
 * //     (key: string): (callback: (value: Record<string, { name: string }>) => void) => () => void;
 * //   }
 * // }
 * ```
 */
export type KeySubscriptionsMap<T extends Record<string, unknown>> = {
	[K in ExtractRecordFields<T>]: {
		(key: ExtractRecordKeyType<T[K]>): (callback: (value: Readonly<T[K]>) => void) => () => void;
	};
};

/**
 * Item ID subscriptions map type for value-based subscriptions on Array fields
 * Maps each Array field key to a function that takes an item ID and returns a subscribe function
 * The subscribe function:
 * - Executes the callback immediately with the current value
 * - Executes the callback on every field update for that specific item ID
 * - Returns an unsubscribe function
 *
 * NOTE: Only fires when item properties are updated, NOT when item is removed.
 *
 * @example
 * ```ts
 * type State = { todos: Array<{ id: string; text: string }> };
 * type ItemIdSubscriptionsMap = ItemIdSubscriptionsMap<State>;
 * // {
 * //   todos: {
 * //     (itemId: string | number): (callback: (value: Array<...>) => void) => () => void;
 * //   }
 * // }
 * ```
 */
export type ItemIdSubscriptionsMap<T extends Record<string, unknown>> = {
	[K in ExtractArrayFields<T>]: {
		(itemId: string | number): (callback: (value: Readonly<T[K]>) => void) => () => void;
	};
};

/**
 * @deprecated Use KeySubscriptionsMap for Record fields or ItemIdSubscriptionsMap for Array fields
 */
export type KeyedSubscriptionsMap<T extends Record<string, unknown>> = {
	[K in keyof T]: {
		(key: ExtractKeyType<T[K]>): (callback: (value: Readonly<T[K]>) => void) => () => void;
	};
};

export const Operation = {
	Remove: 'remove',
	Replace: 'replace',
	Add: 'add',
} as const;

export type PatchOp = (typeof Operation)[keyof typeof Operation];

/**
 * Function that extracts an ID from an item value
 */
export type GetItemIdFunction = (value: any) => string | number | undefined | null;

/**
 * Recursive configuration for getItemId - can be a function or nested object
 */
export type GetItemIdConfig = {
	[key: string]: GetItemIdFunction | GetItemIdConfig;
};

export type PatchPath = (string | number | symbol | object)[];

export type Patch = {
	path: PatchPath;
	op: PatchOp;
	value?: any;
	/**
	 * Optional previous value for replace operations.
	 * Populated by patch-recorder for array length changes.
	 */
	oldValue?: any;
	/**
	 * Optional ID of the item being removed or replaced.
	 * Populated when getItemId option is configured for the item's parent path.
	 */
	id?: string | number;
};

export type Patches = Patch[];

export type RecordPatchesFunction = <T extends NonPrimitive>(
	state: T,
	mutate: (state: T) => void,
	options?: {getItemId?: GetItemIdConfig},
) => Patches;

export type CreateFunction = <T extends NonPrimitive>(
	state: T,
	mutate: (state: T) => void,
	getItemId?: GetItemIdConfig,
) => [T, Patches];
