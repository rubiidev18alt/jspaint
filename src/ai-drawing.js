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
			<label for="ai-drawing-model">Model:</label>
			<select id="ai-drawing-model" class="inset-deep" style="max-width: 100%;">
				<option value="standard">Standard (better drawings, more GPU memory)</option>
				<option value="lite">Lite (simpler drawings, less GPU memory)</option>
			</select>
			<p>On a GPU pipeline error, Standard automatically tries Lite, which requires a separate download of several hundred MB. Both need WebGPU.</p>
			<label for="ai-drawing-prompt">What should I draw?</label>
			<textarea id="ai-drawing-prompt" class="inset-deep" rows="3" maxlength="500" placeholder="A yellow sun over a little house" style="display: block; width: 100%; box-sizing: border-box; margin: 5px 0;"></textarea>
			<p style="margin: 5px 0">The AI creates a new illustration; it cannot see or edit your existing picture. Applying it draws over your canvas and can be undone.</p>
			<p class="ai-drawing-status" role="status" aria-live="polite" style="min-height: 1em; overflow-wrap: anywhere;"></p>
			<canvas class="ai-drawing-preview inset-deep" aria-label="Generated drawing preview" hidden style="display: none; max-width: 100%; max-height: 200px; background: white; object-fit: contain;"></canvas>
		</div>
	`);
	$w.$main.css({ maxHeight: "calc(100vh - 130px)", overflowY: "auto" });
	const $prompt = $w.$main.find("#ai-drawing-prompt");
	const $model = $w.$main.find("#ai-drawing-model");
	const $status = $w.$main.find(".ai-drawing-status");
	const $preview = $w.$main.find(".ai-drawing-preview");
	let worker;
	let busy = false;
	let shapes = null;
	let active_prompt;
	let active_model;
	let progress_timer;
	let last_progress_time;
	let progress_text;
	let progress_phase;

	const show_progress = (text, phase) => {
		progress_text = text;
		progress_phase = phase;
		last_progress_time = Date.now();
		$status.text(text);
	};

	const stop = () => {
		clearInterval(progress_timer);
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
		if (!value) clearInterval(progress_timer);
		$generate.prop("disabled", value);
		$model.prop("disabled", value);
		$apply.prop("disabled", value || !shapes);
		$cancel.text(value ? "Stop" : "Close");
	};
	const fail = (message) => {
		stop();
		set_busy(false);
		$status.text(`Couldn't draw: ${message}`);
	};

	const start_generation = (prompt, model, is_fallback = false) => {
		active_prompt = prompt;
		active_model = model;
		try {
			if (!worker) {
				worker = new Worker(new URL("./ai-drawing-worker.js", import.meta.url), { type: "module" });
				worker.onmessage = ({ data }) => {
					if (data.type === "progress") {
						show_progress(data.text, data.phase);
					} else if (data.type === "error") {
						if (active_model === "standard" && /createcomputepipeline/i.test(data.text)) {
							// A failed initialization can leave GPU resources allocated. Start a
							// fresh worker for the smaller model instead of reusing that device.
							const fallback_prompt = active_prompt;
							stop();
							$model.val("lite");
							start_generation(fallback_prompt, "lite", true);
						} else if (/createcomputepipeline/i.test(data.text)) {
							fail("Your browser or GPU could not compile the AI model, even in Lite mode. Update your browser and GPU drivers, close other GPU-heavy apps, or try a different device. Technical detail: " + data.text);
						} else {
							fail(`${data.text} Check your connection, browser WebGPU support and available GPU memory, then try again.`);
						}
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
			show_progress(is_fallback ? "Standard model failed on this GPU. Trying Lite; its separate download may take a while." : "Loading AI model… The first download may take a while.", "loading");
			progress_timer = setInterval(() => {
				const seconds = Math.floor((Date.now() - last_progress_time) / 1000);
				if (progress_phase !== "drawing" && seconds >= 180) {
					fail("Model loading has not made progress for 3 minutes. Check your connection, available storage and GPU memory, then try again. Completed download chunks are kept when possible.");
				} else if (seconds >= 5) {
					$status.text(`${progress_text} (${seconds}s since last update)`);
				}
			}, 1000);
			worker.postMessage({ prompt, model });
		} catch (error) {
			fail(error.message);
		}
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
		start_generation(prompt, String($model.val()));
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
	$model.on("change", () => {
		stop();
		shapes = null;
		$preview.hide();
		set_busy(false);
		$status.text("Model changed. Generate a new preview.");
	});
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
