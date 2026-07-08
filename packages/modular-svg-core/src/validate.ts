// Schema validation (Node.js only). Kept out of parser.ts so the browser
// build of buildSceneFromJson pulls in no node:fs / node:path / node:url
// imports. This module is exported from index.ts (the Node/default entry)
// but NOT from browser.ts.

let validateFn: ((data: unknown) => boolean) | undefined;

// Lazy load validation only in a Node.js environment
async function getValidator() {
	if (validateFn) return validateFn;

	// Skip validation in browser
	if (typeof globalThis !== "undefined" && "window" in globalThis) {
		return undefined;
	}

	// Dynamic import for Node.js-only modules
	const { readFileSync } = await import("node:fs");
	const { dirname, join } = await import("node:path");
	const { fileURLToPath } = await import("node:url");
	const Ajv = (await import("ajv")).default;

	const schemaPath = join(
		dirname(fileURLToPath(import.meta.url)),
		"scene.schema.json",
	);
	const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
	const ajv = new Ajv();
	validateFn = ajv.compile(schema);
	return validateFn;
}

export async function validate(data: unknown): Promise<void> {
	const validator = await getValidator();
	if (!validator) {
		// Skip validation in browser
		return;
	}

	if (!validator(data)) {
		// Access Ajv instance to get errors - this is Node-only
		const Ajv = (await import("ajv")).default;
		const ajv = new Ajv();
		const tempValidator = ajv.compile(
			(await import("./scene.schema.json", { with: { type: "json" } })).default,
		);
		tempValidator(data);
		const msg = ajv.errorsText(tempValidator.errors) || "invalid scene";
		throw new Error(msg);
	}
}
