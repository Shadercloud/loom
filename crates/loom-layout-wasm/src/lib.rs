//! WASM bridge for the loom layout engine.
//!
//! A thin shell that (de)serializes across the JS boundary and calls the pure
//! `loom-layout` core. Scene + viewport cross as structural JS objects via
//! `serde-wasm-bindgen`; the result is serialized with `json_compatible()` so the
//! `rects` map arrives as a plain JS object (not a `Map`).

use serde::Serialize as _;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(js_name = computeLayout)]
pub fn compute_layout_wasm(root: JsValue, viewport: JsValue) -> Result<JsValue, JsValue> {
    let root: loom_scene::SceneNode = serde_wasm_bindgen::from_value(root)
        .map_err(|e| JsValue::from_str(&format!("loom: invalid scene: {e}")))?;
    let vp: loom_scene::Viewport = serde_wasm_bindgen::from_value(viewport)
        .map_err(|e| JsValue::from_str(&format!("loom: invalid viewport: {e}")))?;

    let result = loom_layout::compute_layout(&root, vp)
        .map_err(|e| JsValue::from_str(&format!("loom: {e}")))?;

    // json_compatible() == serialize_maps_as_objects(true): BTreeMap -> JS object.
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    result
        .serialize(&serializer)
        .map_err(|e| JsValue::from_str(&format!("loom: serialize failed: {e}")))
}
