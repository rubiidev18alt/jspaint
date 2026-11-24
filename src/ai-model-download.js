// WebLLM uses Cache.add() for each large model shard and reports progress only
// after the whole shard has downloaded. Instrument only these requests so users
// can see that a slow download is moving (and recover from a stalled request).
export function track_model_downloads(cachePrototype, modelBaseUrl, report, idleTimeoutMs = 120000) {
	const originalAdd = cachePrototype.add;
	let downloaded = 0;
	let lastReport = 0;
	cachePrototype.add = async function(request) {
		const url = typeof request === "string" ? request : request.url;
		if (!url.startsWith(modelBaseUrl) || !/\.bin(?:\?|$)/.test(url)) {
			return originalAdd.call(this, request);
		}

		// Retry a stalled or interrupted shard once; already cached shards are
		// untouched. HTTP and storage errors are surfaced instead of retried.
		for (let attempt = 0; attempt < 2; attempt++) {
			const controller = new AbortController();
			let timedOut = false;
			let timer;
			const resetTimer = () => {
				clearTimeout(timer);
				timer = setTimeout(() => { timedOut = true; controller.abort(); }, idleTimeoutMs);
			};
			resetTimer();
			try {
				const response = await fetch(request, { signal: controller.signal });
				if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}.`);
				if (!response.body) throw new Error("Your browser could not stream the model download.");
				const stream = response.body.pipeThrough(new TransformStream({
					transform(chunk, streamController) {
						resetTimer();
						downloaded += chunk.byteLength;
						const now = Date.now();
						if (now - lastReport >= 500) {
							lastReport = now;
							report(downloaded);
						}
						streamController.enqueue(chunk);
					},
				}));
				// The decoded bytes are what WebLLM reads from its cache; don't copy
				// content-encoding or content-length headers from the original response.
				await this.put(request, new Response(stream, { headers: { "Content-Type": "application/octet-stream" } }));
				report(downloaded);
				return;
			} catch (error) {
				controller.abort();
				if (attempt === 0 && (timedOut || error instanceof TypeError)) {
					report(downloaded, "Download interrupted; retrying a model chunk…");
					continue;
				}
				if (timedOut) throw new Error("The model download stopped receiving data. Check your connection and try again.");
				throw error;
			} finally {
				clearTimeout(timer);
			}
		}
	};
	return () => { cachePrototype.add = originalAdd; };
}
