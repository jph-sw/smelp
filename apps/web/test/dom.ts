import { afterAll, afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

declare global {
	var __UI_SDK_STRICT__: boolean | undefined;
}
globalThis.__UI_SDK_STRICT__ = true;

HTMLElement.prototype.showPopover = () => {};
HTMLElement.prototype.hidePopover = () => {};
Element.prototype.getAnimations = () => [];
Element.prototype.scrollIntoView = () => {};
Element.prototype.checkVisibility = () => true;

afterAll(() => GlobalRegistrator.unregister());

// Testing Library binds `screen` to document.body as it loads, so it loads after
// the DOM exists. A global preload would hand the API tests happy-dom's fetch.
export const { act, cleanup, render, screen, within } = await import(
	"@testing-library/react"
);
export const { default: userEvent } = await import(
	"@testing-library/user-event"
);

afterEach(cleanup);
