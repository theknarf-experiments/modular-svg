import { Graphic } from "@modular-svg/react";

export type Field = {
	name: string;
	/** field width in bits; omit to fill the rest of the row */
	bits?: number;
};

export type PacketDiagramProps = {
	fields: Field[];
	bitsPerRow?: number;
	/** pixels per bit; rows are bitsPerRow * bitWidth wide */
	bitWidth?: number;
	rowHeight?: number;
	fontSize?: number;
};

type Cell = {
	name: string;
	startBit: number;
	/** undefined fills the remainder of the row */
	bits?: number;
	continued: boolean;
};

// Flow fields into rows, splitting any field that crosses a row boundary
function toRows(fields: Field[], bitsPerRow: number): Cell[][] {
	const rows: Cell[][] = [[]];
	let bit = 0;
	for (const field of fields) {
		if (field.bits === undefined) {
			rows[rows.length - 1].push({
				name: field.name,
				startBit: bit,
				continued: false,
			});
			rows.push([]);
			bit = Math.ceil((bit + 1) / bitsPerRow) * bitsPerRow;
			continue;
		}
		let remaining = field.bits;
		let continued = false;
		while (remaining > 0) {
			const space = bitsPerRow - (bit % bitsPerRow);
			const take = Math.min(remaining, space);
			rows[rows.length - 1].push({
				name: field.name,
				startBit: bit,
				bits: take,
				continued,
			});
			bit += take;
			remaining -= take;
			if (bit % bitsPerRow === 0) rows.push([]);
			continued = true;
		}
	}
	if (rows[rows.length - 1].length === 0) rows.pop();
	return rows;
}

export function PacketDiagram({
	fields,
	bitsPerRow = 32,
	bitWidth = 15,
	rowHeight = 30,
	fontSize = 12,
}: PacketDiagramProps) {
	const rows = toRows(fields, bitsPerRow);
	const cellId = (r: number, c: number) => `cell-${r}-${c}`;

	return (
		<Graphic
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
			}}
			margin={12}
		>
			<group>
				<stackV spacing={0} alignment="left">
					{rows.map((row, r) => (
						// Each row is exactly bitsPerRow * bitWidth wide: sized cells
						// take bits * bitWidth, unsized cells share the leftover via
						// the stack's total mode
						<stackH
							key={`row-${r}`}
							spacing={0}
							total={bitsPerRow * bitWidth}
							alignment="top"
						>
							{row.map((cell, c) => (
								<rect
									key={cellId(r, c)}
									width={
										cell.bits === undefined ? undefined : cell.bits * bitWidth
									}
									height={rowHeight}
									fill="#EDF2FB"
									stroke="#333"
									stroke-width={1}
								/>
							))}
						</stackH>
					))}
				</stackV>

				{rows.map((row, r) =>
					row.map((cell, c) => {
						const endBit =
							cell.bits === undefined
								? `${bitsPerRow - 1 + Math.floor(cell.startBit / bitsPerRow) * bitsPerRow}`
								: `${cell.startBit + cell.bits - 1}`;
						const range =
							cell.bits === 1
								? `${cell.startBit}`
								: `${cell.startBit}-${endBit}`;
						return (
							<group key={`${cellId(r, c)}-labels`}>
								<text key={`${cellId(r, c)}-name`} font-size={fontSize}>
									{cell.continued ? `${cell.name} (cont.)` : cell.name}
								</text>
								<align alignment="center">
									<ref target={cellId(r, c)} />
									<ref target={`${cellId(r, c)}-name`} />
								</align>
								<text
									key={`${cellId(r, c)}-range`}
									font-size={fontSize - 4}
									fill="#777"
								>
									{range}
								</text>
								<align alignment="topLeft">
									<ref target={cellId(r, c)} />
									<ref target={`${cellId(r, c)}-range`} />
								</align>
							</group>
						);
					}),
				)}
			</group>
		</Graphic>
	);
}
