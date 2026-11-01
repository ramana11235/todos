import {dayOf} from '../../src/core/task';
import * as words from '../../src/core/words';

export const today = () => dayOf(new Date());

export function addDays(day: string, n: number) {
	const d = new Date(`${day}T12:00`);
	d.setDate(d.getDate() + n);
	return dayOf(d);
}

// The shared words for days, counted from today on this device.
export const daysLeft = (day: string) => words.daysLeft(day, today());
export const dayName = (day: string) => words.dayName(day, today());
