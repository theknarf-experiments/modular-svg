import { ExampleSection } from "./ExampleSection";
import { BasicShapes } from "./examples/BasicShapes";
import basicShapesCode from "./examples/BasicShapes.tsx?raw";
import { CanvasMargin } from "./examples/CanvasMargin";
import canvasMarginCode from "./examples/CanvasMargin.tsx?raw";
import { ComplexPlanetSystem } from "./examples/ComplexPlanetSystem";
import complexPlanetSystemCode from "./examples/ComplexPlanetSystem.tsx?raw";
import { ContextForwarding } from "./examples/ContextForwarding";
import contextForwardingCode from "./examples/ContextForwarding.tsx?raw";
import { CustomStyling } from "./examples/CustomStyling";
import customStylingCode from "./examples/CustomStyling.tsx?raw";
import { EventHandlers } from "./examples/EventHandlers";
import eventHandlersCode from "./examples/EventHandlers.tsx?raw";
import { HorizontalStack } from "./examples/HorizontalStack";
import horizontalStackCode from "./examples/HorizontalStack.tsx?raw";
import { InteractivePlanetExample } from "./examples/InteractivePlanetExample";
import interactivePlanetExampleCode from "./examples/InteractivePlanetExample.tsx?raw";
import { InteractiveState } from "./examples/InteractiveState";
import interactiveStateCode from "./examples/InteractiveState.tsx?raw";
import { NestedLayouts } from "./examples/NestedLayouts";
import nestedLayoutsCode from "./examples/NestedLayouts.tsx?raw";
import { PlanetExample } from "./examples/PlanetExample";
import planetExampleCode from "./examples/PlanetExample.tsx?raw";
import { ReactComponents } from "./examples/ReactComponents";
import reactComponentsCode from "./examples/ReactComponents.tsx?raw";
import { VerticalStack } from "./examples/VerticalStack";
import verticalStackCode from "./examples/VerticalStack.tsx?raw";
import "./modular-svg.d.ts";

function App() {
	return (
		<div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
			<h1>Modular SVG React Examples</h1>
			<p style={{ color: "#666", marginBottom: "2rem" }}>
				Showcasing declarative SVG layouts with automatic constraint solving
			</p>

			<ExampleSection
				title="Basic Shapes"
				description="Simple circle and rectangle with default styling"
				code={basicShapesCode}
			>
				<BasicShapes />
			</ExampleSection>

			<ExampleSection
				title="Horizontal Stack"
				description="Using stackH to arrange circles horizontally with spacing"
				code={horizontalStackCode}
			>
				<HorizontalStack />
			</ExampleSection>

			<ExampleSection
				title="Vertical Stack"
				description="Using stackV to arrange shapes vertically with spacing"
				code={verticalStackCode}
			>
				<VerticalStack />
			</ExampleSection>

			<ExampleSection
				title="Nested Layouts"
				description="Combining stackH and stackV to create complex layouts"
				code={nestedLayoutsCode}
			>
				<NestedLayouts />
			</ExampleSection>

			<ExampleSection
				title="React Components"
				description="Using React components to create reusable shapes"
				code={reactComponentsCode}
			>
				<ReactComponents />
			</ExampleSection>

			<ExampleSection
				title="Interactive with React State"
				description="Adjust the controls to see the layout update in real-time"
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
				title="Canvas Margin"
				description="The margin prop adds padding around the SVG content"
				code={canvasMarginCode}
			>
				<CanvasMargin />
			</ExampleSection>

			<ExampleSection
				title="Custom Styling"
				description="Canvas accepts standard div props like className and style"
				code={customStylingCode}
			>
				<CustomStyling />
			</ExampleSection>

			<ExampleSection
				title="Planet Example"
				description="A complete adaptation of examples/planet.json using Background, StackH, Text, Align, Distribute, Arrow, and Ref"
				code={planetExampleCode}
			>
				<PlanetExample />
			</ExampleSection>

			<ExampleSection
				title="Interactive Planet Example"
				description="Adjust the scale and spacing to explore the layout"
				code={interactivePlanetExampleCode}
			>
				<InteractivePlanetExample />
			</ExampleSection>

			<ExampleSection
				title="Complex Planet System"
				description="Multiple labels, alignments, and arrows"
				code={complexPlanetSystemCode}
			>
				<ComplexPlanetSystem />
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
