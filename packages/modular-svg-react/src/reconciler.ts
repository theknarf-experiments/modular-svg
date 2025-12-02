import type { LayoutOperator, NodeRecord } from "@modular-svg/core";
import { buildSceneFromJson } from "@modular-svg/core";
import type * as React from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";

// Event handlers that can be attached to SVG elements
export type EventHandlers = {
	onClick?: (e: React.MouseEvent<SVGElement>) => void;
	onMouseEnter?: (e: React.MouseEvent<SVGElement>) => void;
	onMouseLeave?: (e: React.MouseEvent<SVGElement>) => void;
	onMouseMove?: (e: React.MouseEvent<SVGElement>) => void;
	onMouseDown?: (e: React.MouseEvent<SVGElement>) => void;
	onMouseUp?: (e: React.MouseEvent<SVGElement>) => void;
};

// Instance represents a node in our scene graph
type Instance = {
	type: string;
	key?: string;
	props: Record<string, unknown>;
	children: Instance[];
	parent?: Instance;
	textContent?: string; // For text elements with string children
};

// Global map to store event handlers for each element by ID
// This survives across reconciler updates
const eventHandlerMap = new Map<string, EventHandlers>();

// Counter for auto-generated IDs (deterministic per reconciler session)
let idCounter = 0;

// Container holds the root instances (can be multiple for fragments)
type Container = {
	rootInstances: Instance[];
};

// Text instance (we don't support text nodes in our scene)
type TextInstance = null;

// Type for HostConfig
type Type = string;
type Props = Record<string, unknown>;
type HydratableInstance = never;
type PublicInstance = Instance;
type HostContext = object;
type UpdatePayload = Props;
type ChildSet = never;
type TimeoutHandle = number;
type NoTimeout = -1;
type SuspenseInstance = never;

// Helper to convert instance tree to JSON for core library
function instanceToJson(instance: Instance): Record<string, unknown> {
	const { type, key, props, children } = instance;

	// Capitalize first letter for core library (e.g., "circle" -> "Circle")
	// Handle camelCase types like "stackH" -> "StackH"
	const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);

	// Filter out text pseudo-instances and collect text content
	const realChildren = children.filter((child) => child.type !== "__text__");
	const textContent = children
		.filter((child) => child.type === "__text__")
		.map((child) => child.props.textContent)
		.join("");

	// Special handling for text elements - add text content to props
	let finalProps = { ...props };
	if (type === "text" && textContent && !finalProps.text) {
		finalProps = { ...finalProps, text: textContent };
	}

	// Special handling for ref elements - target should be at top level
	if (type === "ref" && props.target) {
		return {
			type: capitalizedType,
			target: props.target,
		};
	}

	return {
		type: capitalizedType,
		key,
		props: finalProps,
		children: realChildren.map(instanceToJson),
	};
}

// HostConfig implementation
// Note: Using 'as any' cast because @types/react-reconciler 0.31.0 types may not match
// the actual React 19 runtime behavior (commitUpdate signature changed)
const hostConfig: Reconciler.HostConfig<
	Type,
	Props,
	Container,
	Instance,
	TextInstance,
	SuspenseInstance,
	HydratableInstance,
	PublicInstance,
	HostContext,
	UpdatePayload,
	ChildSet,
	TimeoutHandle,
	NoTimeout
> = {
	// Configuration
	supportsMutation: true,
	supportsPersistence: false,
	supportsHydration: false,
	isPrimaryRenderer: false,

	// Context
	getRootHostContext(_rootContainer: Container): HostContext {
		return {};
	},

	getChildHostContext(
		parentHostContext: HostContext,
		_type: Type,
		_rootContainer: Container,
	): HostContext {
		return parentHostContext;
	},

	// Instance creation
	createInstance(
		type: Type,
		props: Props,
		_rootContainer: Container,
		_hostContext: HostContext,
		internalHandle: Reconciler.OpaqueHandle,
	): Instance {
		// Get key from fiber handle (React doesn't pass key in props)
		const fiber = internalHandle as { key?: unknown };
		const key = fiber?.key;

		// Generate stable ID for this instance
		// Use user-provided key, or auto-generate with counter
		const id = typeof key === "string" ? key : `${type}_${idCounter++}`;

		// Extract event handlers from props
		const {
			children,
			onClick,
			onMouseEnter,
			onMouseLeave,
			onMouseMove,
			onMouseDown,
			onMouseUp,
			...layoutProps
		} = props;

		// Store event handlers in global map if any are provided
		const handlers: EventHandlers = {};
		if (onClick) handlers.onClick = onClick as EventHandlers["onClick"];
		if (onMouseEnter)
			handlers.onMouseEnter = onMouseEnter as EventHandlers["onMouseEnter"];
		if (onMouseLeave)
			handlers.onMouseLeave = onMouseLeave as EventHandlers["onMouseLeave"];
		if (onMouseMove)
			handlers.onMouseMove = onMouseMove as EventHandlers["onMouseMove"];
		if (onMouseDown)
			handlers.onMouseDown = onMouseDown as EventHandlers["onMouseDown"];
		if (onMouseUp) handlers.onMouseUp = onMouseUp as EventHandlers["onMouseUp"];

		if (Object.keys(handlers).length > 0) {
			eventHandlerMap.set(id, handlers);
		}

		return {
			type,
			key: id,
			props: layoutProps,
			children: [],
		};
	},

	createTextInstance(
		text: string,
		_rootContainer: Container,
		_hostContext: HostContext,
		_internalHandle: Reconciler.OpaqueHandle,
	): TextInstance {
		// Text nodes are captured by their parent <text> element
		// We create a pseudo-instance to hold the text content
		return {
			type: "__text__",
			key: undefined,
			props: { textContent: text },
			children: [],
		} as unknown as TextInstance;
	},

	// Tree manipulation - appendChild, appendInitialChild, etc.
	appendInitialChild(parent: Instance, child: Instance | TextInstance): void {
		if (child === null) return;
		parent.children.push(child);
		child.parent = parent;
	},

	appendChild(parent: Instance, child: Instance | TextInstance): void {
		if (child === null) return;
		parent.children.push(child);
		child.parent = parent;
	},

	appendChildToContainer(
		container: Container,
		child: Instance | TextInstance,
	): void {
		if (child === null) return;
		container.rootInstances.push(child);
	},

	removeChild(parent: Instance, child: Instance | TextInstance): void {
		if (child === null) return;
		const index = parent.children.indexOf(child);
		if (index !== -1) {
			parent.children.splice(index, 1);
			child.parent = undefined;
		}
	},

	removeChildFromContainer(
		container: Container,
		child: Instance | TextInstance,
	): void {
		if (child === null) return;
		const index = container.rootInstances.indexOf(child);
		if (index !== -1) {
			container.rootInstances.splice(index, 1);
		}
	},

	insertBefore(
		parent: Instance,
		child: Instance | TextInstance,
		beforeChild: Instance | TextInstance,
	): void {
		if (child === null || beforeChild === null) return;
		const index = parent.children.indexOf(beforeChild);
		if (index !== -1) {
			parent.children.splice(index, 0, child);
			child.parent = parent;
		}
	},

	insertInContainerBefore(
		container: Container,
		child: Instance | TextInstance,
		beforeChild: Instance | TextInstance,
	): void {
		if (child === null || beforeChild === null) return;
		const index = container.rootInstances.indexOf(beforeChild);
		if (index !== -1) {
			container.rootInstances.splice(index, 0, child);
		} else {
			container.rootInstances.push(child);
		}
	},

	// React 19: prepareUpdate was removed, signature changed
	// Signature is now: commitUpdate(instance, type, oldProps, newProps, fiber)
	// Note: @types/react-reconciler may not be updated yet, but runtime behavior is correct
	// @ts-expect-error - React 19 changed commitUpdate signature, types not updated
	commitUpdate(
		instance: Instance,
		_type: Type,
		_oldProps: Props,
		newProps: Props,
		_internalHandle: Reconciler.OpaqueHandle,
	): void {
		// In React 19, we diff and apply changes directly in commitUpdate
		// Extract event handlers from new props
		const {
			children,
			key,
			onClick,
			onMouseEnter,
			onMouseLeave,
			onMouseMove,
			onMouseDown,
			onMouseUp,
			...layoutProps
		} = newProps;

		// Update instance props (without event handlers)
		instance.props = layoutProps;
		if (key) instance.key = key as string;

		// Update event handlers in global map
		const handlers: EventHandlers = {};
		if (onClick) handlers.onClick = onClick as EventHandlers["onClick"];
		if (onMouseEnter)
			handlers.onMouseEnter = onMouseEnter as EventHandlers["onMouseEnter"];
		if (onMouseLeave)
			handlers.onMouseLeave = onMouseLeave as EventHandlers["onMouseLeave"];
		if (onMouseMove)
			handlers.onMouseMove = onMouseMove as EventHandlers["onMouseMove"];
		if (onMouseDown)
			handlers.onMouseDown = onMouseDown as EventHandlers["onMouseDown"];
		if (onMouseUp) handlers.onMouseUp = onMouseUp as EventHandlers["onMouseUp"];

		if (Object.keys(handlers).length > 0 && instance.key) {
			eventHandlerMap.set(instance.key, handlers);
		}
	},

	commitTextUpdate(
		_textInstance: TextInstance,
		_oldText: string,
		_newText: string,
	): void {
		// Not supported
	},

	// Finalization
	finalizeInitialChildren(
		_instance: Instance,
		_type: Type,
		_props: Props,
		_rootContainer: Container,
		_hostContext: HostContext,
	): boolean {
		return false;
	},

	// Commit phase
	prepareForCommit(_containerInfo: Container): Record<string, unknown> | null {
		return null;
	},

	resetAfterCommit(_containerInfo: Container): void {
		// Could trigger scene rebuild here if needed
	},

	// Clearing
	clearContainer(container: Container): void {
		container.rootInstances = [];
		// Reset ID counter for deterministic IDs in tests
		idCounter = 0;
	},

	// Text content
	shouldSetTextContent(_type: Type, _props: Props): boolean {
		return false;
	},

	resetTextContent(_instance: Instance): void {
		// Not needed
	},

	// Hydration (not supported)
	canHydrateInstance(): null {
		return null;
	},

	canHydrateTextInstance(): null {
		return null;
	},

	isSuspenseInstancePending(): boolean {
		return false;
	},

	isSuspenseInstanceFallback(): boolean {
		return false;
	},

	registerSuspenseInstanceRetry(): void {
		// Not needed
	},

	getInstanceFromNode(): null {
		return null;
	},

	beforeActiveInstanceBlur(): void {
		// Not needed
	},

	afterActiveInstanceBlur(): void {
		// Not needed
	},

	prepareScopeUpdate(): void {
		// Not needed
	},

	getInstanceFromScope(): null {
		return null;
	},

	detachDeletedInstance(): void {
		// Not needed
	},

	// Public instance
	getPublicInstance(instance: Instance): PublicInstance {
		return instance;
	},

	preparePortalMount(): void {
		// Not needed
	},

	// Scheduling
	scheduleTimeout: setTimeout,
	cancelTimeout: clearTimeout,
	noTimeout: -1 as NoTimeout,

	getCurrentEventPriority(): number {
		return DefaultEventPriority;
	},

	resolveUpdatePriority(): number {
		return DefaultEventPriority;
	},

	getCurrentUpdatePriority(): number {
		return DefaultEventPriority;
	},

	setCurrentUpdatePriority(_priority: number): void {
		// Not needed for our use case
	},

	maySuspendCommit(_type: Type, _props: Props): boolean {
		return false;
	},

	preloadInstance(_type: Type, _props: Props): boolean {
		return true;
	},

	startSuspendingCommit(): void {
		// Not needed
	},

	suspendInstance(_type: Type, _props: Props): void {
		// Not needed
	},

	waitForCommitToBeReady(): null {
		return null;
	},

	// Additional required methods for newer react-reconciler
	hideInstance(_instance: Instance): void {
		// Not needed
	},

	hideTextInstance(_textInstance: TextInstance): void {
		// Not needed
	},

	unhideInstance(_instance: Instance, _props: Props): void {
		// Not needed
	},

	unhideTextInstance(_textInstance: TextInstance, _text: string): void {
		// Not needed
	},

	// Micro-tasks
	supportsMicrotasks: true,
	scheduleMicrotask:
		typeof queueMicrotask === "function"
			? queueMicrotask
			: (callback: () => void) => Promise.resolve().then(callback),
};

// Create the reconciler
const reconciler = Reconciler(hostConfig);

// ReconcilerRoot type
export type ReconcilerRoot = {
	render: (element: React.ReactNode) => Promise<void>;
	unmount: () => Promise<void>;
	getScene: () => { nodes: NodeRecord[]; operators: LayoutOperator[] };
};

// Create root function
export function createRoot(): ReconcilerRoot {
	const container: Container = { rootInstances: [] };

	const fiberRoot = reconciler.createContainer(
		container,
		0, // ConcurrentRoot
		null, // hydration callbacks
		false, // isStrictMode
		null, // concurrentUpdatesByDefaultOverride
		"", // identifierPrefix
		() => {}, // onRecoverableError
		null, // transitionCallbacks
	);

	return {
		async render(element: React.ReactNode): Promise<void> {
			// React 19: The updateContainer callback behavior differs between browser and test environments
			const isTest =
				typeof process !== "undefined" && process.env.NODE_ENV === "test";

			if (isTest) {
				// Test environment (vitest/jsdom): callback may not fire reliably
				reconciler.updateContainer(element, fiberRoot, null, () => {});
				await new Promise((resolve) => setTimeout(resolve, 0));
			} else {
				// Browser environment: use callback to ensure reconciliation completes
				await new Promise<void>((resolve) => {
					reconciler.updateContainer(element, fiberRoot, null, () => {
						// Callback fires when update is scheduled
						// Wait for commit phase to complete
						setTimeout(resolve, 0);
					});
				});
			}
		},

		async unmount(): Promise<void> {
			reconciler.updateContainer(null, fiberRoot, null, () => {});
			await new Promise((resolve) => setTimeout(resolve, 0));
		},

		getScene(): { nodes: NodeRecord[]; operators: LayoutOperator[] } {
			if (container.rootInstances.length === 0) {
				return { nodes: [], operators: [] };
			}

			// If we have multiple root instances (e.g., from fragment), wrap in Group
			let json: Record<string, unknown>;
			if (container.rootInstances.length === 1) {
				json = instanceToJson(container.rootInstances[0]);
			} else {
				// Multiple children - wrap in a Group
				json = {
					type: "Group",
					props: {},
					children: container.rootInstances.map(instanceToJson),
				};
			}

			// Use core library to build scene
			return buildSceneFromJson(json);
		},
	};
}

// Export act helper for testing
export async function act(callback: () => void | Promise<void>): Promise<void> {
	// Use React's act from react reconciler
	const reactAct = (await import("react")).act;
	await reactAct(async () => {
		await callback();
	});
}

// Export function to get event handlers for an element
export function getEventHandlers(id: string): EventHandlers | undefined {
	return eventHandlerMap.get(id);
}

// Export function to clear all event handlers (useful for cleanup)
export function clearEventHandlers(): void {
	eventHandlerMap.clear();
}
