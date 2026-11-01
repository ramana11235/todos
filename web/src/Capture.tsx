import {Dialog, DialogContent, DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';

// Alt+C, as in the terminal: one line, Enter saves to the Inbox, Esc cancels.
export function Capture({open, onOpenChange, onSave}: {open: boolean; onOpenChange: (open: boolean) => void; onSave: (title: string) => void}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent showCloseButton={false} className="top-[30%] gap-2 p-3">
				<DialogTitle className="sr-only">Capture</DialogTitle>
				<Input
					autoFocus
					placeholder="Capture"
					className="border-none font-mono text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
					onKeyDown={e => {
						if (e.key === 'Enter' && e.currentTarget.value.trim()) {
							onSave(e.currentTarget.value.trim());
							onOpenChange(false);
						}
					}}
				/>
			</DialogContent>
		</Dialog>
	);
}
