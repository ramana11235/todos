import {describe, expect, it} from 'vitest';
import {dayName, deadlineName, whenName} from '../src/core/words.js';

// A Friday.
const today = '2026-10-30';

describe('the words every client shows', () => {
	it('names a day as Today, Tomorrow or Yesterday, by weekday within a week, and by date further out', () => {
		expect([dayName('2026-10-30', today), dayName('2026-10-31', today), dayName('2026-10-29', today)]).toEqual(['Today', 'Tomorrow', 'Yesterday']);
		expect(dayName('2026-11-03', today)).toBe('Tue 3');
		expect(dayName('2026-11-14', today)).toBe('14 Nov');
	});

	it('reads a Deadline as days left, due today, days overdue, or its day further out', () => {
		expect(['2026-11-03', '2026-10-30', '2026-10-28', '2026-11-14'].map(day => deadlineName(day, today))).toEqual(['4d left', 'Due today', '2d overdue', '14 Nov']);
	});

	it('names a When, with Active once the day it comes back has come', () => {
		expect(whenName({kind: 'active'}, today)).toBe('Active');
		expect(whenName({kind: 'someday'}, today)).toBe('Someday');
		expect(whenName({kind: 'on_day', day: '2026-11-14'}, today)).toBe('Back on 14 Nov');
		expect(whenName({kind: 'on_day', day: '2026-10-30'}, today)).toBe('Active');
	});
});
