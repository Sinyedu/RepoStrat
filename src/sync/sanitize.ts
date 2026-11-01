const ZWSP = '​';

/** Truncates by code points (never splits a surrogate pair). */
export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, Math.max(0, max - 1))
    .join('')
    .trimEnd()}…`;
}

/** Defuses mentions and Discord-specific tokens in untrusted text. */
export function defuseMentions(text: string): string {
  return text
    .replace(/@(everyone|here)/gi, `@${ZWSP}$1`)
    .replace(/<([@#:]|a:|t:|id:)/gi, `<${ZWSP}$1`)
    .replace(/@(?=[A-Za-z0-9_-])/g, `@${ZWSP}`);
}

/** Single-line plain text safe for names, titles and field values. */
export function inline(text: string): string {
  return defuseMentions(text.replace(/\s+/g, ' ').trim());
}

/** Renders a GitHub Markdown body as short, safe Discord text. */
export function renderBody(body: string | null, max: number): string {
  if (!body?.trim()) return '*No description provided.*';
  let text = body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Show real link targets instead of masked links.
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '$1 ($2)')
    // Strip raw HTML tags but keep <https://…> autolinks.
    .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(\s[^>\n]*)?\/?>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  text = defuseMentions(text);
  if (!text) return '*No description provided.*';
  const long = Array.from(text).length > max;
  text = truncate(text, max);
  // Close a code fence the cut may have left open.
  if ((text.match(/```/g) ?? []).length % 2 === 1) text += '\n```';
  return long && !text.endsWith('…') && !text.endsWith('```')
    ? `${text}…`
    : text;
}

/** Hyperlinks only GitHub logins, which are restricted characters. */
export function profile(login: string | null): string {
  if (!login) return 'Unknown';
  return /^[A-Za-z0-9-]+(\[bot\])?$/.test(login)
    ? `[${login}](https://github.com/${login.replace('[bot]', '')})`
    : inline(login);
}

export function list(values: string[], max: number): string {
  if (!values.length) return 'None';
  const text = values
    .map((v) => `\`${inline(v).replace(/`/g, "'")}\``)
    .join(', ');
  return truncate(text, max);
}
