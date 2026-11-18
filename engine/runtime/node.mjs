import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const pins = JSON.parse(readFileSync(join(root, 'package.json'))).dependencies;
const roots = process.env.GTA_NODE_MODULES
  ? [resolve(process.env.GTA_NODE_MODULES)]
  : [join(root, 'node_modules'), join(root, '../bay-referee/node_modules')];

export function dependency(name) {
  for (const modules of roots) {
    const manifest = join(modules, name, 'package.json');
    if (!existsSync(manifest)) continue;
    const { version } = JSON.parse(readFileSync(manifest));
    if (version === pins[name]) return dirname(manifest);
  }
  throw new Error(`Missing ${name}@${pins[name]}. Use the matching installed engine or GTA_NODE_MODULES.`);
}

const environment = {
  ...process.env,
  HYPERFRAMES_NO_TELEMETRY: '1',
  HYPERFRAMES_NO_UPDATE_CHECK: '1',
  HYPERFRAMES_NO_AUTO_INSTALL: '1',
  HYPERFRAMES_SKIP_SKILLS: '1',
  PYTHONDONTWRITEBYTECODE: '1',
  DO_NOT_TRACK: '1',
};
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!environment.HYPERFRAMES_BROWSER_PATH && existsSync(systemChrome)) {
  environment.HYPERFRAMES_BROWSER_PATH = systemChrome;
}

export function run(command, args, { label, capture = false } = {}) {
  const wrapped = label
    ? ['python3', [join(root, 'scripts/heavy-job.py'), '--label', label, '--', command, ...args]]
    : [command, args];
  const result = spawnSync(...wrapped, {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`${label || command} exited with status ${result.status}${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
    error.exitCode = result.status || 1;
    throw error;
  }
  return result;
}

export function hyperframes(args, options) {
  return run(process.execPath, [join(dependency('hyperframes'), 'bin/hyperframes.mjs'), ...args], options);
}

export function sharpLibrary() {
  const modules = dirname(dependency('sharp'));
  const require = createRequire(join(modules, 'gta-studio.cjs'));
  return require('sharp');
}
