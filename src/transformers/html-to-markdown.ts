import TurndownService from 'turndown';

// Initialize TurndownService with concise Markdown formatting options
const turndownService = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Remove noisy and non-content tags completely
turndownService.remove([
  'script',
  'style',
  'noscript',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'header',
  'footer',
  'nav',
  'button',
]);

// Strip custom and non-HTML tags like <svg> and <applet>
turndownService.addRule('stripSvgAndApplet', {
  filter: (node) => {
    const tag = node.nodeName.toLowerCase();
    return tag === 'svg' || tag === 'applet';
  },
  replacement: () => '',
});

// Strip navigation and UI elements commonly found in Moodle CMS pages
turndownService.addRule('stripMoodleUiElements', {
  filter: (node) => {
    if (node.nodeType !== 1) return false;
    const el = node as HTMLElement;
    const className = el.className || '';
    if (typeof className === 'string') {
      if (
        className.includes('breadcrumb') ||
        className.includes('activity-navigation') ||
        className.includes('action-menu') ||
        className.includes('moodle-actionmenu') ||
        className.includes('nav-item') ||
        className.includes('nav-link')
      ) {
        return true;
      }
    }
    const role = el.getAttribute('role');
    if (role === 'navigation') {
      return true;
    }
    return false;
  },
  replacement: () => '',
});

/**
 * Converts rich Moodle CMS HTML to clean, compact Markdown.
 * Strips script tags, styles, navigation bars, and noisy wrappers, achieving >80% token reduction.
 */
export function htmlToMarkdown(html?: string | null): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Pre-strip HTML comments (e.g. <!-- behat_test_flag: ... -->)
  let cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (!cleanHtml) {
    return '';
  }

  // If text does not contain any HTML tags, return trimmed text
  if (!/<[a-z][\s\S]*>/i.test(cleanHtml)) {
    return cleanHtml;
  }

  try {
    let md = turndownService.turndown(cleanHtml);
    // Normalize bullet list markers: "-   item" -> "- item"
    md = md.replace(/^([ \t]*)-\s+/gm, '$1- ');
    // Collapse excessive consecutive newlines to maximum of two
    md = md.replace(/\n{3,}/g, '\n\n');
    return md.trim();
  } catch {
    // Fallback: strip tags via regex if Turndown parsing encounters an issue
    return cleanHtml.replace(/<[^>]+>/g, '').trim();
  }
}
