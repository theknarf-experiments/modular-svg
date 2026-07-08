import tsx from "@shikijs/langs/tsx";
import githubLight from "@shikijs/themes/github-light";
import * as React from "react";
import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const frameStyle: React.CSSProperties = {
	border: "1px solid #ddd",
	borderRadius: "8px",
	overflow: "auto",
};

// One highlighter for the whole app, loaded lazily and only once, carrying
// just the tsx grammar (a superset of ts/js/jsx) and a single theme with the
// JavaScript regex engine - so no other language grammars and no oniguruma
// wasm end up in the bundle.
let highlighterPromise: Promise<HighlighterCore> | undefined;
function getHighlighter() {
	if (!highlighterPromise) {
		highlighterPromise = createHighlighterCore({
			themes: [githubLight],
			langs: [tsx],
			engine: createJavaScriptRegexEngine(),
		});
	}
	return highlighterPromise;
}

export function CodeBlock({ code }: { code: string }) {
	const [html, setHtml] = React.useState<string | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		getHighlighter().then((hl) => {
			if (cancelled) return;
			setHtml(
				hl.codeToHtml(code, {
					lang: "tsx",
					theme: "github-light",
					transformers: [
						{
							pre(node) {
								node.properties.style = `${node.properties.style ?? ""};margin:0;padding:1rem;font-size:13px;line-height:1.5;tab-size:2;`;
							},
						},
					],
				}),
			);
		});
		return () => {
			cancelled = true;
		};
	}, [code]);

	// Plain fallback while shiki loads
	if (html === null) {
		return (
			<div style={frameStyle}>
				<pre
					style={{
						margin: 0,
						padding: "1rem",
						fontSize: "13px",
						lineHeight: 1.5,
						tabSize: 2,
					}}
				>
					<code>{code}</code>
				</pre>
			</div>
		);
	}

	return <div style={frameStyle} dangerouslySetInnerHTML={{ __html: html }} />;
}
