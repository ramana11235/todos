// How Home looks: the logo, the shimmer on Working Threads and the
// colours. Motion here shows that things are alive and never asks for
// attention (CLAUDE.md principles).

import {Box, Text, useAnimation} from 'ink';

export const colours = {
	blue: '#83d4fe',
	deepBlue: '#4a8bb5',
	// The On me dot, a deeper blue than the logo.
	dot: '#55a6dc',
	line: '#3a3f4b',
	text: '#e6e9f2',
	faint: '#6b7280',
	dim: '#4b5060',
	shimmerBase: '#8a93a8',
	shimmerPeak: '#ffffff',
	// A Deadline that is due by tomorrow.
	deadline: '#f2994a',
};

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
						<Text key={x} color={run.startsWith('█') ? colours.blue : colours.deepBlue}>
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
