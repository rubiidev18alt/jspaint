import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CPU worker uses WASM, reports progress, and extracts a chat response", async () => {
	const messages = [];
	globalThis.self = { postMessage: message => messages.push(message) };
	globalThis.cpuTest = {};
	const fakeLibrary = `
		export const env = globalThis.cpuTest.env = { backends: { onnx: { wasm: {} } } };
		export class TextStreamer { constructor(tokenizer, options) { this.options = options; } }
		export async function pipeline(task, model, options) {
			globalThis.cpuTest.pipeline = { task, model, options };
			options.progress_callback({ status: 'progress', file: 'model.onnx', loaded: 1048576, total: 2097152 });
			const generator = async (chat, settings) => {
				globalThis.cpuTest.chat = chat;
				settings.streamer.options.token_callback_function([1,2,3,4,5]);
				return [{ generated_text: [...chat, { role: 'assistant', content: 'Here is your drawing:\\n\\x60\\x60\\x60json\\n{"shapes":[]}\\n\\x60\\x60\\x60' }] }];
			};
			generator.tokenizer = {};
			return generator;
		}`;
	const moduleUrl = `data:text/javascript;base64,${Buffer.from(fakeLibrary).toString("base64")}`;
	let source = await readFile(new URL("../src/ai-drawing-cpu-worker.js", import.meta.url), "utf8");
	source = source.replace('"../lib/transformers/transformers.min.js"', JSON.stringify(moduleUrl));
	// import.meta.url in a data URL cannot resolve relative paths.
	source = source.replace('new URL("../lib/transformers/", import.meta.url).href', '"https://example.test/lib/transformers/"');
	await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
	await self.onmessage({ data: { prompt: "a tree", model: "cpu" } });
	assert.equal(cpuTest.pipeline.task, "text-generation");
	assert.equal(cpuTest.pipeline.options.device, "wasm");
	assert.equal(cpuTest.pipeline.options.dtype, "q8");
	assert.equal(cpuTest.env.backends.onnx.wasm.numThreads, 1);
	assert.equal(cpuTest.chat[1].content, "a tree");
	assert.ok(messages.some(m => m.phase === "download" && m.text.includes("1.0 / 2.0 MB")));
	assert.ok(messages.some(m => m.phase === "drawing" && m.text.includes("5 tokens")));
	assert.deepEqual(messages.at(-1), { type: "result", text: '{"shapes":[]}' });
	delete globalThis.self;
	delete globalThis.cpuTest;
});
