import { REST, Routes } from 'discord.js';
import { parseConfig } from '../config.js';
import { commands } from './commands.js';

const config = parseConfig(process.env);
const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
await rest.put(
  Routes.applicationGuildCommands(
    config.DISCORD_CLIENT_ID,
    config.DISCORD_GUILD_ID,
  ),
  {
    body: commands,
  },
);
console.info(`Registered ${commands.length} guild commands.`);
