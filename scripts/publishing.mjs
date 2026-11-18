import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { constants, copyFile, link, lstat, mkdir, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureLoudness } from '../engine/audio/final-mix.mjs';
import { run } from '../engine/runtime/node.mjs';

const repository = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const lockedPicture = 'render/master-clean-1920x1080.mp4';
const turkishTest = 'render/review-tr.mp4';
const areas = [
  '00_brief', '01_script', '02_audio', '03_video', '04_captions', '05_cover', '06_social', '07_assets', '08_delivery', '_work',
];
const frozenFiles = [
  ['research/claims.json', '01_script/claims-sources.json'],
  ['assets/source-register.json', '07_assets/asset-manifest.json'],
  ['research/source-notes.md', '07_assets/sources.md'],
  ['storyboard/timeline.json', '07_assets/timeline.json'],
  ['delivery/manifest.json', '07_assets/master-source-manifest.json'],
];
const optionalFiles = [
  ['script/script-tr.md', '01_script/script-tr.md'],
  ['script/script-tr.json', '01_script/script-tr.json'],
  ['audio/tr/narration-tr.wav', '02_audio/tr/narration-tr.wav'],
  ['audio/tr/provider-job.json', '02_audio/tr/provider-job.json'],
  ['audio/tr/whisper-tr.json', '02_audio/tr/whisper-tr.json'],
  ['audio/tr/word-map-tr.json', '02_audio/tr/word-map-tr.json'],
  ['captions/tr.srt', '04_captions/captions-tr.srt'],
  ['audio/tr/whisper-spelling-review.json', '02_audio/tr/whisper-spelling-review.json'],
  ['delivery/audio-mix.json', '02_audio/tr/audio-mix.json'],
  ['delivery/audio-mix-validation.json', '02_audio/tr/audio-mix-validation.json'],
  ['captions/tr-source.srt', '04_captions/captions-tr-source.srt'],
  ['assets/audio/sound-register.json', '07_assets/audio/sound-register.json'],
  ['research/edit-reference.md', '07_assets/edit-reference.md'],
  ['storyboard/cut.json', '07_assets/cut.json'],
  ['storyboard/semantic-beats.json', '07_assets/semantic-beats.json'],
  ['storyboard/claim-to-media.json', '07_assets/claim-to-media.json'],
  ['storyboard/outro-media.json', '07_assets/outro-media.json'],
];

const json = async path => JSON.parse(await readFile(path, 'utf8'));
const jsonText = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = file => new Promise((done, fail) => {
  const hash = createHash('sha256');
  const input = createReadStream(file);
  input.on('data', chunk => hash.update(chunk));
  input.on('end', () => done(hash.digest('hex')));
  input.on('error', fail);
});
async function entry(path) {
  try { return await lstat(path); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function checkedDirectory(path) {
  if (!await entry(path)) {
    await checkedDirectory(dirname(path));
    try { await mkdir(path); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) {
    throw new Error(`Expected a physical publishing path: ${path}`);
  }
}
function isInside(base, path) {
  const rel = relative(base, path);
  return rel && rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
}
async function sourceFile(revision, file) {
  const path = await realpath(resolve(revision, file));
  if (!isInside(revision, path) || !(await lstat(path)).isFile()) throw new Error(`Invalid revision file: ${file}`);
  return path;
}

async function put(path, hash, stage) {
  await checkedDirectory(dirname(path));
  async function verifyExisting() {
    const current = await entry(path);
    if (!current) return false;
    if (!current.isFile() || await digest(path) !== hash) throw new Error(`Existing file differs; preserved: ${path}`);
    return true;
  }
  if (await verifyExisting()) return;
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await stage(temporary);
    if (await digest(temporary) !== hash) throw new Error(`Copy verification failed: ${path}`);
    try { await link(temporary, path); } catch (error) {
      if (error.code !== 'EEXIST' || !await verifyExisting()) throw error;
    }
  } finally {
    if (await entry(temporary)) await unlink(temporary);
  }
}

function packageDirectory(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Provide a lowercase slug separated by hyphens.');
  return join(repository, 'videolar', slug);
}

async function prepare(requestedRevision, slug) {
  const revision = await realpath(resolve(requestedRevision));
  const destination = packageDirectory(slug);
  if (isInside(revision, destination) || isInside(destination, revision) || revision === destination) {
    throw new Error('Revision and publishing destination must be separate.');
  }
  const [manifest, qa, timeline] = await Promise.all([
    sourceFile(revision, 'delivery/manifest.json').then(json),
    sourceFile(revision, 'delivery/qa.json').then(json),
    sourceFile(revision, 'storyboard/timeline.json').then(json),
  ]);
  if (qa.technical?.status !== 'PASS' || qa.technical.frames !== timeline.totalFrames || qa.technical.fps !== timeline.fps) {
    throw new Error('Revision picture and technical QA do not agree.');
  }
  const checksums = new Map(manifest.files.map(item => [item.path, item.sha256]));
  if (checksums.has('delivery/qa.json') && await digest(join(revision, 'delivery/qa.json')) !== checksums.get('delivery/qa.json')) {
    throw new Error('Technical QA differs from the revision manifest.');
  }
  const files = [...frozenFiles, [lockedPicture, null, 'locked-picture']];
  if (await entry(join(revision, turkishTest))) files.push([turkishTest, null, 'tr-test-mp4']);
  for (const record of optionalFiles) if (await entry(join(revision, record[0]))) files.push(record);
  const audioCues = [...(timeline.audio?.transitions ?? []), timeline.audio?.outro].filter(Boolean);
  for (const cue of new Map(audioCues.map(value => [value.path, value])).values()) {
    if (typeof cue.path !== 'string' || !cue.path.startsWith('assets/audio/') || !cue.sha256) {
      throw new Error('Timeline audio cues must have a source path and SHA-256.');
    }
    if (checksums.has(cue.path) && checksums.get(cue.path) !== cue.sha256) {
      throw new Error(`Timeline cue differs from the revision manifest: ${cue.path}`);
    }
    files.push([cue.path, `07_assets/audio/${basename(cue.path)}`]);
    if (!checksums.has(cue.path)) checksums.set(cue.path, cue.sha256);
  }

  const inventory = [];
  const outputs = new Set();
  for (const [file, output, role] of files) {
    if (output && outputs.has(output)) throw new Error(`Two source files share a publishing destination: ${output}`);
    if (output) outputs.add(output);
    const path = await sourceFile(revision, file);
    const sha256 = await digest(path);
    const expected = checksums.get(file);
    if (expected && sha256 !== expected) throw new Error(`Revision checksum differs: ${file}`);
    inventory.push({ file, output, role, path, sha256 });
  }
  const topicFolders = [revision];
  if (basename(dirname(revision)) === 'revisions') topicFolders.push(dirname(dirname(revision)));
  let topic = slug;
  for (const folder of topicFolders) {
    const file = join(folder, 'social/title-en.txt');
    if (!(await entry(file))?.isFile()) continue;
    topic = (await readFile(file, 'utf8')).trim() || topic;
    break;
  }
  const origin = isInside(repository, revision) ? relative(repository, revision) : revision;
  const generated = [
    ['00_brief/topic.txt', `${topic}\n`],
    ['00_brief/brief.md', `# ${topic}\n\nİngilizce yayın videosu, ${basename(revision)} sürümünün onaylı görüntüsünü kullanır. Kaynak ve kurgu referansları [varlık sicilinde](../07_assets/provenance.json).\n`],
    ['00_brief/episode.json', jsonText({
      schemaVersion: 1, channel: 'VALEA', slug, topic, sourceRevision: origin, status: manifest.status,
      masterLanguage: 'en', originalAudioLanguage: 'en', alternateAudioLanguages: ['tr', 'es', 'de'],
      picture: { source: lockedPicture, path: `03_video/${slug}-valea-en.mp4`,
        width: qa.technical.width, height: qa.technical.height, fps: timeline.fps, frames: timeline.totalFrames },
    })],
    ['07_assets/provenance.json', jsonText({
      schemaVersion: 1, sourceRevision: origin, sourceStatus: manifest.status,
      pathBasis: 'The paths embedded in source records are relative to the frozen source revision.',
      files: inventory.map(({ file, output, role, sha256 }) => ({
        source: file, ...(output ? { path: output } : { role }), sha256,
      })),
    })],
  ];

  for (const area of areas) await checkedDirectory(join(destination, area));
  for (const { output, path, sha256 } of inventory) {
    if (output) {
      await put(join(destination, output), sha256, temporary => copyFile(path, temporary, constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL));
    }
  }
  for (const [output, body] of generated) {
    await put(join(destination, output), createHash('sha256').update(body).digest('hex'), temporary => writeFile(temporary, body, { flag: 'wx' }));
  }
  console.log(`${inventory.length} frozen files verified in ${destination}`);
}

function videoPackets(file) {
  const { stdout } = run('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_data_hash', 'SHA256',
    '-show_entries', 'packet=pts_time,dts_time,duration_time,size,data_hash', '-of', 'compact=p=0:nk=0', file,
  ], { capture: true });
  const packets = stdout.trim().split('\n');
  if (!packets[0]?.includes('data_hash=SHA256:')) throw new Error(`No verifiable video packets in ${file}`);
  return { sha256: createHash('sha256').update(stdout).digest('hex'), count: packets.length };
}

async function mux(slug) {
  const packageRoot = packageDirectory(slug);
  const [episode, provenance, aligned] = await Promise.all([
    json(join(packageRoot, '00_brief/episode.json')),
    json(join(packageRoot, '07_assets/provenance.json')),
    json(join(packageRoot, '02_audio/en/dub-qa.json')),
  ]);
  const publishPath = `03_video/${slug}-valea-en.mp4`;
  const source = provenance.files.find(item => item.role === 'locked-picture' && item.source === episode.picture.source);
  if (episode.originalAudioLanguage !== 'en' || episode.picture.path !== publishPath || !source) {
    throw new Error('Prepare the English publishing package before muxing.');
  }
  const picture = await sourceFile(resolve(repository, provenance.sourceRevision), source.source);
  const wav = join(packageRoot, '02_audio/en/youtube-dub-en.wav');
  const [sourcePictureSha256, englishMixSha256] = await Promise.all([digest(picture), digest(wav)]);
  if (sourcePictureSha256 !== source.sha256 || aligned.whisperModel !== 'medium' ||
      englishMixSha256 !== aligned.finalWhisperInputSha256) {
    throw new Error('The original picture or final aligned English mix differs from its recorded hash.');
  }
  const work = await mkdtemp(join(packageRoot, '_work/upload-'));
  try {
    const staged = join(work, 'upload.mp4');
    run('ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', picture, '-i', wav,
      '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '-1',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
      '-metadata:s:a:0', 'language=eng', '-disposition:a:0', 'default', '-movflags', '+faststart', staged,
    ], { label: 'gta-mux-en' });
    const originalPackets = videoPackets(picture);
    const muxedPackets = videoPackets(staged);
    if (originalPackets.sha256 !== muxedPackets.sha256 || muxedPackets.count !== episode.picture.frames) {
      throw new Error('The mux differs from the locked picture packets or clock.');
    }
    const { stdout } = run('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0', '-show_entries',
      'stream=codec_name,sample_rate,channels,start_time,duration:stream_tags=language', '-of', 'json', staged,
    ], { capture: true });
    const { streams: [audio] } = JSON.parse(stdout);
    const duration = episode.picture.frames / episode.picture.fps;
    if (audio?.codec_name !== 'aac' || audio?.tags?.language !== 'eng' || audio.sample_rate !== '48000' ||
        audio.channels !== 2 || Number(audio.start_time) !== 0 || Math.abs(Number(audio.duration) - duration) > .001) {
      throw new Error('The AAC stream does not match the English upload and picture clock.');
    }
    const measurements = measureLoudness(staged);
    if (measurements.truePeakDbtp > -1) throw new Error('The upload exceeds −1 dBTP.');
    const sha256 = await digest(staged);
    await put(join(packageRoot, publishPath), sha256, temporary => link(staged, temporary));
    const receipt = jsonText({
      path: publishPath, sha256, sourcePictureSha256, englishMixSha256,
      videoPacketSha256: muxedPackets.sha256, videoPacketCount: muxedPackets.count,
      audioLanguage: audio.tags.language, duration, measurements,
    });
    await put(join(packageRoot, '08_delivery/upload-video-qa.json'), createHash('sha256').update(receipt).digest('hex'),
      temporary => writeFile(temporary, receipt, { flag: 'wx' }));
    console.log(`${publishPath} · ${muxedPackets.count} unchanged picture packets · ${duration.toFixed(3)} s`);
  } finally {
    await rm(work, { recursive: true });
  }
}

const [, , action, ...args] = process.argv;
try {
  if (action === 'prepare' && args.length === 2) await prepare(...args);
  else if (action === 'mux' && args.length === 1) await mux(...args);
  else throw new Error('Usage: node scripts/publishing.mjs prepare REVISION SLUG | mux SLUG');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
