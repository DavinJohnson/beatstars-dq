'use strict';

const { get, download, sanitizeFilename } = require('../lib');

const API_BASE = 'https://main.v2.beatstars.com';

function detect(url) {
  return /beatstars\.com/i.test(url);
}

function extractId(input) {
  const trimmed = input.trim();
  if (/^\d{5,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(\d{5,})(?:[/?#]|$)/);
  return match ? match[1] : null;
}

async function getInfo(input) {
  const trackId = extractId(input);
  if (!trackId) throw new Error('Could not extract track ID from BeatStars URL');

  const { status, body } = await get(`${API_BASE}/beat?id=${trackId}&fields=details,stats,licenses`);
  if (status !== 200) throw new Error(`BeatStars API returned HTTP ${status}`);
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Invalid JSON from BeatStars API'); }
  if (!data.status) throw new Error(data.response?.data?.message || 'BeatStars API error');
  const details = data.response?.data?.details;
  if (!details) throw new Error('No track details in BeatStars response');

  return {
    title: details.title || `beat-${trackId}`,
    artist: details.musician?.display_name || details.musician?.permalink || 'Unknown',
    bpm: details.bpm || null,
    streamUrl: details.stream_ssl_url || details.stream_url,
    ext: 'mp3',
  };
}

async function downloadTrack(input, destPath) {
  const info = await getInfo(input);
  if (!info.streamUrl) throw new Error('No stream URL (track may be private or exclusive-only)');
  await download(info.streamUrl, destPath);
  return info;
}

module.exports = { detect, extractId, getInfo, downloadTrack };
