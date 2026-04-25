'use strict';

const beatstars = require('./beatstars');
const soundcloud = require('./soundcloud');
const traktrain = require('./traktrain');
const youtube = require('./youtube');

const PLATFORMS = [beatstars, soundcloud, traktrain, youtube];

function detectPlatform(input) {
  return PLATFORMS.find((p) => p.detect(input)) || null;
}

module.exports = { detectPlatform, beatstars, soundcloud, traktrain, youtube };
