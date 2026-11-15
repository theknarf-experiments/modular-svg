import { Graphic } from "@modular-svg/react";

const cards = [
	{ id: "visits", label: "Visits", value: "48.2k", color: "#4C7DF0" },
	{ id: "signups", label: "Sign-ups", value: "1,930", color: "#2FB8A0" },
	{ id: "revenue", label: "Revenue", value: "$86k", color: "#F28C28" },
];
const bars = [14, 22, 17, 30, 26, 38];

// One dashboard, written out twice: dimmed, and lit. `lit` is the copy that
// goes inside the Mask.
function dashboard(lit: boolean) {
	const k = (id: string) => `${lit ? "lit" : "dim"}-${id}`;
	return (
		<stackH key={k("row")} spacing={16}>
			{cards.map((c) => (
				<background
					key={k(c.id)}
					padding={16}
					rx={12}
					fill={lit ? "#FFFFFF" : "#1B2436"}
					stroke={lit ? c.color : "#2A3550"}
					stroke-width={lit ? 2 : 1}
				>
					<stackV key={k(`${c.id}Body`)} spacing={8} alignment="left">
						<text
							key={k(`${c.id}Label`)}
							font-size={12}
							fill={lit ? "#5A6577" : "#4A5876"}
							width={100}
						>
							{c.label}
						</text>
						<text
							key={k(`${c.id}Value`)}
							font-size={26}
							font-weight={700}
							fill={lit ? "#1F2A44" : "#55648A"}
							width={100}
						>
							{c.value}
						</text>
						<stackH key={k(`${c.id}Bars`)} spacing={5} alignment="bottom">
							{bars.map((h, i) => (
								<rect
									key={k(`${c.id}Bar${i}`)}
									width={12}
									height={h}
									rx={2}
									fill={lit ? c.color : "#2F3B58"}
									stroke="none"
									stroke-width={0}
								/>
							))}
						</stackH>
					</stackV>
				</background>
			))}
		</stackH>
	);
}

// A spotlight. The dim dashboard is drawn as usual; the lit copy is the
// content of a Mask, so it only shows through the mask's shape, a circle. A
// Mask shows its content through the shape's paint as authored (here opaque
// black) and `feather` blurs it, which is the soft edge. A Travel carries the
// circle from card to card: a motion on the shape moves the light, and the
// Phrase sends it there and back.
export function SpotlightExample() {
	return (
		<Graphic margin={22} animation={{ loop: true, stillAt: 1.9 }}>
			<background key="wall" padding={22} rx={14} fill="#111827" stroke="none">
				{dashboard(false)}
			</background>
			<mask key="light" feather={16}>
				<circle key="spot" r={86} fill="#000000" stroke="none" />
				{dashboard(true)}
			</mask>
			<align alignment="topLeft">
				<ref target="dim-row" />
				<ref target="lit-row" />
			</align>
			<align alignment="center">
				<ref target="dim-visits" />
				<ref target="spot" />
			</align>

			<phrase key="sweep" at={0.5} repeat={2} alternate>
				<travel key="pan" over={2.8} ease="inOut">
					<ref target="spot" />
					<ref target="dim-signups" />
					<ref target="dim-revenue" />
				</travel>
				<rest key="dwell" over={0.5} />
				<sequence>
					<ref target="pan" />
					<ref target="dwell" />
				</sequence>
			</phrase>
			<rest at={7.1} over={0.4} />
		</Graphic>
	);
}
