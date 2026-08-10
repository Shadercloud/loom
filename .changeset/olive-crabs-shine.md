---
"@loom-dev/runtime": minor
---

Give every instance Roblox's attribute API.

`GetAttribute`, `SetAttribute`, `GetAttributes`, `GetAttributeChangedSignal` and
the `AttributeChanged` event were missing entirely, so app code reaching for the
one namespace a Roblox app owns outright died on
`GetAttribute is not a function` — before drawing anything, since the read is
usually on mount. Vela's runtime host hits both halves of it resolving `dark:`
(it reads `LocalPlayer:GetAttribute("VelaColorScheme")` on every environment read
and subscribes to the change signal), which took down every preview whose scene
reached that host.

Attributes are a second namespace beside the property store, as in Roblox: an
attribute is not readable as a property, does not fire `Changed`, and reaches
neither the renderer nor the Scene IR — so a write schedules no flush.
`SetAttribute(name, nil)` removes the attribute and still notifies, an unchanged
write is silent, and `GetAttributes` hands back a snapshot rather than the live
store.

Names are validated the way the engine validates them — up to 100 alphanumerics
and underscores, with the `RBX` prefix reserved — and a bad one throws rather
than storing something a real place would refuse.
