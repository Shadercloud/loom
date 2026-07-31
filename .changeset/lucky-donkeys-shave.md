---
"@loom-dev/preview": patch
"@loom-dev/react": patch
"loom-dev": patch
---

Add browser runtime compatibility for `@rbxts/ripple` and `@rbxts/react-ripple`,
preventing Luau package entries from reaching Vite and Rollup during gallery
development and static builds.

Both packages publish a Luau runtime (`"main": "src/init.luau"`) and a `.d.ts`,
so normal resolution handed Rollup a Luau file and `loom build` / `next build`
failed with `Expected ';', '}' or <eof>` — while development could look fine,
because a gallery target is only fetched when it is opened. Both packages now
alias to loom's own adapters, in serve and build alike.

The adapters are a port of the published implementation, not a stub:
`createSpring`, `createTween`, `createMotion`, `config`, `easing` and the
`useSpring` / `useTween` / `useMotion` hooks, animating `number`, `Vector2`,
`Vector3`, `Color3`, `UDim`, `UDim2`, `Rect` and records of numbers. `CFrame`
throws with a named loom error rather than animating. Controllers share one
`RunService.Heartbeat` connection and release it when the last one settles.

`@loom-dev/react` gains the React bindings this needs: `createBinding`,
`useBinding` and `joinBindings` (re-exported from `@rbxts/react`), with every
host prop accepting a value or a `Binding` of one. A bound prop is written
straight onto the live instance, so an animation costs no React renders.
