import {
	type Activation,
	type Message,
	SequenceDiagram,
} from "./SequenceDiagram";

// Three different diagrams from the same component - only the data changes.

const httpFlow: {
	actors: string[];
	messages: Message[];
	activations: Activation[];
} = {
	actors: ["Browser", "Server", "Database"],
	messages: [
		{ from: "Browser", to: "Server", label: "GET /planets" },
		{ from: "Server", to: "Database", label: "SELECT * FROM planets" },
		{ from: "Database", to: "Server", label: "rows", reply: true },
		{ from: "Server", to: "Server", label: "render JSON" },
		{ from: "Server", to: "Browser", label: "200 OK", reply: true },
	],
	activations: [
		{ actor: "Server", from: 0, to: 4 },
		{ actor: "Database", from: 1, to: 2 },
	],
};

const oauthFlow: {
	actors: string[];
	messages: Message[];
	activations: Activation[];
} = {
	actors: ["User", "App", "Auth"],
	messages: [
		{ from: "User", to: "App", label: "Log in" },
		{ from: "App", to: "Auth", label: "Authorization request" },
		{ from: "Auth", to: "User", label: "Consent prompt" },
		{ from: "User", to: "Auth", label: "Approve" },
		{ from: "Auth", to: "App", label: "Access token", reply: true },
		{ from: "App", to: "User", label: "Logged in", reply: true },
	],
	activations: [
		{ actor: "App", from: 0, to: 5 },
		{ actor: "Auth", from: 1, to: 4 },
	],
};

const tcpHandshake: { actors: string[]; messages: Message[] } = {
	actors: ["Client", "Server"],
	messages: [
		{ from: "Client", to: "Server", label: "SYN" },
		{ from: "Server", to: "Client", label: "SYN-ACK", reply: true },
		{ from: "Client", to: "Server", label: "ACK" },
	],
};

export function SequenceDiagramExample() {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "1.5rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>HTTP request</h3>
				<SequenceDiagram {...httpFlow} />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>OAuth login</h3>
				<SequenceDiagram {...oauthFlow} actorSpacing={200} />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>TCP handshake</h3>
				<SequenceDiagram {...tcpHandshake} actorSpacing={120} />
			</div>
		</div>
	);
}
