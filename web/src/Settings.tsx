import {useEffect, useLayoutEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {CheckIcon, SettingsIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import type {AccentColour} from '../../src/core/settings';
import {ease, ms, pinned} from './motion';

// Each accent colour in OKLCH. All but red share the blue's brightness and
// strength; red is a little stronger so it reads as red. index.css draws
// every accent from --l, --c and --hue.
const looks: Record<AccentColour, {name: string; l: number; c: number; hue: number}> = {
	blue: {name: 'Blue', l: 0.85, c: 0.09, hue: 230},
	teal: {name: 'Teal', l: 0.85, c: 0.09, hue: 190},
	green: {name: 'Green', l: 0.85, c: 0.09, hue: 150},
	amber: {name: 'Amber', l: 0.85, c: 0.09, hue: 85},
	pink: {name: 'Pink', l: 0.85, c: 0.09, hue: 350},
	purple: {name: 'Purple', l: 0.85, c: 0.09, hue: 300},
	red: {name: 'Red', l: 0.74, c: 0.15, hue: 25},
};

// How far below its place the box starts, as a share of the screen's height.
const below = 0.65;

// The Instance's Settings, opened from the cog at the bottom of the sidebar.
// Like Capture, the box rises from the bottom of the screen, and Esc or a
// click outside sends it back down. Each setting is a section in it.
export function Settings({open, onOpen, onClose, accentColour, onPickColour}: {
	open: boolean;
	onOpen: () => void;
	onClose: () => void;
	accentColour: AccentColour;
	onPickColour: (colour: AccentColour) => void;
}) {
	const box = useRef<HTMLDivElement>(null);
	const cog = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		const {l, c, hue} = looks[accentColour];
		const root = document.documentElement.style;
		root.setProperty('--l', String(l));
		root.setProperty('--c', String(c));
		root.setProperty('--hue', String(hue));
	}, [accentColour]);
	useLayoutEffect(() => {
		if (open) box.current?.animate([{translate: `0 ${innerHeight * below}px`, opacity: 0}, {translate: '0 0', opacity: 1}], {duration: ms * 2, easing: ease});
	}, [open]);
	const close = () => {
		if (!box.current) return;
		const held = pinned(box.current, box.current.getBoundingClientRect(), 50);
		void held.animate([{translate: `0 ${innerHeight * below}px`, opacity: 0}], {duration: ms * 2, easing: ease, fill: 'forwards'}).finished.then(() => held.remove());
		onClose();
	};
	useEffect(() => {
		if (!open) return;
		const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
		// A press on the cog closes the box through the cog's own click.
		const press = (e: PointerEvent) => !box.current?.contains(e.target as Node) && !cog.current?.contains(e.target as Node) && close();
		window.addEventListener('keydown', key);
		window.addEventListener('pointerdown', press);
		return () => {
			window.removeEventListener('keydown', key);
			window.removeEventListener('pointerdown', press);
		};
	});
	return (
		<>
			<Button variant="ghost" size="icon-sm" className="text-muted-foreground" ref={cog} aria-label="Settings" onClick={open ? close : onOpen}>
				<SettingsIcon />
			</Button>
			{/* Drawn outside the sidebar, which steps back while this is open. */}
			{open && createPortal(
				<div className="pointer-events-none fixed inset-x-0 top-[30%] z-50 flex justify-center px-4">
					<div ref={box} role="dialog" aria-label="Settings" className="pointer-events-auto w-full max-w-sm rounded-xl bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
						<h2 className="px-2 pb-3 font-heading text-base font-semibold">Settings</h2>
						<section className="flex flex-col gap-2 px-2 pb-1">
							<h3 className="text-xs font-medium text-muted-foreground">Colour</h3>
							<div className="flex gap-2">
								{Object.entries(looks).map(([colour, {name, l, c, hue}]) => (
									<button
										key={colour}
										title={name}
										aria-label={name}
										aria-pressed={colour === accentColour}
										onClick={() => onPickColour(colour as AccentColour)}
										className="flex size-6 items-center justify-center rounded-full"
										style={{background: `oklch(${l} ${c} ${hue})`}}
									>
										{colour === accentColour && <CheckIcon className="size-3.5 text-background" />}
									</button>
								))}
							</div>
						</section>
					</div>
				</div>,
				document.body,
			)}
		</>
	);
}
