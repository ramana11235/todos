import {describe, expect, it} from 'vitest';
import {nvimConfig} from '../src/home/thoughts.js';

describe('the nvim config for Thoughts', () => {
	it('never reads settings written inside the page, because others can write Thoughts through the API', () => {
		expect(nvimConfig()).toMatch(/^o\.modeline = false$/m);
	});
});
