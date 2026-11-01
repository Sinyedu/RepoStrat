import { createHash } from 'node:crypto';
import { inline, list, profile, renderBody, truncate } from './sanitize.js';
import type { ForumPost, GitHubItem } from './types.js';

const colors = {
  open: 0x2da44e,
  closed: 0xcf222e,
  merged: 0x8250df,
  draft: 0x6e7781,
};

function status(item: GitHubItem): keyof typeof colors {
  if (item.type === 'issue') return item.state;
  if (item.merged) return 'merged';
  if (item.state === 'closed') return 'closed';
  return item.draft ? 'draft' : 'open';
}

function stamp(date: Date): string {
  const seconds = Math.floor(date.getTime() / 1000);
  return `<t:${seconds}:f>`;
}

/** Builds the forum post for an item plus a hash of everything rendered. */
export function renderItem(
  item: GitHubItem,
  repository: string,
): ForumPost & { hash: string } {
  const state = status(item);
  const label = state[0]!.toUpperCase() + state.slice(1);
  const heading = `#${item.number} — ${inline(item.title)}`;
  const fields = [
    { name: 'Status', value: label, inline: true },
    { name: 'Author', value: profile(item.author), inline: true },
  ];
  if (item.type === 'pull_request') {
    fields.push({
      name: 'Branches',
      value: truncate(
        `\`${inline(item.headRef ?? '?').replace(/`/g, "'")}\` → \`${inline(item.baseRef ?? '?').replace(/`/g, "'")}\``,
        1024,
      ),
      inline: false,
    });
  }
  fields.push(
    { name: 'Labels', value: list(item.labels, 1024), inline: false },
    { name: 'Assignees', value: list(item.assignees, 1024), inline: false },
  );
  if (item.type === 'pull_request') {
    fields.push({
      name: 'Reviewers',
      value: list(item.reviewers, 1024),
      inline: false,
    });
  }
  fields.push(
    { name: 'Created', value: stamp(item.createdAt), inline: true },
    { name: 'Updated', value: stamp(item.updatedAt), inline: true },
  );
  const embed = {
    title: truncate(heading, 256),
    url: item.url,
    description: renderBody(item.body, 1500),
    color: colors[state],
    fields,
    footer: {
      text: truncate(
        `${item.type === 'issue' ? 'Issue' : 'Pull request'} · ${repository}`,
        2048,
      ),
    },
  };
  const post = { name: truncate(heading, 100), embed };
  const hash = createHash('sha256').update(JSON.stringify(post)).digest('hex');
  return { ...post, hash };
}
