'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { sanitizeFilename } = require('./lib');
const { detectPlatform } = require('./platforms');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment.');
  console.error('Copy .env.example to .env and fill in your values, then run: node bot.js');
  process.exit(1);
}

const DISCORD_MAX_BYTES = 8 * 1024 * 1024;

const SUPPORTED_URL_RE = /https?:\/\/(?:www\.)?(beatstars\.com\/beat\/|soundcloud\.com\/|traktrain\.com\/|(?:www\.)?youtube\.com\/watch|youtu\.be\/)[^\s]*/gi;

const PLATFORM_LABELS = {
  beatstars: 'BeatStars',
  soundcloud: 'SoundCloud',
  traktrain: 'TrakTrain',
  youtube: 'YouTube',
};

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('dl')
      .setDescription('Download a beat from BeatStars, SoundCloud, TrakTrain, or YouTube')
      .addStringOption((opt) =>
        opt.setName('url').setDescription('URL to download').setRequired(true)
      ),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log('Slash commands registered.');
}

async function handleDownload(input, replyFn) {
  const trimmed = input.trim();
  const platform = detectPlatform(trimmed);

  if (!platform) {
    await replyFn({ content: `❌ Unsupported URL. Paste a link from BeatStars, SoundCloud, TrakTrain, or YouTube.`, ephemeral: true });
    return;
  }

  const platformName = Object.keys(PLATFORM_LABELS).find((k) => require('./platforms')[k] === platform);
  const label = PLATFORM_LABELS[platformName] || 'Unknown';

  await replyFn({ content: `🔍 Looking up track on **${label}**...` });

  let info;
  try {
    info = await platform.getInfo(trimmed);
  } catch (err) {
    await replyFn({ content: `❌ Failed to fetch track info: ${err.message}` });
    return;
  }

  const bpmSuffix = info.bpm ? ` • ${info.bpm} BPM` : '';
  const displayName = `**${info.artist} - ${info.title}**${bpmSuffix}`;
  await replyFn({ content: `⬇️ Downloading ${displayName} from ${label}...` });

  const filenameBpm = info.bpm ? ` (${info.bpm} BPM)` : '';
  const filename = sanitizeFilename(`${info.artist} - ${info.title}${filenameBpm}.${info.ext}`);
  const tempPath = path.join(os.tmpdir(), `dq-${Date.now()}.${info.ext}`);

  try {
    await platform.downloadTrack(trimmed, tempPath);
  } catch (err) {
    await replyFn({ content: `❌ Download failed: ${err.message}` });
    return;
  }

  const fileSize = fs.statSync(tempPath).size;

  if (fileSize > DISCORD_MAX_BYTES) {
    fs.unlinkSync(tempPath);
    const sizeMB = (fileSize / 1024 / 1024).toFixed(1);
    await replyFn({
      content: `❌ ${displayName} is **${sizeMB} MB** — over Discord's 8 MB limit. Can't attach it here.`,
    });
    return;
  }

  try {
    const attachment = new AttachmentBuilder(tempPath, { name: filename });
    await replyFn({ content: `✅ ${displayName}`, files: [attachment] });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

async function main() {
  await registerCommands();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log('Listening for /dl and links from BeatStars, SoundCloud, TrakTrain, YouTube...');
  });

  // /dl slash command
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'dl') return;
    const input = interaction.options.getString('url');
    await interaction.deferReply();
    await handleDownload(input, async ({ content, files, ephemeral }) => {
      try { await interaction.editReply({ content, files: files || [] }); } catch {}
    });
  });

  // Auto-detect supported links in chat
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const urls = message.content.match(SUPPORTED_URL_RE);
    if (!urls) return;

    const toProcess = [...new Set(urls)].slice(0, 3);
    for (const url of toProcess) {
      let replied = false;
      await handleDownload(url, async (payload) => {
        if (!replied) {
          replied = true;
          await message.reply(payload);
        } else {
          await message.channel.send(payload);
        }
      });
    }
  });

  client.login(TOKEN);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
