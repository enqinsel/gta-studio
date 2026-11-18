const fps = 30;
export const seconds = frames => (frames / fps).toFixed(6);
export const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const entrances = {
  slide: '{opacity: 0, y: 18}',
  mask: '{opacity: 0, clipPath: "inset(0 95% 0 0)"}',
  focus: '{opacity: 0, scale: .975}',
  fade: '{opacity: 0}',
};
export const cardModes = Object.keys(entrances);

export function cardLayer(name, card, clip, layers, motion) {
  const marks = card.items.map(({ label, detail }, index) => {
    const id = `${name}-item-${index + 1}`;
    const sub = detail ? `<span class="card-detail">${escape(detail)}</span>` : '';
    return `<div id="${id}" class="card-item">${escape(label)}${sub}</div>`;
  }).join('');
  layers.push(`<article id="${name}-card" class="clip motion-card" ${clip} data-track-index="0" data-layout="${card.layout}">
    ${card.kicker ? `<div class="card-kicker">${escape(card.kicker)}</div>` : ''}
    <h2>${escape(card.title)}</h2>
    <div class="card-grid">${marks}</div>
    <div class="card-credit">${escape(card.credit)}</div>
  </article>`);
  let previous;
  for (const [index, item] of card.items.entries()) {
    const id = `#${name}-item-${index + 1}`;
    const start = seconds(item.frame);
    motion.push(`tl.fromTo('${id}', ${entrances[item.mode]}, {opacity: 1, y: 0, scale: 1, clipPath: "inset(0 0% 0 0)", duration: ${seconds(item.revealFrames)}, ease: 'power2.out', immediateRender: false}, ${start});`);
    if (card.layout === 'roster') {
      if (previous) motion.push(`tl.to('${previous}', {color: '#d1bdb3', duration: .23, ease: 'none'}, ${start});`);
      previous = id;
    }
  }
}

export function transitionLayer(name, shot, previous, previousSrc, layers, motion) {
  const timing = shot.transition;
  if (!timing || timing.style === 'cut') return;
  const start = seconds(shot.startFrame);
  const duration = seconds(timing.frames);
  if (timing.style === 'focus') {
    motion.push(`tl.fromTo('#${name}', {filter: "blur(5px) brightness(.85)"}, {filter: "blur(0px) brightness(1)", duration: ${duration}, ease: 'power2.out', immediateRender: false}, ${start});`);
    return;
  }
  const index = '#'+name+'-dissolve';
  const position = previous.position || '50% 50%';
  layers.push(`<img id="${name}-dissolve" class="clip media dissolve" data-start="${start}" data-duration="${duration}" data-track-index="1" src="${escape(previousSrc)}" style="object-position:${position};transform-origin:${position};transform:scale(${previous.push || 1})" alt="">`);
  motion.push(`tl.fromTo('${index}', {opacity: 1}, {opacity: 0, duration: ${duration}, ease: 'sine.inOut', immediateRender: false}, ${start});`);
}

export function outroIdentity(shots, brand, lockup, layers, motion) {
  if (!shots.length) return;
  const startFrame = shots[0].startFrame;
  const stopFrame = shots.at(-1).endFrame;
  const start = seconds(startFrame);
  const duration = seconds(stopFrame - startFrame);
  const clip = `data-start="${start}" data-duration="${duration}"`;
  layers.push(`<div id="outro-background" class="clip outro-veil" ${clip} data-track-index="4"></div>`);
  if (shots[0].matte) {
    layers.push(`<div id="outro-matte" class="clip outro-matte" ${clip} data-track-index="6" style="--matte:${shots[0].matte}px"></div>`);
  }
  const visual = lockup ? `<img src="${lockup}" alt="${escape(brand.displayName)}">` : escape(brand.displayName);
  layers.push(`<div id="outro-identity" class="clip outro-identity" ${clip} data-track-index="5">${visual}</div>`);
  const anchor = seconds(startFrame + (shots[0].identityAt ?? 15));
  motion.push(`tl.fromTo('#outro-background', {opacity: .14}, {opacity: .9, duration: .9, ease: 'sine.inOut', immediateRender: false}, ${anchor});`);
  motion.push(`tl.fromTo('#outro-identity', {opacity: 0, clipPath: "inset(0 0 18% 0)", y: 8}, {opacity: 1, clipPath: "inset(0 0 0% 0)", y: 0, duration: .78, ease: 'power2.out', immediateRender: false}, ${anchor});`);
}
