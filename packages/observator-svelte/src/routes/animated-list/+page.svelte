<script lang="ts">
	import { createObservableStore } from 'observator';
	import { useSvelteReactivity } from '$lib/index.js';
	import { flip } from 'svelte/animate';
	import { fade, fly, scale } from 'svelte/transition';
	import { quintOut, elasticOut } from 'svelte/easing';

	// Define the state type with unique IDs for animation keying
	type Item = {
		id: string;
		text: string;
		done: boolean;
		priority: number;
	};

	type State = {
		items: Item[];
		nextId: number;
	};

	// Create the ObservableStore with initial state
	const observableStore = createObservableStore<State>({
		items: [
			{ id: 'item-1', text: 'Learn Svelte 5 animations', done: false, priority: 1 },
			{ id: 'item-2', text: 'Build an animated list', done: false, priority: 2 },
			{ id: 'item-3', text: 'Test array operations', done: false, priority: 3 },
			{ id: 'item-4', text: 'Deploy the demo', done: false, priority: 4 }
		],
		nextId: 5
	});

	// Wrap with Svelte reactivity
	const store = useSvelteReactivity(observableStore);

	// Action handlers
	function addItem() {
		const text = prompt('Enter item text:');
		if (text) {
			store.update((s) => {
				const newId = `item-${s.nextId}`;
				s.items.push({
					id: newId,
					text,
					done: false,
					priority: s.items.length + 1
				});
				s.nextId += 1;
			});
		}
	}

	function addItemAtBeginning() {
		const text = prompt('Enter item text:');
		if (text) {
			store.update((s) => {
				const newId = `item-${s.nextId}`;
				s.items.unshift({
					id: newId,
					text,
					done: false,
					priority: 0
				});
				// Update priorities
				s.items.forEach((item, index) => {
					item.priority = index + 1;
				});
				s.nextId += 1;
			});
		}
	}

	function removeItem(id: string) {
		store.update((s) => {
			const index = s.items.findIndex((item) => item.id === id);
			if (index !== -1) {
				s.items.splice(index, 1);
				// Update priorities
				s.items.forEach((item, idx) => {
					item.priority = idx + 1;
				});
			}
		});
	}

	function removeDoneItems() {
		store.update((s) => {
			s.items = s.items.filter((item) => !item.done);
			// Update priorities
			s.items.forEach((item, idx) => {
				item.priority = idx + 1;
			});
		});
	}

	function toggleDone(id: string) {
		store.update((s) => {
			const item = s.items.find((item) => item.id === id);
			if (item) item.done = !item.done;
		});
	}

	function moveUp(id: string) {
		store.update((s) => {
			const index = s.items.findIndex((item) => item.id === id);
			if (index > 0) {
				// Swap with previous item
				const temp = s.items[index];
				s.items[index] = s.items[index - 1];
				s.items[index - 1] = temp;
				// Update priorities
				s.items.forEach((item, idx) => {
					item.priority = idx + 1;
				});
			}
		});
	}

	function moveDown(id: string) {
		store.update((s) => {
			const index = s.items.findIndex((item) => item.id === id);
			if (index < s.items.length - 1) {
				// Swap with next item
				const temp = s.items[index];
				s.items[index] = s.items[index + 1];
				s.items[index + 1] = temp;
				// Update priorities
				s.items.forEach((item, idx) => {
					item.priority = idx + 1;
				});
			}
		});
	}

	function moveToTop(id: string) {
		store.update((s) => {
			const index = s.items.findIndex((item) => item.id === id);
			if (index > 0) {
				const [item] = s.items.splice(index, 1);
				s.items.unshift(item);
				// Update priorities
				s.items.forEach((item, idx) => {
					item.priority = idx + 1;
				});
			}
		});
	}

	function moveToBottom(id: string) {
		store.update((s) => {
			const index = s.items.findIndex((item) => item.id === id);
			if (index < s.items.length - 1) {
				const [item] = s.items.splice(index, 1);
				s.items.push(item);
				// Update priorities
				s.items.forEach((item, idx) => {
					item.priority = idx + 1;
				});
			}
		});
	}

	function reverseList() {
		store.update((s) => {
			s.items.reverse();
			// Update priorities
			s.items.forEach((item, idx) => {
				item.priority = idx + 1;
			});
		});
	}

	function sortByText() {
		store.update((s) => {
			s.items.sort((a, b) => a.text.localeCompare(b.text));
			// Update priorities
			s.items.forEach((item, idx) => {
				item.priority = idx + 1;
			});
		});
	}

	function sortByDone() {
		store.update((s) => {
			s.items.sort((a, b) => {
				if (a.done === b.done) return 0;
				return a.done ? 1 : -1; // Not done items first
			});
			// Update priorities
			s.items.forEach((item, idx) => {
				item.priority = idx + 1;
			});
		});
	}

	function shuffle() {
		store.update((s) => {
			// Fisher-Yates shuffle
			for (let i = s.items.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				const temp = s.items[i];
				s.items[i] = s.items[j];
				s.items[j] = temp;
			}
			// Update priorities
			s.items.forEach((item, idx) => {
				item.priority = idx + 1;
			});
		});
	}

	function clearAll() {
		store.update((s) => {
			s.items = [];
		});
	}

	function resetDemo() {
		store.update((s) => {
			s.items = [
				{ id: `item-${s.nextId}`, text: 'Learn Svelte 5 animations', done: false, priority: 1 },
				{ id: `item-${s.nextId + 1}`, text: 'Build an animated list', done: false, priority: 2 },
				{ id: `item-${s.nextId + 2}`, text: 'Test array operations', done: false, priority: 3 },
				{ id: `item-${s.nextId + 3}`, text: 'Deploy the demo', done: false, priority: 4 }
			];
			s.nextId += 4;
		});
	}
</script>

<main>
	<h1>🎬 Animated Array List Demo</h1>
	<p>
		This demo showcases array operations (add, remove, reorder) with smooth Svelte animations.
		<br />
		Using <code>observator</code> with <code>useSvelteReactivity</code> for reactive state management.
	</p>

	<section class="controls">
		<h2>➕ Add Items</h2>
		<div class="button-group">
			<button onclick={addItem}>Add to End</button>
			<button onclick={addItemAtBeginning}>Add to Beginning</button>
		</div>
	</section>

	<section class="controls">
		<h2>🔄 Reorder Items</h2>
		<div class="button-group">
			<button onclick={reverseList}>Reverse List</button>
			<button onclick={shuffle}>Shuffle</button>
			<button onclick={sortByText}>Sort by Text</button>
			<button onclick={sortByDone}>Sort by Status</button>
		</div>
	</section>

	<section class="controls">
		<h2>🗑️ Remove Items</h2>
		<div class="button-group">
			<button onclick={removeDoneItems} class="danger">Remove Done</button>
			<button onclick={clearAll} class="danger">Clear All</button>
			<button onclick={resetDemo}>Reset Demo</button>
		</div>
	</section>

	<section class="list-container">
		<h2>📋 Items ({store.items.length})</h2>
		{#if store.items.length === 0}
			<div class="empty-state" in:fade={{ duration: 300 }}>
				<p>No items yet. Add some items to see the animations!</p>
			</div>
		{:else}
			<ul class="item-list">
				{#each store.items as item (item.id)}
					<li
						class="item"
						class:done={item.done}
						animate:flip={{ duration: 400, easing: quintOut }}
						in:fly={{ x: -200, duration: 400, easing: quintOut }}
						out:scale={{ duration: 200, start: 0.8 }}
					>
						<div class="item-content">
							<input
								type="checkbox"
								checked={item.done}
								onchange={() => toggleDone(item.id)}
							/>
							<span class="item-text">{item.text}</span>
							<span class="item-priority">#{item.priority}</span>
						</div>
						<div class="item-actions">
							<button
								class="icon-btn"
								onclick={() => moveToTop(item.id)}
								title="Move to top"
								disabled={store.items.indexOf(item) === 0}
							>⏫</button>
							<button
								class="icon-btn"
								onclick={() => moveUp(item.id)}
								title="Move up"
								disabled={store.items.indexOf(item) === 0}
							>⬆️</button>
							<button
								class="icon-btn"
								onclick={() => moveDown(item.id)}
								title="Move down"
								disabled={store.items.indexOf(item) === store.items.length - 1}
							>⬇️</button>
							<button
								class="icon-btn"
								onclick={() => moveToBottom(item.id)}
								title="Move to bottom"
								disabled={store.items.indexOf(item) === store.items.length - 1}
							>⏬</button>
							<button
								class="icon-btn delete"
								onclick={() => removeItem(item.id)}
								title="Remove"
							>❌</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="info">
		<h2>ℹ️ How it works</h2>
		<ul>
			<li>
				<strong>FLIP Animation:</strong> When items are reordered, Svelte's <code>animate:flip</code> creates smooth position transitions.
			</li>
			<li>
				<strong>Enter Animation:</strong> New items fly in from the left using <code>in:fly</code>.
			</li>
			<li>
				<strong>Exit Animation:</strong> Removed items scale down using <code>out:scale</code>.
			</li>
			<li>
				<strong>Keyed Each:</strong> Using <code>item.id</code> as the key ensures Svelte tracks individual items correctly.
			</li>
			<li>
				<strong>Reactive Store:</strong> All operations go through <code>store.update()</code> which emits patches for fine-grained reactivity.
			</li>
		</ul>
	</section>

	<section class="state-preview">
		<h2>🔍 Current State</h2>
		<pre>{JSON.stringify(store.items, null, 2)}</pre>
	</section>
</main>

<style>
	main {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	h1 {
		color: #333;
		text-align: center;
		margin-bottom: 0.5rem;
	}

	main > p {
		text-align: center;
		color: #666;
		margin-bottom: 2rem;
	}

	section {
		border: 1px solid #ddd;
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
		background: #fafafa;
	}

	h2 {
		margin-top: 0;
		color: #ff3e00;
		font-size: 1.25rem;
	}

	.controls {
		background: #f0f4f8;
	}

	.button-group {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	button {
		background: #ff3e00;
		color: white;
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.95rem;
		transition: all 0.2s ease;
	}

	button:hover:not(:disabled) {
		background: #e63600;
		transform: translateY(-1px);
	}

	button:active:not(:disabled) {
		transform: translateY(0);
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.danger {
		background: #dc3545;
	}

	button.danger:hover:not(:disabled) {
		background: #c82333;
	}

	.list-container {
		background: white;
	}

	.item-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		margin-bottom: 0.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 8px;
		color: white;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.item.done {
		background: linear-gradient(135deg, #a8a8a8 0%, #6b6b6b 100%);
	}

	.item-content {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.item-content input[type='checkbox'] {
		width: 20px;
		height: 20px;
		cursor: pointer;
		accent-color: #fff;
	}

	.item-text {
		font-weight: 500;
	}

	.item.done .item-text {
		text-decoration: line-through;
		opacity: 0.8;
	}

	.item-priority {
		font-size: 0.85rem;
		opacity: 0.7;
		background: rgba(255, 255, 255, 0.2);
		padding: 0.2rem 0.5rem;
		border-radius: 4px;
	}

	.item-actions {
		display: flex;
		gap: 0.25rem;
	}

	.icon-btn {
		background: rgba(255, 255, 255, 0.2);
		border: none;
		padding: 0.4rem 0.5rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: all 0.2s ease;
	}

	.icon-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.35);
		transform: scale(1.1);
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.icon-btn.delete:hover:not(:disabled) {
		background: rgba(220, 53, 69, 0.8);
	}

	.empty-state {
		text-align: center;
		padding: 3rem;
		color: #666;
		background: #f9f9f9;
		border-radius: 8px;
		border: 2px dashed #ddd;
	}

	.info {
		background: #e8f4fd;
		border-color: #b6d4fe;
	}

	.info ul {
		padding-left: 1.5rem;
	}

	.info li {
		margin-bottom: 0.75rem;
		line-height: 1.5;
	}

	.state-preview {
		background: #333;
		border-color: #444;
	}

	.state-preview h2 {
		color: #fff;
	}

	pre {
		background: #1a1a1a;
		color: #00ff00;
		padding: 1rem;
		border-radius: 6px;
		overflow-x: auto;
		font-size: 0.85rem;
		max-height: 300px;
		overflow-y: auto;
	}

	code {
		background: rgba(0, 0, 0, 0.1);
		padding: 0.15rem 0.4rem;
		border-radius: 3px;
		font-size: 0.9em;
	}

	.info code {
		background: rgba(0, 0, 0, 0.08);
	}
</style>
