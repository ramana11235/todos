// A finger on the phone. Playwright can only tap, so a swipe or a long press
// is sent as the touch events Safari sends, all to the element the finger
// first came down on, as a real touch is.

import type {Page} from '@playwright/test';

export type Finger = {
	move(x: number, y: number): Promise<void>;
	up(): Promise<void>;
};

export async function down(page: Page, x: number, y: number): Promise<Finger> {
	const send = (type: string, x: number, y: number) =>
		page.evaluate(
			({type, x, y}) => {
				const w = window as unknown as {fingerOn?: Element};
				if (type === 'touchstart') w.fingerOn = document.elementFromPoint(x, y) ?? document.body;
				const target = w.fingerOn!;
				// WebKit has no Touch constructor, only the older createTouch.
				const d = document as unknown as {createTouch(...a: unknown[]): Touch; createTouchList(...t: Touch[]): TouchList};
				const touch = d.createTouch(window, target, 1, x + scrollX, y + scrollY, x, y);
				const touches = type === 'touchend' ? d.createTouchList() : d.createTouchList(touch);
				const init = {bubbles: true, cancelable: true, composed: true, touches, targetTouches: touches, changedTouches: d.createTouchList(touch)};
				target.dispatchEvent(new TouchEvent(type, init as unknown as TouchEventInit));
			},
			{type, x, y},
		);
	let at = {x, y};
	await send('touchstart', x, y);
	return {
		move: async (x, y) => {
			at = {x, y};
			await send('touchmove', x, y);
		},
		up: () => send('touchend', at.x, at.y),
	};
}
