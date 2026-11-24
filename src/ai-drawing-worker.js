import { CreateMLCEngine } from "../lib/web-llm/index.js";
import { track_model_downloads } from "./ai-model-download.js";

// The model and its compiled WebGPU runtime are downloaded by WebLLM on first use.
const models = {
	standard: { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", size: "about 1 GB" },
	lite: { id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", size: "several hundred MB" },
};
let engine;
const schema = {
	type: "object",
	properties: {
		shapes: {
			type: "array",
			items: {
				type: "object",
				properties: {
					type: { type: "string", enum: ["rectangle", "ellipse", "triangle", "line"] },
					color: { type: "string" },
					x: { type: "number" }, y: { type: "number" },
					width: { type: "number" }, height: { type: "number" },
				},
				required: ["type", "color", "x", "y", "width", "height"],
			},
		},
	},
	required: ["shapes"],
};

self.onmessage = async ({ data }) => {
	try {
		if (!engine) {
			const model = models[data.model] || models.standard;
			const modelBaseUrl = `https://huggingface.co/mlc-ai/${model.id}/resolve/main/`;
			track_model_downloads(Cache.prototype, modelBaseUrl, (bytes, message) => {
				self.postMessage({ type: "progress", phase: "download", text: message || `Downloading model: ${(bytes / 1024 / 1024).toFixed(1)} MB received this run. The first download is ${model.size}.` });
			});
			engine = await CreateMLCEngine(model.id, {
				initProgressCallback: (progress) => self.postMessage({
					type: "progress",
					phase: "loading",
					text: progress.text === "Start to fetch params" ?
						"Starting model download. This can take several minutes on the first run." : progress.text,
				}),
			});
		}
		self.postMessage({ type: "progress", phase: "drawing", text: "Drawing… This may take a few minutes." });
		const result = await engine.chat.completions.create({
			messages: [
				{ role: "system", content: `You draw simple colorful flat illustrations using shapes. Return JSON only: {"shapes":[{"type":"ellipse","color":"#ffcc00","x":300,"y":200,"width":400,"height":400}]}. Shapes are painted in order. The canvas is 1000 by 1000. Coordinates and sizes are numbers between 0 and 1000. Types: rectangle, ellipse, triangle (points up), line (from x,y to x+width,y+height). All colors must be six digit hex like #ff0000. Use 5 to 18 shapes. Make a recognizable, attractive illustration of the user's request. Add a background rectangle only if requested.` },
				{ role: "user", content: data.prompt },
			],
			response_format: { type: "json_object", schema: JSON.stringify(schema) },
			temperature: 0.7,
			max_tokens: 1400,
		});
		self.postMessage({ type: "result", text: result.choices[0]?.message?.content || "" });
	} catch (error) {
		self.postMessage({ type: "error", text: error?.message || String(error) });
	}
};
