import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { dependency, root, sharpLibrary } from '../engine/runtime/node.mjs';

const [requestedOutput, ...rest] = process.argv.slice(2);
if (!requestedOutput || rest.length) {
  throw new Error('Usage: node scripts/render-ep01-covers.mjs NEW_WORK_DIRECTORY');
}
const output = resolve(requestedOutput);
const episode = join(root, 'episodes/gta6-confirmed-locations/revisions/v4');
const v4Covers = join(episode, 'covers');
const v4Register = JSON.parse(await readFile(join(v4Covers, 'cover-register.json'), 'utf8'));
const selected = v4Register.covers.find(cover => cover.selected);
const { assets } = JSON.parse(await readFile(join(episode, 'assets/source-register.json'), 'utf8'));
const asset = assets.find(item => item.id === selected.sourceAssetId);
const sharp = sharpLibrary();
const require = createRequire(join(dependency('fontkit'), 'package.json'));
const fontkit = require('fontkit');
const title = fontkit.openSync(process.env.GTA_COVER_CONDENSED_FONT ?? '/System/Library/Fonts/Avenir Next Condensed.ttc')
  .getFont('AvenirNextCondensed-Heavy');
const kicker = fontkit.openSync(process.env.GTA_COVER_FONT ?? '/System/Library/Fonts/Avenir Next.ttc').getFont('AvenirNext-Heavy');
const width = 1920;
const height = 1080;
const graphite = '#100e13';
const paper = '#fff4e9';
const peach = '#ffc19e';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

const localized = {
  tr: '6 BÖLGE',
  en: '6 REGIONS',
  es: '6 REGIONES',
  de: '6 REGIONEN',
};

// The Turkish render must reproduce the selected V4 art before translations are exported.
const editorialGrade = [
  { coordinates: 'x1="0" y1="0.40" x2="1" y2="0.43"', stops: [[0, .76], [.46, .37], [.68, .05], [1, 0]] },
  { coordinates: 'x1="0" y1="1" x2="0" y2="0"', stops: [[0, .20], [.35, .03], [1, 0]] },
];

function lettering({ text, x, y, size, tracking, face, color }) {
  const layout = face.layout(text);
  const scale = size / face.unitsPerEm;
  let furthest = x;
  let pen = x;
  const paths = layout.glyphs.map((glyph, index) => {
    const position = layout.positions[index];
    const glyphX = pen + position.xOffset * scale;
    furthest = Math.max(furthest, glyphX + glyph.bbox.maxX * scale);
    const transform = `translate(${glyphX} ${y - position.yOffset * scale}) scale(${scale} ${-scale})`;
    pen += position.xAdvance * scale + tracking;
    return `<path d="${glyph.path.toSVG()}" fill="${color}" transform="${transform}"/>`;
  }).join('');
  return { paths, right: furthest };
}

const headlineStyle = { x: 102, y: 603, size: 267, tracking: -4, face: title, color: paper };
const maximumRight = lettering({ ...headlineStyle, text: localized.tr }).right;

function fitHeadline(text) {
  let size = headlineStyle.size;
  let letteringRun = lettering({ ...headlineStyle, text, size });
  if (letteringRun.right > maximumRight) {
    const trackingPart = headlineStyle.tracking * (title.layout(text).glyphs.length - 1);
    const glyphPart = letteringRun.right - headlineStyle.x - trackingPart;
    size *= (maximumRight - headlineStyle.x - trackingPart) / glyphPart;
    letteringRun = lettering({ ...headlineStyle, text, size });
  }
  return { ...letteringRun, size };
}

const gameTag = lettering({
  text: 'GTA VI', x: 117, y: 357, size: 79, tracking: 6, face: kicker, color: peach,
}).paths;

function graphics(headline) {
  const gradients = editorialGrade.map(({ coordinates, stops }, index) =>
    `<linearGradient id="shade-${index}" ${coordinates}>${stops.map(([offset, opacity]) =>
      `<stop offset="${offset}" stop-color="${graphite}" stop-opacity="${opacity}"/>`).join('')}</linearGradient>`).join('');
  const treatment = editorialGrade.map((_, index) =>
    `<rect width="${width}" height="${height}" fill="url(#shade-${index})"/>`).join('');
  const paths = gameTag + headline.paths;
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradients}<filter id="shadow" x="-20%" y="-30%" width="145%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter></defs>
    ${treatment}
    <g filter="url(#shadow)" opacity=".34" transform="translate(0 5)">${paths.replaceAll(/fill="[^"]+"/g, 'fill="#09060a"')}</g>
    ${paths}
  </svg>`);
}

async function rawRgb(png) {
  return sharp(png).removeAlpha().raw().toBuffer();
}

function differenceBounds(before, after) {
  const bounds = { left: width, top: height, right: -1, bottom: -1, changedPixels: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      if (before[offset] === after[offset] && before[offset + 1] === after[offset + 1] &&
          before[offset + 2] === after[offset + 2]) continue;
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x);
      bounds.bottom = Math.max(bounds.bottom, y);
      bounds.changedPixels++;
    }
  }
  if (!bounds.changedPixels) return null;
  if (bounds.left < 45 || bounds.top < 310 || bounds.right > 1100 || bounds.bottom > 655) {
    throw new Error(`Cover pixels changed beyond the V4 headline and shadow: ${JSON.stringify(bounds)}`);
  }
  return bounds;
}

async function exportFile(name, bytes, expectedWidth, expectedHeight) {
  const metadata = await sharp(bytes).metadata();
  if (metadata.width !== expectedWidth || metadata.height !== expectedHeight || metadata.format !== 'png') {
    throw new Error(`Invalid PNG geometry for ${name}`);
  }
  await writeFile(join(output, name), bytes);
  return { file: name, width: metadata.width, height: metadata.height, byteCount: bytes.length, sha256: sha256(bytes) };
}

const source = await readFile(join(episode, asset.path));
if (asset.source_type !== 'official_game_screenshot' || sha256(source) !== selected.sourceSha256 ||
    asset.sha256 !== selected.sourceSha256) throw new Error('Selected V4 source does not match the register.');
const base = await sharp(source).rotate().resize(width, height, { fit: 'cover' })
  .modulate({ saturation: 1.04 }).toBuffer();

const v4Master = await readFile(join(v4Covers, selected.master.file));
const v4Thumb = await readFile(join(v4Covers, selected.final.file));
if (sha256(v4Master) !== selected.master.sha256 || sha256(v4Thumb) !== selected.final.sha256) {
  throw new Error('Selected V4 files do not match the register.');
}
const v4Pixels = await rawRgb(v4Master);

await mkdir(output);
const covers = [];
const previews = [];
for (const [language, text] of Object.entries(localized)) {
  const headline = fitHeadline(text);
  const master = await sharp(base).composite([{ input: graphics(headline) }]).png().toBuffer();
  const pixels = await rawRgb(master);
  const difference = differenceBounds(v4Pixels, pixels);
  if (language === 'tr' ? difference !== null : difference === null) {
    throw new Error(`Incorrect localization difference for ${language}`);
  }
  const masterBytes = language === 'tr' ? v4Master : master;
  const thumbnail = language === 'tr' ? v4Thumb :
    await sharp(masterBytes).resize(1280, 720).png({ compressionLevel: 9 }).toBuffer();
  const thumb = await exportFile(`thumbnail-${language}-1280x720.png`, thumbnail, 1280, 720);
  covers.push({
    language,
    headline: `GTA VI / ${text}`,
    headlineSizeAt1920: headline.size,
    headlineDifferenceFromTrAt1920: difference,
    thumbnail: thumb,
    master: await exportFile(`art-master-${language}-1920x1080.png`, masterBytes, 1920, 1080),
  });
  previews.push(await sharp(thumbnail).resize(320, 180).png().toBuffer());
}

const defaultThumbnail = covers.find(({ language }) => language === 'en').thumbnail;
const preview = await sharp({ create: { width: 648, height: 368, channels: 3, background: graphite } })
  .composite(previews.map((image, index) => ({ input: image, left: (index % 2) * 328, top: Math.floor(index / 2) * 188 })))
  .png().toBuffer();
await writeFile(join(output, 'preview-mobile-320.png'), preview);
await writeFile(join(output, 'cover-register.json'), JSON.stringify({
  version: 'ep01-v4-localized',
  source: {
    assetId: asset.id,
    publisher: asset.publisher,
    sourceUrl: asset.source_url,
    originalUrl: asset.original_url,
    sourceSha256: asset.sha256,
    rightsStatus: asset.rights_status,
    approvedV4MasterSha256: selected.master.sha256,
    approvedV4ThumbnailSha256: selected.final.sha256,
  },
  method: 'V4 art, crop, grade and GTA VI kicker reproduced pixel-for-pixel. Language changes apply only to the headline and its shadow. Turkish copies use the V4 files verbatim.',
  defaultLanguage: 'en',
  defaultThumbnail,
  mobilePreview: { file: 'preview-mobile-320.png', tileWidth: 320, tileHeight: 180, order: Object.keys(localized) },
  covers,
}, null, 2) + '\n');
