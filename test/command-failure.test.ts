import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { reportCommandFailure } from '../src/discord/command-failure.js';
import { ProjectOperationError } from '../src/projects/types.js';

function interaction(editReply: (content: string) => Promise<unknown>) {
  const followUp = vi.fn(async () => undefined);
  return {
    commandName: 'project',
    deferred: true,
    replied: false,
    editReply,
    followUp,
  } as unknown as ChatInputCommandInteraction & { followUp: typeof followUp };
}

describe('failed Discord interaction responses', () => {
  it('edits a deferred reply and logs the operation and Discord code safely', async () => {
    const editReply = vi.fn(async () => undefined);
    const input = interaction(editReply);
    const logger = { error: vi.fn() };
    const cause = {
      code: 10004,
      status: 404,
      requestBody: { token: 'never-log-this' },
    };
    await reportCommandFailure(
      input,
      new ProjectOperationError('discord.guild.permissions', cause),
      logger,
    );
    expect(editReply).toHaveBeenCalledWith(
      'Something went wrong. Please try again later.',
    );
    expect(input.followUp).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'discord.guild.permissions',
        discordCode: 10004,
        httpStatus: 404,
      }),
      'Command failed',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'never-log-this',
    );
  });

  it('tries an ephemeral follow-up if editing the deferred reply fails', async () => {
    const input = interaction(async () => {
      throw { code: 50001, status: 403 };
    });
    const logger = { error: vi.fn() };
    await reportCommandFailure(input, new Error('failed'), logger);
    expect(input.followUp).toHaveBeenCalledWith({
      content: 'Something went wrong. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'discord.interaction.editReply',
        discordCode: 50001,
      }),
      'Could not edit deferred reply',
    );
  });
});
