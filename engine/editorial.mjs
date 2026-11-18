import { cardModes } from './composition/motion.mjs';

const revealLength = { mask: 9, slide: 10, focus: 8, fade: 8 };

export function resolveCard(card, shot, phraseFrame) {
  if (!card) return;
  if (!['directory', 'roster', 'scope'].includes(card.layout) ||
      !card.title?.trim() || !card.credit?.trim() || !card.items?.length) {
    throw new Error('A motion card needs a supported layout, heading, source and timed items.');
  }
  let previous = shot.startFrame;
  const items = card.items.map(item => {
    const mode = item.mode || 'fade';
    const offset = item.offset ?? 0;
    if (!cardModes.includes(mode) || !Number.isInteger(offset) || !item.label?.trim() || !item.on?.trim()) {
      throw new Error(`Invalid motion cue on ${card.title}.`);
    }
    const frame = phraseFrame(item.on) + offset;
    const revealFrames = revealLength[mode];
    if (!Number.isInteger(frame) || frame < previous || frame + revealFrames >= shot.endFrame) {
      throw new Error(`Motion cue "${item.label}" falls outside its card or out of order.`);
    }
    previous = frame;
    return { ...item, mode, frame, revealFrames };
  });
  return { ...card, items };
}

export function applyTransitions(shots, transitions, sounds) {
  const planned = new Set();
  for (const spec of transitions || []) {
    const i = shots.findIndex(shot => shot.sectionId === spec.sectionId);
    const shot = shots[i];
    const previous = shots[i - 1];
    const frames = spec.frames ?? 0;
    if (i < 1 || planned.has(spec.sectionId) || !['cut', 'focus', 'dissolve'].includes(spec.style) ||
        !Number.isInteger(frames) || frames < 0 || frames >= shot.endFrame - shot.startFrame ||
        (spec.style !== 'cut' && (!frames || shot.card || (spec.style === 'dissolve' && (previous.kind !== 'image' || previous.card))))) {
      throw new Error(`Invalid chapter transition for ${spec.sectionId}.`);
    }
    const offsetFrames = spec.sound?.offsetFrames ?? 0;
    if (!Number.isInteger(offsetFrames) || shot.startFrame + offsetFrames < 0) {
      throw new Error(`Invalid sound entry frame for ${spec.sectionId}.`);
    }
    planned.add(spec.sectionId);
    shot.transition = { style: spec.style, frames };
    const sound = sounds.get(spec.sectionId);
    if (sound) Object.assign(sound, { startFrame: shot.startFrame + offsetFrames });
  }
}

export function planOutro({ outro, used, brand, startFrame, fps }) {
  if (!outro) return [];
  const source = outro.shots || [{ assetId: outro.assetId, frames: Math.round(brand.outro.durationSeconds * fps), push: 1.035 }];
  const identityAt = outro.identityAt ?? 15;
  const matte = outro.matte ?? 0;
  let cursor = startFrame;
  const shots = source.map(({ assetId, frames, sourceIn, push }) => {
    const asset = used.get(assetId);
    const start = sourceIn ?? 0;
    if (!asset || !Number.isInteger(frames) || frames <= 0 || start < 0 || !Number.isFinite(start) ||
        (asset.kind === 'video' && start + frames / fps > asset.duration + .002) ||
        (push !== undefined && (!Number.isFinite(push) || push < 1 || push > 1.09))) {
      throw new Error(`Invalid source range for outro asset ${assetId}.`);
    }
    const shot = {
      sectionId: 'outro', layout: 'outro', kind: asset.kind, assetId, path: asset.path,
      source: asset.source, startFrame: cursor, endFrame: cursor + frames, push, sourceIn: start,
      sourceOut: asset.kind === 'video' ? start + frames / fps : undefined, purpose: `${brand.displayName} closing sequence.`,
    };
    cursor += frames;
    return shot;
  });
  if (!Number.isInteger(matte) || matte < 0 || matte >= 240) throw new Error('Invalid outro matte.');
  if (!shots.length || !Number.isInteger(identityAt) || identityAt < 0 || identityAt + Math.round(.78 * fps) >= cursor - startFrame) {
    throw new Error('Outro identity must have time to settle before the last frame.');
  }
  shots[0].identityAt = identityAt;
  shots[0].matte = matte;
  return shots;
}
