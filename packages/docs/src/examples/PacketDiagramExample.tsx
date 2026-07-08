import { type Field, PacketDiagram } from "./PacketDiagram";

// RFC-style header layouts as plain field lists; a field without bits
// fills the rest of its row.

const tcpHeader: Field[] = [
	{ name: "Source Port", bits: 16 },
	{ name: "Destination Port", bits: 16 },
	{ name: "Sequence Number", bits: 32 },
	{ name: "Acknowledgment Number", bits: 32 },
	{ name: "Offset", bits: 4 },
	{ name: "Rsvd", bits: 3 },
	{ name: "Flags", bits: 9 },
	{ name: "Window", bits: 16 },
	{ name: "Checksum", bits: 16 },
	{ name: "Urgent Pointer", bits: 16 },
	{ name: "Options / Padding" },
];

const udpHeader: Field[] = [
	{ name: "Source Port", bits: 16 },
	{ name: "Destination Port", bits: 16 },
	{ name: "Length", bits: 16 },
	{ name: "Checksum", bits: 16 },
	{ name: "Data" },
];

export function PacketDiagramExample() {
	return (
		<div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>TCP header</h3>
				<PacketDiagram fields={tcpHeader} />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>UDP header</h3>
				<PacketDiagram fields={udpHeader} />
			</div>
		</div>
	);
}
