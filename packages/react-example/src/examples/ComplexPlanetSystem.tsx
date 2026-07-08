import { Canvas } from "@modular-svg/react";

export function ComplexPlanetSystem() {
	return (
		<Canvas
			style={{
				border: "1px solid #ddd",
				borderRadius: "8px",
				display: "inline-block",
				backgroundColor: "#0a0a0a",
			}}
			margin={30}
		>
			<group>
				{/* Main planet layout */}
				<background padding={15} fill="#1a1a1a" stroke="#333" stroke-width={1}>
					<stackH key="planets" spacing={60} alignment="centerY">
						<circle
							key="mercury"
							r={15}
							fill="#EBE3CF"
							stroke="#666"
							stroke-width={2}
						/>
						<circle
							key="venus"
							r={36}
							fill="#DC933C"
							stroke="#666"
							stroke-width={2}
						/>
						<circle
							key="earth"
							r={38}
							fill="#179DD7"
							stroke="#666"
							stroke-width={2}
						/>
						<circle
							key="mars"
							r={21}
							fill="#F1CF8E"
							stroke="#666"
							stroke-width={2}
						/>
					</stackH>
				</background>

				{/* Labels for each planet */}
				<align key="alignMercuryLabel" axis="x" alignment="center">
					<text key="mercuryLabel" fill="#EBE3CF">
						Mercury
					</text>
					<ref target="mercury" />
				</align>

				<align key="alignVenusLabel" axis="x" alignment="center">
					<text key="venusLabel" fill="#DC933C">
						Venus
					</text>
					<ref target="venus" />
				</align>

				<align key="alignEarthLabel" axis="x" alignment="center">
					<text key="earthLabel" fill="#179DD7">
						Earth
					</text>
					<ref target="earth" />
				</align>

				<align key="alignMarsLabel" axis="x" alignment="center">
					<text key="marsLabel" fill="#F1CF8E">
						Mars
					</text>
					<ref target="mars" />
				</align>

				{/* Vertical spacing for labels */}
				<distribute key="distMercury" axis="y" spacing={50}>
					<ref target="mercuryLabel" />
					<ref target="mercury" />
				</distribute>

				<distribute key="distVenus" axis="y" spacing={50}>
					<ref target="venusLabel" />
					<ref target="venus" />
				</distribute>

				<distribute key="distEarth" axis="y" spacing={50}>
					<ref target="earthLabel" />
					<ref target="earth" />
				</distribute>

				<distribute key="distMars" axis="y" spacing={50}>
					<ref target="marsLabel" />
					<ref target="mars" />
				</distribute>

				{/* Arrows connecting labels to planets */}
				<arrow key="arrowMercury" stroke="#EBE3CF" stroke-width={1}>
					<ref target="mercuryLabel" />
					<ref target="mercury" />
				</arrow>

				<arrow key="arrowVenus" stroke="#DC933C" stroke-width={1}>
					<ref target="venusLabel" />
					<ref target="venus" />
				</arrow>

				<arrow key="arrowEarth" stroke="#179DD7" stroke-width={1}>
					<ref target="earthLabel" />
					<ref target="earth" />
				</arrow>

				<arrow key="arrowMars" stroke="#F1CF8E" stroke-width={1}>
					<ref target="marsLabel" />
					<ref target="mars" />
				</arrow>
			</group>
		</Canvas>
	);
}
