import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { dependency, hyperframes, root, sharpLibrary } from '../runtime/node.mjs';
import { cardLayer, escape, outroIdentity, seconds, transitionLayer } from './motion.mjs';

export function studioBrand() {
  const brand = JSON.parse(readFileSync(join(root, 'engine/composition/brand.json'), 'utf8'));
  if (brand.projectId !== 'gta-studio' || typeof brand.displayName !== 'string' || !brand.displayName.trim()) {
    throw new Error('The brand requires projectId gta-studio and a public displayName.');
  }
  return brand;
}

export async function compile(directory, shots, brand = studioBrand()) {
  const assets = join(directory, 'assets');
  const vendor = join(directory, 'vendor');
  mkdirSync(assets, { recursive: true });
  mkdirSync(vendor, { recursive: true });
  copyFileSync(join(dependency('gsap'), 'dist/gsap.min.js'), join(vendor, 'gsap.min.js'));
  copyFileSync(join(root, 'engine/composition/studio.css'), join(directory, 'studio.css'));
  const brandAssets = {};
  for (const key of ['icon', 'lockup']) {
    const source = brand.identity?.[key];
    if (!source) continue;
    const name = `brand-${key}${extname(source)}`;
    copyFileSync(join(root, 'engine/composition', source), join(assets, name));
    brandAssets[key] = `assets/${name}`;
  }
  const colors = brand.identity?.colors || {};
  const brandStyle = [['night', 'graphite'], ['paper', 'paper'], ['peach', 'warm']]
    .filter(([, key]) => /^#[a-f0-9]{6}$/i.test(colors[key]))
    .map(([token, key]) => `--${token}:${colors[key]}`).join(';');

  const media = new Map();
  const sharp = sharpLibrary();
  for (const shot of shots) {
    if (shot.card || media.has(shot.source)) continue;
    const image = shot.kind === 'image';
    const name = `media-${media.size + 1}${image ? '.jpg' : extname(shot.source)}`;
    const output = join(assets, name);
    if (image) {
      await sharp(shot.source).rotate().resize({
        width: 2560, height: 1440, fit: 'inside', withoutEnlargement: true,
      }).flatten({ background: '#100e13' }).jpeg({ quality: 93 }).toFile(output);
    } else {
      copyFileSync(shot.source, output);
    }
    media.set(shot.source, `assets/${name}`);
  }

  const layers = [];
  const motion = [];
  for (const [index, shot] of shots.entries()) {
    const name = `shot-${index + 1}`;
    const start = seconds(shot.startFrame);
    const duration = seconds(shot.endFrame - shot.startFrame);
    const clip = `data-start="${start}" data-duration="${duration}"`;
    if (shot.card) {
      cardLayer(name, shot.card, clip, layers, motion);
      continue;
    }
    const src = escape(media.get(shot.source));
    const center = `style="object-position:${shot.position || '50% 50%'}"`;
    if (shot.kind === 'video') {
      layers.push(`<video id="${name}" class="clip media" ${clip} data-track-index="0" src="${src}" muted playsinline preload="auto" data-media-start="${shot.sourceIn}" data-has-audio="false" ${center}></video>`);
    } else {
      layers.push(`<img id="${name}" class="clip media" ${clip} data-track-index="0" src="${src}" ${center} alt="">`);
      if (shot.push) {
        motion.push(`tl.fromTo('#${name}', {scale: 1}, {scale: ${shot.push}, transformOrigin: '${shot.position || '50% 50%'}', duration: ${duration}, ease: 'none', immediateRender: false}, ${start});`);
      }
    }
    if (shot.label) {
      const layout = shot.layout === 'title' ? 'title' : 'chapter';
      const hold = seconds(Math.min(shot.endFrame - shot.startFrame, 118));
      const titleClip = `data-start="${start}" data-duration="${hold}"`;
      layers.push(`<div id="${name}-treatment" class="clip treatment" ${titleClip} data-track-index="1" data-layout="${layout}"></div>`);
      layers.push(`<div id="${name}-label" class="clip chapter" ${titleClip} data-track-index="2" data-layout="${layout}">${escape(shot.label)}</div>`);
      motion.push(`tl.fromTo('#${name}-label', {opacity: 0, y: 18}, {opacity: 1, y: 0, duration: .32, ease: 'power2.out', immediateRender: false}, ${start});`);
    }
    const previous = shots[index - 1];
    transitionLayer(name, shot, previous, media.get(previous?.source), layers, motion);
  }

  const duration = seconds(shots.at(-1).endFrame);
  const watermarkFrames = (shots.find(shot => shot.layout === 'outro') || { startFrame: shots.at(-1).endFrame }).startFrame;
  if (watermarkFrames && brand.watermark.enabled) {
    const clip = `data-start="0" data-duration="${seconds(watermarkFrames)}" data-track-index="3"`;
    if (brandAssets.icon) {
      layers.push(`<img id="channel-watermark" class="clip watermark watermark-mark" ${clip} src="${brandAssets.icon}" alt="${escape(brand.displayName)}">`);
    } else {
      layers.push(`<div id="channel-watermark" class="clip watermark" ${clip}>${escape(brand.displayName)}</div>`);
    }
  }
  outroIdentity(shots.filter(shot => shot.layout === 'outro'), brand, brandAssets.lockup, layers, motion);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1920,height=1080">
<title>${escape(brand.displayName)}</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="studio.css">
<script src="vendor/gsap.min.js"></script>
</head>
<body>
<main id="studio" data-composition-id="${escape(brand.projectId)}" data-start="0" data-duration="${duration}" data-width="1920" data-height="1080" data-fps="30" style="${brandStyle}">
${layers.join('\n')}
</main>
<script>
const tl = gsap.timeline({ paused: true });
tl.to({}, { duration: ${duration} }, 0);
${motion.join('\n')}
window.__timelines = window.__timelines || {};
window.__timelines[${JSON.stringify(brand.projectId)}] = tl;
</script>
</body>
</html>
`;
  writeFileSync(join(directory, 'index.html'), html);
  writeFileSync(join(directory, 'hyperframes.json'), JSON.stringify({ media: { autoProxy: false } }));
}

export function render(directory, output) {
  hyperframes(['lint', directory]);
  hyperframes([
    'render', directory, '--output', output, '--fps', '30', '--format', 'mp4',
    '--quality', 'looks', '--workers', '1', '--sdr', '--no-best-effort',
    // The generated absolute timeline can exceed Studio's hand-editing density advisory.
    '--strict', '--no-browser-gpu',
  ], { label: 'gta-hyperframes-render' });
}
