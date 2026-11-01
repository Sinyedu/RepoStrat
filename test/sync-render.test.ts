import { describe, expect, it } from 'vitest';
import { renderItem } from '../src/sync/render.js';
import { renderBody, truncate } from '../src/sync/sanitize.js';
import { item } from './sync-fixture.js';

type Embed = {
  title: string;
  description: string;
  url: string;
  fields: { name: string; value: string }[];
};
const render = (...args: Parameters<typeof item>) =>
  renderItem(item(...args), 'acme/widget');

describe('rendering GitHub content', () => {
  it('includes the required issue details and link', () => {
    const post = render(42, 'issue', {
      title: 'Fix authentication error',
      assignees: ['hubot'],
    });
    const embed = post.embed as Embed;
    expect(post.name).toBe('#42 — Fix authentication error');
    expect(embed.url).toBe('https://github.com/acme/widget/issues/42');
    const names = embed.fields.map((f) => f.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Status',
        'Author',
        'Labels',
        'Assignees',
        'Created',
        'Updated',
      ]),
    );
    expect(names).not.toContain('Branches');
  });

  it('includes branches and reviewers for pull requests', () => {
    const embed = render(18, 'pull_request', { reviewers: ['hubot'] })
      .embed as Embed;
    const text = JSON.stringify(embed.fields);
    expect(text).toContain('`feature` → `main`');
    expect(text).toContain('hubot');
  });

  it('neutralizes mentions in every GitHub-controlled field', () => {
    const post = render(1, 'issue', {
      title: '@everyone <@123456789012345678>',
      body: 'ping @here and <@&123456789012345678> and @someone',
      labels: ['@everyone'],
      assignees: ['@here'],
    });
    const text = JSON.stringify(post);
    expect(text).not.toMatch(/@(everyone|here|someone)/);
    expect(text).not.toMatch(/<@/);
  });

  it('keeps oversized content within Discord limits', () => {
    const labels = Array.from({ length: 200 }, (_, i) =>
      `label-${i}-`.repeat(5),
    );
    const post = render(9, 'pull_request', {
      title: 'T'.repeat(500),
      body: 'x'.repeat(50_000),
      labels,
      assignees: labels,
      reviewers: labels,
    });
    const embed = post.embed as Embed;
    expect(post.name.length).toBeLessThanOrEqual(100);
    expect(embed.title.length).toBeLessThanOrEqual(256);
    expect(embed.description.length).toBeLessThanOrEqual(4096);
    for (const f of embed.fields)
      expect(f.value.length).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(embed).length).toBeLessThan(6000);
  });

  it('truncates Unicode without splitting characters', () => {
    const text = '😀'.repeat(30);
    const cut = truncate(text, 10);
    expect(Array.from(cut)).toHaveLength(10);
    expect(cut).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
    expect(
      renderItem(item(2, 'issue', { title: '日本語 ✓ ñ' }), 'a/b').name,
    ).toBe('#2 — 日本語 ✓ ñ');
  });

  it('closes a code fence cut by truncation', () => {
    const body = '```\n' + 'code\n'.repeat(1000);
    const out = renderBody(body, 100);
    expect((out.match(/```/g) ?? []).length % 2).toBe(0);
  });

  it('strips HTML and comments, and unmasks links', () => {
    const out = renderBody(
      '<!-- secret --><b>hi</b> [click](https://evil.example) <https://ok.example>',
      500,
    );
    expect(out).not.toContain('secret');
    expect(out).not.toContain('<b>');
    expect(out).toContain('click (https://evil.example)');
    expect(out).toContain('<https://ok.example>');
  });

  it('handles an empty description', () => {
    expect(renderBody(null, 100)).toContain('No description');
  });

  it('changes the hash only when rendered content changes', () => {
    expect(render(1).hash).toBe(render(1).hash);
    expect(render(1).hash).not.toBe(
      render(1, 'issue', { state: 'closed' }).hash,
    );
  });
});
