import {useLayoutEffect, useRef} from 'react';
import {Input} from '@/components/ui/input';
import {ease, ms, pinned} from './motion';

// How far below its place the line starts, as a share of the screen's height.
const below = 0.65;

// Alt+C, as in the terminal: one line, Enter saves to the Inbox, Esc cancels.
// The line rises from the bottom of the screen and Esc sends it back down.
// On Enter it hands over a copy of itself, held where it is, so it can travel
// into the Inbox (docs/animation.md).
export function Capture({open, onClose, onSave}: {open: boolean; onClose: () => void; onSave: (title: string, copy: HTMLElement) => void}) {
	const box = useRef<HTMLDivElement>(null);
	const done = useRef(false);
	useLayoutEffect(() => {
		done.current = false;
		if (open) box.current?.animate([{translate: `0 ${innerHeight * below}px`, opacity: 0}, {translate: '0 0', opacity: 1}], {duration: ms * 2, easing: ease});
	}, [open]);
	if (!open) return null;
	// The input's text is not part of a copy of the page, so it is put back.
	const copy = (title: string) => {
		const held = pinned(box.current!, box.current!.getBoundingClientRect(), 50);
		held.querySelector('input')!.value = title;
		return held;
	};
	const finish = (title: string) => {
		if (done.current) return;
		done.current = true;
		if (title) return onSave(title, copy(title));
		const held = copy('');
		void held.animate([{translate: `0 ${innerHeight * below}px`, opacity: 0}], {duration: ms * 2, easing: ease, fill: 'forwards'}).finished.then(() => held.remove());
		onClose();
	};
	return (
		<div className="pointer-events-none fixed inset-x-0 top-[30%] z-50 flex justify-center px-4">
			<div ref={box} role="dialog" aria-label="Capture" className="pointer-events-auto w-full max-w-sm rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
				<Input
					autoFocus
					placeholder="Capture"
					className="border-none font-sans text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
					onKeyDown={e => {
						if (e.key === 'Enter' && e.currentTarget.value.trim()) finish(e.currentTarget.value.trim());
						if (e.key === 'Escape') finish('');
					}}
					onBlur={() => finish('')}
				/>
			</div>
		</div>
	);
}
