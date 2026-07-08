import { Canvas } from "@modular-svg/react";
import { createContext, useContext, useState } from "react";

const ThemeContext = createContext<"light" | "dark">("light");
const SizeScaleContext = createContext(1);

function ThemedCircle() {
	const theme = useContext(ThemeContext);
	const scale = useContext(SizeScaleContext);

	const colors = {
		light: { fill: "#3b82f6", stroke: "#1e40af" },
		dark: { fill: "#1e293b", stroke: "#475569" },
	};

	return (
		<circle
			r={20 * scale}
			fill={colors[theme].fill}
			stroke={colors[theme].stroke}
			stroke-width={2}
		/>
	);
}

export function ContextForwarding() {
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
				</div>
			</SizeScaleContext.Provider>
		</ThemeContext.Provider>
	);
}
