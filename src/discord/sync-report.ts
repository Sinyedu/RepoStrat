import type { SyncSummary } from '../sync/types.js';

const maxListed = 5;

export function formatSummary(name: string, s: SyncSummary): string {
  const complete =
    !s.failures.length && !s.deferred && !s.truncated && !s.aborted;
  const lines = [
    `**${name} ${complete ? 'synchronized' : 'partially synchronized'}**`,
    `- ${s.issuesImported} issues imported`,
    `- ${s.pullRequestsImported} pull requests imported`,
    `- ${s.updated + s.recreated} existing posts updated` +
      (s.recreated ? ` (${s.recreated} recreated after deletion)` : ''),
    `- ${s.unchanged} unchanged`,
    `- ${s.failures.length} errors`,
  ];
  if (s.deferred)
    lines.push(
      `\n${s.deferred} items were not processed in this run. Run \`/project sync\` again to continue.`,
    );
  if (s.truncated)
    lines.push(
      '\nGitHub returned more items than one sync can list (5,000 per type); the import is incomplete.',
    );
  if (s.aborted)
    lines.push(
      '\nSync stopped after repeated Discord errors. Check that the bot can view, post in, and manage threads in the forum channels.',
    );
  for (const f of s.failures.slice(0, maxListed))
    lines.push(
      `- #${f.number} (${f.type === 'issue' ? 'issue' : 'pull request'}): ${f.reason}`,
    );
  if (s.failures.length > maxListed)
    lines.push(`- …and ${s.failures.length - maxListed} more`);
  return lines.join('\n');
}
