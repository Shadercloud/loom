import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInstance } from "./instance";
import {
	flushDirtyNow,
	getDirtyCount,
	markDirty,
	setFlusher,
} from "./scheduler";

describe("scheduler", () => {
	beforeEach(() => {
		// Drain anything earlier module work marked dirty.
		setFlusher(undefined);
		flushDirtyNow();
	});

	afterEach(() => {
		setFlusher(undefined);
	});

	it("markDirty → flushDirtyNow delivers the snapshot and clears the set", () => {
		const flusher = vi.fn();
		setFlusher(flusher);

		const a = createInstance("Frame", "A");
		const b = createInstance("Frame", "B");
		markDirty(a);
		markDirty(b);
		markDirty(a); // deduplicated
		expect(getDirtyCount()).toBe(2);

		flushDirtyNow();
		expect(flusher).toHaveBeenCalledTimes(1);
		expect(flusher).toHaveBeenCalledWith([a, b]);
		expect(getDirtyCount()).toBe(0);
	});

	it("does not call the flusher when nothing is dirty", () => {
		const flusher = vi.fn();
		setFlusher(flusher);
		flushDirtyNow();
		expect(flusher).not.toHaveBeenCalled();
	});

	it("property writes mark the instance dirty", () => {
		const flusher = vi.fn();
		setFlusher(flusher);
		const frame = createInstance("Frame");
		frame.Visible = false;
		expect(getDirtyCount()).toBe(1);
		flushDirtyNow();
		expect(flusher).toHaveBeenCalledWith([frame]);
	});
});
