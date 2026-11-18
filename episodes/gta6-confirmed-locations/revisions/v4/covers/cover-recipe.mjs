import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependency, root, sharpLibrary } from '../../../../../engine/runtime/node.mjs';

const output = fileURLToPath(new URL('.', import.meta.url));
const episode = join(root, 'episodes/gta6-confirmed-locations');
const { assets } = JSON.parse(await readFile(join(episode, 'assets/source-register.json'), 'utf8'));
const sharp = sharpLibrary();
const require = createRequire(join(dependency('sharp'), 'package.json'));
const fontkit = require('fontkit');
const condensed = fontkit.openSync('/System/Library/Fonts/Avenir Next Condensed.ttc');
const geometric = fontkit.openSync('/System/Library/Fonts/Avenir Next.ttc');
const title = condensed.getFont('AvenirNextCondensed-Heavy');
const kicker = geometric.getFont('AvenirNext-Heavy');
const width = 1920;
const height = 1080;
const paper = '#fff4e9';
const peach = '#ffc19e';
const graphite = '#100e13';

function lettering({ text, x, y, size, tracking, face, color }) {
  const layout = face.layout(text);
  const scale = size / face.unitsPerEm;
  let pen = x;
  return layout.glyphs.map((glyph, index) => {
    const position = layout.positions[index];
    const transform = `translate(${pen + position.xOffset * scale} ${y - position.yOffset * scale}) scale(${scale} ${-scale})`;
    pen += position.xAdvance * scale + tracking;
    return `<path d="${glyph.path.toSVG()}" fill="${color}" transform="${transform}"/>`;
  }).join('');
}

function shade({ coordinates, stops }, index) {
  return `<linearGradient id="shade-${index}" ${coordinates}>${stops.map(([offset, opacity]) =>
    `<stop offset="${offset}" stop-color="${graphite}" stop-opacity="${opacity}"/>`).join('')}</linearGradient>`;
}

const concepts = [
  {
    file: '01-vice-city-alti-bolge-1280x720.png',
    assetId: 'vice-city-22',
    headline: 'GTA VI / 6 BÖLGE',
    rationale: 'Vice City’nin gece siluetini benzin istasyonunun sıcak ışıklarıyla birleştiriyor. Bölgenin sayısı 320 piksel genişliğinde de ilk bakışta okunuyor.',
    selected: true,
    saturation: 1.04,
    tones: [
      { coordinates: 'x1="0" y1="0.40" x2="1" y2="0.43"', stops: [[0, .76], [.46, .37], [.68, .05], [1, 0]] },
      { coordinates: 'x1="0" y1="1" x2="0" y2="0"', stops: [[0, .20], [.35, .03], [1, 0]] },
    ],
    lines: [
      { text: 'GTA VI', x: 117, y: 357, size: 79, tracking: 6, face: kicker, color: peach },
      { text: '6 BÖLGE', x: 102, y: 603, size: 267, tracking: -4, face: title, color: paper },
    ],
  },
  {
    file: '02-sehrin-otesi-1280x720.png',
    assetId: 'mount-kalaga-02',
    headline: 'GTA VI / ŞEHRİN ÖTESİ',
    rationale: 'Mount Kalaga’daki tek helikopter, altın saat ışığında doğrudan bir odak sağlıyor. Coğrafyanın şehir dışında kalan tarafına açılan bir belgesel kapağı.',
    saturation: 1.03,
    tones: [
      { coordinates: 'x1="0" y1="1" x2="0.15" y2="0"', stops: [[0, .82], [.18, .67], [.42, .14], [.61, 0], [1, 0]] },
    ],
    lines: [
      { text: 'GTA VI', x: 114, y: 159, size: 81, tracking: 5, face: kicker, color: graphite },
      { text: 'ŞEHRİN ÖTESİ', x: 105, y: 939, size: 210, tracking: -3.2, face: title, color: paper },
    ],
  },
  {
    file: '03-leonida-sulakalan-1280x720.png',
    assetId: 'grassrivers-03',
    headline: 'GTA VI / LEONIDA',
    rationale: 'Grassrivers’ın neredeyse siyah suyu ve çapraz tekne kadrajı, beyaz manşete temiz alan açıyor. Bölümün atmosferini bataklık üzerinden kuruyor.',
    saturation: 1.01,
    tones: [
      { coordinates: 'x1="1" y1="0.4" x2="0.2" y2="0.45"', stops: [[0, .75], [.46, .55], [.70, .02], [1, 0]] },
    ],
    lines: [
      { text: 'GTA VI', x: 1099, y: 433, size: 75, tracking: 4.5, face: kicker, color: peach },
      { text: 'LEONIDA', x: 1080, y: 615, size: 196, tracking: -3.9, face: title, color: paper },
    ],
  },
];

function graphics(concept) {
  const gradients = concept.tones.map(shade).join('');
  const treatment = concept.tones.map((_, index) =>
    `<rect width="${width}" height="${height}" fill="url(#shade-${index})"/>`).join('');
  const paths = concept.lines.map(lettering).join('');
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradients}<filter id="shadow" x="-20%" y="-30%" width="145%" height="160%">
      <feGaussianBlur stdDeviation="6"/>
    </filter></defs>
    ${treatment}
    <g filter="url(#shadow)" opacity=".34" transform="translate(0 5)">${paths.replaceAll(/fill="[^"]+"/g, 'fill="#09060a"')}</g>
    ${paths}
  </svg>`);
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function record(file) {
  const bytes = await readFile(file);
  const dimensions = await sharp(bytes).metadata();
  return { file: basename(file), width: dimensions.width, height: dimensions.height, sha256: sha256(bytes), bytes: bytes.length };
}

const covers = [];
for (const concept of concepts) {
  const asset = assets.find(item => item.id === concept.assetId);
  if (asset?.source_type !== 'official_game_screenshot') throw new Error(`Invalid cover source: ${concept.assetId}`);
  const source = await readFile(join(episode, asset.path));
  if (sha256(source) !== asset.sha256) throw new Error(`Source hash mismatch: ${asset.id}`);
  const base = await sharp(source).rotate().resize(width, height, { fit: 'cover' })
    .modulate({ saturation: concept.saturation }).toBuffer();
  const composition = await sharp(base).composite([{ input: graphics(concept) }]).png().toBuffer();
  const file = join(output, concept.file);
  await sharp(composition).resize(1280, 720).png({ compressionLevel: 9 }).toFile(file);
  const result = {
    ...await record(file),
    headline: concept.headline,
    sourceAssetId: asset.id,
    publisher: asset.publisher,
    sourceUrl: asset.source_url,
    originalUrl: asset.original_url,
    sourceSha256: asset.sha256,
    rightsStatus: asset.rights_status,
    rationale: concept.rationale,
    selected: !!concept.selected,
  };
  if (concept.selected) {
    const master = join(output, 'art-master-1920x1080.png');
    const final = join(output, 'thumbnail-1280x720.png');
    await writeFile(master, composition);
    await writeFile(final, await readFile(file));
    result.master = await record(master);
    result.final = await record(final);
  }
  covers.push(result);
}
await writeFile(join(output, 'cover-register.json'), JSON.stringify({ covers }, null, 2) + '\n');
