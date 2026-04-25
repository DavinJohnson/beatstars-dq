'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');

const API_BASE = 'https://main.v2.beatstars.com';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://www.beatstars.com/',
  'Accept': 'application/json',
};

function extractTrackId(input) {
  const trimmed = input.trim();
  if (/^\d{5,}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(\d{5,})(?:[/?#]|$)/);
  if (match) return match[1];
  return null;
}

function get(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { ...HEADERS, ...opts.headers } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(get(res.headers.location, opts));
      }
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
  });
}

function download(url, destPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const mergedHeaders = { ...HEADERS, ...(opts.headers || {}) };
    const doRequest = (reqUrl) => {
      const mod = reqUrl.startsWith('https') ? https : http;
      mod.get(reqUrl, { headers: mergedHeaders }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    doRequest(url);
  });
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

async function getTrackInfo(trackId) {
  const url = `${API_BASE}/beat?id=${trackId}&fields=details,stats,licenses`;
  const { status, body } = await get(url);
  if (status !== 200) throw new Error(`API returned HTTP ${status}`);
  let data;
  try { data = JSON.parse(body); } catch { throw new Error('Invalid JSON from API'); }
  if (!data.status) throw new Error(data.response?.data?.message || 'Unknown API error');
  const details = data.response?.data?.details;
  if (!details) throw new Error('No track details in response');
  return details;
}

module.exports = { extractTrackId, get, download, sanitizeFilename, getTrackInfo };
