import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run, sharpLibrary } from '../engine/runtime/node.mjs';

const [, , input, ...windows] = process.argv;
if (!input) {
  console.error('Usage: node scripts/shot-review.mjs EPISODE [FIRST_FRAME:LAST_FRAME ...]');
  process.exit(2);
}
const episode = resolve(input);
const timeline = JSON.parse(readFileSync(join(episode, 'storyboard/timeline.json')));
if (!timeline.shots?.length) throw new Error('Episode timeline has no shots.');
const folder = mkdtempSync(join(episode, '_work/shot-review-'));
const width = 320;
const height = 180;
const columns = 4;
const boundaryFrames = timeline.shots.slice(1).flatMap(shot => [shot.startFrame - 1, shot.startFrame]);
const previewFrames = timeline.shots.map(shot => Math.min(shot.startFrame + 18, shot.endFrame - 1));
const motionFrames = timeline.shots.flatMap(shot => (shot.card?.items || []).flatMap(item => [
  Math.max(shot.startFrame, item.frame - 1), item.frame + item.revealFrames,
]));
const transitionFrames = timeline.shots.filter(shot => shot.transition).flatMap(shot => [
  shot.startFrame - 1, shot.startFrame + Math.floor(shot.transition.frames / 2), shot.startFrame + shot.transition.frames,
]);
const closing = timeline.shots.find(shot => shot.layout === 'outro');
if (closing?.identityAt !== undefined) {
  motionFrames.push(closing.startFrame + closing.identityAt - 1, timeline.totalFrames - 1);
}
const sheets = [['shot-overview', previewFrames], ['cut-boundaries', boundaryFrames],
  ['motion-cues', motionFrames], ['transition-easing', transitionFrames]];
for (const window of windows) {
  const match = /^(\d+):(\d+)$/.exec(window);
  if (!match) throw new Error(`Invalid review frame window: ${window}.`);
  const [, first, last] = match.map(Number);
  if (first > last || last >= timeline.totalFrames) throw new Error(`Review frame window is outside the episode: ${window}.`);
  for (let start = first; start <= last; start += 60) {
    const end = Math.min(start + 59, last);
    sheets.push([`frames-${start}-${end}`, Array.from({ length: end - start + 1 }, (_, index) => start + index)]);
  }
}
const list = [...new Set(sheets.flatMap(([, frames]) => frames))].sort((a, b) => a - b);
const sampleAt = new Map(list.map((frame, index) => [frame, index + 1]));
function selectFrames(frames) {
  if (frames.length === 1) return `eq(n,${frames[0]})`;
  const middle = Math.floor(frames.length / 2);
  return `max(${selectFrames(frames.slice(0, middle))},${selectFrames(frames.slice(middle))})`;
}
const filter = selectFrames(list);
run('ffmpeg', [
  '-hide_banner', '-v', 'error', '-xerror', '-i', join(episode, 'render/review-tr.mp4'),
  '-an', '-vf', `select='${filter}',scale=${width}:${height}`, '-fps_mode', 'vfr', join(folder, 'frame-%03d.png'),
], { label: 'gta-visual-review-frames' });
const sharp = sharpLibrary();
const imageAt = frame => join(folder, `frame-${String(sampleAt.get(frame)).padStart(3, '0')}.png`);
writeFileSync(join(folder, 'frame-index.json'), JSON.stringify({ fps: timeline.fps, frames: list,
  sheets: Object.fromEntries(sheets.filter(([, frames]) => frames.length)) }, null, 2) + '\n');
for (const [name, frames] of sheets) {
  if (!frames.length) continue;
  const rows = Math.ceil(frames.length / columns);
  const sheet = await sharp({
    create: { width: width * columns, height: height * rows, channels: 3, background: '#080b14' },
  }).composite(frames.map((frame, index) => ({
    input: imageAt(frame), left: (index % columns) * width, top: Math.floor(index / columns) * height,
  }))).jpeg({ quality: 88 }).toFile(join(folder, `${name}.jpg`));
  console.log(`${join(folder, name)}.jpg (${sheet.width}×${sheet.height})`);
}
