<script lang="ts">
	import { createObservableStore } from 'observator';
	import { useSvelteReactivity } from '$lib/index.js';
	import { untrack } from 'svelte';

	// Define the state type
	type State = {
		counter: number;
		user: { name: string; age: number };
		todos: Array<{ id: number; text: string; done: boolean }>;
		users: Record<string, { name: string; online: boolean }>;
	};

	// Create the ObservableStore with initial state
	const observableStore = createObservableStore<State>({
		counter: 0,
		user: { name: 'John Doe', age: 30 },
		todos: [
			{ id: 1, text: 'Learn Svelte 5', done: false },
			{ id: 2, text: 'Build an app', done: false }
		],
		users: {
			alice: { name: 'Alice', online: true },
			bob: { name: 'Bob', online: false }
		}
	});

	// Wrap with Svelte reactivity
	const store = useSvelteReactivity(observableStore);

	// Track render counts to demonstrate fine-grained reactivity
	let counterRenderCount = $state(0);
	let userRenderCount = $state(0);
	let todosRenderCount = $state(0);

	// These effects track renders - use untrack to avoid infinite loops
	$effect(() => {
		store.counter; // Read counter to subscribe
		untrack(() => {
			counterRenderCount++;
		});
	});

	$effect(() => {
		store.user; // Read user to subscribe
		untrack(() => {
			userRenderCount++;
		});
	});

	$effect(() => {
		store.todos; // Read todos to subscribe
		untrack(() => {
			todosRenderCount++;
		});
	});

	// Action handlers
	function increment() {
		store.update((s) => {
			s.counter += 1;
		});
	}

	function decrement() {
		store.update((s) => {
			s.counter -= 1;
		});
	}

	function updateUserName() {
		const newName = prompt('Enter new name:', store.getRaw('user').name);
		if (newName) {
			store.update((s) => {
				s.user.name = newName;
			});
		}
	}

	function addTodo() {
		const text = prompt('Enter todo text:');
		if (text) {
			store.update((s) => {
				const newId = s.todos.length > 0 ? Math.max(...s.todos.map((t) => t.id)) + 1 : 1;
				s.todos.push({ id: newId, text, done: false });
			});
		}
	}

	function toggleTodo(id: number) {
		store.update((s) => {
			const todo = s.todos.find((t) => t.id === id);
			if (todo) todo.done = !todo.done;
		});
	}

	function toggleUserOnline(userId: string) {
		store.update((s) => {
			const user = s.users[userId];
			if (user) user.online = !user.online;
		});
	}
</script>

<main>
	<h1>ObservableStore + Svelte 5 Demo</h1>
	<p>This demo showcases fine-grained reactivity using <code>useSvelteReactivity</code>.</p>
	
	<section class="demo-link">
		<h2>🎬 Animated Array List Demo</h2>
		<p>See array operations (add, remove, reorder) with smooth animations!</p>
		<a href="/animated-list" class="demo-button">View Animated List Demo →</a>
	</section>

	<section>
		<h2>Counter (Field: counter)</h2>
		<p><strong>Render count:</strong> {counterRenderCount}</p>
		<p>
			<strong>Value:</strong>
			{store.counter}
		</p>
		<button onclick={increment}>+1</button>
		<button onclick={decrement}>-1</button>
		<p class="note">Only this section re-renders when counter changes.</p>
	</section>

	<section>
		<h2>User (Field: user)</h2>
		<p><strong>Render count:</strong> {userRenderCount}</p>
		<p><strong>Name:</strong> {store.user.name}</p>
		<p><strong>Age:</strong> {store.user.age}</p>
		<button onclick={updateUserName}>Update Name</button>
		<p class="note">Only this section re-renders when user changes.</p>
	</section>

	<section>
		<h2>Todos (Field: todos)</h2>
		<p><strong>Render count:</strong> {todosRenderCount}</p>
		<ul>
			{#each store.todos as todo (todo.id)}
				<li>
					<input type="checkbox" checked={todo.done} onchange={() => toggleTodo(todo.id)} />
					<span class:done={todo.done}>{todo.text}</span>
				</li>
			{/each}
		</ul>
		<button onclick={addTodo}>Add Todo</button>
		<p class="note">Only this section re-renders when todos change.</p>
	</section>

	<section>
		<h2>Users (Keyed Access)</h2>
		<p>Using <code>store.users[userId]</code> for automatic keyed reactivity:</p>
		<div class="users-grid">
			{#each Object.keys(store.users) as userId}
				<div class="user-card">
					<p><strong>{store.users[userId]?.name}</strong></p>
					<p class:online={store.users[userId]?.online}>
						{store.users[userId]?.online ? '🟢 Online' : '🔴 Offline'}
					</p>
					<button onclick={() => toggleUserOnline(userId)}>Toggle Status</button>
				</div>
			{/each}
		</div>
		<p class="note">Each user card can react independently using automatic keyed subscriptions via proxy.</p>
	</section>

	<section>
		<h2>Raw ObservableStore Access</h2>
		<p>Access underlying store via <code>store.raw</code> (same as original <code>observableStore</code>):</p>
		<pre>{JSON.stringify(store.getState(), null, 2)}</pre>
	</section>
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 2rem;
		font-family: system-ui, -apple-system, sans-serif;
	}

	section {
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1rem;
		margin-bottom: 1rem;
		background: #fafafa;
	}

	h1 {
		color: #333;
	}

	h2 {
		margin-top: 0;
		color: #ff3e00;
	}

	button {
		background: #ff3e00;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		margin-right: 0.5rem;
	}

	button:hover {
		background: #e63600;
	}

	.note {
		font-size: 0.875rem;
		color: #666;
		font-style: italic;
	}

	code {
		background: #eee;
		padding: 0.2rem 0.4rem;
		border-radius: 3px;
		font-size: 0.9em;
	}

	.done {
		text-decoration: line-through;
		color: #999;
	}

	.users-grid {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.user-card {
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 0.5rem 1rem;
		background: white;
	}

	.online {
		color: green;
	}

	pre {
		background: #333;
		color: #fff;
		padding: 1rem;
		border-radius: 4px;
		overflow-x: auto;
		font-size: 0.875rem;
	}

	ul {
		list-style: none;
		padding: 0;
	}

	li {
		padding: 0.5rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	input[type='checkbox'] {
		width: 18px;
		height: 18px;
	}

	.demo-link {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border: none;
		color: white;
	}

	.demo-link h2 {
		color: white;
	}

	.demo-link p {
		color: rgba(255, 255, 255, 0.9);
	}

	.demo-button {
		display: inline-block;
		background: white;
		color: #667eea;
		padding: 0.75rem 1.5rem;
		border-radius: 6px;
		text-decoration: none;
		font-weight: 600;
		transition: all 0.2s ease;
	}

	.demo-button:hover {
		background: #f0f0f0;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}
</style>
