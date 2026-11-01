import {cn} from '@/lib/utils';
import type {ShownMove} from '../../src/core/thread';

// The dot Home puts before each Thread: bright when it is on me, faint when
// it is dimmed.
export function StateDot({shown, dimmed}: {shown: ShownMove; dimmed?: boolean}) {
	return (
		<span
			aria-hidden
			className={cn('size-2 shrink-0 rounded-full transition-colors duration-300', dimmed ? 'bg-muted-foreground/40' : shown === 'on_me' ? 'bg-(--icon-bright)' : 'bg-muted-foreground/70')}
		/>
	);
}
