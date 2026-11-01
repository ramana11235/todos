import {Marked} from 'marked';

const escaped = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Only links that open a page or an email; a javascript: link would run code.
const safe = (href: string) => /^(https?:|mailto:)/i.test(href.trim());

// Markdown as HTML for the page to show. Sessions write Thread Notes too, so
// raw HTML in the text is shown as text, and a link or image that is not
// safe shows only its words.
const marked = new Marked({
	gfm: true,
	breaks: true,
	async: false,
	renderer: {
		html: ({text}) => escaped(text),
		link(token) {
			return safe(token.href) ? false : this.parser.parseInline(token.tokens);
		},
		image: token => (safe(token.href) ? false : escaped(token.text)),
	},
});

export const markdownHtml = (text: string): string => marked.parse(text) as string;
