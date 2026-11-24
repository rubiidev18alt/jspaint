import { env, pipeline, TextStreamer } from "../lib/transformers/transformers.min.js";
import { ai_drawing_prompt } from "./ai-drawing-prompts.js";

// Run ONNX Runtime on the CPU only. Pages is not cross-origin isolated, so
// force one WASM thread rather than requiring SharedArrayBuffer headers.
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.wasmPaths = new URL("../lib/transformers/", import.meta.url).href;

let generator;
let last_progress_post = 0;

self.onmessage = async ({ data }) => {
	try {
		if (!generator) {
			generator = await pipeline("text-generation", "onnx-community/Qwen2.5-0.5B-Instruct", {
				device: "wasm",
				dtype: "q8",
				progress_callback: (progress) => {
					if (progress.status === "progress" && Date.now() - last_progress_post >= 500) {
						last_progress_post = Date.now();
						const mb = (progress.loaded / 1024 / 1024).toFixed(1);
						const total = progress.total ? ` / ${(progress.total / 1024 / 1024).toFixed(1)} MB` : " MB";
						self.postMessage({ type: "progress", phase: "download", text: `Loading ${progress.file}: ${mb}${total}. CPU model is about 512 MB.` });
					} else if (progress.status === "done") {
						self.postMessage({ type: "progress", phase: "loading", text: `Loaded ${progress.file}. Preparing CPU model; this can take several minutes.` });
					}
				},
			});
		}
		self.postMessage({ type: "progress", phase: "drawing", text: "Drawing on CPU… This can take many minutes. You can stop at any time." });
		let count = 0;
		const streamer = new TextStreamer(generator.tokenizer, {
			skip_prompt: true,
			token_callback_function: (tokens) => {
				count += tokens.length;
				if (count % 5 === 0) self.postMessage({ type: "progress", phase: "drawing", text: `Drawing on CPU… ${count} tokens generated. This can take many minutes.` });
			},
		});
		const result = await generator([
			{ role: "system", content: ai_drawing_prompt("cpu") },
			{ role: "user", content: data.prompt },
		], { max_new_tokens: 1000, do_sample: false, return_full_text: false, streamer });
		const generated = result[0]?.generated_text;
		let text = Array.isArray(generated) ? generated[generated.length - 1]?.content || "" : generated || "";
		// Small models sometimes surround the JSON with a Markdown fence or prose.
		// Extract the object, but never evaluate it; the main thread validates it.
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		if (start >= 0 && end > start) text = text.slice(start, end + 1);
		self.postMessage({ type: "result", text });
	} catch (error) {
		self.postMessage({ type: "error", text: error?.message || String(error) });
	}
};
