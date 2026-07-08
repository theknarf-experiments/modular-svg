import * as React from "react";
import { codeToHtml } from "shiki";

const frameStyle: React.CSSProperties = {
	border: "1px solid #ddd",
	borderRadius: "8px",
	overflow: "auto",
	maxWidth: "800px",
};

export function CodeBlock({ code }: { code: string }) {
	const [html, setHtml] = React.useState<string | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		codeToHtml(code, {
			lang: "tsx",
			theme: "github-light",
			transformers: [
				{
					pre(node) {
						node.properties.style = `${node.properties.style ?? ""};margin:0;padding:1rem;font-size:13px;line-height:1.5;tab-size:2;`;
					},
				},
			],
		}).then((result) => {
			if (!cancelled) setHtml(result);
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
