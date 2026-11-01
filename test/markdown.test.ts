import {describe, expect, it} from 'vitest';
import {markdownHtml} from '../web/src/markdown.js';

describe('Markdown in the web app', () => {
	it('formats lists, bold, code and links', () => {
		const html = markdownHtml('- **Bold** and `code`\n- [A link](https://example.com)');
		expect(html).toContain('<li><strong>Bold</strong> and <code>code</code></li>');
		expect(html).toContain('<a href="https://example.com">A link</a>');
	});

	it('shows raw HTML as text and keeps only the words of an unsafe link or image', () => {
		const html = markdownHtml('<img src=x onerror="alert(1)">\n\n[click](javascript:alert(1)) ![pic](javascript:alert(1))\n\n<script>alert(1)</script>');
		expect(html).not.toMatch(/<img|<script|javascript:|<a /);
		expect(html).toContain('&lt;img');
		expect(html).toContain('click');
	});
});
