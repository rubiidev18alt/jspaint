// A deliberately small, non-executable drawing language. Model output is never evaluated as code.
// Coordinates use a 0-1000 square, scaled to the destination canvas.
export function parse_ai_drawing(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch (_error) {
		throw new Error("The model returned an incomplete or invalid drawing. Try a simpler description.");
	}
	if (!data || !Array.isArray(data.shapes) || data.shapes.length < 1 || data.shapes.length > 60) {
		throw new Error("The model did not return a usable drawing. Try again with a simpler description.");
	}
	return data.shapes.map((shape) => {
		if (!shape || !["rectangle", "ellipse", "triangle", "line"].includes(shape.type) ||
			!/^#[0-9a-f]{6}$/i.test(shape.color) ||
			![shape.x, shape.y, shape.width, shape.height].every((n) =>
				typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000
			)) {
			throw new Error("The model returned an invalid shape. Try again with a simpler description.");
		}
		return { type: shape.type, color: shape.color, x: shape.x, y: shape.y, width: shape.width, height: shape.height };
	});
}

export function render_ai_drawing(ctx, shapes, width, height) {
	ctx.save();
	try {
		ctx.scale(width / 1000, height / 1000);
		for (const shape of shapes) {
			const { x, y, width: w, height: h } = shape;
			ctx.fillStyle = ctx.strokeStyle = shape.color;
			ctx.beginPath();
			switch (shape.type) {
				case "rectangle": ctx.rect(x, y, w, h); ctx.fill(); break;
				case "ellipse": ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); break;
				case "triangle":
					ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill(); break;
				case "line":
					ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.stroke(); break;
			}
		}
	} finally {
		ctx.restore();
	}
}
