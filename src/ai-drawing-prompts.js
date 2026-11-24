// Keep these instructions in sync with ai-drawing-renderer.js. The small
// models need the same drawing rules, but a shorter task than Standard.
export const drawing_example = `{"shapes":[{"type":"rectangle","color":"#d99a62","x":250,"y":400,"width":500,"height":400},{"type":"triangle","color":"#a83232","x":200,"y":200,"width":600,"height":250},{"type":"rectangle","color":"#704020","x":450,"y":600,"width":100,"height":200},{"type":"rectangle","color":"#99ddff","x":300,"y":480,"width":100,"height":100},{"type":"rectangle","color":"#99ddff","x":600,"y":480,"width":100,"height":100}]}`;

const drawing_rules = `You create a new simple picture from flat colored shapes. You cannot see the existing canvas. Draw only what the user asks for.
Return one JSON object only, with a "shapes" array. No explanation, markdown, comments, or extra text. Each shape must have exactly these fields: "type", "color", "x", "y", "width", "height".
The picture uses a 1000 by 1000 coordinate space: (0,0) is the top left, x increases right and y increases down. x and y locate the top-left corner of a shape's bounding box; width and height are its size. Every coordinate and size must be a number from 0 to 1000. Keep shapes inside the canvas where possible.
Allowed types are "rectangle", "ellipse", "triangle", and "line" only. A rectangle is filled. An ellipse is filled inside its box. A triangle is filled, with its point at the top center of its box and its base along the bottom. A line goes from (x,y) to (x+width,y+height), with a fixed thin stroke; width and height cannot be negative.
Every color must be a six-digit hex string, such as "#ff0000", not a color name. Shapes are opaque and painted in array order: later shapes cover earlier shapes. Leave the background untouched unless the user asks for one; the existing picture cannot be seen or modified selectively.
Example for a simple house (adapt the shapes to the actual request, do not copy the house unless asked):
${drawing_example}`;

const small_guidance = `Use about 3 to 10 shapes. Make the main subject large and recognizable. Use a few smaller shapes for important details, placed on top of the main shapes. Close the JSON array and object.`;
const standard_guidance = `Use about 5 to 18 shapes. Plan a clear composition: choose the main subject, place large base shapes first, then add smaller distinctive parts and details in front. Use positions and sizes that make the parts touch or overlap naturally. Choose contrasting colors so details are visible. Respect requested colors, placement, and other details. Simplify complex requests into the most recognizable elements; do not use unsupported shapes, text, transparency, outlines, or negative coordinates. A full-canvas rectangle is a background and should only be included when requested. End with valid, complete JSON.`;

export function ai_drawing_prompt(model) {
	return `${drawing_rules}\n${model === "standard" ? standard_guidance : small_guidance}`;
}
