import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependency, root, sharpLibrary } from '../../../../../engine/runtime/node.mjs';

const output = fileURLToPath(new URL('.', import.meta.url));
const episode = join(root, 'episodes/gta6-confirmed-locations');
const sources = JSON.parse(await readFile(join(episode, 'assets/source-register.json'), 'utf8'));
const sharp = sharpLibrary();
const require = createRequire(join(dependency('sharp'), 'package.json'));
const fontkit = require('fontkit');
const condensed = fontkit.openSync('/System/Library/Fonts/Avenir Next Condensed.ttc');
const geometric = fontkit.openSync('/System/Library/Fonts/Avenir Next.ttc');
const title = condensed.getFont('AvenirNextCondensed-Heavy');
const kicker = geometric.getFont('AvenirNext-Heavy');
const width = 1920;
const height = 1080;
const ink = '#09050c';
const ivory = '#fff4e5';
const peach = '#ffccaa';

function lettering(text, { x, y, size, tracking, face, color }) {
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

function shade(direction, values) {
  return `<linearGradient id="shade" ${direction}>${values.map(([offset, opacity]) =>
    `<stop offset="${offset}" stop-color="${ink}" stop-opacity="${opacity}"/>`).join('')}</linearGradient>`;
}

const designs = [
  {
    file: '01-leonida-1280x720.png',
    assetId: 'vice-city-27',
    headline: 'GTA 6 / LEONIDA',
    rationale: 'Alacakaranlık Vice City silueti, Leonida başlığının altında eyalet anlatısına giriş veriyor. Oyun adı ve ana başlık telefon boyutunda ayrı okunuyor.',
    selected: true,
    saturation: 1.05,
    gradients: shade('x1="0" y1="0" x2="0" y2="1"', [[0, .05], [.36, 0], [.64, .16], [1, .89]]),
    lines: [
      ['GTA 6', { x: 112, y: 735, size: 82, tracking: 5, face: kicker, color: peach }],
      ['LEONIDA', { x: 97, y: 957, size: 267, tracking: -5.5, face: title, color: ivory }],
    ],
  },
  {
    file: '02-vice-city-1280x720.png',
    assetId: 'vice-city-01',
    headline: 'GTA 6',
    rationale: 'Uçak ve oyun dünyasındaki Vice City levhası tek bir sahnede. Ekrandaki oyun adı küçük kalıyor, mekân adı Rockstar’ın görselinden okunuyor.',
    saturation: 1.13,
    gradients: shade('x1="0" y1="0" x2="1" y2="0.7"', [[0, .59], [.3, .27], [.56, 0], [1, .02]]),
    lines: [['GTA 6', { x: 102, y: 277, size: 164, tracking: -.8, face: title, color: ivory }]],
  },
  {
    file: '03-alti-bolge-1280x720.png',
    assetId: 'leonida-keys-01',
    headline: '6 ANA / BÖLGE',
    rationale: 'Köprü ve deniz uçağı bölümlerin şehir dışına uzandığını gösteriyor. Manşet, bölümün altı ana bölgelik kapsamını öne çıkarıyor.',
    saturation: 1.03,
    gradients: shade('x1="0" y1="0.2" x2="1" y2="0.9"', [[0, .62], [.33, .53], [.62, 0], [1, 0]]),
    lines: [
      ['6 ANA', { x: 107, y: 589, size: 80, tracking: 5, face: kicker, color: peach }],
      ['BÖLGE', { x: 95, y: 864, size: 263, tracking: -6, face: title, color: ivory }],
    ],
  },
];

function svg(design) {
  const paths = design.lines.map(([text, options]) => lettering(text, options)).join('');
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>${design.gradients}<filter id="shadow" x="-20%" y="-30%" width="145%" height="160%">
      <feGaussianBlur stdDeviation="8"/>
    </filter></defs>
    <path fill="url(#shade)" d="M0 0H1920V1080H0Z"/>
    <g filter="url(#shadow)" opacity=".44" transform="translate(0 5)">
      ${paths.replaceAll(/fill="[^"]+"/g, 'fill="#09050c"')}
    </g>
    ${paths}
  </svg>`);
}

async function record(file) {
  const bytes = await readFile(file);
  const dimensions = await sharp(bytes).metadata();
  return {
    file: basename(file),
    width: dimensions.width,
    height: dimensions.height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}

const exported = [];
for (const design of designs) {
  const asset = sources.assets.find(record => record.id === design.assetId);
  if (!asset) throw new Error(`Unknown source ${design.assetId}`);
  const source = await readFile(join(episode, asset.path));
  if (createHash('sha256').update(source).digest('hex') !== asset.sha256) {
    throw new Error(`Source hash mismatch: ${design.assetId}`);
  }
  const base = await sharp(source).rotate().resize(width, height, { fit: 'cover' })
    .modulate({ saturation: design.saturation }).toBuffer();
  const composition = await sharp(base).composite([{ input: svg(design) }]).png().toBuffer();
  const file = join(output, design.file);
  await sharp(composition).resize(1280, 720).png({ compressionLevel: 9 }).toFile(file);
  const result = {
    ...await record(file),
    headline: design.headline,
    sourceAssetId: design.assetId,
    publisher: asset.publisher,
    sourceUrl: asset.source_url,
    originalUrl: asset.original_url,
    sourceSha256: asset.sha256,
    rightsStatus: asset.rights_status,
    rationale: design.rationale,
    selected: !!design.selected,
  };
  if (design.selected) {
    const master = join(output, 'art-master-1920x1080.png');
    const final = join(output, 'thumbnail-1280x720.png');
    await writeFile(master, composition);
    await writeFile(final, await readFile(file));
    result.master = await record(master);
    result.final = await record(final);
  }
  exported.push(result);
}
await writeFile(join(output, 'cover-register.json'), JSON.stringify({ covers: exported }, null, 2) + '\n');
