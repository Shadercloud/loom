import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CFrame, Color3, Rect, UDim2, Vector2, Vector3 } from "./datatypes";
import { Enum } from "./enums";
import { createInstance } from "./instance";
import {
	applyPrototypePatches,
	assert,
	bit32,
	buffer,
	debug,
	ipairs,
	LUAU_IS_EMPTY,
	LUAU_SIZE,
	math,
	os,
	pairs,
	pcall,
	rawequal,
	rawget,
	rawlen,
	rawset,
	select,
	string,
	table,
	task,
	tonumber,
	tostring,
	typeIs,
	typeOf,
	unpack,
	utf8,
	xpcall,
} from "./luau";

describe("pcall", () => {
	it("returns [true, result] on success", () => {
		expect(pcall((a: number, b: number) => a + b, 2, 3)).toEqual([true, 5]);
	});

	it("returns [false, message] on thrown Error", () => {
		const [ok, message] = pcall(() => {
			throw new Error("boom");
		});
		expect(ok).toBe(false);
		expect(message).toBe("boom");
	});

	it("returns thrown non-Error values as-is", () => {
		expect(
			pcall(() => {
				throw "raw";
			}),
		).toEqual([false, "raw"]);
	});

	it("xpcall routes failures through the handler", () => {
		expect(
			xpcall(
				() => {
					throw new Error("bad");
				},
				(err) => `handled:${err}`,
			),
		).toEqual([false, "handled:bad"]);
	});
});

describe("typeOf / typeIs", () => {
	it("recognizes datatypes, enum items, and instances", () => {
		expect(typeOf(UDim2.new())).toBe("UDim2");
		expect(typeOf(Vector2.new())).toBe("Vector2");
		expect(typeOf(Vector3.new())).toBe("Vector3");
		expect(typeOf(Rect.new(0, 0, 10, 10))).toBe("Rect");
		expect(typeOf(CFrame.new())).toBe("CFrame");
		expect(typeOf(Color3.fromRGB(255, 0, 0))).toBe("Color3");
		expect(typeOf(Enum.KeyCode.Space)).toBe("EnumItem");
		expect(typeOf(createInstance("Frame"))).toBe("Instance");
		expect(typeOf(undefined)).toBe("nil");
		expect(typeOf({})).toBe("table");
		expect(typeOf([])).toBe("table");
		expect(typeOf(1)).toBe("number");
		expect(typeOf("x")).toBe("string");
		expect(typeIs(Vector2.new(), "Vector2")).toBe(true);
		expect(typeIs(Vector2.new(), "Vector3")).toBe(false);
	});
});

describe("tostring / tonumber", () => {
	it("stringifies Luau-style", () => {
		expect(tostring(undefined)).toBe("nil");
		expect(tostring(Enum.KeyCode.Space)).toBe("Enum.KeyCode.Space");
		expect(tostring(createInstance("Frame", "MyFrame"))).toBe("MyFrame");
	});

	it("parses numbers or returns undefined", () => {
		expect(tonumber("42")).toBe(42);
		expect(tonumber(" 1.5 ")).toBe(1.5);
		expect(tonumber("ff", 16)).toBe(255);
		expect(tonumber("nope")).toBeUndefined();
		expect(tonumber(true)).toBeUndefined();
	});
});

describe("pairs / ipairs", () => {
	it("iterates plain objects by key", () => {
		const seen = [...pairs({ a: 1, b: 2, c: undefined })];
		expect(seen).toEqual([
			["a", 1],
			["b", 2],
		]);
	});

	it("iterates Maps by entry", () => {
		const map = new Map([
			["x", 1],
			["y", 2],
		]);
		expect([...pairs(map)]).toEqual([
			["x", 1],
			["y", 2],
		]);
	});

	it("iterates arrays 1-based, ipairs stops at nil", () => {
		expect([...pairs(["a", "b"])]).toEqual([
			[1, "a"],
			[2, "b"],
		]);
		expect([...ipairs(["a", undefined, "c"])]).toEqual([[1, "a"]]);
	});
});

describe("math", () => {
	it("clamp", () => {
		expect(math.clamp(5, 0, 3)).toBe(3);
		expect(math.clamp(-1, 0, 3)).toBe(0);
		expect(math.clamp(2, 0, 3)).toBe(2);
	});

	it("round rounds halves away from zero", () => {
		expect(math.round(2.5)).toBe(3);
		expect(math.round(-2.5)).toBe(-3);
		expect(math.round(2.4)).toBe(2);
		expect(math.round(-2.4)).toBe(-2);
	});

	it("misc", () => {
		expect(math.huge).toBe(Number.POSITIVE_INFINITY);
		expect(math.sign(-4)).toBe(-1);
		expect(math.fmod(7, 3)).toBe(1);
		expect(math.deg(Math.PI)).toBeCloseTo(180);
		expect(math.rad(180)).toBeCloseTo(Math.PI);
		expect(math.noise()).toBe(0);
	});

	it("log takes an optional base, log10 is its own", () => {
		expect(math.log(Math.E)).toBeCloseTo(1);
		expect(math.log(8, 2)).toBeCloseTo(3);
		expect(math.log10(1000)).toBeCloseTo(3);
	});

	it("the trig and hyperbolic set", () => {
		expect(math.asin(1)).toBeCloseTo(Math.PI / 2);
		expect(math.acos(1)).toBe(0);
		expect(math.atan(1)).toBeCloseTo(Math.PI / 4);
		expect(math.atan2(1, 1)).toBeCloseTo(Math.PI / 4);
		expect(math.sinh(0)).toBe(0);
		expect(math.cosh(0)).toBe(1);
		expect(math.tanh(0)).toBe(0);
	});

	it("frexp and ldexp are inverses, modf splits the parts", () => {
		for (const value of [8, 0.75, -3.5, 1, 1e-8, 12345.678]) {
			const [mantissa, exponent] = math.frexp(value);
			expect(Math.abs(mantissa)).toBeGreaterThanOrEqual(0.5);
			expect(Math.abs(mantissa)).toBeLessThan(1);
			expect(math.ldexp(mantissa, exponent)).toBeCloseTo(value, 10);
		}
		expect(math.frexp(0)).toEqual([0, 0]);
		expect(math.modf(3.7)[0]).toBe(3);
		expect(math.modf(3.7)[1]).toBeCloseTo(0.7);
		expect(math.modf(-3.7)[0]).toBe(-3);
		expect(math.modf(-3.7)[1]).toBeCloseTo(-0.7);
	});

	it("randomseed makes random reproducible", () => {
		math.randomseed(42);
		const first = [math.random(), math.random(1, 100), math.random(6)];
		math.randomseed(42);
		expect([math.random(), math.random(1, 100), math.random(6)]).toEqual(first);
		// Ranges still hold on the seeded stream.
		math.randomseed(7);
		for (let i = 0; i < 50; i++) {
			const roll = math.random(1, 6);
			expect(roll).toBeGreaterThanOrEqual(1);
			expect(roll).toBeLessThanOrEqual(6);
		}
	});
});

describe("string", () => {
	it("format supports %d %s %f %x %% and %.Nf", () => {
		expect(string.format("%d items", 3.7)).toBe("3 items");
		expect(string.format("%s!", "hi")).toBe("hi!");
		expect(string.format("%.2f", 1.2345)).toBe("1.23");
		expect(string.format("%x", 255)).toBe("ff");
		expect(string.format("100%%")).toBe("100%");
	});

	it("sub is 1-based inclusive with negative indices", () => {
		expect(string.sub("hello", 2, 4)).toBe("ell");
		expect(string.sub("hello", 2)).toBe("ello");
		expect(string.sub("hello", -3)).toBe("llo");
		expect(string.sub("hello", 4, 2)).toBe("");
	});

	it("find returns a 1-based [start, end] tuple, or an empty tuple when unmatched", () => {
		expect(string.find("hello world", "world", 1, true)).toEqual([7, 11]);
		expect(string.find("hello", "l")).toEqual([3, 3]);
		expect(string.find("hello", "z", 1, true)).toEqual([]);
		expect(string.find("aXa", "%d")).toEqual([]);
		expect(string.find("a7a", "%d")).toEqual([2, 2]);
	});

	it("an unmatched find is still destructurable (roblox-ts LuaTuple read)", () => {
		// `const [start] = string.find(...)` is the idiomatic roblox-ts read, and
		// lattice's combobox filter uses exactly that. Returning `undefined` here
		// threw "undefined is not iterable" and crashed the whole render.
		const [start, finish] = string.find("hello", "z", 1, true);
		expect(start).toBeUndefined();
		expect(finish).toBeUndefined();
	});

	it("gsub handles the lattice character-class pattern", () => {
		// packages/tabs sanitizes ids with this exact call.
		expect(string.gsub("Hello World!", "[^%w_%-]", "-")).toEqual([
			"Hello-World-",
			2,
		]);
		expect(string.gsub("a.b.c", ".", "-", 2)[0]).toBe("--b.c");
		expect(string.gsub("abc", "q", "-")).toEqual(["abc", 0]);
	});

	it("lower/upper/rep/split", () => {
		expect(string.lower("AbC")).toBe("abc");
		expect(string.upper("AbC")).toBe("ABC");
		expect(string.rep("ab", 3)).toBe("ababab");
		expect(string.split("a,b,c", ",")).toEqual(["a", "b", "c"]);
	});

	it("len/reverse/char/byte", () => {
		expect(string.len("hello")).toBe(5);
		expect(string.reverse("abc")).toBe("cba");
		// By code point, so an emoji comes back intact rather than as two halves.
		expect(string.reverse("a🙂b")).toBe("b🙂a");
		expect(string.char(72, 105)).toBe("Hi");
		expect(string.byte("A")).toEqual([65]);
		expect(string.byte("ABC", 1, 3)).toEqual([65, 66, 67]);
		expect(string.byte("ABC", -1)).toEqual([67]);
		const [code] = string.byte("A");
		expect(code).toBe(65);
	});

	it("match returns captures, or the whole match, or an empty tuple", () => {
		expect(string.match("hello world", "(%a+) (%a+)")).toEqual([
			"hello",
			"world",
		]);
		expect(string.match("count: 42", "%d+")).toEqual(["42"]);
		expect(string.match("nothing", "%d+")).toEqual([]);
		// The same destructure-an-unmatched-tuple case `find` documents.
		const [word] = string.match("nothing", "%d+");
		expect(word).toBeUndefined();
		expect(string.match("a1b2", "%d", 3)).toEqual(["2"]);
	});

	it("gmatch iterates every match", () => {
		expect([...string.gmatch("a1 b2 c3", "%a%d")]).toEqual([
			["a1"],
			["b2"],
			["c3"],
		]);
		const pairsFound: string[][] = [];
		for (const captured of string.gmatch("x=1, y=2", "(%a+)=(%d+)")) {
			pairsFound.push(captured);
		}
		expect(pairsFound).toEqual([
			["x", "1"],
			["y", "2"],
		]);
		expect([...string.gmatch("abc", "%d")]).toEqual([]);
	});

	it("find takes a negative init, like the engine", () => {
		expect(string.find("hello hello", "hello", -5, true)).toEqual([7, 11]);
	});
});

describe("select / raw access", () => {
	it("select counts with # and slices from n", () => {
		expect(select("#", "a", "b", "c")).toBe(3);
		expect(select("#")).toBe(0);
		expect(select(2, "a", "b", "c")).toEqual(["b", "c"]);
		expect(select(-1, "a", "b", "c")).toEqual(["c"]);
		expect(select(9, "a")).toEqual([]);
	});

	it("unpack is table.unpack", () => {
		expect(unpack(["a", "b", "c"], 2)).toEqual(["b", "c"]);
	});

	it("rawget/rawset reach objects and Maps", () => {
		const obj: Record<string, number> = { a: 1 };
		expect(rawget(obj, "a")).toBe(1);
		expect(rawget(obj, "missing")).toBeUndefined();
		expect(rawset(obj, "b", 2)).toBe(obj);
		expect(obj.b).toBe(2);
		const map = new Map<string, number>([["k", 1]]);
		expect(rawget(map, "k")).toBe(1);
		rawset(map, "j", 2);
		expect(map.get("j")).toBe(2);
	});

	it("rawequal is identity, rawlen counts every shape", () => {
		const shared = { a: 1 };
		expect(rawequal(shared, shared)).toBe(true);
		expect(rawequal({ a: 1 }, { a: 1 })).toBe(false);
		expect(rawlen(["a", "b"])).toBe(2);
		expect(rawlen(new Map([["k", 1]]))).toBe(1);
		expect(rawlen(new Set([1, 2, 3]))).toBe(3);
		expect(rawlen({ a: 1, b: 2 })).toBe(2);
		expect(rawlen("hello")).toBe(5);
	});
});

describe("os", () => {
	it("time converts a date table as UTC, difftime subtracts", () => {
		const midday = os.time({ year: 2026, month: 8, day: 2 });
		expect(midday).toBe(Date.UTC(2026, 7, 2, 12, 0, 0) / 1000);
		const midnight = os.time({
			year: 2026,
			month: 8,
			day: 2,
			hour: 0,
			min: 0,
			sec: 0,
		});
		expect(os.difftime(midday, midnight)).toBe(12 * 3600);
	});

	it("date formats in UTC with a leading !", () => {
		const at = Date.UTC(2026, 7, 2, 15, 4, 5) / 1000;
		expect(os.date("!%Y-%m-%d", at)).toBe("2026-08-02");
		expect(os.date("!%H:%M:%S", at)).toBe("15:04:05");
		expect(os.date("!%I %p", at)).toBe("03 PM");
		expect(os.date("!%A, %B %d", at)).toBe("Sunday, August 02");
		expect(os.date("!%a %b %y", at)).toBe("Sun Aug 26");
		expect(os.date("!100%%", at)).toBe("100%");
		// An unknown specifier is left alone rather than guessed at.
		expect(os.date("!%Q", at)).toBe("%Q");
	});

	it("date returns a table for *t", () => {
		const at = Date.UTC(2026, 7, 2, 15, 4, 5) / 1000;
		expect(os.date("!*t", at)).toEqual({
			year: 2026,
			month: 8,
			day: 2,
			hour: 15,
			min: 4,
			sec: 5,
			wday: 1, // Sunday
			yday: 214,
			isdst: false,
		});
	});
});

describe("bit32", () => {
	it("the boolean operators are unsigned", () => {
		expect(bit32.band(0b1100, 0b1010)).toBe(0b1000);
		expect(bit32.bor(0b1100, 0b1010)).toBe(0b1110);
		expect(bit32.bxor(0b1100, 0b1010)).toBe(0b0110);
		expect(bit32.bnot(0)).toBe(0xffffffff);
		expect(bit32.band(0xffffffff, 0xffffffff)).toBe(0xffffffff);
		expect(bit32.btest(0b100, 0b101)).toBe(true);
		expect(bit32.btest(0b010, 0b101)).toBe(false);
	});

	it("shifts saturate past 32 bits, where JS would wrap", () => {
		expect(bit32.lshift(1, 4)).toBe(16);
		expect(bit32.rshift(16, 4)).toBe(1);
		expect(bit32.lshift(1, 32)).toBe(0); // JS `1 << 32` is 1
		expect(bit32.rshift(0xffffffff, 32)).toBe(0);
		expect(bit32.lshift(1, -1)).toBe(0);
		// Arithmetic: the sign bit fills, where the logical shift brings in zeros.
		expect(bit32.arshift(0x80000000, 31)).toBe(0xffffffff);
		expect(bit32.rshift(0x80000000, 31)).toBe(1);
		expect(bit32.arshift(0xffffffff, 40)).toBe(0xffffffff);
		expect(bit32.arshift(0x7fffffff, 40)).toBe(0);
	});

	it("rotates, extract/replace, counts and byteswap", () => {
		expect(bit32.lrotate(0x80000000, 1)).toBe(1);
		expect(bit32.rrotate(1, 1)).toBe(0x80000000);
		expect(bit32.lrotate(0x12345678, 0)).toBe(0x12345678);
		expect(bit32.extract(0b1011, 0, 2)).toBe(0b11);
		expect(bit32.extract(0b1011, 2, 2)).toBe(0b10);
		expect(bit32.replace(0b0000, 0b11, 1, 2)).toBe(0b0110);
		expect(bit32.countlz(1)).toBe(31);
		expect(bit32.countlz(0)).toBe(32);
		expect(bit32.countrz(0b1000)).toBe(3);
		expect(bit32.countrz(0)).toBe(32);
		expect(bit32.byteswap(0x12345678)).toBe(0x78563412);
	});
});

describe("utf8", () => {
	it("char/codepoint/len read code points", () => {
		expect(utf8.char(72, 105, 0x1f642)).toBe("Hi🙂");
		expect(utf8.codepoint("Hi")).toEqual([72]);
		expect(utf8.codepoint("Hi", 1, 2)).toEqual([72, 105]);
		expect(utf8.codepoint("🙂")).toEqual([0x1f642]);
		expect(utf8.len("Hi🙂")).toBe(3);
		expect(utf8.len("héllo")).toBe(5);
	});

	it("codes and graphemes walk the string, offset seeks", () => {
		expect([...utf8.codes("a🙂b")]).toEqual([
			[1, 97],
			[2, 0x1f642],
			[4, 98],
		]);
		expect([...utf8.graphemes("a🙂")]).toEqual([
			[1, 1],
			[2, 3],
		]);
		expect(utf8.offset("a🙂b", 3)).toBe(4);
		expect(utf8.offset("a🙂b", -1)).toBe(4);
		expect(utf8.offset("abc", 9)).toBeUndefined();
	});

	it("normalizes", () => {
		expect(utf8.nfcnormalize("é")).toBe("é");
		expect(utf8.nfdnormalize("é")).toBe("é");
	});
});

describe("debug", () => {
	it("traceback carries the message and a stack", () => {
		expect(debug.traceback("boom")).toContain("boom");
		expect(debug.traceback()).toContain("luau.test");
	});

	it("the profile and memory calls are safe to call in any order", () => {
		debug.profilebegin("render");
		debug.profileend();
		expect(() => debug.profileend()).not.toThrow(); // unbalanced
		expect(() => debug.setmemorycategory("UI")).not.toThrow();
		expect(() => debug.resetmemorycategory()).not.toThrow();
		const [source] = debug.info(1, "s");
		expect(source).toBeUndefined();
	});
});

describe("buffer", () => {
	it("round-trips strings and reports its own type", () => {
		const b = buffer.fromstring("loom");
		expect(buffer.len(b)).toBe(4);
		expect(buffer.tostring(b)).toBe("loom");
		expect(typeOf(b)).toBe("buffer");
		expect(typeIs(b, "buffer")).toBe(true);
	});

	it("reads and writes every width, little-endian", () => {
		const b = buffer.create(8);
		buffer.writeu8(b, 0, 0xff);
		expect(buffer.readu8(b, 0)).toBe(0xff);
		expect(buffer.readi8(b, 0)).toBe(-1);
		buffer.writeu16(b, 0, 0x1234);
		expect(buffer.readu16(b, 0)).toBe(0x1234);
		expect(buffer.readu8(b, 0)).toBe(0x34); // little-endian
		buffer.writei32(b, 0, -2);
		expect(buffer.readi32(b, 0)).toBe(-2);
		expect(buffer.readu32(b, 0)).toBe(0xfffffffe);
		buffer.writef32(b, 0, 0.5);
		expect(buffer.readf32(b, 0)).toBe(0.5);
		buffer.writef64(b, 0, 1.25);
		expect(buffer.readf64(b, 0)).toBe(1.25);
	});

	it("copy, fill and the string window", () => {
		const source = buffer.fromstring("abcdef");
		const target = buffer.create(6);
		buffer.copy(target, 0, source, 2, 3);
		expect(buffer.readstring(target, 0, 3)).toBe("cde");
		buffer.writestring(target, 3, "XYZ");
		expect(buffer.tostring(target)).toBe("cdeXYZ");
		buffer.fill(target, 0, 0x2e, 2);
		expect(buffer.tostring(target)).toBe("..eXYZ");
	});

	it("an out-of-bounds access throws, as it does in the engine", () => {
		const b = buffer.create(2);
		expect(() => buffer.readu32(b, 0)).toThrow(/out of bounds/);
		expect(() => buffer.writeu8(b, 2, 1)).toThrow(/out of bounds/);
		expect(() => buffer.readu8(b, -1)).toThrow(/out of bounds/);
	});
});

describe("table", () => {
	it("insert appends, or splices at a 1-based position", () => {
		const list = ["b", "c"];
		table.insert(list, "d");
		expect(list).toEqual(["b", "c", "d"]);
		table.insert(list, 1, "a");
		expect(list).toEqual(["a", "b", "c", "d"]);
		table.insert(list, 5, "e");
		expect(list).toEqual(["a", "b", "c", "d", "e"]);
	});

	it("insert takes a number value as a value, not a position", () => {
		// The 2-argument form is the append, even on a number array — Luau tells
		// the two apart by arity, and so must this.
		const list = [1];
		table.insert(list, 2);
		expect(list).toEqual([1, 2]);
	});

	it("an out-of-range insert position clamps", () => {
		const list = ["a"];
		table.insert(list, 99, "z");
		table.insert(list, -3, "start");
		expect(list).toEqual(["start", "a", "z"]);
	});

	it("remove pops the last by default and returns what it removed", () => {
		const list = ["a", "b", "c"];
		expect(table.remove(list)).toBe("c");
		expect(table.remove(list, 1)).toBe("a");
		expect(list).toEqual(["b"]);
	});

	it("an out-of-range remove is nil and leaves the list alone", () => {
		const list = ["a"];
		expect(table.remove(list, 2)).toBeUndefined();
		expect(table.remove(list, 0)).toBeUndefined();
		expect(table.remove([])).toBeUndefined();
		expect(list).toEqual(["a"]);
	});

	it("find returns a 1-based index, or nil", () => {
		expect(table.find(["a", "b", "c"], "b")).toBe(2);
		expect(table.find(["a", "b", "a"], "a", 2)).toBe(3);
		expect(table.find(["a"], "z")).toBeUndefined();
	});

	it("concat joins an inclusive 1-based range", () => {
		expect(table.concat(["a", "b", "c"], ", ")).toBe("a, b, c");
		expect(table.concat([1, 2, 3])).toBe("123");
		expect(table.concat(["a", "b", "c", "d"], "-", 2, 3)).toBe("b-c");
		expect(table.concat(["a", "b"], "-", 5)).toBe("");
	});

	it("sort takes Luau's boolean predicate", () => {
		const nums = [3, 1, 2];
		table.sort(nums);
		expect(nums).toEqual([1, 2, 3]);
		table.sort(nums, (a, b) => a > b);
		expect(nums).toEqual([3, 2, 1]);
		const words = ["pear", "fig", "apple"];
		table.sort(words, (a, b) => a.length < b.length);
		expect(words).toEqual(["fig", "pear", "apple"]);
	});

	it("create fills an array", () => {
		expect(table.create(3, 0)).toEqual([0, 0, 0]);
		expect(table.create(0, 0)).toEqual([]);
		expect(table.create(-1, 0)).toEqual([]);
	});

	it("clear empties arrays, Maps, Sets and objects in place", () => {
		const list = ["a"];
		table.clear(list);
		expect(list).toEqual([]);
		const map = new Map([["k", 1]]);
		table.clear(map);
		expect(map.size).toBe(0);
		const set = new Set([1]);
		table.clear(set);
		expect(set.size).toBe(0);
		const obj: Record<string, number> = { a: 1 };
		table.clear(obj);
		expect(obj).toEqual({});
	});

	it("clone copies one level, keeping the shape", () => {
		const nested = { deep: true };
		const source = { a: 1, nested };
		const copy = table.clone(source);
		copy.a = 2;
		expect(source.a).toBe(1);
		expect(copy.nested).toBe(nested); // shallow, as in Luau
		expect(table.clone(["a"])).toEqual(["a"]);
		expect(table.clone(new Map([["k", 1]])).get("k")).toBe(1);
		expect(table.clone(new Set([1])).has(1)).toBe(true);
	});

	it("freeze/isfrozen", () => {
		const frozen = table.freeze({ a: 1 });
		expect(table.isfrozen(frozen)).toBe(true);
		expect(table.isfrozen({ a: 1 })).toBe(false);
	});

	it("unpack slices an inclusive 1-based range, pack counts", () => {
		expect(table.unpack(["a", "b", "c"])).toEqual(["a", "b", "c"]);
		expect(table.unpack(["a", "b", "c"], 2)).toEqual(["b", "c"]);
		expect(table.unpack(["a", "b", "c"], 1, 2)).toEqual(["a", "b"]);
		expect(table.unpack(["a", "b"], 2, 1)).toEqual([]);
		const packed = table.pack("a", "b");
		expect(packed.n).toBe(2);
		expect([...packed]).toEqual(["a", "b"]);
	});

	it("getn is #list, maxn looks past holes", () => {
		expect(table.getn(["a", "b"])).toBe(2);
		expect(table.getn([])).toBe(0);
		const holed = ["a", undefined, "c"];
		expect(table.maxn(holed)).toBe(3);
		expect(table.maxn(["a", undefined])).toBe(1);
		expect(table.maxn([])).toBe(0);
		expect(table.maxn({ 2: "b", 7: "g" })).toBe(7);
		expect(
			table.maxn(
				new Map([
					[3, "c"],
					[1, "a"],
				]),
			),
		).toBe(3);
		expect(table.maxn({ name: "no index" })).toBe(0);
	});

	it("foreach/foreachi visit pairs, and a non-nil return stops them", () => {
		const seen: [unknown, unknown][] = [];
		table.foreach(["a", "b"], (k, v) => {
			seen.push([k, v]);
		});
		expect(seen).toEqual([
			[1, "a"],
			[2, "b"],
		]);
		expect(
			table.foreach({ a: 1, b: 2 }, (k) => (k === "b" ? "found" : undefined)),
		).toBe("found");
		expect(table.foreach(new Map([["k", 1]]), (_k, v) => v)).toBe(1);
		expect(table.foreach(["a"], () => undefined)).toBeUndefined();

		const visited: number[] = [];
		// foreachi is the array part only, so it stops at the hole ipairs stops at.
		table.foreachi(["a", undefined, "c"], (i) => {
			visited.push(i);
		});
		expect(visited).toEqual([1]);
		expect(
			table.foreachi(["a", "b"], (i, v) => (i === 2 ? v : undefined)),
		).toBe("b");
	});

	it("is reachable as the global roblox-ts code calls it on", async () => {
		// roblox-ts writes `table.insert(list, v)` with no import at all, so the
		// library only exists for a previewed app if `installGlobals` wires it up.
		const { installGlobals } = await import("./index");
		const target: Record<string, unknown> = {};
		installGlobals(target);
		expect(target.table).toBe(table);
	});

	it("move copies a range, including onto itself", () => {
		expect(table.move(["a", "b", "c"], 1, 2, 1, ["x", "y", "z"])).toEqual([
			"a",
			"b",
			"z",
		]);
		// Overlapping, in place: the source range is read before it is written.
		expect(table.move(["a", "b", "c"], 1, 2, 2)).toEqual(["a", "a", "b"]);
		expect(table.move(["a"], 2, 1, 1, ["keep"])).toEqual(["keep"]);
	});
});

describe("prototype patches", () => {
	it("installs size/isEmpty/remove/unorderedRemove/clear (0-based roblox-ts indices)", () => {
		applyPrototypePatches();
		type Patched<T> = T[] & {
			size(): number;
			isEmpty(): boolean;
			remove(index: number): T | undefined;
			unorderedRemove(index: number): T | undefined;
			clear(): void;
		};
		const arr = ["a", "b", "c"] as Patched<string>;
		expect(arr.size()).toBe(3);
		expect(arr.isEmpty()).toBe(false);
		expect(arr.remove(1)).toBe("b");
		expect(arr).toEqual(["a", "c"]);
		expect(arr.unorderedRemove(0)).toBe("a");
		expect(arr).toEqual(["c"]);
		arr.clear();
		expect(arr.isEmpty()).toBe(true);
		const str = "hello" as unknown as { size(): number };
		expect(str.size()).toBe(5);
	});

	it("installs the Luau string methods with 1-based indices", () => {
		applyPrototypePatches();
		type PatchedString = {
			lower(): string;
			upper(): string;
			sub(i?: number, j?: number): string;
			rep(n: number, sep?: string): string;
			find(
				pattern: string,
				init?: number,
				plain?: boolean,
			): [number, number] | [];
			gsub(
				pattern: string,
				replacement: string,
				maxCount?: number,
			): [string, number];
			format(...args: unknown[]): string;
		};
		const s = "Hello,World" as unknown as PatchedString;
		expect(s.lower()).toBe("hello,world");
		expect(s.upper()).toBe("HELLO,WORLD");
		// 1-based and inclusive: NOT slice(1, 5), and NOT the Annex B `<sub>`
		// wrapper that `String.prototype.sub` ships by default.
		expect(s.sub(1, 5)).toBe("Hello");
		expect(s.sub(-5)).toBe("World");
		expect(("ab" as unknown as PatchedString).rep(3)).toBe("ababab");
		expect(s.find("World")).toEqual([7, 11]);
		expect(s.find("nope")).toEqual([]);
		expect(s.gsub("l", "L")).toEqual(["HeLLo,WorLd", 3]);
		expect(("%d apples" as unknown as PatchedString).format(3)).toBe(
			"3 apples",
		);
	});

	it("leaves native String.prototype.split alone", () => {
		applyPrototypePatches();
		// Deliberately unpatched: `string.split` is implemented *with* the native
		// method, so overriding it would recurse forever. Native split already
		// matches Luau for a string separator.
		expect("a,b,c".split(",")).toEqual(["a", "b", "c"]);
		expect(string.split("a,b,c")).toEqual(["a", "b", "c"]);
	});
});

describe("assert", () => {
	it("returns the value when truthy, the way Luau does", () => {
		const value = { ok: true };
		expect(assert(value)).toBe(value);
		expect(assert("text", "unused")).toBe("text");
	});

	it("throws the given message when falsy", () => {
		expect(() => assert(undefined, "no config")).toThrow("no config");
		expect(() => assert(false)).toThrow("assertion failed!");
	});
});

describe("task", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("delay runs after the timeout and cancel prevents it", () => {
		vi.useFakeTimers();
		const ran = vi.fn();
		const cancelled = vi.fn();
		task.delay(0.05, ran);
		const handle = task.delay(0.05, cancelled);
		task.cancel(handle);
		vi.advanceTimersByTime(100);
		expect(ran).toHaveBeenCalledOnce();
		expect(cancelled).not.toHaveBeenCalled();
	});
});

describe("datatype arithmetic", () => {
	it("Vector2 add/sub/mul/div and Magnitude", () => {
		const v = Vector2.new(3, 4);
		expect(v.Magnitude).toBe(5);
		expect(v.add(Vector2.new(1, 1))).toEqual(Vector2.new(4, 5));
		expect(v.sub(Vector2.new(1, 1))).toEqual(Vector2.new(2, 3));
		expect(v.mul(2)).toEqual(Vector2.new(6, 8));
		expect(v.div(Vector2.new(3, 2))).toEqual(Vector2.new(1, 2));
		expect(Vector2.zero).toEqual(Vector2.new(0, 0));
		expect(Vector2.one).toEqual(Vector2.new(1, 1));
	});

	it("UDim2 add/sub", () => {
		const sum = UDim2.new(0.5, 10, 0, 4).add(UDim2.new(0.25, 5, 1, -4));
		expect(sum).toEqual(UDim2.new(0.75, 15, 1, 0));
		expect(sum.sub(UDim2.new(0.25, 5, 1, -4))).toEqual(
			UDim2.new(0.5, 10, 0, 4),
		);
	});

	it("CFrame Lerp/FuzzyEq and Rect dimensions", () => {
		const mid = CFrame.new(0, 0, 0).Lerp(CFrame.new(10, 20, 30), 0.5);
		expect(mid.Position).toEqual(Vector3.new(5, 10, 15));
		expect(mid.FuzzyEq(CFrame.new(5, 10, 15))).toBe(true);
		expect(mid.FuzzyEq(CFrame.new(5, 10, 16))).toBe(false);

		const rect = Rect.new(10, 20, 110, 70);
		expect(rect.Width).toBe(100);
		expect(rect.Height).toBe(50);
		const fromVectors = Rect.new(Vector2.new(1, 2), Vector2.new(4, 6));
		expect(fromVectors.Width).toBe(3);
		expect(fromVectors.Height).toBe(4);
	});

	it("Color3.Lerp interpolates channels", () => {
		const mixed = Color3.new(0, 0, 0).Lerp(Color3.new(1, 0.5, 0), 0.5);
		expect(mixed.R).toBeCloseTo(0.5);
		expect(mixed.G).toBeCloseTo(0.25);
		expect(mixed.B).toBe(0);
	});

	it("audited lattice Enum usages exist", () => {
		expect(Enum.UserInputType.MouseButton1.Name).toBe("MouseButton1");
		expect(Enum.KeyCode.PageDown.EnumType).toBe("KeyCode");
		expect(Enum.ScreenInsets.CoreUISafeInsets).toBeDefined();
		expect(Enum.ScrollingDirection.XY).toBeDefined();
		expect(Enum.TextTruncate.AtEnd).toBeDefined();
		expect(Enum.ZIndexBehavior.Sibling).toBeDefined();
		expect(Enum.AutomaticCanvasSize.Y).toBe(Enum.AutomaticSize.Y);
	});
});

describe("the size/isEmpty macro keys", () => {
	// The other half of the preview's `.size()` rewrite. The point of routing
	// through a symbol is that `Map`/`Set` keep JS semantics for everyone else:
	// roblox-ts asks through the key, React and loom's own scheduler keep reading
	// the plain `.size` property.
	beforeAll(() => applyPrototypePatches());

	/** What the transform emits: `receiver[Symbol.for("loom.size")]()`. */
	function macro(value: object, key: symbol): unknown {
		const method = (value as Record<symbol, unknown>)[key];
		if (typeof method !== "function") {
			throw new Error(`${String(key)} is not installed`);
		}
		return (method as () => unknown).call(value);
	}
	const sizeOf = (value: object): unknown => macro(value, LUAU_SIZE);
	const emptyOf = (value: object): unknown => macro(value, LUAU_IS_EMPTY);

	it("counts a Map and a Set without redefining their `size`", () => {
		const map = new Map([["a", 1]]);
		const set = new Set([1, 2, 3]);
		expect(sizeOf(map)).toBe(1);
		expect(sizeOf(set)).toBe(3);
		// Untouched for every other caller — this is the whole reason for the key.
		expect(map.size).toBe(1);
		expect(set.size === 3).toBe(true);
	});

	it("counts arrays and strings through their patched methods", () => {
		expect(sizeOf([1, 2])).toBe(2);
		expect(sizeOf(Object("abc") as object)).toBe(3);
	});

	it("defers to a receiver's own size()", () => {
		class Bag {
			size(): number {
				return 42;
			}
		}
		expect(sizeOf(new Bag())).toBe(42);
	});

	it("answers isEmpty from the count when the receiver has none", () => {
		expect(emptyOf(new Map())).toBe(true);
		expect(emptyOf(new Set([1]))).toBe(false);
		expect(emptyOf([])).toBe(true);
		expect(emptyOf([1])).toBe(false);
	});

	it("stays invisible to enumeration and serialization", () => {
		const map = new Map();
		expect(Object.keys(map)).toEqual([]);
		expect(JSON.stringify({ a: 1 })).toBe('{"a":1}');
		expect(Object.prototype.propertyIsEnumerable.call({}, LUAU_SIZE)).toBe(
			false,
		);
	});
});
