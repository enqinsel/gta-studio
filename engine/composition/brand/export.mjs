import { readFileSync, writeFileSync } from 'node:fs';

import { sharpLibrary } from '../../runtime/node.mjs';

const config = new URL('../brand.json', import.meta.url);
const { displayName, identity } = JSON.parse(readFileSync(config, 'utf8'));
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const paper = escape(identity.colors.paper);
const mark = `<path fill="${paper}" d="M12 24h16l7 5 21 40 22-44 11-8h11L63 94l-10 6Z"/>`;

// The wordmark's outlines are authored vectors so every compositor uses the same letterforms.
const letterA = 'M29 0h16l30 80H61l-8-22H22l-8 22H0Zm-3 46h23L37 15Z';
const glyphs = [
  [206, 'M0 0h14l23 63L60 0h14L44 80H30Z'],
  [278, letterA],
  [376, 'M0 0h13v68h49v12H0Z'],
  [462, 'M0 0h63v12H13v22h42v12H13v22h51v12H0Z'],
  [543, letterA],
];
const wordmark = glyphs.map(([x, path]) => `    <path transform="translate(${x} 60)" d="${path}"/>`).join('\n');

const exports = [
  {
    path: identity.icon,
    pixelWidth: 512,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112" width="112" height="112" role="img"><title>${escape(displayName)} monogram</title>${mark}</svg>`,
  },
  {
    path: identity.lockup,
    pixelWidth: 1360,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 200" width="680" height="200" role="img">
  <title>${escape(displayName)}</title>
  <svg x="18" y="16" width="168" height="168" viewBox="0 0 112 112">${mark}</svg>
  <g fill="${paper}" fill-rule="evenodd">
${wordmark}
  </g>
</svg>`,
  },
];

const sharp = sharpLibrary();
for (const artifact of exports) {
  const output = new URL(artifact.path, config);
  writeFileSync(output, `${artifact.svg}\n`);
  const png = new URL(artifact.path.replace(/\.svg$/i, '.png'), config);
  const image = await sharp(Buffer.from(artifact.svg), { density: 400 }).resize({ width: artifact.pixelWidth }).png().toBuffer();
  writeFileSync(png, image);
}
