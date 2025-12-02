import { Canvas } from "@modular-svg/react";
import { createContext, useContext, useState } from "react";
import { ComplexPlanetSystem, FullPlanetExample } from "./FullPlanetExample";
import { InteractivePlanetExample, PlanetExample } from "./PlanetExample";
import "./modular-svg.d.ts";

// Create contexts for demonstration
const ThemeContext = createContext<"light" | "dark">("light");
const SizeScaleContext = createContext(1);

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

			{/* Example 7: Event Handlers (NEW!) */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>7. Interactive Event Handlers ✨ NEW!</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					Click on circles to see event handlers in action!
				</p>
				<InteractiveClickExample />
			</section>

			{/* Example 8: Margin Control */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>8. Canvas Margin</h2>
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

			{/* Example 9: Planet Example */}
			<section style={{ marginBottom: "3rem" }}>
				<PlanetExample />
			</section>

			{/* Example 10: Interactive Planet Example */}
			<section style={{ marginBottom: "3rem" }}>
				<InteractivePlanetExample />
			</section>

			{/* Example 11: Full Planet Example with ALL Features */}
			<section style={{ marginBottom: "3rem" }}>
				<FullPlanetExample />
			</section>

			{/* Example 12: Complex Planet System */}
			<section style={{ marginBottom: "3rem" }}>
				<ComplexPlanetSystem />
			</section>

			{/* Example 13: Context Forwarding ✨ NEW! */}
			<section style={{ marginBottom: "3rem" }}>
				<h2>13. React Context Forwarding ✨ NEW!</h2>
				<p style={{ color: "#666", fontSize: "14px" }}>
					React contexts automatically flow into Canvas children - no special
					setup required!
				</p>
				<ContextForwardingExample />
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
					<li>✅ Event handlers (onClick, onMouseEnter, etc.)</li>
					<li>✅ Props (margin, className, style, title)</li>
					<li>✅ Dynamic updates and re-renders</li>
					<li>✅ React Context forwarding</li>
				</ul>
				<p style={{ marginTop: "1rem" }}>
					<strong>Built with React 19</strong> using react-reconciler 0.31.0 and
					its-fine for seamless context bridging.
				</p>
			</footer>
		</div>
	);
}

// Helper component to demonstrate React component usage
function ColoredCircle({ color }: { color: string }) {
	return <circle r={18} fill={color} />;
}

// Interactive example with click handlers
function InteractiveClickExample() {
	const [clicked, setClicked] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);

	return (
		<div>
			<p style={{ color: "#333", fontSize: "14px", marginBottom: "1rem" }}>
				{clicked
					? `✅ You clicked: ${clicked}`
					: "👆 Click on any circle below"}
			</p>
			<Canvas
				style={{
					border: "1px solid #ddd",
					borderRadius: "8px",
					display: "inline-block",
					cursor: "pointer",
				}}
				margin={10}
				title="Interactive color circles"
			>
				<stackH spacing={20}>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Custom JSX elements processed by reconciler */}
					<circle
						key="red-circle"
						r={25}
						fill={hovered === "Red Circle" ? "#ff6666" : "#ff0000"}
						stroke="#990000"
						stroke-width={hovered === "Red Circle" ? 3 : 1}
						onClick={() => setClicked("Red Circle")}
						onMouseEnter={() => setHovered("Red Circle")}
						onMouseLeave={() => setHovered(null)}
					/>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Custom JSX elements processed by reconciler */}
					<circle
						key="green-circle"
						r={25}
						fill={hovered === "Green Circle" ? "#66ff66" : "#00ff00"}
						stroke="#009900"
						stroke-width={hovered === "Green Circle" ? 3 : 1}
						onClick={() => setClicked("Green Circle")}
						onMouseEnter={() => setHovered("Green Circle")}
						onMouseLeave={() => setHovered(null)}
					/>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Custom JSX elements processed by reconciler */}
					<circle
						key="blue-circle"
						r={25}
						fill={hovered === "Blue Circle" ? "#6666ff" : "#0000ff"}
						stroke="#000099"
						stroke-width={hovered === "Blue Circle" ? 3 : 1}
						onClick={() => setClicked("Blue Circle")}
						onMouseEnter={() => setHovered("Blue Circle")}
						onMouseLeave={() => setHovered(null)}
					/>
				</stackH>
			</Canvas>
			<p style={{ color: "#666", fontSize: "12px", marginTop: "1rem" }}>
				Supported events: onClick, onMouseEnter, onMouseLeave, onMouseMove,
				onMouseDown, onMouseUp
			</p>
		</div>
	);
}

// Context forwarding example - demonstrates React contexts work seamlessly
function ContextForwardingExample() {
	const [theme, setTheme] = useState<"light" | "dark">("light");
	const [scale, setScale] = useState(1);

	return (
		<ThemeContext.Provider value={theme}>
			<SizeScaleContext.Provider value={scale}>
				<div>
					<div style={{ marginBottom: "1rem" }}>
						<label style={{ display: "block", marginBottom: "0.5rem" }}>
							<strong>Theme Context:</strong>
							<select
								value={theme}
								onChange={(e) => setTheme(e.target.value as "light" | "dark")}
								style={{ marginLeft: "1rem", padding: "4px 8px" }}
							>
								<option value="light">Light</option>
								<option value="dark">Dark</option>
							</select>
						</label>
						<label style={{ display: "block", marginBottom: "0.5rem" }}>
							<strong>Size Scale Context:</strong> {scale.toFixed(1)}x
							<input
								type="range"
								min="0.5"
								max="2"
								step="0.1"
								value={scale}
								onChange={(e) => setScale(Number(e.target.value))}
								style={{ marginLeft: "1rem", width: "200px" }}
							/>
						</label>
					</div>
					<Canvas
						style={{
							border: "1px solid #ddd",
							borderRadius: "8px",
							display: "inline-block",
						}}
						margin={10}
						data-testid="context-canvas"
					>
						<stackH spacing={15}>
							<ThemedCircle />
							<ThemedCircle />
							<ThemedCircle />
						</stackH>
					</Canvas>
					<p
						style={{
							color: "#666",
							fontSize: "12px",
							marginTop: "1rem",
							maxWidth: "500px",
						}}
					>
						<strong>How it works:</strong> The ThemedCircle components use{" "}
						<code>useContext()</code> to read theme and scale values from
						providers outside the Canvas. Context automatically flows from
						react-dom into the custom reconciler!
					</p>
				</div>
			</SizeScaleContext.Provider>
		</ThemeContext.Provider>
	);
}

// Component that reads from context - demonstrates context forwarding works
function ThemedCircle() {
	const theme = useContext(ThemeContext);
	const scale = useContext(SizeScaleContext);

	const baseRadius = 20;
	const radius = baseRadius * scale;

	// Theme-based colors
	const colors = {
		light: {
			fill: "#3b82f6",
			stroke: "#1e40af",
		},
		dark: {
			fill: "#1e293b",
			stroke: "#475569",
		},
	};

	return (
		<circle
			r={radius}
			fill={colors[theme].fill}
			stroke={colors[theme].stroke}
			stroke-width={2}
		/>
	);
}

export default App;
