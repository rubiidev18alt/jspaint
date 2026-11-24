/* global main_canvas, main_ctx */
import { $DialogWindow } from "./$ToolWindow.js";
import { cancel, deselect, undoable, update_helper_layer } from "./functions.js";
import { get_help_folder_icon } from "./helpers.js";
import { parse_ai_drawing, render_ai_drawing } from "./ai-drawing-renderer.js";

let drawing_window;

export function show_ai_drawing() {
	if (drawing_window && !drawing_window.closed) {
		drawing_window.close();
	}
	const $w = drawing_window = $DialogWindow("AI Drawing").addClass("ai-drawing-window horizontal-buttons");
	$w.$main.html(`
		<div style="padding: 10px; width: 400px; max-width: calc(100vw - 50px); box-sizing: border-box;">
			<p style="margin-top: 0">Describe a picture and the AI will draw it using simple colored shapes.</p>
			<p>Runs locally with Qwen 2.5 and WebLLM. No API key needed. The first use downloads a large model (about 1 GB); a WebGPU browser and a capable GPU are required.</p>
			<label for="ai-drawing-prompt">What should I draw?</label>
			<textarea id="ai-drawing-prompt" class="inset-deep" rows="3" maxlength="500" placeholder="A yellow sun over a little house" style="display: block; width: 100%; box-sizing: border-box; margin: 5px 0;"></textarea>
			<p style="margin: 5px 0">The AI creates a new illustration; it cannot see or edit your existing picture. Applying it draws over your canvas and can be undone.</p>
			<p class="ai-drawing-status" role="status" aria-live="polite" style="min-height: 1em; overflow-wrap: anywhere;"></p>
			<canvas class="ai-drawing-preview inset-deep" aria-label="Generated drawing preview" hidden style="display: none; max-width: 100%; max-height: 200px; background: white; object-fit: contain;"></canvas>
		</div>
	`);
	const $prompt = $w.$main.find("#ai-drawing-prompt");
	const $status = $w.$main.find(".ai-drawing-status");
	const $preview = $w.$main.find(".ai-drawing-preview");
	let worker;
	let busy = false;
	let shapes = null;

	const stop = () => {
		if (worker) {
			worker.onmessage = null;
			worker.onerror = null;
			worker.terminate();
		}
		worker = null;
		busy = false;
	};
	const set_busy = (value) => {
		busy = value;
		$generate.prop("disabled", value);
		$apply.prop("disabled", value || !shapes);
		$cancel.text(value ? "Stop" : "Close");
	};
	const fail = (message) => {
		stop();
		set_busy(false);
		$status.text(`Couldn't draw: ${message}`);
	};

	const $generate = $w.$Button("Generate", () => {
		const prompt = String($prompt.val()).trim();
		if (!prompt) {
			$status.text("Please describe what you want to draw.");
			$prompt.focus();
			return;
		}
		shapes = null;
		$preview.hide();
		if (!navigator.gpu) {
			$status.text("WebGPU is not available. Try a current WebGPU-enabled Chrome or Edge browser on a compatible device.");
			set_busy(false);
			return;
		}
		try {
			if (!worker) {
				worker = new Worker(new URL("./ai-drawing-worker.js", import.meta.url), { type: "module" });
				worker.onmessage = ({ data }) => {
					if (data.type === "progress") {
						$status.text(data.text);
					} else if (data.type === "error") {
						fail(`${data.text} Check your connection, browser WebGPU support and available GPU memory, then try again.`);
					} else if (data.type === "result") {
						try {
							shapes = parse_ai_drawing(data.text);
							const canvas = $preview[0];
							const scale = Math.min(360 / main_canvas.width, 200 / main_canvas.height);
							canvas.width = Math.max(1, Math.round(main_canvas.width * scale));
							canvas.height = Math.max(1, Math.round(main_canvas.height * scale));
							render_ai_drawing(canvas.getContext("2d"), shapes, canvas.width, canvas.height);
							$preview.removeAttr("hidden").show();
							$status.text("Preview ready. Apply it to your canvas, or generate again.");
							set_busy(false);
						} catch (error) {
							fail(error.message);
						}
					}
				};
				worker.onerror = () => fail("The AI worker could not start. Check your browser and try again.");
			}
			set_busy(true);
			$status.text("Loading AI model… The first download may take a while.");
			worker.postMessage({ prompt });
		} catch (error) {
			fail(error.message);
		}
	});
	const $apply = $w.$Button("Apply to canvas", () => {
		if (!shapes || busy) return;
		cancel();
		deselect();
		undoable({ name: "AI Drawing", icon: get_help_folder_icon("p_brush.gif") }, () => {
			render_ai_drawing(main_ctx, shapes, main_canvas.width, main_canvas.height);
		});
		update_helper_layer();
		$w.close();
	});
	const $cancel = $w.$Button("Close", () => {
		if (busy) {
			stop();
			set_busy(false);
			$status.text("Stopped. Generate again to retry.");
		} else {
			$w.close();
		}
	});
	$w.on("close", stop);
	$prompt.on("input", () => {
		if (!busy && shapes) {
			shapes = null;
			$preview.hide();
			set_busy(false);
			$status.text("Description changed. Generate a new preview.");
		}
	});
	// Prevent a result for an old description being applied accidentally.
	$prompt.on("input", () => {
		if (busy) {
			stop();
			set_busy(false);
			$status.text("Description changed. Generate again.");
		}
	});
	set_busy(false);
	$w.center();
	$prompt.focus();
}
