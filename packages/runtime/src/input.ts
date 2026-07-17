/**
 * `input.ts` — Roblox `InputObject` construction.
 *
 * The DOM bridge synthesizes these from pointer/keyboard events and passes them
 * to `InputBegan`/`InputChanged`/`InputEnded` handlers. Plain objects, not
 * instances: Roblox handler code only reads the fields.
 */
import { Vector3 } from "./datatypes";
import { Enum, type EnumItem } from "./enums";

/** The fields Roblox input handlers read from an `InputObject`. */
export interface InputObject {
	UserInputType: EnumItem<"UserInputType">;
	UserInputState: EnumItem<"UserInputState">;
	Position: Vector3;
	Delta: Vector3;
	KeyCode: EnumItem<"KeyCode">;
}

/** What the caller must/can provide; everything else gets Roblox defaults. */
export interface InputObjectInit {
	UserInputType: EnumItem<"UserInputType">;
	UserInputState?: EnumItem<"UserInputState">;
	Position?: Vector3;
	Delta?: Vector3;
	KeyCode?: EnumItem<"KeyCode">;
}

/**
 * Build an `InputObject`. Defaults: state `Begin`, zero position/delta,
 * `KeyCode.Unknown`.
 */
export function makeInputObject(init: InputObjectInit): InputObject {
	return {
		UserInputType: init.UserInputType,
		UserInputState: init.UserInputState ?? Enum.UserInputState.Begin,
		Position: init.Position ?? Vector3.zero,
		Delta: init.Delta ?? Vector3.zero,
		KeyCode: init.KeyCode ?? Enum.KeyCode.Unknown,
	};
}
