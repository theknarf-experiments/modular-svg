import { VennDiagram } from "./VennDiagram";

export function VennDiagramExample() {
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "2rem" }}>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Two sets</h3>
				<VennDiagram sets={[{ label: "Frontend" }, { label: "Backend" }]} />
			</div>
			<div>
				<h3 style={{ margin: "0 0 0.5rem" }}>Three sets</h3>
				<VennDiagram
					sets={[{ label: "HTML" }, { label: "CSS" }, { label: "JS" }]}
				/>
			</div>
		</div>
	);
}
