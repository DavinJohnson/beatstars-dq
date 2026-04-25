'use strict';

const { get, download } = require('../lib');

const CDN = 'https://d2lvs3zi8kbddv.cloudfront.net/';
const TT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://traktrain.com/',
  'Accept': 'text/html,application/xhtml+xml',
};

function detect(url) {
  return /traktrain\.com/i.test(url);
}

function normalizeUrl(input) {
  const trimmed = input.trim();
  // Already an absolute URL
  if (trimmed.startsWith('http')) return trimmed;
  // Relative path
  return 'https://traktrain.com' + (trimmed.startsWith('/') ? trimmed : '/' + trimmed);
}

async function getInfo(input) {
  const url = normalizeUrl(input);
  const { status, body: html } = await get(url, { headers: TT_HEADERS });

  if (status === 404) throw new Error('Track not found on TrakTrain');
  if (status !== 200) throw new Error(`TrakTrain returned HTTP ${status}`);

  // Extract the FixedPlayer JSON object from the onclick attribute or data-player-info
  const fixedPlayerMatch = html.match(/FixedPlayer\((\{[^)]{20,2000}\})\s*[,)]/);
  const playerInfoMatch = html.match(/data-player-info='(\{[^']+\})'/);

  const rawJson = fixedPlayerMatch?.[1] || playerInfoMatch?.[1];
  if (!rawJson) throw new Error('Could not find player data on TrakTrain page');

  let info;
  try { info = JSON.parse(rawJson); } catch { throw new Error('Failed to parse TrakTrain player data'); }

  if (!info.src) throw new Error('No audio source in TrakTrain player data (track may be private)');

  return {
    title: info.brand?.trim() || info.name || 'Unknown',
    artist: info.name || 'Unknown',
    bpm: info.bpm || null,
    streamUrl: CDN + info.src,
    ext: 'mp3',
  };
}

async function downloadTrack(input, destPath) {
  const info = await getInfo(input);
  await download(info.streamUrl, destPath, { headers: TT_HEADERS });
  return info;
}

module.exports = { detect, getInfo, downloadTrack };
