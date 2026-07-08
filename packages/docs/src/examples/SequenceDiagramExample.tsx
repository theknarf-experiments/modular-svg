import {
	type Activation,
	type Frame,
	type Item,
	SequenceDiagram,
} from "./SequenceDiagram";

// Three different diagrams from the same component - only the data changes.

const httpFlow: {
	actors: string[];
	items: Item[];
	activations: Activation[];
} = {
	actors: ["Browser", "Server", "Database"],
	items: [
		{ from: "Browser", to: "Server", label: "GET /planets" },
		{ note: "over", actors: ["Server", "Database"], text: "query planning" },
		{ from: "Server", to: "Database", label: "SELECT * FROM planets" },
		{ from: "Database", to: "Server", label: "rows", line: "dotted" },
		{ from: "Server", to: "Server", label: "render JSON" },
		{ from: "Server", to: "Browser", label: "200 OK", line: "dotted" },
	],
	activations: [
		{ actor: "Server", from: 0, to: 5 },
		{ actor: "Database", from: 2, to: 3 },
	],
};

const oauthFlow: {
	actors: { id: string; label: string }[];
	items: Item[];
	activations: Activation[];
	frames: Frame[];
} = {
	actors: [
		{ id: "user", label: "User" },
		{ id: "app", label: "My App" },
		{ id: "auth", label: "Auth Server" },
	],
	items: [
		{ from: "user", to: "app", label: "Log in" },
		{ from: "app", to: "auth", label: "Authorization request", head: "open" },
		{ from: "auth", to: "user", label: "Consent prompt" },
		{ from: "user", to: "auth", label: "Approve" },
		{ from: "auth", to: "app", label: "Access token", line: "dotted" },
		{ note: "rightOf", actors: ["app"], text: "token cached" },
		{ from: "app", to: "user", label: "Logged in", line: "dotted" },
	],
	activations: [
		{ actor: "app", from: 0, to: 6 },
		{ actor: "auth", from: 1, to: 4 },
	],
	frames: [{ kind: "loop", label: "until granted", from: 2, to: 3 }],
};

const tcpHandshake: { actors: string[]; items: Item[]; frames: Frame[] } = {
	actors: ["Client", "Server"],
	items: [
		{ from: "Client", to: "Server", label: "SYN" },
		{ from: "Server", to: "Client", label: "SYN-ACK", line: "dotted" },
		{ from: "Client", to: "Server", label: "ACK" },
		{ from: "Client", to: "Server", label: "data", head: "both" },
		{ from: "Client", to: "Server", label: "FIN (lost)", head: "cross" },
	],
	frames: [{ kind: "rect", from: 0, to: 2, fill: "rgba(120,180,255,0.2)" }],
};

export function SequenceDiagramExample() {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>HTTP request (autonumbered)</h3>
				<SequenceDiagram {...httpFlow} autonumber />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>OAuth login</h3>
				<SequenceDiagram {...oauthFlow} actorSpacing={200} />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>TCP handshake</h3>
				<SequenceDiagram {...tcpHandshake} actorSpacing={140} />
			</div>
		</div>
	);
}
