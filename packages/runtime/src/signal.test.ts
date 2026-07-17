import { describe, expect, it, vi } from "vitest";
import { LoomSignal } from "./signal";

describe("LoomSignal", () => {
	it("delivers fires to connected listeners with arguments", () => {
		const signal = new LoomSignal<[number, string]>();
		const seen: [number, string][] = [];
		signal.Connect((n, s) => seen.push([n, s]));
		signal.fire(1, "a");
		signal.fire(2, "b");
		expect(seen).toEqual([
			[1, "a"],
			[2, "b"],
		]);
	});

	it("stops delivering after Disconnect and reports Connected", () => {
		const signal = new LoomSignal();
		const cb = vi.fn();
		const connection = signal.Connect(cb);
		expect(connection.Connected).toBe(true);
		signal.fire();
		connection.Disconnect();
		expect(connection.Connected).toBe(false);
		signal.fire();
		expect(cb).toHaveBeenCalledTimes(1);
		// Disconnect is idempotent.
		connection.Disconnect();
		expect(connection.Connected).toBe(false);
	});

	it("does not skip remaining listeners when one disconnects mid-fire", () => {
		const signal = new LoomSignal();
		const order: string[] = [];
		const a = signal.Connect(() => {
			order.push("a");
			a.Disconnect();
			b.Disconnect();
		});
		const b = signal.Connect(() => order.push("b"));
		signal.Connect(() => order.push("c"));
		signal.fire();
		// b was disconnected before its turn, c must still run.
		expect(order).toEqual(["a", "c"]);
	});

	it("does not fire listeners connected during the same fire", () => {
		const signal = new LoomSignal();
		const late = vi.fn();
		signal.Connect(() => signal.Connect(late));
		signal.fire();
		expect(late).not.toHaveBeenCalled();
		signal.fire();
		expect(late).toHaveBeenCalledTimes(1);
	});

	it("Once fires exactly once", () => {
		const signal = new LoomSignal();
		const cb = vi.fn();
		signal.Once(cb);
		signal.fire();
		signal.fire();
		expect(cb).toHaveBeenCalledTimes(1);
		expect(signal.hasConnections).toBe(false);
	});

	it("Wait resolves with the first fired argument", async () => {
		const signal = new LoomSignal<[string]>();
		const promise = signal.Wait();
		signal.fire("hello");
		await expect(promise).resolves.toBe("hello");
	});

	it("invokes the onConnect callback on every Connect", () => {
		const onConnect = vi.fn();
		const signal = new LoomSignal({ onConnect });
		signal.Connect(() => {});
		signal.Connect(() => {});
		expect(onConnect).toHaveBeenCalledTimes(2);
	});

	it("disconnectAll severs every connection", () => {
		const signal = new LoomSignal();
		const cb = vi.fn();
		const connection = signal.Connect(cb);
		signal.disconnectAll();
		expect(connection.Connected).toBe(false);
		expect(signal.hasConnections).toBe(false);
		signal.fire();
		expect(cb).not.toHaveBeenCalled();
	});
});
