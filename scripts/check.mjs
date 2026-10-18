import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['src','tests','scripts','examples']) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const r = spawnSync(process.execPath, ['--check', `${dir}/${entry.name}`], { stdio: 'inherit' });
    if (r.status !== 0) process.exit(1);
  }
}
