/// <reference types="Cypress" />

context("AI Drawing", () => {
	const openAssistant = () => {
		cy.contains(".menu-button", /^Extras$/).trigger("pointerdown", { which: 1 }).trigger("pointerup", { force: true });
		cy.contains(".menu-item-label", /^AI Drawing\.\.\.$/).trigger("pointerdown", { which: 1 }).trigger("pointerup", { force: true });
	};
	const drawing = JSON.stringify({ shapes: [{ type: "rectangle", color: "#ff0000", x: 0, y: 0, width: 1000, height: 1000 }] });

	beforeEach(() => {
		cy.visit("/", {
			onBeforeLoad(win) {
				Object.defineProperty(win.navigator, "gpu", { configurable: true, value: {} });
				const NativeWorker = win.Worker;
				win.Worker = class {
					constructor(url, options) {
						if (!String(url).includes("ai-drawing-worker")) return new NativeWorker(url, options);
						win.aiWorker = this;
					}
					postMessage(message) { this.prompt = message.prompt; }
					terminate() { this.terminated = true; }
				};
			},
		});
		cy.window().should("have.property", "api_for_cypress_tests");
		openAssistant();
	});

	it("previews a result and applies it as an undoable canvas change", () => {
		cy.get("#ai-drawing-prompt").type("a red background");
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.window().then((win) => {
			expect(win.aiWorker.prompt).to.equal("a red background");
			win.aiWorker.onmessage({ data: { type: "result", text: drawing } });
		});
		cy.get(".ai-drawing-preview").should("be.visible");
		cy.window().then((win) => {
			const ctx = win.document.querySelector(".main-canvas").getContext("2d");
			expect(Array.from(ctx.getImageData(0, 0, 1, 1).data)).to.deep.equal([255, 255, 255, 255]);
		});
		cy.contains(".ai-drawing-window button", "Apply to canvas").click();
		cy.window().then((win) => {
			const ctx = win.document.querySelector(".main-canvas").getContext("2d");
			expect(Array.from(ctx.getImageData(0, 0, 1, 1).data)).to.deep.equal([255, 0, 0, 255]);
			win.document.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
			expect(Array.from(ctx.getImageData(0, 0, 1, 1).data)).to.deep.equal([255, 255, 255, 255]);
			expect(win.aiWorker.terminated).to.equal(true);
		});
	});

	it("handles invalid results and can stop a request", () => {
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.get(".ai-drawing-status").should("contain", "Please describe");
		cy.get("#ai-drawing-prompt").type("a tree");
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.window().then((win) => win.aiWorker.onmessage({ data: { type: "result", text: "not json" } }));
		cy.get(".ai-drawing-status").should("contain", "invalid drawing");
		cy.contains(".ai-drawing-window button", "Apply to canvas").should("be.disabled");
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.contains(".ai-drawing-window button", "Stop").click();
		cy.get(".ai-drawing-status").should("contain", "Stopped");
		cy.window().its("aiWorker.terminated").should("equal", true);
	});
});
