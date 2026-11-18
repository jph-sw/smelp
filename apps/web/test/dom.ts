import { afterAll, afterEach, beforeAll } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

declare global {
	var __UI_SDK_STRICT__: boolean | undefined;
}

function registerDom() {
	if (GlobalRegistrator.isRegistered) return;
	GlobalRegistrator.register();
	globalThis.__UI_SDK_STRICT__ = true;
	HTMLElement.prototype.showPopover = () => {};
	HTMLElement.prototype.hidePopover = () => {};
	Element.prototype.getAnimations = () => [];
	Element.prototype.scrollIntoView = () => {};
	Element.prototype.checkVisibility = () => true;
}

registerDom();

// Testing Library binds `screen` to document.body as it loads, so it loads after
// the DOM exists. A global preload would hand the API tests happy-dom's fetch.
const testingLibrary = await import("@testing-library/react");
export const { act, cleanup, render, waitFor, within } = testingLibrary;
export const { default: userEvent } = await import(
	"@testing-library/user-event"
);

// Each file gets a fresh window, so `screen` must query the current body.
type Screen = typeof testingLibrary.screen;
export const screen = new Proxy({} as Screen, {
	get: (_, key) => Reflect.get(within(document.body), key),
});

// Bun evaluates this module once per run, so hooks declared at its top level
// would bind only to the first test file that imports it.
export function setupDom() {
	beforeAll(registerDom);
	afterEach(cleanup);
	afterAll(() => GlobalRegistrator.unregister());
}
