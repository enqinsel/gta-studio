import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { measureLoudness } from '../engine/audio/final-mix.mjs';
import { compile, render } from '../engine/composition/render.mjs';
import { run } from '../engine/runtime/node.mjs';

const timelineFile = 'storyboard/timeline.json';
const registerFile = 'assets/source-register.json';
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

function isWithin(directory, file) {
  const child = relative(directory, file);
  return child !== '..' && !child.startsWith('../') && !isAbsolute(child);
}

async function readFrozenPicture(directory, allowReencoded) {
  const [manifest, qa] = await Promise.all([
    json(join(directory, 'delivery/manifest.json')),
    json(join(directory, 'delivery/qa.json')),
  ]);
  if (qa.technical?.status !== 'PASS') throw new Error('The source revision has no approved technical picture QA.');
  const hashes = new Map(manifest.files.map(item => [item.path, item.sha256]));
  const [timeline, register] = await Promise.all([timelineFile, registerFile].map(async file => {
    const bytes = await readFile(join(directory, file));
    if (createHash('sha256').update(bytes).digest('hex') !== hashes.get(file)) {
      throw new Error(`Frozen revision document differs from its manifest: ${file}`);
    }
    return JSON.parse(bytes);
  }));
  if (timeline.fps !== 30 || timeline.fps !== qa.technical.fps || timeline.totalFrames !== qa.technical.frames) {
    throw new Error('The frozen timeline does not match its approved frame clock.');
  }
  const records = new Map(register.assets.map(asset => [asset.id, asset]));
  const sources = new Map();
  const missing = [];
  const receiptPath = join(directory, '_work/source-restore.json');
  const accepted = allowReencoded ? await json(receiptPath).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return { assets: [] };
  }) : { assets: [] };
  const restored = new Map(accepted.assets.map(asset => [asset.path, asset]));
  let end = 0;
  for (const shot of timeline.shots) {
    if (shot.startFrame !== end || !Number.isInteger(shot.endFrame) || shot.endFrame <= end) {
      throw new Error(`Discontinuous picture plan at shot ${shot.assetId}.`);
    }
    end = shot.endFrame;
    const record = records.get(shot.assetId);
    if (record?.path !== shot.path || record?.kind !== shot.kind || !['APPROVED', 'REVIEW'].includes(record?.rights_status)) {
      throw new Error(`Shot differs from its registered source: ${shot.assetId}.`);
    }
    if (sources.has(record.id)) continue;
    try {
      const source = await realpath(join(directory, record.path));
      if (!isWithin(directory, source) || !(await stat(source)).isFile()) {
        throw new Error(`Source is not a file inside this revision: ${record.path}.`);
      }
      const digest = await sha256(source);
      const receipt = restored.get(record.path);
      const verifiedRestore = record.kind === 'video' && receipt && record.original_sha256 &&
        digest === receipt.sha256 && record.original_sha256 === receipt.upstreamSha256 &&
        record.source_start_frame === receipt.sourceStartFrame && record.source_end_frame === receipt.sourceEndFrame;
      if (digest !== record.sha256 && !verifiedRestore) {
        throw new Error(`Source SHA-256 differs from the approved record: ${record.path}.`);
      }
      sources.set(record.id, source);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!missing.includes(record.path)) missing.push(record.path);
    }
  }
  if (end !== timeline.totalFrames) throw new Error('The final shot does not reach the approved end frame.');
  if (missing.length) throw new Error(`Restore these registered media files in the selected revision:\n${missing.join('\n')}`);
  return { frames: end, shots: timeline.shots.map(shot => ({ ...shot, source: sources.get(shot.assetId) })) };
}

function probe(path) {
  const { stdout } = run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { capture: true });
  return JSON.parse(stdout);
}

function checkEnglishMix(audio, frames) {
  const { streams: [stream, ...extra], format } = probe(audio);
  const duration = frames / 30;
  if (extra.length || format.format_name !== 'wav' || stream?.codec_type !== 'audio' ||
      !stream.codec_name.startsWith('pcm_') || stream.sample_rate !== '48000' || stream.channels !== 2 ||
      Math.abs(Number(stream.duration) - duration) > 1 / 48000 || !Number.isFinite(Number(stream.duration))) {
    throw new Error(`The English mix must be a stereo 48 kHz PCM WAV lasting ${duration.toFixed(3)} s.`);
  }
}

function checkPicture(path, frames, withAudio) {
  const { streams } = probe(path);
  const video = streams.find(stream => stream.codec_type === 'video');
  const audio = streams.find(stream => stream.codec_type === 'audio');
  const correctClock = stream => Number.isFinite(Number(stream.duration)) && stream.start_time === '0.000000' &&
    Math.abs(Number(stream.duration) - frames / 30) <= .001;
  if (streams.length !== (withAudio ? 2 : 1) || video?.codec_name !== 'h264' ||
      video.width !== 1920 || video.height !== 1080 || video.avg_frame_rate !== '30/1' ||
      Number(video.nb_frames) !== frames || !correctClock(video)) {
    throw new Error('The rebuilt picture does not match the approved dimensions, frame rate and frame count.');
  }
  if (withAudio && (audio?.codec_name !== 'aac' || audio.tags?.language !== 'eng' ||
      audio.sample_rate !== '48000' || audio.channels !== 2 || !correctClock(audio))) {
    throw new Error('The English AAC stream does not match the approved picture clock.');
  }
}

async function picturePackets(path) {
  const process = spawn('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_data_hash', 'SHA256',
    '-show_entries', 'packet=pts_time,dts_time,duration_time,size,data_hash', '-of', 'compact=p=0:nk=0', path,
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const status = new Promise((done, fail) => {
    process.once('error', fail);
    process.once('close', code => code === 0 ? done() : fail(new Error(`Cannot inspect the H.264 packets: ${path}`)));
  });
  const digest = async () => {
    const hash = createHash('sha256');
    let count = 0;
    for await (const bytes of process.stdout) {
      hash.update(bytes);
      count += bytes.toString().split('\n').length - 1;
    }
    return { hash: hash.digest('hex'), count };
  };
  const [result] = await Promise.all([digest(), status]);
  return result;
}

async function muxEnglish(picture, audio, destination, frames) {
  run('ffmpeg', [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', picture, '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0', '-map_metadata', '-1',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
    '-metadata:s:a:0', 'language=eng', '-disposition:a:0', 'default', '-movflags', '+faststart', destination,
  ], { label: 'gta-rebuild-english-mux' });
  checkPicture(destination, frames, true);
  const [before, after] = await Promise.all([picturePackets(picture), picturePackets(destination)]);
  if (before.count !== frames || after.count !== frames || before.hash !== after.hash) {
    throw new Error('AAC mux changed the rebuilt H.264 picture packets or timestamps.');
  }
  const { integratedLufs, truePeakDbtp } = measureLoudness(destination);
  if (truePeakDbtp > -1) throw new Error('The English AAC exceeds -1 dBTP.');
  console.log(`English AAC: ${integratedLufs} LUFS-I, ${truePeakDbtp} dBTP; ${frames} unchanged picture packets.`);
}

async function rebuild(directory, output, audio, allowReencoded) {
  const { frames, shots } = await readFrozenPicture(directory, allowReencoded);
  if (audio) checkEnglishMix(audio, frames);
  if (!output) {
    console.log(`${shots.length} shots, ${frames} frames; frozen timeline and source files verified.`);
    if (audio) console.log('English PCM mix frame duration verified.');
    return;
  }
  await mkdir(dirname(output), { recursive: true });
  output = join(await realpath(dirname(output)), basename(output));
  if (isWithin(directory, output)) throw new Error('Choose an output outside the frozen revision.');
  if (await lstat(output).catch(error => { if (error.code !== 'ENOENT') throw error; })) {
    throw new Error(`Choose a new output path; existing video preserved: ${output}`);
  }
  const work = await mkdtemp(join(dirname(output), '.gta-picture-'));
  try {
    const composition = join(work, 'composition');
    const picture = join(work, 'picture.mp4');
    await compile(composition, shots);
    render(composition, picture);
    checkPicture(picture, frames, false);
    const completed = audio ? join(work, 'english.mp4') : picture;
    if (audio) await muxEnglish(picture, audio, completed, frames);
    await link(completed, output);
    console.log(`Rebuilt ${frames} frames: ${output}`);
  } finally {
    await rm(work, { recursive: true });
  }
}

try {
  const { positionals: [revision, target, ...extra], values } = parseArgs({
    allowPositionals: true,
    options: { check: { type: 'boolean' }, audio: { type: 'string' }, 'allow-reencoded': { type: 'boolean' }, worker: { type: 'boolean' } },
  });
  const output = target?.endsWith('.mp4') && resolve(target);
  if (!revision || (values.check ? Boolean(target) : !output) || extra.length || values.audio === '') {
    throw new Error('Usage: node scripts/rebuild-picture.mjs REVISION (--check | OUTPUT.mp4) [--audio EN_MIX.wav] [--allow-reencoded]');
  }
  const audio = values.audio && resolve(values.audio);
  const directory = await realpath(resolve(revision));
  if (output && isWithin(directory, output)) {
    throw new Error(`Choose an output outside the frozen revision: ${basename(directory)}.`);
  }
  if (output && !values.worker) {
    const options = [...(audio ? ['--audio', audio] : []), ...(values['allow-reencoded'] ? ['--allow-reencoded'] : [])];
    run(process.execPath, [fileURLToPath(import.meta.url), directory, output, ...options, '--worker'], { label: 'gta-rebuild-picture' });
  } else {
    if (output && !process.env.BAY_REFEREE_HEAVY_TOKEN) throw new Error('The rebuild worker requires the shared heavy-job lease.');
    await rebuild(directory, output, audio, values['allow-reencoded']);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode || 1;
}
