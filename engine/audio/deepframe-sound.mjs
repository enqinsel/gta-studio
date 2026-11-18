import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sampleRate = 48000;
const channels = 2;
const tau = Math.PI * 2;

const ease = progress => {
  const clipped = Math.max(0, Math.min(1, progress));
  return (1 - Math.cos(Math.PI * clipped)) / 2;
};
const envelope = (time, start, end, attack, release) =>
  ease((time - start) / attack) * ease((end - time) / release);
const frequency = note => 440 * 2 ** ((note - 69) / 12);

function noiseSource(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2147483648 - 1;
  };
}

function synthesize(file, duration, targetPeak, signal) {
  const samplesPerChannel = Math.round(sampleRate * duration);
  const samples = new Float32Array(samplesPerChannel * channels);
  let peak = 0;
  for (let index = 0; index < samplesPerChannel; index++) {
    const values = signal(index / sampleRate);
    for (let channel = 0; channel < channels; channel++) {
      samples[index * channels + channel] = values[channel];
      peak = Math.max(peak, Math.abs(values[channel]));
    }
  }
  if (!Number.isFinite(peak) || peak <= 0) throw new Error('Invalid sound synthesis signal.');
  const bytesPerSample = 3;
  const dataBytes = samples.length * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);

  const gain = 10 ** (targetPeak / 20) / peak;
  let energy = 0;
  for (const [index, sample] of samples.entries()) {
    const value = Math.round(sample * gain * 8388607);
    buffer.writeIntLE(value, 44 + index * bytesPerSample, bytesPerSample);
    energy += (value / 8388607) ** 2;
  }
  writeFileSync(file, buffer);
  return {
    file: basename(file), duration: samplesPerChannel / sampleRate,
    sampleRate, channels, bitDepth: 24, peakDbfs: targetPeak,
    rmsDbfs: Number((10 * Math.log10(energy / samples.length)).toFixed(2)),
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

function swell(duration, cut, logo) {
  const chords = [
    { start: 0, end: cut + 0.5, attack: 1, release: 1.05, notes: [38, 50, 57, 64] },
    { start: Math.max(0, cut - 0.5), end: logo + 0.55, attack: 0.92, release: 0.98, notes: [34, 53, 57, 62, 64] },
    { start: Math.max(cut, logo - 0.33), end: duration, attack: 0.61, release: 1.25, notes: [38, 50, 53, 57, 64] },
  ].map(chord => ({ ...chord, tones: chord.notes.map(frequency) }));
  const notes = [
    { at: cut * 0.42, tone: frequency(69), weight: 0.085 },
    { at: cut * 0.79, tone: frequency(76), weight: 0.07 },
    { at: logo, tone: frequency(74), weight: 0.11 },
  ];
  const random = noiseSource(75);
  let air = 0;
  return time => {
    let center = 0;
    let side = 0;
    const building = ease((time - cut * 0.54) / Math.max(0.5, logo - cut * 0.54));
    for (const chord of chords) {
      const level = envelope(time, chord.start, chord.end, chord.attack, chord.release);
      if (!level) continue;
      const localTime = time - chord.start;
      for (const [index, tone] of chord.tones.entries()) {
        const fundamental = tau * tone * localTime;
        const phase = fundamental + index * 0.7 + 0.21 * Math.sin(tau * 0.31 * localTime + index);
        const texture = 0.06 + building * 0.12;
        const volume = level * (index === 0 ? 0.095 : 0.059) * (0.42 + building * 0.58);
        center += volume * (Math.sin(phase) + texture * Math.sin(phase * 2) + 0.039 * Math.sin(phase * 3));
        side += volume * 0.28 * Math.sin(phase + tau * (0.26 + index * 0.11) * localTime);
      }
    }
    for (const note of notes) {
      for (const [repeat, delay] of [0, 0.27, 0.51].entries()) {
        const age = time - note.at - delay;
        if (age < 0 || age > 3.2) continue;
        const phase = tau * note.tone * age;
        const body = note.weight * ease(age / 0.032) * Math.exp(-age * 1.58) / (1 + repeat * 2.6);
        const pluck = body * (Math.sin(phase) + 0.18 * Math.sin(phase * 2.003));
        center += pluck;
        side += repeat ? pluck * (repeat === 1 ? 0.36 : -0.36) : 0;
      }
    }
    const tail = ease((duration - time) / 0.62);
    air += (random() - air) * 0.034;
    const risingAir = air * 0.068 * envelope(time, cut * 0.48, logo + 0.43, Math.max(0.4, logo - cut * 0.66), 0.5);
    const arrivalTime = time - logo;
    const arrival = arrivalTime >= 0
      ? 0.09 * ease(arrivalTime / 0.05) * Math.exp(-arrivalTime * 2.8) *
        Math.sin(tau * (52 * arrivalTime + 1.1 * (1 - Math.exp(-arrivalTime * 7)))) : 0;
    return [(center + side + risingAir + arrival) * tail, (center - side + risingAir - side * 0.08 + arrival) * tail];
  };
}

function airAcquisition(duration, water) {
  const laneLeft = noiseSource(water ? 146 : 91);
  const laneRight = noiseSource(water ? 720 : 398);
  const filters = [0, 0];
  const lowpasses = [0, 0];
  return time => {
    const progress = time / duration;
    const level = envelope(time, 0, duration, water ? 0.25 : 0.44, water ? 0.48 : 0.43);
    return [laneLeft(), laneRight()].map((fresh, channel) => {
      const ripple = water
        ? 0.63 + 0.16 * Math.sin(tau * 5.4 * time + channel * 0.8) + 0.18 * Math.sin(tau * 9.7 * time + channel)
        : 0.9;
      filters[channel] += (fresh - filters[channel]) * (0.058 + progress * 0.113);
      lowpasses[channel] += (fresh - lowpasses[channel]) * 0.021;
      return level * ripple * (lowpasses[channel] * 0.56 + (filters[channel] - lowpasses[channel]) * (water ? 0.8 : 1.1));
    });
  };
}

function softArrival(duration, impact) {
  const noise = noiseSource(9769);
  let low = 0;
  return time => {
    low += (noise() - low) * 0.085;
    const air = low * 0.32 * envelope(time, 0, duration, impact, 0.49);
    const age = time - impact;
    const weight = age >= 0
      ? ease(age / 0.05) * Math.exp(-age * 6.9) * ease((duration - time) / 0.2) : 0;
    const tone = weight * (Math.sin(tau * (46 * age + 3.6 * (1 - Math.exp(-age * 6.5)))) +
      0.13 * Math.sin(tau * 101 * age));
    return [tone + air, tone + air * 0.91];
  };
}

export function renderDeepFrameSound(dir, { outroFrames, cityCutFrame, logoFrame, fps = 30 }) {
  if (![outroFrames, cityCutFrame, logoFrame, fps].every(Number.isInteger) ||
      fps <= 0 || !(0 < cityCutFrame && cityCutFrame < logoFrame && logoFrame < outroFrames)) {
    throw new Error('The score requires increasing cut, logo and end frames at a positive frame rate.');
  }
  mkdirSync(dir, { recursive: true });
  const duration = outroFrames / fps;
  const score = synthesize(join(dir, 'deepframe-outro-score.wav'), duration, -12.5,
    swell(duration, cityCutFrame / fps, logoFrame / fps));
  const waterDuration = 0.85;
  const impactDuration = 0.8;
  const summitDuration = 0.95;
  const effects = [
    {
      sectionId: 'leonida-keys', cueOffset: 0.33, suggestedGainDb: 0,
      ...synthesize(join(dir, 'deepframe-water-air.wav'), waterDuration, -31.0, airAcquisition(waterDuration, true)),
    },
    {
      sectionId: 'port-gellhorn', cueOffset: 0.26, suggestedGainDb: -2,
      ...synthesize(join(dir, 'deepframe-soft-arrival.wav'), impactDuration, -30.0, softArrival(impactDuration, 0.26)),
    },
    {
      sectionId: 'mount-kalaga', cueOffset: 0.45, suggestedGainDb: 0,
      ...synthesize(join(dir, 'deepframe-summit-air.wav'), summitDuration, -33.0, airAcquisition(summitDuration, false)),
    },
  ];
  const register = {
    score: { ...score, outroFrames, cityCutFrame, logoFrame, fps, suggestedGainDb: 0 },
    effects,
    origin: 'Original synthesis using oscillators and deterministic noise. No imported music or source audio.',
    recipe: 'engine/audio/deepframe-sound.mjs',
    rights_status: 'APPROVED',
  };
  writeFileSync(join(dir, 'sound-register.json'), JSON.stringify(register, null, 2) + '\n');
  return register;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , output, frames, cityCut, logo] = process.argv;
  if (!output) throw new Error('Usage: node engine/audio/deepframe-sound.mjs OUTPUT_DIR END_FRAME CUT_FRAME LOGO_FRAME');
  renderDeepFrameSound(output, { outroFrames: Number(frames), cityCutFrame: Number(cityCut), logoFrame: Number(logo) });
}
