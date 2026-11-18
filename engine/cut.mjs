import { writeFileSync } from 'node:fs';

const cueRate = 48000;

export function editClock(cut, authority, fps) {
  const voiceFrames = Math.ceil(authority.duration * fps);
  const words = authority.map.sections.flatMap(section => section.words).filter(word => word.matched);
  const rests = cut.rests || [];
  let previous = 0;
  for (const { atFrame, frames } of rests) {
    const point = atFrame / fps;
    if (!Number.isInteger(atFrame) || atFrame <= previous || atFrame >= voiceFrames ||
        !Number.isInteger(frames) || frames <= 0 ||
        words.some(word => word.start <= point + .025 && word.end >= point - .025)) {
      throw new Error(`A rest must be frame-aligned and fall between spoken words: frame ${atFrame}`);
    }
    previous = atFrame;
  }
  const closingFrames = cut.closingFrames ?? 0;
  if (!Number.isInteger(closingFrames) || closingFrames < 0) throw new Error('Closing hold must use whole frames.');
  const pictureFrame = frame => frame + rests.reduce((sum, rest) => sum + (rest.atFrame <= frame ? rest.frames : 0), 0);
  return { rests, closingFrames, pictureFrame, bodyFrames: pictureFrame(voiceFrames) + closingFrames };
}

function srtTime(seconds) {
  let ms = Math.round(seconds * 1000);
  const hours = Math.floor(ms / 3600000);
  ms %= 3600000;
  const minutes = Math.floor(ms / 60000);
  ms %= 60000;
  return [hours, minutes, Math.floor(ms / 1000)].map(part => String(part).padStart(2, '0')).join(':') +
    ',' + String(ms % 1000).padStart(3, '0');
}

export function retimeCaptions(path, { subtitle, map }, edit, fps) {
  const offset = (seconds, includeBoundary) => edit.rests.reduce((sum, rest) => {
    const point = rest.atFrame / fps;
    return sum + (seconds > point || (includeBoundary && seconds === point) ? rest.frames / fps : 0);
  }, 0);
  const words = map.sections.flatMap(section => section.words);
  let wordIndex = 0;
  const entries = subtitle.entries.flatMap(cue => {
    const tokens = cue.text.trim().split(/\s+/);
    const timed = words.slice(wordIndex, wordIndex + tokens.length);
    wordIndex += tokens.length;
    const gaps = edit.rests.map(rest => rest.atFrame / fps).filter(point => cue.start < point && cue.end > point);
    if (!gaps.length) return [cue];
    if (!timed.every((word, index) => word.matched && word.word === tokens[index]) || timed.length !== tokens.length) {
      throw new Error('A subtitle crossing an inserted rest could not be split on an aligned word.');
    }
    const result = [];
    let remaining = timed;
    let start = cue.start;
    for (const point of gaps) {
      const before = remaining.filter(word => word.end <= point);
      remaining = remaining.slice(before.length);
      if (before.length) result.push({ start, end: before.at(-1).end, text: captionText(before) });
      start = remaining[0]?.start;
    }
    if (remaining.length) result.push({ start, end: cue.end, text: captionText(remaining) });
    return result;
  });
  const text = entries.map(({ start, end, text }, index) =>
    `${index + 1}\n${srtTime(start + offset(start, true))} --> ${srtTime(end + offset(end, false))}\n${text}`
  ).join('\n\n') + '\n';
  writeFileSync(path, text);
}

function captionText(words) {
  const lines = [''];
  for (const { word } of words) {
    const line = lines.at(-1);
    if (line && line.length + 1 + word.length > 42) lines.push(word);
    else lines[lines.length - 1] = line ? `${line} ${word}` : word;
  }
  return lines.join('\n');
}

export function audioMix(edit, cuePath, fps, effects = [], cueGain = 0, {
  voiceInput = 1, musicStartFrame = edit.bodyFrames, duckMusic = false, busFilter = 'apad',
} = {}) {
  const tracks = [...effects];
  if (cuePath) tracks.push({ source: cuePath, startFrame: musicStartFrame, gainDb: cueGain, isMusic: true });
  if (!edit.rests.length && !tracks.length) return ['-map', `${voiceInput}:a:0`, '-af', busFilter];
  const filters = [];
  let narration = `[${voiceInput}:a]`;
  if (edit.rests.length) {
    const parts = [];
    const starts = [0, ...edit.rests.map(rest => rest.atFrame)];
    const inputs = starts.map((_, index) => `[take${index}]`);
    filters.push(`${narration}asplit=${inputs.length}${inputs.join('')}`);
    for (const [index, start] of starts.entries()) {
      const next = edit.rests[index];
      const stop = next ? `:end=${next.atFrame / fps}` : '';
      filters.push(`${inputs[index]}atrim=start=${start / fps}${stop},asetpts=PTS-STARTPTS[a${index}]`);
      parts.push(`[a${index}]`);
      if (next) {
        filters.push(`anullsrc=r=48000:cl=mono:d=${next.frames / fps}[gap${index}]`);
        parts.push(`[gap${index}]`);
      }
    }
    narration = '[narration]';
    filters.push(`${parts.join('')}concat=n=${parts.length}:v=0:a=1${narration}`);
  }
  if (tracks.length) {
    const useDucking = duckMusic && Boolean(cuePath);
    const split = useDucking ? ',asplit=2[lead][sidechain]' : '[lead]';
    filters.push(`${narration}aformat=sample_rates=${cueRate}:channel_layouts=stereo${split}`);
    if (useDucking) filters.push('[sidechain]apad[duckKey]');
    const labels = [];
    for (const [index, { startFrame, gainDb, isMusic, filters: trackFilters }] of tracks.entries()) {
      const delay = Math.round(startFrame / fps * cueRate);
      const label = `[cue${index}]`;
      const process = trackFilters ? `${trackFilters},` : '';
      filters.push(`[${index + voiceInput + 1}:a]aformat=sample_rates=${cueRate}:channel_layouts=stereo,${process}volume=${gainDb}dB,adelay=${delay}S:all=1${label}`);
      if (isMusic && useDucking) {
        filters.push(`${label}[duckKey]sidechaincompress=threshold=0.03:ratio=3:attack=22:release=280:makeup=1[duckedMusic]`);
        labels.push('[duckedMusic]');
      } else labels.push(label);
    }
    filters.push(`[lead]${labels.join('')}amix=inputs=${labels.length + 1}:normalize=0,${busFilter}[audio]`);
  } else {
    filters.push(`${narration}${busFilter}[audio]`);
  }
  return [...tracks.flatMap(track => ['-i', track.source]), '-filter_complex', filters.join(';'), '-map', '[audio]'];
}

export function writeOutroCue(path, seconds) {
  const samples = Math.round(seconds * cueRate);
  const pcm = Buffer.alloc(44 + samples * 2);
  const header = Buffer.from('524946460000000057415645666d7420100000000100010080bb000000770100020010006461746100000000', 'hex');
  pcm.set(header);
  pcm.writeUInt32LE(pcm.length - 8, 4);
  pcm.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const t = index / cueRate;
    const attack = Math.min(1, t / .52);
    const release = Math.min(1, Math.max(0, (seconds - t) / 1.55));
    const overtones = Math.sin(2 * Math.PI * 55 * t) * .031 + Math.sin(2 * Math.PI * 82.41 * t) * .029 +
      Math.sin(2 * Math.PI * 130.81 * t + .3 * Math.sin(2 * Math.PI * .24 * t)) * .025 +
      Math.sin(2 * Math.PI * 196 * t) * .012 * Math.exp(-t * .42);
    pcm.writeInt16LE(Math.round(32767 * overtones * attack ** 2 * release ** 2), 44 + index * 2);
  }
  writeFileSync(path, pcm);
}
