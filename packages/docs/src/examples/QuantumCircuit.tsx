import { Canvas } from "@modular-svg/react";
import type * as React from "react";

// One horizontal circuit wire with symbols laid on top of it
function Wire({
	depth = 1,
	children,
}: {
	depth?: number;
	children?: React.ReactNode;
}) {
	return (
		<align alignment="centerLeft">
			<rect height={3} width={depth * 60 + 30} fill="black" stroke-width={0} />
			<stackH>
				<rect fill="transparent" width={10} stroke-width={0} />
				{children}
			</stackH>
		</align>
	);
}

// A fixed 50x50 slot on the wire, centering whatever it holds
function WireSymbol({ children }: { children?: React.ReactNode }) {
	return (
		<align alignment="center">
			<rect height={50} width={50} fill="transparent" stroke-width={0} />
			{children}
		</align>
	);
}

// A boxed gate symbol: fixed-size background frame with a letter inside
function BoxedSymbol({ id, children }: { id?: string; children: string }) {
	return (
		<background
			key={id}
			width={50}
			height={50}
			fill="white"
			stroke="black"
			stroke-width={3}
		>
			<text
				font-size={30}
				x={0}
				y={0}
				font-family="serif"
				font-style="italic"
				dy="5"
			>
				{children}
			</text>
		</background>
	);
}

// The circled-plus (controlled-NOT target) symbol
function OPlus({ id }: { id: string }) {
	return (
		<group key={id}>
			<align alignment="center">
				<circle r={15} fill="transparent" stroke="black" stroke-width={3} />
				<rect height={3} width={30} fill="black" stroke-width={0} />
				<rect height={30} width={3} fill="black" stroke-width={0} />
			</align>
		</group>
	);
}

function ControlDot({ id }: { id: string }) {
	return <circle key={id} r={5} fill="black" />;
}

export function QuantumCircuit() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={15}
		>
			<group>
				<stackH alignment="centerY" spacing={25}>
					<stackV>
						<Wire>
							<WireSymbol>
								<ControlDot id="c1" />
							</WireSymbol>
						</Wire>
						<Wire>
							<BoxedSymbol id="z">Z</BoxedSymbol>
						</Wire>
					</stackV>
					{/* Bluefish measures text at the inherited 14px (unitless
					    font-size is invalid CSS), so the effective dims are 7x40 */}
					<text font-size={40} font-weight={300} width={7} height={40}>
						≡
					</text>
					<stackV>
						<Wire depth={3}>
							<WireSymbol />
							<WireSymbol>
								<ControlDot id="c2" />
							</WireSymbol>
						</Wire>
						<Wire depth={3}>
							<BoxedSymbol>H</BoxedSymbol>
							<WireSymbol>
								<OPlus id="plus" />
							</WireSymbol>
							<BoxedSymbol>H</BoxedSymbol>
						</Wire>
					</stackV>
					<text key="plusDescription" font-size={14}>
						This is a controlled-NOT.
					</text>
				</stackH>
				<line>
					<ref target="c1" />
					<ref target="z" />
				</line>
				<line>
					<ref target="c2" />
					<ref target="plus" />
				</line>
				<background fill="rgba(255,200,0,0.333)" rx={10} stroke-width={0}>
					<ref target="plus" />
				</background>
				<background fill="rgba(255,200,0,0.333)" rx={10} stroke-width={0}>
					<ref target="plusDescription" />
				</background>
			</group>
		</Canvas>
	);
}
