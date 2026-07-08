import type * as React from "react";

export function ExampleSection({
	title,
	description,
	code,
	children,
}: {
	title: string;
	description?: string;
	code: string;
	children: React.ReactNode;
}) {
	return (
		<section style={{ marginBottom: "3rem" }}>
			<h2>{title}</h2>
			{description && (
				<p style={{ color: "#666", fontSize: "14px" }}>{description}</p>
			)}
			{children}
			<details style={{ marginTop: "1rem" }}>
				<summary style={{ cursor: "pointer", color: "#666", fontSize: "14px" }}>
					Show code
				</summary>
				<pre
					style={{
						background: "#f6f8fa",
						border: "1px solid #ddd",
						borderRadius: "8px",
						padding: "1rem",
						overflowX: "auto",
						fontSize: "13px",
						lineHeight: 1.5,
						maxWidth: "800px",
					}}
				>
					<code>{code}</code>
				</pre>
			</details>
		</section>
	);
}
