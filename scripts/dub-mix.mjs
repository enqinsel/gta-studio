import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { prepareFinalMix, measureLoudness, scorePlaybackGain } from '../engine/audio/final-mix.mjs';
import { run } from '../engine/runtime/node.mjs';

const [, , input] = process.argv;
if (!input) throw new Error('Usage: node scripts/dub-mix.mjs PLACED_VOICE.json');
const data = JSON.parse(readFileSync(input, 'utf8'));
const timeline = JSON.parse(readFileSync(join(data.picture, 'storyboard/timeline.json'), 'utf8'));
const cut = JSON.parse(readFileSync(join(data.picture, 'storyboard/cut.json'), 'utf8'));
const fps = timeline.fps;
const totalFrames = timeline.totalFrames;
const duration = totalFrames / fps;
const expectedSamples = Math.round(48000 * duration);
const work = resolve(dirname(input));
const edit = { rests: [], pictureFrame: frame => frame, bodyFrames: totalFrames - timeline.pacing.outroFrames };
const effects = timeline.audio.transitions.map(effect => ({ ...effect, source: join(data.picture, effect.path) }));
const score = timeline.audio.outro;
if (score && score.startFrame !== edit.bodyFrames) throw new Error('Score and picture clocks differ.');
const authority = { narration: data.narration, map: { sections: data.sections.map(({ words }) => ({ words })) } };
const mix = prepareFinalMix({ authority, edit, cue: score && join(data.picture, score.path),
  fps, effects, cueGain: cut.outro?.music?.gainDb, totalFrames, work, settings: cut.mix });
const mp3 = join(work, 'final-mix.mp3');
run('ffmpeg', ['-nostdin', '-hide_banner', '-v', 'error', '-y', '-i', mix.path, '-map', '0:a:0',
  '-c:a', 'libmp3lame', '-b:a', '320k', mp3], { label: 'gta-dub-mp3' });

function probe(file) {
  const { stdout } = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,sample_rate,channels,start_time,duration:format=duration',
    '-of', 'json', file], { capture: true });
  const { streams: [stream], format } = JSON.parse(stdout);
  const seconds = Number(stream.duration ?? format.duration);
  const { stdout: decodedFrames } = run('ffprobe', ['-v', 'error', '-select_streams', 'a:0',
    '-show_frames', '-show_entries', 'frame=nb_samples', '-of', 'csv=p=0', file], { capture: true });
  const decodedSamples = decodedFrames.trim().split('\n').reduce((sum, count) => sum + Number(count), 0);
  if (decodedSamples !== expectedSamples || stream.channels !== 2 || Number(stream.sample_rate) !== 48000) {
    throw new Error(`Dub format or length does not match the locked picture: ${file}`);
  }
  return { ...stream, duration: seconds, decodedSamples };
}

const report = {
  pictureSeconds: duration,
  wav: { path: mix.path, stream: probe(mix.path), measurements: mix.report.pcm },
  mp3: { path: mp3, stream: probe(mp3), measurements: measureLoudness(mp3) },
  bed: { originalScoreGainDb: scorePlaybackGain(cut.outro?.music?.gainDb, cut.mix), theme: score,
    transitions: mix.report.effects, hasOverlapWithScore: mix.report.music?.hasSpeechOverlap },
  dialogue: mix.report.narration,
};
if (report.mp3.measurements.truePeakDbtp > (cut.mix?.maxTruePeakDbtp ?? -1)) {
  throw new Error(`Encoded dub exceeds true-peak target: ${report.mp3.measurements.truePeakDbtp}`);
}
writeFileSync(join(work, 'mix-qa.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({duration, wav: report.wav.measurements, mp3: report.mp3.measurements}));
