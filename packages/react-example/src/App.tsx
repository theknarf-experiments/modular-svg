import { Canvas } from "@modular-svg/react";
import { useState } from "react";
import { ComplexPlanetSystem, FullPlanetExample } from "./FullPlanetExample";
import { InteractivePlanetExample, PlanetExample } from "./PlanetExample";
import "./modular-svg.d.ts";

function App() {
	const [radius, setRadius] = useState(20);
	const [spacing, setSpacing] = useState(10);
	const [showRect, setShowRect] = useState(true);
	const [margin, setMargin] = useState(10);

	return (
		<div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
			<h1>Modular SVG React Examples</h1>
			<p style={{ color: "#666", marginBottom: "2rem" }}>
				Showcasing declarative SVG layouts with automatic constraint solving
			</p>

			{/* Example 1: Basic Shapes */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>1. Basic Shapes</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Simple circle and rectangle with default styling
				</p>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={10}
				>
					<circle r={25} fill="coral" />
					<rect width={50} height={30} fill="skyblue" />
				</Canvas>
			</section>

			{/* Example 2: Horizontal Stack */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>2. Horizontal Stack</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Using stackH to arrange circles horizontally with spacing
				</p>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={10}
				>
					<stackH spacing={15}>
						<circle r={20} fill="red" />
						<circle r={25} fill="green" />
						<circle r={20} fill="blue" />
					</stackH>
				</Canvas>
			</section>

			{/* Example 3: Vertical Stack */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>3. Vertical Stack</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Using stackV to arrange shapes vertically with spacing
				</p>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={10}
				>
					<stackV spacing={10}>
						<circle r={15} fill="purple" />
						<rect width={40} height={20} fill="orange" />
						<circle r={18} fill="teal" />
					</stackV>
				</Canvas>
			</section>

			{/* Example 4: Nested Layouts */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>4. Nested Layouts</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Combining stackH and stackV to create complex layouts
				</p>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={15}
				>
					<stackV spacing={20}>
						<stackH spacing={15}>
							<circle r={15} fill="crimson" />
							<circle r={15} fill="gold" />
							<circle r={15} fill="limegreen" />
						</stackH>
						<stackH spacing={15}>
							<rect width={30} height={30} fill="dodgerblue" />
							<rect width={30} height={30} fill="mediumpurple" />
						</stackH>
					</stackV>
				</Canvas>
			</section>

			{/* Example 5: React Components */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>5. React Components</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Using React components to create reusable shapes
				</p>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={10}
				>
					<stackH spacing={12}>
						<ColoredCircle color="red" />
						<ColoredCircle color="green" />
						<ColoredCircle color="blue" />
					</stackH>
				</Canvas>
			</section>

			{/* Example 6: Interactive with State */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>6. Interactive with React State</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Adjust the controls to see the layout update in real-time
				</p>
				<div style={{ marginBottom: "1rem" }}>
					<label style={{ display: "block", marginBottom: "0.5rem" }}>
						Circle Radius: {radius}px
						<input
							type="range"
							min="10"
							max="40"
							value={radius}
							onChange={(e) => setRadius(Number(e.target.value))}
							style={{ marginLeft: "1rem", width: "200px" }}
						/>
					</label>
					<label style={{ display: "block", marginBottom: "0.5rem" }}>
						Spacing: {spacing}px
						<input
							type="range"
							min="5"
							max="30"
							value={spacing}
							onChange={(e) => setSpacing(Number(e.target.value))}
							style={{ marginLeft: "1rem", width: "200px" }}
						/>
					</label>
					<label style={{ display: "block", marginBottom: "0.5rem" }}>
						<input
							type="checkbox"
							checked={showRect}
							onChange={(e) => setShowRect(e.target.checked)}
							style={{ marginRight: "0.5rem" }}
						/>
						Show Rectangle
					</label>
				</div>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={10}
				>
					<stackH spacing={spacing}>
						<circle r={radius} fill="hotpink" />
						{showRect && (
							<rect width={radius * 2} height={radius} fill="gold" />
						)}
						<circle r={radius} fill="cyan" />
					</stackH>
				</Canvas>
			</section>

			{/* Example 7: Margin Control */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>7. Canvas Margin</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					The margin prop adds padding around the SVG content
				</p>
				<div style={{ marginBottom: "1rem" }}>
					<label style={{ display: "block", marginBottom: "0.5rem" }}>
						Margin: {margin}px
						<input
							type="range"
							min="0"
							max="50"
							value={margin}
							onChange={(e) => setMargin(Number(e.target.value))}
							style={{ marginLeft: "1rem", width: "200px" }}
						/>
					</label>
				</div>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
						backgroundColor: "#f9f9f9",
					}}
					margin={margin}
				>
					<stackH spacing={10}>
						<circle r={20} fill="red" />
						<circle r={20} fill="blue" />
					</stackH>
				</Canvas>
			</section>

			{/* Example 8: Custom Styling */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>8. Custom Styling</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Canvas accepts standard div props like className and style
				</p>
				<Canvas
					className="custom-canvas"
					style={{
						border: "3px solid #333",
						borderRadius: "12px",
						display: "inline-block",
						backgroundColor: "#fafafa",
						padding: "10px",
						boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
					}}
					margin={15}
				>
					<stackV spacing={15}>
						<circle r={20} fill="indigo" />
						<rect width={60} height={40} fill="tomato" />
					</stackV>
				</Canvas>
			</section>

			{/* Example 9: onRender Callback */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>9. onRender Callback</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Get notified when the SVG is rendered with the onRender callback
				</p>
				<Canvas
					style={{
						border: "1px solid #ddd",
						borderRadius: "8px",
						display: "inline-block",
					}}
					margin={10}
					onRender={(svg) => {
						console.log("SVG rendered:", `${svg.substring(0, 100)}...`);
					}}
				>
					<stackH spacing={10}>
						<circle r={15} fill="seagreen" />
						<circle r={15} fill="salmon" />
						<circle r={15} fill="slateblue" />
					</stackH>
				</Canvas>
				<p style={{ color: "#666", fontSize: "12px", marginTop: "0.5rem" }}>
					Check the browser console to see the rendered SVG
				</p>
			</section>

			{/* Example 10: Planet Example */}
			<section style={{ marginBottom: "3rem" }}>
				<PlanetExample />
			</section>

			{/* Example 11: Interactive Planet Example */}
			<section style={{ marginBottom: "3rem" }}>
				<InteractivePlanetExample />
			</section>

			{/* Example 12: Full Planet Example with ALL Features */}
			<section style={{ marginBottom: "3rem" }}>
				<FullPlanetExample />
			</section>

			{/* Example 13: Complex Planet System */}
			<section style={{ marginBottom: "3rem" }}>
				<ComplexPlanetSystem />
			</section>

			{/* Footer */}
			<footer
				style={{
					marginTop: "4rem",
					paddingTop: "2rem",
					borderTop: "1px solid #ddd",
					color: "#666",
					fontSize: "14px",
				}}
			>
				<p>
					<strong>Features Demonstrated:</strong>
				</p>
				<ul>
					<li>✅ Basic shapes (circle, rect)</li>
					<li>✅ Layout containers (stackH, stackV)</li>
					<li>✅ Nested layouts</li>
					<li>✅ React components</li>
					<li>✅ React state and interactivity</li>
					<li>✅ Props (margin, className, style, onRender)</li>
					<li>✅ Dynamic updates and re-renders</li>
				</ul>
				<p style={{ marginTop: "1rem" }}>
					<strong>Note:</strong> Context forwarding is not yet implemented. See{" "}
					<code>IMPLEMENTATION_STATUS.md</code> for details.
				</p>
			</footer>
		</div>
	);
}

// Helper component to demonstrate React component usage
function ColoredCircle({ color }: { color: string }) {
	return <circle r={18} fill={color} />;
}

export default App;
