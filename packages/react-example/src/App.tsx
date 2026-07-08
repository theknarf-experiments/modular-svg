import { ExampleSection } from "./ExampleSection";
import { BarChart } from "./examples/BarChart";
import barChartCode from "./examples/BarChart.tsx?raw";
import { ContextForwarding } from "./examples/ContextForwarding";
import contextForwardingCode from "./examples/ContextForwarding.tsx?raw";
import { CustomStyling } from "./examples/CustomStyling";
import customStylingCode from "./examples/CustomStyling.tsx?raw";
import { EventHandlers } from "./examples/EventHandlers";
import eventHandlersCode from "./examples/EventHandlers.tsx?raw";
import { InteractiveState } from "./examples/InteractiveState";
import interactiveStateCode from "./examples/InteractiveState.tsx?raw";
import { PlanetExample } from "./examples/PlanetExample";
import planetExampleCode from "./examples/PlanetExample.tsx?raw";
import { ReactComponents } from "./examples/ReactComponents";
import reactComponentsCode from "./examples/ReactComponents.tsx?raw";
import { ShapesAndStacks } from "./examples/ShapesAndStacks";
import shapesAndStacksCode from "./examples/ShapesAndStacks.tsx?raw";
import "./modular-svg.d.ts";

function App() {
	return (
		<div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
			<h1>Modular SVG React Examples</h1>
			<p style={{ color: "#666", marginBottom: "2rem" }}>
				Showcasing declarative SVG layouts with automatic constraint solving
			</p>

			<ExampleSection
				title="Shapes and Stacks"
				description="Circles and rectangles arranged with stackH and stackV - stacks nest to build up larger layouts"
				code={shapesAndStacksCode}
			>
				<ShapesAndStacks />
			</ExampleSection>

			<ExampleSection
				title="React Components"
				description="Using React components to create reusable shapes"
				code={reactComponentsCode}
			>
				<ReactComponents />
			</ExampleSection>

			<ExampleSection
				title="Custom Styling"
				description="Canvas accepts standard div props like className and style"
				code={customStylingCode}
			>
				<CustomStyling />
			</ExampleSection>

			<ExampleSection
				title="Interactive with React State"
				description="Adjust the controls to see the layout update in real-time - including the margin the Canvas reserves around the content"
				code={interactiveStateCode}
			>
				<InteractiveState />
			</ExampleSection>

			<ExampleSection
				title="Interactive Event Handlers"
				description="Click on circles to see event handlers in action"
				code={eventHandlersCode}
			>
				<EventHandlers />
			</ExampleSection>

			<ExampleSection
				title="Planet Example"
				description="A complete adaptation of examples/planet.json using Background, StackH, Text, Align, Distribute, Arrow, and Ref"
				code={planetExampleCode}
			>
				<PlanetExample />
			</ExampleSection>

			<ExampleSection
				title="Interactive Bar Chart"
				description="Bars bottom-aligned in a stackH, with align, distribute, and an arrow pointing out the tallest bar - adjust scale and spacing"
				code={barChartCode}
			>
				<BarChart />
			</ExampleSection>

			<ExampleSection
				title="React Context Forwarding"
				description="React contexts automatically flow into Canvas children - no special setup required"
				code={contextForwardingCode}
			>
				<ContextForwarding />
			</ExampleSection>
		</div>
	);
}

export default App;
