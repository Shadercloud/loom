// The host app's own page — rendered by the app's own React (react-dom),
// untouched by the loom aliases, which live entirely in the proxied gallery's
// Vite instance.
export default function Home() {
	return (
		<main style={{ fontFamily: "system-ui", padding: "2rem" }}>
			<h1>loom next-demo</h1>
			<p>
				This is a plain Next.js page. The loom gallery is served by the same app
				at <a href="/loom-preview">/loom-preview</a>.
			</p>
			<iframe
				src="/loom-preview/?chrome=none&target=src/targets/CardScene.loom.tsx"
				title="CardScene preview"
				style={{ width: "100%", height: 420, border: "1px solid #ccc" }}
			/>
		</main>
	);
}
