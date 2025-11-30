import { describe, expect, it } from "vitest";
import { buildSceneFromJson } from "./parser";

describe("ID Stability", () => {
	describe("user-provided keys", () => {
		it("should use 'key' prop as ID when provided", () => {
			const json = {
				type: "Group",
				children: [
					{
						type: "Circle",
						key: "my-custom-circle",
						props: { r: 10 },
					},
				],
			};

			const scene = buildSceneFromJson(json);
			const circle = scene.nodes.find((n) => n.id === "my-custom-circle");

			expect(circle).toBeDefined();
			expect(circle?.id).toBe("my-custom-circle");
		});

		it("should support keys on multiple elements", () => {
			const json = {
				type: "StackH",
				key: "my-stack",
				children: [
					{ type: "Circle", key: "circle-1", props: { r: 5 } },
					{ type: "Circle", key: "circle-2", props: { r: 8 } },
					{ type: "Rect", key: "rect-1", props: { width: 10, height: 10 } },
				],
			};

			const scene = buildSceneFromJson(json);

			expect(scene.nodes.find((n) => n.id === "my-stack")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "circle-1")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "circle-2")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "rect-1")).toBeDefined();
		});

		it("should work with nested structures", () => {
			const json = {
				type: "Group",
				key: "root",
				children: [
					{
						type: "Background",
						key: "bg",
						props: { padding: 10 },
						children: [
							{
								type: "StackV",
								key: "inner-stack",
								children: [
									{ type: "Circle", key: "c1", props: { r: 5 } },
									{ type: "Circle", key: "c2", props: { r: 5 } },
								],
							},
						],
					},
				],
			};

			const scene = buildSceneFromJson(json);

			expect(scene.nodes.find((n) => n.id === "root")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "bg")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "inner-stack")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "c1")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "c2")).toBeDefined();
		});
	});

	describe("auto-generated IDs", () => {
		it("should generate deterministic IDs based on tree position when no key provided", () => {
			const json = {
				type: "Group",
				children: [
					{ type: "Circle", props: { r: 5 } },
					{ type: "Circle", props: { r: 8 } },
					{ type: "Rect", props: { width: 10, height: 10 } },
				],
			};

			const scene1 = buildSceneFromJson(json);
			const scene2 = buildSceneFromJson(json);

			// Same input should produce same IDs
			expect(scene1.nodes.map((n) => n.id)).toEqual(
				scene2.nodes.map((n) => n.id),
			);
		});

		it("should generate unique IDs for siblings of same type", () => {
			const json = {
				type: "Group",
				children: [
					{ type: "Circle", props: { r: 5 } },
					{ type: "Circle", props: { r: 8 } },
					{ type: "Circle", props: { r: 10 } },
				],
			};

			const scene = buildSceneFromJson(json);
			const circles = scene.nodes.filter((n) => n.type === "circle");

			// All circles should have unique IDs
			const ids = circles.map((c) => c.id);
			expect(new Set(ids).size).toBe(ids.length);
		});

		it("should generate stable IDs for nested structures", () => {
			const json = {
				type: "Group",
				children: [
					{
						type: "StackV",
						children: [
							{ type: "Circle", props: { r: 5 } },
							{
								type: "StackH",
								children: [
									{ type: "Rect", props: { width: 10, height: 10 } },
									{ type: "Rect", props: { width: 15, height: 15 } },
								],
							},
						],
					},
				],
			};

			const scene1 = buildSceneFromJson(json);
			const scene2 = buildSceneFromJson(json);

			// Same nested structure should produce same IDs
			expect(scene1.nodes.map((n) => n.id)).toEqual(
				scene2.nodes.map((n) => n.id),
			);
		});
	});

	describe("mixed keys and auto-generated IDs", () => {
		it("should handle mix of keyed and un-keyed elements", () => {
			const json = {
				type: "Group",
				children: [
					{ type: "Circle", key: "named-circle", props: { r: 5 } },
					{ type: "Circle", props: { r: 8 } }, // No key - should auto-generate
					{ type: "Rect", key: "named-rect", props: { width: 10, height: 10 } },
					{ type: "Rect", props: { width: 15, height: 15 } }, // No key
				],
			};

			const scene = buildSceneFromJson(json);

			// Keyed elements should have specified IDs
			expect(scene.nodes.find((n) => n.id === "named-circle")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "named-rect")).toBeDefined();

			// All nodes should have unique IDs
			const ids = scene.nodes.map((n) => n.id);
			expect(new Set(ids).size).toBe(ids.length);

			// Auto-generated IDs should be stable
			const scene2 = buildSceneFromJson(json);
			expect(scene.nodes.map((n) => n.id)).toEqual(
				scene2.nodes.map((n) => n.id),
			);
		});
	});

	describe("ID uniqueness", () => {
		it("should ensure all generated IDs are unique", () => {
			const json = {
				type: "Group",
				children: [
					{
						type: "StackV",
						children: [
							{ type: "Circle", props: { r: 5 } },
							{ type: "Circle", props: { r: 5 } },
							{ type: "Circle", props: { r: 5 } },
						],
					},
					{
						type: "StackH",
						children: [
							{ type: "Circle", props: { r: 10 } },
							{ type: "Circle", props: { r: 10 } },
						],
					},
				],
			};

			const scene = buildSceneFromJson(json);
			const ids = scene.nodes.map((n) => n.id);

			// All IDs must be unique
			expect(new Set(ids).size).toBe(ids.length);
		});

		it("should throw error if duplicate keys are provided", () => {
			const json = {
				type: "Group",
				children: [
					{ type: "Circle", key: "duplicate", props: { r: 5 } },
					{ type: "Circle", key: "duplicate", props: { r: 8 } },
				],
			};

			expect(() => buildSceneFromJson(json)).toThrow();
		});
	});

	describe("backward compatibility", () => {
		it("should still support existing 'id' prop for backward compatibility", () => {
			const json = {
				type: "Group",
				children: [
					{
						type: "Circle",
						id: "old-style-id",
						props: { r: 10 },
					},
				],
			};

			const scene = buildSceneFromJson(json);
			const circle = scene.nodes.find((n) => n.id === "old-style-id");

			expect(circle).toBeDefined();
		});

		it("should prefer 'key' over 'id' when both are provided", () => {
			const json = {
				type: "Group",
				children: [
					{
						type: "Circle",
						id: "old-id",
						key: "new-key",
						props: { r: 10 },
					},
				],
			};

			const scene = buildSceneFromJson(json);

			expect(scene.nodes.find((n) => n.id === "new-key")).toBeDefined();
			expect(scene.nodes.find((n) => n.id === "old-id")).toBeUndefined();
		});
	});
});
