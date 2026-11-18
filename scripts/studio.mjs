import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, render } from '../engine/composition/render.mjs';
import { dependency, run } from '../engine/runtime/node.mjs';

const [command, target, second, mode] = process.argv.slice(2);

try {
  if (command === 'doctor') {
    for (const name of ['hyperframes', 'gsap', 'sharp']) console.log(dependency(name));
    for (const name of ['ffmpeg', 'ffprobe']) {
      console.log(run(name, ['-version'], { capture: true }).stdout.split('\n')[0]);
    }
  } else if (command === 'smoke' && target && second) {
    const directory = mkdtempSync(join(tmpdir(), 'gta-studio-smoke-'));
    const video = extname(second).toLowerCase() === '.mp4';
    const shots = [
      { source: resolve(target), kind: 'image', label: 'Leonida', layout: 'title', startFrame: 0, endFrame: 54, push: 1.04 },
      { source: resolve(second), kind: video ? 'video' : 'image', sourceIn: video ? 0 : undefined, startFrame: 54, endFrame: 108 },
    ];
    const composition = join(directory, 'composition');
    const output = join(directory, 'landscape-smoke.mp4');
    await compile(composition, shots);
    render(composition, output);
    run('ffmpeg', ['-hide_banner', '-v', 'error', '-xerror', '-i', output, '-f', 'null', '-'], { label: 'gta-smoke-decode' });
    const format = JSON.parse(run('ffprobe', [
      '-v', 'error', '-of', 'json', '-show_streams', output,
    ], { capture: true }).stdout).streams.find(stream => stream.codec_type === 'video');
    if (format?.codec_name !== 'h264' || format.width !== 1920 || format.height !== 1080 ||
        format.avg_frame_rate !== '30/1' || Number(format.nb_frames) !== 108) {
      throw new Error('Smoke render format or frame count mismatch.');
    }
    console.log(`108 fully decoded H.264 frames at 1920×1080, 30 fps\n${output}`);
  } else if (command === 'outro' && target && second && existsSync(target)) {
    if (mode === '--worker') {
      if (!process.env.BAY_REFEREE_HEAVY_TOKEN) throw new Error('Outro worker requires the shared heavy-job lease.');
      const { buildOutro } = await import('../engine/episode.mjs');
      await buildOutro(resolve(target), resolve(second));
    } else {
      run(process.execPath, [fileURLToPath(import.meta.url), 'outro', resolve(target), resolve(second), '--worker'], {
        label: 'gta-outro-build',
      });
    }
  } else if (command === 'build' && target && existsSync(target) && second !== '--worker') {
    run(process.execPath, [fileURLToPath(import.meta.url), 'build', resolve(target), '--worker'], {
      label: 'gta-episode-build',
    });
  } else if (['preflight', 'plan', 'build'].includes(command) && target && existsSync(target)) {
    if (command === 'build' && !process.env.BAY_REFEREE_HEAVY_TOKEN) {
      throw new Error('Build worker requires the shared heavy-job lease. Run the build command without --worker.');
    }
    const episodeCommands = await import('../engine/episode.mjs');
    const episode = resolve(target);
    await episodeCommands[command](episode);
  } else {
    console.log('Usage: npm run studio -- doctor | preflight EPISODE | plan EPISODE | build EPISODE | outro EPISODE OUTPUT_DIRECTORY | smoke IMAGE IMAGE_OR_MP4');
    process.exitCode = command ? 2 : 0;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode || 1;
}
