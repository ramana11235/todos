// The page says when it has settled, so a test can read a final result
// instead of waiting on time. It is unsettled from the moment a call to the
// API or a movement that ends in a change, such as the phone sidebar closing,
// starts, and settled again once none is running and the page has drawn
// what they brought.

import {useEffect, useLayoutEffect, useState} from 'react';

let running = 0;
let finished = 0;
const listeners = new Set<() => void>();

function changed() {
	for (const listener of listeners) listener();
}

// Marks the page unsettled until the function it gives back is called.
export function begin(): () => void {
	running++;
	document.documentElement.dataset.settled = 'false';
	let ended = false;
	return () => {
		if (ended) return;
		ended = true;
		running--;
		finished++;
		changed();
	};
}

// Wraps every method of the client, so each call it makes counts while it runs.
export function counted<T extends object>(client: T): T {
	return new Proxy(client, {
		get(target, name, receiver) {
			const value = Reflect.get(target, name, receiver);
			if (typeof value !== 'function') return value;
			return (...args: unknown[]) => {
				const result = value.apply(target, args);
				if (!(result instanceof Promise)) return result;
				return result.finally(begin());
			};
		},
	});
}

// Used once, at the top of the app. A call ends just before the code that
// awaited it sets what it brought back, so both land in the same render, and
// the mark is set after that render. Before the first call has finished, the
// page has nothing to show yet, so it is not settled.
// shortcut: code that awaits something other than the API, such as a timer,
// before setting state can be read before it draws; route it through the
// client if a test ever needs it.
export function useSettledMark() {
	const [done, setDone] = useState(0);
	useEffect(() => {
		const listener = () => setDone(finished);
		listeners.add(listener);
		return () => void listeners.delete(listener);
	}, []);
	useLayoutEffect(() => {
		if (running === 0 && done > 0) document.documentElement.dataset.settled = 'true';
	});
}
