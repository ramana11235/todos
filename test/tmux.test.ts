import {describe, expect, it} from 'vitest';
import {tmuxIsNewEnough} from '../src/session/tmux.js';

describe('the tmux version todos needs', () => {
	it('takes 3.3 and later', () => {
		expect(tmuxIsNewEnough('tmux 3.3')).toBe(true);
		expect(tmuxIsNewEnough('tmux 3.5a\n')).toBe(true);
		expect(tmuxIsNewEnough('tmux 4.0')).toBe(true);
		expect(tmuxIsNewEnough('tmux next-3.6')).toBe(true);
	});

	it('refuses anything older', () => {
		expect(tmuxIsNewEnough('tmux 3.2a')).toBe(false);
		expect(tmuxIsNewEnough('tmux 2.9')).toBe(false);
		expect(tmuxIsNewEnough('tmux next-3.2')).toBe(false);
	});

	it('lets through a build that names no version, such as one from source', () => {
		expect(tmuxIsNewEnough('tmux master')).toBe(true);
	});
});
