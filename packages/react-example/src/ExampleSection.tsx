import type * as React from "react";
import { CodeBlock } from "./CodeBlock";

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
				<div style={{ marginTop: "0.5rem" }}>
					<CodeBlock code={code} />
				</div>
			</details>
		</section>
	);
}
