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
					postMessage(message) { this.prompt = message.prompt; this.model = message.model; }
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



	it("retries a GPU pipeline error once with a fresh Lite worker", () => {
		cy.get("#ai-drawing-prompt").type("a little house");
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.window().then((win) => {
			const standard = win.aiWorker;
			expect(standard.model).to.equal("standard");
			standard.onmessage({ data: { type: "error", text: "CreateComputePipelines failed" } });
			expect(standard.terminated).to.equal(true);
			expect(win.aiWorker).not.to.equal(standard);
			expect(win.aiWorker.model).to.equal("lite");
			expect(win.aiWorker.prompt).to.equal("a little house");
		});
		cy.get('[data-model="lite"]').should("have.attr", "aria-pressed", "true");
		cy.get(".ai-drawing-status").should("contain", "Trying Lite");
		cy.window().then((win) => win.aiWorker.onmessage({ data: { type: "error", text: "CreateComputePipelines failed" } }));
		cy.get(".ai-drawing-status").should("contain", "even in Lite mode");
		cy.contains(".ai-drawing-window button", "Generate").should("not.be.disabled");
		cy.window().its("aiWorker.terminated").should("equal", true);
	});

	it("lets you choose Lite without downloading the standard model", () => {
		cy.get('.ai-model-choice[data-model="lite"]').click();
		cy.get('[data-model="lite"]').should("have.attr", "aria-pressed", "true");
		cy.get("#ai-drawing-prompt").type("a tree");
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.window().its("aiWorker.model").should("equal", "lite");
		cy.window().then((win) => win.aiWorker.onmessage({ data: { type: "result", text: drawing } }));
		cy.get(".ai-drawing-preview").should("be.visible");
		cy.get('.ai-model-choice[data-model="standard"]').click();
		cy.get('[data-model="standard"]').should("have.attr", "aria-pressed", "true");
		cy.window().its("aiWorker.terminated").should("equal", true);
		cy.contains(".ai-drawing-window button", "Apply to canvas").should("be.disabled");
	});

	it("shows download progress and recovers when loading stops responding", () => {
		cy.clock();
		cy.get("#ai-drawing-prompt").type("a tree");
		cy.contains(".ai-drawing-window button", "Generate").click();
		cy.window().then((win) => win.aiWorker.onmessage({ data: {
			type: "progress", phase: "download", text: "Downloading model: 12 MB received this run.",
		} }));
		cy.get(".ai-drawing-status").should("contain", "12 MB");
		cy.tick(6000);
		cy.get(".ai-drawing-status").should("contain", "6s since last update");
		cy.tick(174000);
		cy.get(".ai-drawing-status").should("contain", "not made progress for 3 minutes");
		cy.contains(".ai-drawing-window button", "Generate").should("not.be.disabled");
		cy.window().its("aiWorker.terminated").should("equal", true);
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

context("AI Drawing on a small screen", () => {
	it("keeps both model choices tappable and the dialog scrollable", () => {
		cy.viewport(375, 667);
		cy.visit("/");
		cy.window().should("have.property", "api_for_cypress_tests");
		cy.contains(".menu-button", /^Extras$/).trigger("pointerdown", { which: 1 }).trigger("pointerup", { force: true });
		cy.contains(".menu-item-label", /^AI Drawing\.\.\.$/).trigger("pointerdown", { which: 1 }).trigger("pointerup", { force: true });
		cy.get(".ai-drawing-window").should("have.css", "touch-action", "auto");
		cy.get(".ai-drawing-window").then(($window) => {
			const rect = $window[0].getBoundingClientRect();
			expect(rect.left).to.be.at.least(0);
			expect(rect.right).to.be.at.most(375);
			expect(rect.bottom).to.be.at.most(667);
		});
		cy.get(".ai-drawing-window .window-content form > div:first-child").should("have.css", "overflow-y", "auto").then(($content) => {
			expect($content[0].scrollWidth).to.equal($content[0].clientWidth);
		});
		cy.get('.ai-model-choice[data-model="lite"]').should("be.visible").then(($button) => {
			expect($button[0].getBoundingClientRect().height).to.be.at.least(44);
		}).click();
		cy.get('[data-model="lite"]').should("have.attr", "aria-pressed", "true");
		cy.get('.ai-model-choice[data-model="standard"]').click();
		cy.get('[data-model="standard"]').should("have.attr", "aria-pressed", "true");
	});
});
