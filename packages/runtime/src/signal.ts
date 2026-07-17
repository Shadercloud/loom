/**
 * `signal.ts` — RBXScriptSignal-shaped events for the live instance tree.
 *
 * `LoomSignal` mirrors the Roblox signal contract UI code depends on
 * (`Connect` → `{ Disconnect, Connected }`, `Once`, `Wait`) while keeping the
 * firing side (`fire`, `hasConnections`, `disconnectAll`) internal to the
 * runtime. Firing snapshots the listener list first, so a handler that
 * disconnects itself (or a sibling) mid-fire never skips the remaining
 * listeners, and connections made during a fire only run on the next one.
 */

/** The object `Connect` returns — the Roblox `RBXScriptConnection` shape. */
export interface LoomConnection {
	/** Whether this connection still receives fires. */
	readonly Connected: boolean;
	/** Stop receiving fires. Safe to call more than once. */
	Disconnect(): void;
}

interface Listener<A extends unknown[]> {
	cb: (...args: A) => void;
	connected: boolean;
}

export interface LoomSignalOptions {
	/**
	 * Called after every successful `Connect`. Scheduler-driven signals
	 * (RenderStepped/Heartbeat) use this to kick the rAF loop on first listen.
	 */
	onConnect?: () => void;
}

/** A Roblox-shaped event signal, generic over its fire arguments. */
export class LoomSignal<A extends unknown[] = []> {
	private listeners: Listener<A>[] = [];
	private readonly onConnect: (() => void) | undefined;

	constructor(options?: LoomSignalOptions) {
		this.onConnect = options?.onConnect;
	}

	/** Register `cb` to run on every fire until disconnected. */
	Connect(cb: (...args: A) => void): LoomConnection {
		const listener: Listener<A> = { cb, connected: true };
		const listeners = this.listeners;
		listeners.push(listener);
		this.onConnect?.();
		return {
			get Connected(): boolean {
				return listener.connected;
			},
			Disconnect(): void {
				if (!listener.connected) return;
				listener.connected = false;
				const index = listeners.indexOf(listener);
				if (index >= 0) listeners.splice(index, 1);
			},
		};
	}

	/** Register `cb` to run on the next fire only. */
	Once(cb: (...args: A) => void): LoomConnection {
		const connection = this.Connect((...args) => {
			connection.Disconnect();
			cb(...args);
		});
		return connection;
	}

	/**
	 * Resolve with the first fired argument on the next fire. (Roblox `Wait`
	 * blocks and returns the full tuple; in the browser this is a Promise.)
	 */
	Wait(): Promise<A[0] | undefined> {
		return new Promise((resolve) => {
			this.Once((...args) => resolve(args[0]));
		});
	}

	/** @internal Fire all currently connected listeners (snapshot iteration). */
	fire(...args: A): void {
		for (const listener of [...this.listeners]) {
			if (listener.connected) listener.cb(...args);
		}
	}

	/** @internal Whether any connection is live (drives the frame loop). */
	get hasConnections(): boolean {
		return this.listeners.length > 0;
	}

	/** @internal Sever every connection (instance destruction). */
	disconnectAll(): void {
		for (const listener of this.listeners) listener.connected = false;
		this.listeners = [];
	}
}
