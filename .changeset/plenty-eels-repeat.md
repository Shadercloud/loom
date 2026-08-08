---
"@loom-dev/react": patch
---

Narrow the react peer range to `^18.3.1`, which is the react the adapter can
actually drive.

It advertised `^18.3.1 || ^19.0.0`, and the second half was never true: the host
config runs on `react-reconciler` 0.29, which reads react 18's internals and
finds nothing under react 19. The range was also the mechanism of the failure —
it let npm hoist the adapter next to a host app's react 19 while loom's react 18
stayed nested under `loom-dev`, which is how a static gallery build ended up
handing the reconciler the wrong react.

Installing the adapter into a react 19 app now reports a peer conflict instead of
resolving quietly and breaking later. Nothing changes for a react 18 app, or for
`loom-dev`, which brings its own react 18 along.
