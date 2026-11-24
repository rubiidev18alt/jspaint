import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/ai-model-download.js", import.meta.url), "utf8");
const { track_model_downloads } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const base = "https://huggingface.co/mlc-ai/model/resolve/main/";

class FakeCache {
	async add(request) { this.originalRequest = request; }
	async put(request, response) { this.saved = { request, bytes: [...new Uint8Array(await response.arrayBuffer())] }; }
}

test("tracks bytes while caching model shards, without intercepting other requests", async () => {
	const originalFetch = globalThis.fetch;
	const reports = [];
	const restore = track_model_downloads(FakeCache.prototype, base, (bytes) => reports.push(bytes));
	try {
		globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]));
		const cache = new FakeCache();
		await cache.add(new Request(`${base}params_shard_0.bin`));
		assert.deepEqual(cache.saved.bytes, [1, 2, 3]);
		assert.equal(reports.at(-1), 3);
		await cache.add("https://example.com/other.bin");
		assert.equal(cache.originalRequest, "https://example.com/other.bin");
	} finally { restore(); globalThis.fetch = originalFetch; }
});

test("surfaces HTTP errors and stalled connections", async () => {
	const originalFetch = globalThis.fetch;
	const restore = track_model_downloads(FakeCache.prototype, base, () => {}, 10);
	try {
		globalThis.fetch = async () => new Response("unavailable", { status: 503 });
		await assert.rejects(new FakeCache().add(`${base}params_shard_0.bin`), /HTTP 503/);
		globalThis.fetch = (_request, { signal }) => new Promise((_resolve, reject) => {
			signal.addEventListener("abort", () => reject(new Error("aborted")));
		});
		await assert.rejects(new FakeCache().add(`${base}params_shard_0.bin`), /stopped receiving data/);
	} finally { restore(); globalThis.fetch = originalFetch; }
});


test("retries an interrupted download once", async () => {
	const originalFetch = globalThis.fetch;
	const reports = [];
	const restore = track_model_downloads(FakeCache.prototype, base, (bytes, message) => reports.push(message));
	try {
		let attempts = 0;
		globalThis.fetch = async () => {
			if (attempts++ === 0) throw new TypeError("network failure");
			return new Response(new Uint8Array([4, 5]));
		};
		const cache = new FakeCache();
		await cache.add(`${base}params_shard_0.bin`);
		assert.equal(attempts, 2);
		assert.ok(reports.some((message) => message?.includes("retrying")));
		assert.deepEqual(cache.saved.bytes, [4, 5]);
	} finally { restore(); globalThis.fetch = originalFetch; }
});
