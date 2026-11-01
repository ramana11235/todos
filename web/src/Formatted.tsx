import {cn} from '@/lib/utils';
import {markdownHtml} from './markdown';

// Multi-line text shows its Markdown formatted, and a click edits the raw
// Markdown, except a click on a link, which opens it in a new tab.
export function Formatted({text, placeholder, className, onEdit}: {text: string; placeholder: string; className?: string; onEdit: () => void}) {
	if (!text.trim())
		return (
			<button className={cn('cursor-text self-start text-left text-sm text-muted-foreground', className)} onClick={onEdit}>
				{placeholder}
			</button>
		);
	return (
		<div
			className={cn('md cursor-text text-sm', className)}
			onClick={e => {
				const link = (e.target as HTMLElement).closest('a');
				if (!link) return onEdit();
				e.preventDefault();
				window.open(link.href, '_blank', 'noopener');
			}}
			dangerouslySetInnerHTML={{__html: markdownHtml(text)}}
		/>
	);
}
