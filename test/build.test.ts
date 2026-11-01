import {describe, expect, it} from 'vitest';
import {apiAction} from '../src/build.js';

const mine = {build: '2', home: '/home/me/.todos'};

describe('what the launcher does with a running API', () => {
	it('starts one when nothing answers', () => {
		expect(apiAction(null, mine)).toBe('start');
	});

	it('uses its own copy on the same build and replaces it on an older one', () => {
		expect(apiAction({build: '2', home: mine.home}, mine)).toBe('use');
		expect(apiAction({build: '1', home: mine.home}, mine)).toBe('replace');
	});

	it('never stops or uses an API that serves another copy of todos', () => {
		expect(apiAction({build: '1', home: '/tmp/test-copy'}, mine)).toBe('refuse');
		expect(apiAction({build: '2', home: '/tmp/test-copy'}, mine)).toBe('refuse');
	});

	it('still replaces an older API that does not say its home', () => {
		expect(apiAction({build: '1'}, mine)).toBe('replace');
	});
});
