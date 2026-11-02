import {useEffect, useLayoutEffect, useRef, type CSSProperties, type RefObject} from 'react';

// How the Threads page moves, following docs/animation.md.
export const ms = 280;
export const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
// A change I did not make, such as one a Session makes, moves this much slower.
const quietly = 2.5;

// A copy of an element held at a place on the screen, outside the page.
export function pinned(el: HTMLElement, at: DOMRect, z: number) {
	const copy = el.cloneNode(true) as HTMLElement;
	Object.assign(copy.style, {
		position: 'fixed', left: `${at.left}px`, top: `${at.top}px`, width: `${at.width}px`, height: `${at.height}px`,
		margin: '0', zIndex: String(z), pointerEvents: 'none', overflow: 'hidden', transform: 'none', transition: 'none', filter: 'none',
	});
	document.body.append(copy);
	return copy;
}

// A copy of the element flies from one place to another, fading on the way
// if asked, then goes.
export function fly(el: HTMLElement, from: DOMRect, to: DOMRect, fade: boolean) {
	const ghost = pinned(el, from, 50);
	ghost.style.opacity = '1';
	const at = (r: DOMRect, opacity: number) => ({left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, opacity});
	return ghost.animate([at(from, 1), at(to, fade ? 0 : 1)], {duration: ms * 1.6, easing: ease, fill: 'forwards'}).finished.then(() => ghost.remove());
}

// While one thing is in focus, everything else steps back. It dims and
// blurs but keeps its size, because shrinking reads as zooming out.
export const stepBack = (away: boolean): CSSProperties => ({
	opacity: away ? 0.3 : 1,
	filter: away ? 'blur(2px)' : 'none',
	// Colours keep the 300ms fade rows have when picked.
	transition: `opacity ${ms}ms ${ease}, filter ${ms}ms ${ease}, background-color 300ms, color 300ms`,
});

// What another motion already shows, for the next change only: Threads
// whose arrival or going it shows, and whether every row is already where it
// belongs, as after a drag.
export type Handled = {arrived: Set<string>; gone: Set<string>; settled: boolean};
export const nothingHandled = (): Handled => ({arrived: new Set(), gone: new Set(), settled: false});

type Seen = {top: number; rect: DOMRect; copy: HTMLElement; column: string; fades: boolean};

// After every change is drawn, each row that stayed in its column glides
// from where it was, a row new to a column fades in, and a row or a column
// that went fades out where it was. Rows are marked data-row with their
// Thread's id, and columns data-column; a column marked data-fade fades in
// and out as a whole. Switching to or from the ended view fades the new list
// in and nothing travels. With no key or click in the last moment, the
// change is a Session's, so it moves more slowly.
export function useMotion(body: RefObject<HTMLElement | null>, look: string, view: string, handled: RefObject<Handled>) {
	const seen = useRef<{look: string; view: string; rows: Map<string, Seen>; columns: Map<string, Seen>} | null>(null);
	const lastInput = useRef(0);
	useEffect(() => {
		const note = () => (lastInput.current = Date.now());
		window.addEventListener('keydown', note, true);
		window.addEventListener('pointerdown', note, true);
		return () => {
			window.removeEventListener('keydown', note, true);
			window.removeEventListener('pointerdown', note, true);
		};
	}, []);
	useLayoutEffect(() => {
		const root = body.current;
		if (!root) return;
		const slow = Date.now() - lastInput.current > 1500 ? quietly : 1;
		const {arrived, gone, settled} = handled.current;
		handled.current = nothingHandled();
		const was = seen.current;
		const measure = (el: HTMLElement, column: string): Seen =>
			({top: el.offsetTop, rect: el.getBoundingClientRect(), copy: el.cloneNode(true) as HTMLElement, column, fades: el.dataset.fade !== undefined});
		const measureAll = () => {
			const columns = new Map<string, Seen>();
			const rows = new Map<string, Seen>();
			const elements: Array<[HTMLElement, string, string]> = [];
			for (const el of root.querySelectorAll<HTMLElement>('[data-column]')) columns.set(el.dataset.column!, measure(el, el.dataset.column!));
			for (const el of root.querySelectorAll<HTMLElement>('[data-row]')) {
				const column = el.closest<HTMLElement>('[data-column]')?.dataset.column ?? '';
				rows.set(`${column}|${el.dataset.row}`, measure(el, column));
				elements.push([el, column, el.dataset.row!]);
			}
			return {columns, rows, elements};
		};
		const {columns, rows, elements} = measureAll();
		const now = {look, view, rows, columns};
		seen.current = now;
		if (settled) {
			// Another motion is still moving the rows to where they belong, so
			// they are noted again once it ends. Noting them only now would make
			// the next change glide them back from where that motion started.
			const ending = root.getAnimations({subtree: true}).filter(a => Number.isFinite(a.effect?.getComputedTiming().endTime));
			void Promise.allSettled(ending.map(a => a.finished)).then(() => {
				if (seen.current !== now || !body.current) return;
				const again = measureAll();
				seen.current = {look, view, rows: again.rows, columns: again.columns};
			});
		}
		if (!was || was.look !== look || settled) return;
		if (was.view !== view && (was.view === 'ended' || view === 'ended')) {
			root.animate([{opacity: 0}, {opacity: 1}], {duration: ms, easing: ease});
			return;
		}
		const fadeIn = (el: HTMLElement) => el.animate([{opacity: 0}, {opacity: 1}], {duration: ms * slow, easing: ease});
		const fadeOut = (old: Seen) => {
			const copy = pinned(old.copy, old.rect, 40);
			copy.animate([{opacity: 0}], {duration: ms * slow, easing: ease, fill: 'forwards'}).finished.then(() => copy.remove());
		};
		for (const el of root.querySelectorAll<HTMLElement>('[data-column][data-fade]')) if (!was.columns.has(el.dataset.column!)) fadeIn(el);
		for (const [el, column, id] of elements) {
			const old = was.rows.get(`${column}|${id}`);
			if (old) {
				const d = old.top - el.offsetTop;
				if (d) el.animate([{translate: `0 ${d}px`}, {translate: '0 0'}], {duration: (ms + Math.min(Math.abs(d), 300) / 2) * slow, easing: ease});
			} else if (was.columns.has(column) && !arrived.has(id)) fadeIn(el);
		}
		for (const [key, old] of was.columns) if (old.fades && !columns.has(key)) fadeOut(old);
		for (const [key, old] of was.rows) if (!rows.has(key) && columns.has(old.column) && !gone.has(key.slice(key.lastIndexOf('|') + 1))) fadeOut(old);
	});
}
