import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const module_url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

test("GPU workers send the appropriate instructions for Standard and Lite", async () => {
	const engine = module_url(`export async function CreateMLCEngine(id) {
		globalThis.gpuTest.id = id;
		return { chat: { completions: { create: async options => {
			globalThis.gpuTest.options = options;
			return { choices: [{ message: { content: '{"shapes":[]}' } }] };
		} } } };
	}`);
	const download = module_url("export function track_model_downloads() {};");
	let source = await readFile(new URL("../src/ai-drawing-worker.js", import.meta.url), "utf8");
	source = source.replace('"../lib/web-llm/index.js"', JSON.stringify(engine));
	source = source.replace('"./ai-model-download.js"', JSON.stringify(download));
	source = source.replace('"./ai-drawing-prompts.js"', JSON.stringify(new URL("../src/ai-drawing-prompts.js", import.meta.url).href));
	globalThis.Cache = class {};
	globalThis.gpuTest = {};
	const messages = [];
	globalThis.self = { postMessage: message => messages.push(message) };
	for (const [model, expected] of [["standard", "5 to 18 shapes"], ["lite", "3 to 10 shapes"]]) {
		// A separate worker has its own module state and engine.
		await import(module_url(`${source}\n// ${model}`));
		await self.onmessage({ data: { model, prompt: "a tree" } });
		assert.ok(gpuTest.options.messages[0].content.includes(expected));
		assert.equal(gpuTest.options.messages[1].content, "a tree");
		assert.equal(gpuTest.options.response_format.type, "json_object");
		assert.ok(gpuTest.id.includes(model === "standard" ? "1.5B" : "0.5B"));
		assert.equal(messages.at(-1).type, "result");
	}
	delete globalThis.Cache;
	delete globalThis.gpuTest;
	delete globalThis.self;
});
