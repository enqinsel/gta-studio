import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { audioMix } from '../cut.mjs';
import { run } from '../runtime/node.mjs';

const sampleRate = 48000;
const voiceFilters = [
  'highpass=f=65',
  'equalizer=f=245:t=o:w=1.15:g=-1.3',
  'equalizer=f=2800:t=o:w=1.3:g=1.4',
  'acompressor=threshold=0.112:ratio=1.9:attack=14:release=145:knee=2.5',
];

function ffmpeg(args, label, capture = false) {
  return run('ffmpeg', ['-nostdin', '-hide_banner', '-nostats', ...args], { label, capture });
}

export function measureLoudness(path, { filters = [] } = {}) {
  const meter = 'ebur128=peak=true:framelog=verbose';
  const { stderr } = ffmpeg([
    '-i', path, '-map', '0:a:0', '-af', [...filters, meter].join(','), '-f', 'null', '-',
  ], 'gta-audio-r128', true);
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const read = (pattern, label) => {
    const result = pattern.exec(summary);
    if (!result) throw new Error(`Can’t measure ${label} on ${basename(path)}.`);
    return Number(result[1]);
  };
  return {
    integratedLufs: read(/\bI:\s*(-?[\d.]+) LUFS/, 'integrated loudness'),
    rangeLu: read(/\bLRA:\s*(-?[\d.]+) LU/, 'loudness range'),
    truePeakDbtp: read(/\bPeak:\s*(-?[\d.]+) dBFS/, 'true peak'),
  };
}

export function scorePlaybackGain(cueGain = 0, settings = {}) {
  return cueGain + (settings.scoreGainDb ?? 0);
}

export function prepareFinalMix({ authority, edit, cue, fps, effects = [], cueGain, totalFrames, work, settings = {} }) {
  const targetLufs = settings.targetLufs ?? -15;
  const maxTruePeakDbtp = settings.maxTruePeakDbtp ?? -1;
  const episodeSamples = Math.round(totalFrames / fps * sampleRate);
  const scoreStartFrame = settings.musicStartFrame ?? edit.bodyFrames;
  if (!Number.isFinite(targetLufs) || !Number.isFinite(maxTruePeakDbtp) || maxTruePeakDbtp > 0 ||
      !Number.isInteger(scoreStartFrame) || scoreStartFrame < 0 || episodeSamples <= 0 ||
      !Number.isFinite(scorePlaybackGain(cueGain, settings))) {
    throw new Error('Invalid loudness target, score gain or mix duration.');
  }
  mkdirSync(work, { recursive: true });
  const conditioned = join(work, 'narration-conditioned.wav');
  const path = join(work, 'final-mix.wav');
  const originalVoice = measureLoudness(authority.narration);
  const eqVoice = measureLoudness(authority.narration, { filters: voiceFilters });
  const gainDb = Number((targetLufs - eqVoice.integratedLufs).toFixed(2));
  ffmpeg([
    '-y', '-v', 'error', '-i', authority.narration, '-map', '0:a:0',
    '-af', [...voiceFilters, `volume=${gainDb}dB`].join(','), '-ar', String(sampleRate), '-c:a', 'pcm_f32le', conditioned,
  ], 'gta-audio-dialogue');

  const lastWord = Math.max(...authority.map.sections.flatMap(section => section.words.filter(word => word.matched).map(word => word.end)));
  const lastSpeechFrame = edit.pictureFrame(Math.ceil(lastWord * fps));
  const musicOverlapsSpeech = Boolean(cue) && scoreStartFrame < lastSpeechFrame;
  const scoreGainDb = scorePlaybackGain(cueGain, settings);
  const mixedEffects = effects.map(effect => {
    const name = basename(effect.path ?? effect.source);
    const adjustmentDb = settings.effectsGainDb?.[name] ?? 0;
    if (!Number.isFinite(adjustmentDb)) throw new Error(`Invalid gain for ${effect.path ?? effect.source}.`);
    const presence = settings.effectsPresence?.[name];
    if (presence && (!Number.isFinite(presence.frequencyHz) || presence.frequencyHz <= 0 ||
        presence.frequencyHz >= sampleRate / 2 || !Number.isFinite(presence.gainDb))) {
      throw new Error(`Invalid presence shelf for ${name}.`);
    }
    return {
      ...effect, gainDb: effect.gainDb + adjustmentDb, adjustmentDb, presence,
      filters: presence ? `highshelf=f=${presence.frequencyHz}:g=${presence.gainDb}:t=q:w=0.71` : undefined,
    };
  });
  // Four-times oversampling treats inter-sample peaks before the AAC encoder adds its own overshoot.
  const pcmCeiling = maxTruePeakDbtp - .8;
  const amplitude = (10 ** (pcmCeiling / 20)).toFixed(7);
  const busFilter = `aformat=channel_layouts=stereo,aresample=192000,alimiter=limit=${amplitude}:attack=5:release=70:level=false:latency=true,aresample=48000,apad,atrim=end_sample=${episodeSamples}`;
  const mixArgs = audioMix(edit, cue, fps, mixedEffects, scoreGainDb, {
    voiceInput: 0,
    musicStartFrame: scoreStartFrame,
    duckMusic: musicOverlapsSpeech,
    busFilter,
  });
  ffmpeg(['-y', '-v', 'error', '-i', conditioned, ...mixArgs, '-c:a', 'pcm_s24le', path], 'gta-audio-final-bus');
  const report = {
    method: 'FFmpeg EBU R128 with oversampled true peak, stereo 48 kHz PCM premaster',
    target: { integratedLufs: targetLufs, maxTruePeakDbtp, pcmCeilingDbtp: pcmCeiling },
    narration: { original: originalVoice, conditionedBeforeGain: eqVoice, gainDb, filters: voiceFilters,
      conditioned: measureLoudness(conditioned), lastSpeechFrame },
    effects: mixedEffects.map(effect => ({
      path: effect.path ?? basename(effect.source), startFrame: effect.startFrame, duration: effect.duration,
      gainDb: effect.gainDb, adjustmentDb: effect.adjustmentDb, presence: effect.presence,
      source: measureLoudness(effect.source),
    })),
    music: cue && { startFrame: scoreStartFrame, gainDb: scoreGainDb, hasSpeechOverlap: musicOverlapsSpeech,
      ducked: musicOverlapsSpeech, source: measureLoudness(cue) },
    pcm: measureLoudness(path),
  };
  return { path, report, scoreGainDb };
}
