import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// The application serves native ES modules, while this repository's Node package is CommonJS.
const source = await readFile(new URL("../src/ai-drawing-renderer.js", import.meta.url), "utf8");
const { parse_ai_drawing, render_ai_drawing } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const rectangle = { type: "rectangle", color: "#ff0000", x: 0, y: 10, width: 500, height: 300 };

test("validates model output and does not pass arbitrary properties through", () => {
	assert.deepEqual(parse_ai_drawing(JSON.stringify({ shapes: [{ ...rectangle, extra: "ignored" }] })), [rectangle]);
	for (const data of ["not json", "{}", '{"shapes":[]}', JSON.stringify({ shapes: Array(61).fill(rectangle) }),
		JSON.stringify({ shapes: [{ ...rectangle, type: "script" }] }),
		JSON.stringify({ shapes: [{ ...rectangle, color: "url(https://example.com)" }] }),
		JSON.stringify({ shapes: [{ ...rectangle, width: -1 }] }),
		JSON.stringify({ shapes: [{ ...rectangle, x: "10" }] })]) {
		assert.throws(() => parse_ai_drawing(data));
	}
});

test("renders in order at canvas scale and restores canvas state", () => {
	const calls = [];
	const ctx = Object.fromEntries(["save", "restore", "scale", "beginPath", "rect", "fill", "ellipse", "moveTo", "lineTo", "closePath", "stroke"].map((name) => [name, (...args) => calls.push([name, ...args])]));
	const shapes = parse_ai_drawing(JSON.stringify({ shapes: [rectangle,
		{ ...rectangle, type: "ellipse" }, { ...rectangle, type: "triangle" }, { ...rectangle, type: "line" }] }));
	render_ai_drawing(ctx, shapes, 200, 100);
	assert.deepEqual(calls[0], ["save"]);
	assert.deepEqual(calls[1], ["scale", 0.2, 0.1]);
	assert.deepEqual(calls.find((call) => call[0] === "rect"), ["rect", 0, 10, 500, 300]);
	assert.equal(calls.filter((call) => call[0] === "fill").length, 3);
	assert.equal(calls.filter((call) => call[0] === "stroke").length, 1);
	assert.deepEqual(calls.at(-1), ["restore"]);
});
