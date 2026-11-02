// How Home looks: the logo, the shimmer on Working Threads and the
// colours. Motion here shows that things are alive and never asks for
// attention (CLAUDE.md principles).

import {Box, Text, useAnimation} from 'ink';
import type {AccentColour} from '../core/settings.js';

// The accent colours of each of the Instance's Settings, matching the web
// app's: the bright one, a deeper one for the logo's sides, and the On me
// dot between them.
const accents: Record<AccentColour, {accent: string; deepAccent: string; dot: string}> = {
	blue: {accent: '#83d4fe', deepAccent: '#4a8bb5', dot: '#55a6dc'},
	teal: {accent: '#79e3dc', deepAccent: '#329a9b', dot: '#2cb8bc'},
	green: {accent: '#9fe0ac', deepAccent: '#569972', dot: '#5fb887'},
	amber: {accent: '#ecc981', deepAccent: '#9d8742', dot: '#bba148'},
	pink: {accent: '#ffb3d7', deepAccent: '#b57089', dot: '#db84a2'},
	purple: {accent: '#d7bfff', deepAccent: '#977ab4', dot: '#b68fd9'},
	red: {accent: '#ff7c74', deepAccent: '#af3c29', dot: '#da482c'},
};

export const colours = {
	...accents.blue,
	line: '#3a3f4b',
	text: '#e6e9f2',
	faint: '#6b7280',
	dim: '#4b5060',
	shimmerBase: '#8a93a8',
	shimmerPeak: '#ffffff',
	// A Deadline that is due by tomorrow.
	deadline: '#f2994a',
};

// Every part of Home reads `colours` as it draws, so after this the next
// draw is in the Instance's colour.
export function applyAccentColour(colour: AccentColour) {
	Object.assign(colours, accents[colour] ?? accents.blue);
}

// The logo is lowercase "todos" in the style of the ANSI Shadow font: solid
// blocks in front, with a line-drawn side that gives it depth. It does not
// move.
const logo = [
	'  ██╗                    ██╗                    ',
	'  ██║                    ██║                    ',
	'██████╗   ██████╗   ███████║  ██████╗  ███████╗ ',
	'╚═██╔═╝  ██╔═══██╗ ██╔═══██║ ██╔═══██╗ ██╔════╝ ',
	'  ██║    ██║   ██║ ██║   ██║ ██║   ██║ ███████╗ ',
	'  ██║    ██║   ██║ ██║   ██║ ██║   ██║ ╚════██║ ',
	'  ╚████╗ ╚██████╔╝ ╚███████║ ╚██████╔╝ ███████║ ',
	'   ╚═══╝  ╚═════╝   ╚══════╝  ╚═════╝  ╚══════╝ ',
];

export function Logo() {
	return (
		<Box flexDirection="column" alignItems="center">
			{logo.map((row, y) => (
				<Text key={y}>
					{row.split(/(█+)/).map((run, x) => (
						<Text key={x} color={run.startsWith('█') ? colours.accent : colours.deepAccent}>
							{run}
						</Text>
					))}
				</Text>
			))}
		</Box>
	);
}

// A band of light that sweeps over the title of a Working Thread.
export function Shimmer({text}: {text: string}) {
	const {time} = useAnimation({interval: 60});
	const span = text.length + 10;
	const peak = ((time / 70) % span) - 5;
	return (
		<Text>
			{[...text].map((char, x) => (
				<Text key={x} color={mix(colours.shimmerBase, colours.shimmerPeak, Math.max(0, 1 - Math.abs(x - peak) / 4))}>
					{char}
				</Text>
			))}
		</Text>
	);
}

function mix(from: string, to: string, amount: number): string {
	const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
	const parts = [0, 1, 2].map(i => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount));
	return `#${parts.map(part => part.toString(16).padStart(2, '0')).join('')}`;
}
