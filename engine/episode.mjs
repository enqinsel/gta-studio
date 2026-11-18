import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, readSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { compile, render, studioBrand } from './composition/render.mjs';
import { audioMix, editClock, retimeCaptions, writeOutroCue } from './cut.mjs';
import { measureLoudness, prepareFinalMix, scorePlaybackGain } from './audio/final-mix.mjs';
import { applyTransitions, planOutro, resolveCard } from './editorial.mjs';
import { run } from './runtime/node.mjs';

const fps = 30;
const json = path => JSON.parse(readFileSync(path, 'utf8'));
function digest(path) {
  const sha256 = createHash('sha256');
  const file = openSync(path, 'r');
  const chunk = Buffer.alloc(1024 * 1024);
  try {
    let bytes;
    while ((bytes = readSync(file, chunk, 0, chunk.length, null))) sha256.update(chunk.subarray(0, bytes));
    return sha256.digest('hex');
  } finally {
    closeSync(file);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
function save(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n');
  renameSync(temporary, path);
}
function probe(path) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-of', 'json', '-show_streams', '-show_format', path], {
    capture: true,
  }).stdout);
}
function index(records, field = 'id') {
  assert(Array.isArray(records), 'Expected an array of records.');
  const entries = new Map();
  for (const record of records) {
    const id = record[field];
    assert(typeof id === 'string' && id.length && !entries.has(id), `Missing or duplicate ID: ${id}`);
    entries.set(id, record);
  }
  return entries;
}
function words(value) {
  return String(value).normalize('NFC').toLocaleLowerCase('tr').match(/[\p{L}\p{M}\p{N}]+/gu) || [];
}
function findAnchor(items, phrase) {
  const target = words(phrase);
  const haystack = items.flatMap((item, index) => words(item.word).map(token => ({ token, index })));
  const hits = haystack.filter((item, index) => target.every((token, offset) => haystack[index + offset]?.token === token));
  assert(target.length > 0 && hits.length === 1, `Edit anchor must occur exactly once: "${phrase}"`);
  const first = hits[0].index;
  const at = haystack.indexOf(hits[0]);
  return items.slice(first, haystack[at + target.length - 1].index + 1);
}

function verifiedPath(episode, { path, sha256 }, label) {
  assert(typeof path === 'string' && path.length && typeof sha256 === 'string', `Missing source path or hash: ${label}`);
  const source = realpathSync(join(episode, path));
  const inside = relative(realpathSync(episode), source);
  assert(!inside.startsWith('..') && !isAbsolute(inside), `Asset escapes episode directory: ${label}`);
  assert(digest(source) === sha256, `Source SHA-256 mismatch: ${label}`);
  return source;
}

export function preflight(episode, { writeReport = true } = {}) {
  const sections = json(join(episode, 'script/script-tr.json'));
  const scriptIndex = index(sections);
  const coverage = index(json(join(episode, 'storyboard/coverage.json')));
  const claims = index(json(join(episode, 'research/claims.json')));
  const register = index(json(join(episode, 'assets/source-register.json')).assets);
  const cutPath = join(episode, 'storyboard/cut.json');
  const cut = existsSync(cutPath) ? json(cutPath) : {};
  const used = new Map();
  assert(sections.length && coverage.size === sections.length, 'Coverage and script sections differ.');

  function loadAsset(id) {
    if (used.has(id)) return used.get(id);
    const asset = register.get(id);
    assert(asset && ['image', 'video'].includes(asset.kind), `Missing usable asset: ${id}`);
    assert(['APPROVED', 'REVIEW'].includes(asset.rights_status), `Prohibited or unreviewed rights state: ${id}`);
    assert(asset.source_url?.startsWith('https://') && asset.original_url?.startsWith('https://') &&
      asset.publisher && asset.provenance, `Incomplete provenance: ${id}`);
    const source = verifiedPath(episode, asset, id);
    const info = probe(source);
    const stream = info.streams.find(item => item.codec_type === 'video');
    assert(stream?.width && stream?.height, `Asset has no readable picture: ${id}`);
    const record = { ...asset, source, duration: Number(stream.duration || info.format.duration) };
    used.set(id, record);
    return record;
  }

  const records = [];
  for (const [id, section] of scriptIndex) {
    const plan = coverage.get(id);
    assert(section.text?.trim() && section.claim_ids?.length && plan?.shots?.length, `Incomplete script or media coverage: ${id}`);
    for (const claimId of section.claim_ids) {
      const claim = claims.get(claimId);
      assert(claim && ['OFFICIALLY_CONFIRMED', 'OBSERVED', 'INDEPENDENTLY_VERIFIED', 'INFERENCE', 'UNKNOWN'].includes(claim.status) &&
        claim.sources?.length && claim.sources.every(source => source.url?.startsWith('https://')),
      `Missing permissible claim or source: ${claimId}`);
    }
    const scriptTokens = words(section.text).map(word => ({ word }));
    let previousAnchor = -1;
    const mapped = plan.shots.map((shot, offset) => {
      const asset = loadAsset(shot.asset_id);
      assert(shot.purpose?.trim(), `No editorial purpose in ${id}/${offset + 1}`);
      assert(!shot.card || asset.kind === 'image', `A motion card needs a registered editorial graphic: ${asset.id}`);
      if (offset === 0) {
        assert(!shot.on, `First shot has a timing anchor in ${id}`);
      } else {
        const [firstAnchorWord] = findAnchor(scriptTokens, shot.on);
        const anchorIndex = scriptTokens.indexOf(firstAnchorWord);
        assert(anchorIndex > previousAnchor && anchorIndex > 0, `Unordered edit anchor in ${id}: ${shot.on}`);
        previousAnchor = anchorIndex;
      }
      assert(!shot.position || /^\d{1,3}% \d{1,3}%$/.test(shot.position), `Invalid crop position: ${asset.id}`);
      assert(shot.push === undefined || (Number.isFinite(shot.push) && shot.push >= 1 && shot.push <= 1.09),
        `Invalid documentary push: ${asset.id}`);
      if (asset.kind === 'video') {
        const sourceIn = shot.source_in ?? 0;
        assert(Number.isFinite(sourceIn) && sourceIn >= 0 && Number.isFinite(shot.source_out) &&
          shot.source_out > sourceIn && shot.source_out <= asset.duration + 0.034,
        `Missing or out-of-bounds video in/out: ${asset.id}`);
        assert(shot.fallback_asset_id && loadAsset(shot.fallback_asset_id).kind === 'image',
          `An evidence still is required for longer speech holds: ${asset.id}`);
      } else {
        assert(!shot.fallback_asset_id, `Still has a redundant fallback: ${asset.id}`);
      }
      const fallback = used.get(shot.fallback_asset_id);
      return {
        ...shot, local_path: asset.path, source_url: asset.source_url, sha256: asset.sha256, rights_status: asset.rights_status,
        fallback: fallback && { local_path: fallback.path, source_url: fallback.source_url, sha256: fallback.sha256, rights_status: fallback.rights_status },
      };
    });
    records.push({ id, claim_ids: section.claim_ids, shots: mapped });
  }
  const outro = cut.outro ? (cut.outro.shots || [cut.outro]).map(item => loadAsset(item.assetId)) : [];
  function loadSound(item) {
    const source = verifiedPath(episode, item, item.path);
    const audio = probe(source);
    const gainDb = item.gainDb ?? 0;
    const duration = Number(audio.format.duration);
    assert(audio.streams.some(stream => stream.codec_type === 'audio') && duration > 0 &&
      Number.isFinite(gainDb) && gainDb <= 0, `Invalid original sound cue: ${item.path}`);
    return { path: item.path, source, sha256: item.sha256, gainDb, duration };
  }
  const score = cut.outro?.music ? loadSound(cut.outro.music) : undefined;
  const sounds = new Map((cut.transitions || []).filter(spec => spec.sound)
    .map(spec => [spec.sectionId, loadSound(spec.sound)]));
  if (writeReport) {
    save(join(episode, 'storyboard/claim-to-media.json'), {
      status: 'PASS', sections: records,
      outro: outro.map(asset => ({ asset_id: asset.id, local_path: asset.path, source_url: asset.source_url, sha256: asset.sha256 })),
    });
  }
  console.log(`Media preflight passed for ${records.length} sections with ${used.size} source files.`);
  return { sections, used, coverage, cut, score, sounds };
}

function captionsEnd(path, duration) {
  const text = readFileSync(path, 'utf8').replaceAll('\r', '').trim();
  const toSeconds = ([, hours, minutes, seconds, milliseconds]) =>
    Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000;
  const timestamp = /^(\d{2,}):(\d{2}):(\d{2}),(\d{3})$/;
  let previous = 0;
  const cues = text.split(/\n\n+/);
  const entries = [];
  for (const [index, cue] of cues.entries()) {
    const [number, timing = '', ...lines] = cue.split('\n');
    const [left, right] = timing.split(' --> ').map(value => value.match(timestamp));
    assert(Number(number) === index + 1 && left && right && lines.some(line => line.trim()), `Invalid SRT cue: ${index + 1}`);
    const start = toSeconds(left);
    const end = toSeconds(right);
    assert(start >= previous && end > start && end <= duration + 0.05, `Out-of-order SRT cue: ${index + 1}`);
    entries.push({ start, end, text: lines.join('\n') });
    previous = end;
  }
  return { end: previous, cues: cues.length, entries };
}

function timing(episode, sections, cut) {
  const narration = join(episode, 'audio/tr/narration-tr.wav');
  const captions = join(episode, cut.rests?.length ? 'captions/tr-source.srt' : 'captions/tr.srt');
  const whisper = join(episode, 'audio/tr/whisper-tr.json');
  const map = json(join(episode, 'audio/tr/word-map-tr.json'));
  const raw = json(whisper);
  const voice = json(join(episode, 'audio/tr/provider-job.json'));
  const hash = digest(narration);
  const scriptHash = digest(join(episode, 'script/script-tr.json'));
  assert(map.audio_sha256 === hash && map.script_sha256 === scriptHash && map.whisper_sha256 === digest(whisper),
    'Word timing belongs to a different narration or script.');
  assert(raw._provenance?.audio_sha256 === hash && raw._provenance.model === 'medium' &&
    raw.language === 'tr' && raw._provenance.word_timestamps === true, 'Whisper medium TR timing evidence failed.');
  assert(voice.status === 'COMPLETED' && voice.provider === 'Higgsfield' && voice.model === 'elevenlabs_v4' &&
    voice.voice?.name === 'Engin' && voice.voice.type === 'element' && voice.voice.identity_matches_bay_referee === true &&
    voice.settings?.stability === 0.5 && voice.settings.similarity_boost === 0.75 && voice.settings.batch_size === 1 &&
    voice.audio_sha256 === hash && voice.script_sha256 === scriptHash && voice.completion?.status === 'completed',
  'Final Engin provider, settings or source hashes did not match.');
  const audio = probe(narration);
  const duration = Number(audio.streams.find(stream => stream.codec_type === 'audio')?.duration || audio.format.duration);
  assert(Number.isFinite(duration) && duration > 0, 'Narration has no playable audio.');
  const aligned = index(map.sections);
  assert(aligned.size === sections.length, 'Word map and script sections differ.');
  let previous = -1;
  for (const { id } of sections) {
    const section = aligned.get(id);
    assert(section && Number.isFinite(section.start) && Number.isFinite(section.end) && section.start > previous &&
      section.end > section.start && section.end <= duration + 0.05 && section.words?.length,
    `Missing or unordered sections in speech alignment: ${id}`);
    previous = section.start;
  }
  const subtitle = captionsEnd(captions, duration);
  const lastEnd = aligned.get(sections.at(-1).id).end;
  assert(subtitle.end >= lastEnd - 0.1 && subtitle.cues === map.subtitle_cues, 'The SRT differs from the word alignment.');
  return { narration, subtitle, map, hash, aligned, duration };
}

function makeTimeline({ sections, used, coverage, cut, score, sounds }, authority) {
  const shots = [];
  const semantic = [];
  const brand = studioBrand();
  const edit = editClock(cut, authority, fps);
  const pictureAt = time => edit.pictureFrame(Math.round(time * fps));
  for (const [position, section] of sections.entries()) {
    const measured = authority.aligned.get(section.id);
    const startFrame = position === 0 ? 0 : pictureAt(measured.start);
    const next = sections[position + 1];
    const endFrame = next ? pictureAt(authority.aligned.get(next.id).start) : edit.bodyFrames;
    semantic.push({ id: section.id, voiceStart: measured.start, voiceEnd: measured.end, startFrame, endFrame, claim_ids: section.claim_ids });
    const wordTime = phrase => findAnchor(measured.words, phrase).find(word => Number.isFinite(word.start))?.start;

    const edits = coverage.get(section.id).shots.map((shot, offset) => {
      const anchor = offset
        ? wordTime(shot.on)
        : measured.start;
      assert(Number.isFinite(anchor), `Unmatched spoken edit anchor in ${section.id}: ${shot.on}`);
      const frame = offset ? pictureAt(anchor) : startFrame;
      return { ...shot, frame };
    });
    for (const [offset, edit] of edits.entries()) {
      const start = edit.frame;
      const end = edits[offset + 1]?.frame ?? endFrame;
      assert(start >= startFrame && end <= endFrame && end > start, `Invalid timed edit in ${section.id} at frame ${start}`);
      const asset = used.get(edit.asset_id);
      const sourceIn = edit.source_in ?? 0;
      const available = asset.kind === 'video' ? Math.floor((edit.source_out - sourceIn) * fps + 1e-7) : end - start;
      const clipEnd = Math.min(start + available, end);
      assert(clipEnd > start, `Empty evidence clip: ${asset.id}`);
      const shot = {
        sectionId: section.id, label: offset ? undefined : section.label, layout: position === 0 ? 'title' : 'chapter',
        assetId: asset.id, path: asset.path, source: asset.source, kind: asset.kind, purpose: edit.purpose,
        startFrame: start, endFrame: clipEnd, sourceIn: asset.kind === 'video' ? sourceIn : undefined,
        sourceOut: asset.kind === 'video' ? sourceIn + (clipEnd - start) / fps : undefined,
        position: edit.position, push: edit.push, accent: edit.accent,
      };
      shot.card = resolveCard(edit.card, shot, phrase => pictureAt(wordTime(phrase)));
      shots.push(shot);
      if (clipEnd < end) {
        const still = used.get(edit.fallback_asset_id);
        shots.push({
          sectionId: section.id, assetId: still.id, path: still.path, source: still.source, kind: 'image',
          purpose: edit.purpose, startFrame: clipEnd, endFrame: end,
        });
      }
    }
  }
  applyTransitions(shots, cut.transitions, sounds);
  shots.push(...planOutro({ outro: cut.outro, used, brand, startFrame: edit.bodyFrames, fps }));
  const totalFrames = shots.at(-1).endFrame;
  assert(!score || Math.abs(score.duration - (totalFrames - edit.bodyFrames) / fps) <= .05,
    'The outro picture and music durations differ.');
  return { shots, semantic, totalFrames, edit, brand };
}

function checkRender(path, frames, withAudio) {
  const info = probe(path);
  const video = info.streams.find(stream => stream.codec_type === 'video');
  const audio = info.streams.find(stream => stream.codec_type === 'audio');
  assert(video?.codec_name === 'h264' && video.width === 1920 && video.height === 1080 &&
    video.avg_frame_rate === '30/1' && Number(video.nb_frames) === frames, 'Video codec, dimensions, fps or frame count failed.');
  assert(withAudio ? audio?.codec_name === 'aac' : !audio, 'Unexpected audio stream.');
  if (withAudio) {
    assert(Math.abs(Number(audio.duration) - Number(video.duration)) <= 0.05, 'Muxed tracks have different durations.');
  }
  return { duration: Number(video.duration), frames, width: video.width, height: video.height, fps, codec: video.codec_name, audio: audio?.codec_name };
}

function packageDelivery(episode, qa, used) {
  const qaPath = 'delivery/qa.json';
  save(join(episode, qaPath), qa);
  const paths = [
    'render/review-tr.mp4', 'render/master-clean-1920x1080.mp4', 'captions/tr.srt',
    'outro/outro-1920x1080.mp4', 'outro/outro.png', 'outro/outro.wav',
    'composition/assets/brand-icon.svg', 'composition/assets/brand-lockup.svg',
    'assets/brand/valea-mark.svg', 'assets/brand/valea-mark.png',
    'assets/brand/valea-lockup.svg', 'assets/brand/valea-lockup.png',
    'delivery/audio-mix.json',
    'research/edit-reference.md',
    'script/script-tr.json', 'audio/tr/narration-tr.wav', 'audio/tr/whisper-tr.json', 'audio/tr/word-map-tr.json',
    'research/claims.json', 'assets/source-register.json', 'storyboard/timeline.json', 'storyboard/cut.json', qaPath,
  ];
  const covers = join(episode, 'covers');
  if (existsSync(covers)) {
    paths.push(...readdirSync(covers).filter(name => name.endsWith('.png') || name === 'cover-register.json')
      .map(name => `covers/${name}`));
  }
  const inventory = paths.filter(path => existsSync(join(episode, path)))
    .map(path => ({ path, sha256: digest(join(episode, path)) }));
  const cover = json(join(episode, 'assets/source-register.json')).cover;
  save(join(episode, 'delivery/manifest.json'), { status: qa.status, files: inventory, cover });
  const reviews = qa.rights_review_asset_ids.map(id => {
    const asset = used.get(id);
    return `- ${id} · [Rockstar kaynak kaydı](${asset.source_url})`;
  });
  writeFileSync(join(episode, 'delivery/asset-rights-review.md'), [
    '# Görsel kullanım durumu', '',
    'Aşağıdaki materyaller yerel inceleme kurgusunda kullanıldı. Kamuya açık yayımdan önce kullanım statüleri incelenmeli.', '',
    ...reviews, '',
    existsSync(join(episode, 'covers/cover-register.json'))
      ? 'Kapakların kaynak ve kullanım bilgisi [kapak sicilinde](../covers/cover-register.json) bulunur.'
      : 'Görsel kaynak ve düzenleme bilgisi [görsel sicilinde](../assets/source-register.json) bulunur.', '',
  ].join('\n'));
}

export function plan(episode) {
  const evidence = preflight(episode);
  const authority = timing(episode, evidence.sections, evidence.cut);
  const timeline = makeTimeline(evidence, authority);
  const { shots, semantic, totalFrames } = timeline;
  save(join(episode, 'storyboard/semantic-beats.json'), { audio_sha256: authority.hash, sections: semantic });
  save(join(episode, 'storyboard/timeline.json'), {
    fps, totalFrames, audio_sha256: authority.hash, pacing: {
      rests: timeline.edit.rests, closingFrames: timeline.edit.closingFrames,
      outroFrames: totalFrames - timeline.edit.bodyFrames,
    }, audio: {
      outro: evidence.score && { path: evidence.score.path, sha256: evidence.score.sha256, startFrame: timeline.edit.bodyFrames },
      transitions: [...evidence.sounds.values()].map(({ source, ...item }) => item),
      mix: evidence.cut.mix,
    }, shots: shots.map(({ source, ...shot }) => shot),
  });
  console.log(`${shots.length} shots linked to ${totalFrames} measured frames.`);
  return { evidence, authority, ...timeline };
}

function outputDirectory(episode) {
  const renderDir = join(episode, 'render');
  for (const path of [join(episode, 'composition'), join(renderDir, 'review-tr.mp4'), join(renderDir, 'master-clean-1920x1080.mp4')]) {
    assert(!existsSync(path), `Existing release artifact preserved. Build a new take with separate output paths: ${path}`);
  }
  return renderDir;
}

export async function build(episode) {
  outputDirectory(episode);
  const planResult = plan(episode);
  const workRoot = join(episode, '_work');
  mkdirSync(workRoot, { recursive: true });
  const work = mkdtempSync(join(workRoot, 'render-'));
  const composition = join(work, 'composition');
  const picture = join(work, 'master-clean-1920x1080.mp4');
  await compile(composition, planResult.shots, planResult.brand);
  render(composition, picture);
  finishBuild(episode, work, planResult);
}

function prepareCue(directory, score, frames) {
  const cue = join(directory, 'outro.wav');
  mkdirSync(directory, { recursive: true });
  if (score) copyFileSync(score.source, cue);
  else writeOutroCue(cue, frames / fps);
  return cue;
}

function exportOutro(directory, picture, cue, startFrame, endFrame, identityAt, gainDb = 0) {
  const frames = endFrame - startFrame;
  const output = join(directory, 'outro-1920x1080.mp4');
  run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-ss', (startFrame / fps).toFixed(6), '-i', picture,
    '-i', cue, '-map', '0:v:0', '-map', '1:a:0', '-frames:v', String(frames),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-c:a', 'aac', '-b:a', '192k',
    '-af', `volume=${gainDb}dB`, '-movflags', '+faststart', output], { label: 'gta-standalone-outro' });
  const qa = checkRender(output, frames, true);
  const mark = Math.min(frames - 1, identityAt + fps) / fps;
  run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-ss', mark.toFixed(6), '-i', output, '-frames:v', '1',
    '-update', '1', join(directory, 'outro.png')], { label: 'gta-outro-art' });
  return qa;
}

export async function buildOutro(episode, output) {
  assert(!existsSync(output), 'Choose a new directory for the standalone outro.');
  const { cut, used, score } = preflight(episode, { writeReport: false });
  const brand = studioBrand();
  const shots = planOutro({ outro: cut.outro, used, brand, startFrame: 0, fps });
  assert(shots.length, 'This episode has no configured outro.');
  const frames = shots.at(-1).endFrame;
  assert(!score || Math.abs(score.duration - frames / fps) <= .05, 'The outro picture and music durations differ.');
  const parent = dirname(output);
  mkdirSync(parent, { recursive: true });
  const work = mkdtempSync(join(parent, '.outro-'));
  const composition = join(work, 'composition');
  const picture = join(work, 'picture.mp4');
  const exportDirectory = join(work, 'exports');
  await compile(composition, shots, brand);
  render(composition, picture);
  const cue = prepareCue(exportDirectory, score, frames);
  const gain = cut.mix ? scorePlaybackGain(score?.gainDb, cut.mix) : score?.gainDb;
  const qa = exportOutro(exportDirectory, picture, cue, 0, frames, shots[0].identityAt, gain);
  renameSync(exportDirectory, output);
  console.log(`Standalone outro validated at ${qa.duration}s: ${output}`);
}

export function finishBuild(episode, work, { evidence, authority, shots, totalFrames, edit }) {
  const renderDir = outputDirectory(episode);
  const composition = join(work, 'composition');
  const picture = join(work, 'master-clean-1920x1080.mp4');
  const review = join(work, 'review-tr.mp4');
  const outro = evidence.cut.outro ? join(work, 'outro') : undefined;
  assert(!outro || !existsSync(join(episode, 'outro')), 'Existing standalone outro preserved.');
  const cue = outro && prepareCue(outro, evidence.score, totalFrames - edit.bodyFrames);
  checkRender(picture, totalFrames, false);
  const effects = [...evidence.sounds.values()];
  const mix = evidence.cut.mix && prepareFinalMix({ authority, edit, cue, fps, effects,
    cueGain: evidence.score?.gainDb, totalFrames, work, settings: evidence.cut.mix });
  const audioInput = mix
    ? ['-i', mix.path, '-map', '1:a:0']
    : ['-i', authority.narration, ...audioMix(edit, cue, fps, effects, evidence.score?.gainDb)];
  run('ffmpeg', [
    '-hide_banner', '-v', 'error', '-xerror', '-i', picture, ...audioInput,
    '-map', '0:v:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', (totalFrames / fps).toFixed(6), '-movflags', '+faststart', review,
  ], { label: 'gta-review-audio-mux' });
  const technical = checkRender(review, totalFrames, true);
  if (mix) {
    mix.report.decodedAac = measureLoudness(review);
    save(join(work, 'audio-mix.json'), mix.report);
    const { integratedLufs, truePeakDbtp } = mix.report.decodedAac;
    assert(Math.abs(integratedLufs - mix.report.target.integratedLufs) <= 1 &&
      truePeakDbtp <= mix.report.target.maxTruePeakDbtp,
    `Decoded AAC loudness or true peak missed the target: ${integratedLufs} LUFS, ${truePeakDbtp} dBTP.`);
  }
  const decode = run('ffmpeg', [
    '-hide_banner', '-nostats', '-loglevel', 'info', '-xerror', '-i', review,
    '-vf', 'blackdetect=d=0.15:pix_th=0.08:pic_th=0.98', '-af', 'volumedetect', '-f', 'null', '-',
  ], { label: 'gta-review-full-decode', capture: true }).stderr;
  const peak = decode.match(/max_volume:\s+(-?[\d.]+) dB/)?.[1];
  const mean = decode.match(/mean_volume:\s+(-?[\d.]+) dB/)?.[1];
  assert(peak !== undefined && Number(peak) < 0 && Number(peak) > -20, 'Mix peak is clipped, silent or out of range.');
  const black = decode.split('\n').filter(line => line.includes('black_start:'));
  assert(!black.length, `Unexpected near-black frames: ${black.join(' ')}`);

  const captionFile = join(episode, 'captions/tr.srt');
  if (edit.rests.length) retimeCaptions(captionFile, authority, edit, fps);
  const { end: subtitleEnd, cues: subtitleCues } = captionsEnd(captionFile, technical.duration);

  let outroQA;
  if (outro) {
    const { identityAt } = shots.find(shot => shot.layout === 'outro');
    outroQA = exportOutro(outro, picture, cue, edit.bodyFrames, totalFrames, identityAt, mix?.scoreGainDb ?? evidence.score?.gainDb);
    if (mix) mix.report.standaloneOutro = measureLoudness(join(outro, 'outro-1920x1080.mp4'));
    renameSync(outro, join(episode, 'outro'));
  }
  mkdirSync(renderDir, { recursive: true });
  renameSync(composition, join(episode, 'composition'));
  renameSync(picture, join(renderDir, 'master-clean-1920x1080.mp4'));
  renameSync(review, join(renderDir, 'review-tr.mp4'));
  if (mix) save(join(episode, 'delivery/audio-mix.json'), mix.report);
  const rightsReview = [...new Set(shots.map(shot => shot.assetId))]
    .filter(id => evidence.used.get(id).rights_status === 'REVIEW');
  packageDelivery(episode, {
    status: rightsReview.length ? 'RIGHTS_REVIEW' : 'LOCAL_REVIEW',
    technical: { status: 'PASS', ...technical, full_decode: true, black_intervals: black, peak_dbfs: Number(peak), mean_dbfs: Number(mean),
      loudness: mix?.report.decodedAac },
    fact_and_media: 'PASS_MACHINE_LINKS',
    audio_sha256: authority.hash,
    outro: outroQA,
    subtitles: {
      status: authority.map.status === 'PASS' ? 'PASS_MACHINE' : 'REVIEW_NEEDED',
      timing: 'PASS_MACHINE', coverage: authority.map.coverage, alignment: authority.map.status,
      end: subtitleEnd, cues: subtitleCues,
    },
    visual_and_listening_review: 'PENDING',
    rights_review_asset_ids: rightsReview,
  }, evidence.used);
  console.log(`Review MP4 validated at ${technical.duration}s: ${join(renderDir, 'review-tr.mp4')}`);
}
