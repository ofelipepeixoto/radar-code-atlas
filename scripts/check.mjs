import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['src', 'tests', 'scripts', 'examples']) {
  // Git does not retain empty directories; examples is optional in layer 1.
  if (dir === 'examples' && !existsSync(dir)) continue;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const r = spawnSync(process.execPath, ['--check', `${dir}/${entry.name}`], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`Check failed: ${dir}/${entry.name}`, r.error?.code ?? r.signal ?? r.status);
      process.exit(1);
    }
  }
}
