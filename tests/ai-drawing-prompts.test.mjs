import test from "node:test";
import assert from "node:assert/strict";
import { ai_drawing_prompt, drawing_example } from "../src/ai-drawing-prompts.js";
import { parse_ai_drawing } from "../src/ai-drawing-renderer.js";

test("the example drawing follows the actual renderer's rules", () => {
	const shapes = parse_ai_drawing(drawing_example);
	assert.equal(shapes.length, 5);
	assert.equal(shapes[1].type, "triangle");
	for (const shape of shapes) {
		assert.ok(shape.x + shape.width <= 1000);
		assert.ok(shape.y + shape.height <= 1000);
	}
});

test("all modes explain the drawing contract and use model-sized guidance", () => {
	for (const mode of ["standard", "lite", "cpu"]) {
		const prompt = ai_drawing_prompt(mode);
		for (const rule of ["top left", "painted in array order", "six-digit hex", "cannot see the existing canvas", "line goes from", drawing_example]) {
			assert.ok(prompt.includes(rule), `${mode} missing ${rule}`);
		}
	}
	assert.match(ai_drawing_prompt("standard"), /5 to 18 shapes/);
	assert.match(ai_drawing_prompt("standard"), /contrasting colors/);
	for (const mode of ["lite", "cpu"]) {
		assert.match(ai_drawing_prompt(mode), /3 to 10 shapes/);
		assert.ok(ai_drawing_prompt(mode).length < ai_drawing_prompt("standard").length);
	}
});
