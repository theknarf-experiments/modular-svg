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
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
					gap: "1.5rem",
					alignItems: "start",
					marginTop: "1rem",
				}}
			>
				<CodeBlock code={code} />
				<div>{children}</div>
			</div>
		</section>
	);
}
