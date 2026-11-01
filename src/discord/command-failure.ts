import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { ProjectOperationError } from '../projects/types.js';

type ErrorLogger = {
  error(details: Record<string, unknown>, message: string): void;
};

function details(operation: string, error: unknown) {
  const cause = error instanceof ProjectOperationError ? error.cause : error;
  const api =
    typeof cause === 'object' && cause !== null
      ? (cause as { code?: unknown; status?: unknown })
      : {};
  return {
    operation,
    errorName: cause instanceof Error ? cause.name : 'unknown',
    discordCode: typeof api.code === 'number' ? api.code : undefined,
    httpStatus: typeof api.status === 'number' ? api.status : undefined,
  };
}

export async function reportCommandFailure(
  interaction: ChatInputCommandInteraction,
  error: unknown,
  logger: ErrorLogger,
): Promise<void> {
  logger.error(
    details(
      error instanceof ProjectOperationError
        ? error.operation
        : `${interaction.commandName}.handle`,
      error,
    ),
    'Command failed',
  );
  const content = 'Something went wrong. Please try again later.';
  try {
    if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply(content);
        return;
      } catch (editError) {
        logger.error(
          details('discord.interaction.editReply', editError),
          'Could not edit deferred reply',
        );
      }
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  } catch (replyError) {
    logger.error(
      details('discord.interaction.respond', replyError),
      'Could not report command failure',
    );
  }
}
