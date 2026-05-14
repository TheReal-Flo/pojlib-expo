const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const binName = isWindows ? 'expo-module.cmd' : 'expo-module';
const localBin = path.join(__dirname, '..', 'node_modules', '.bin', binName);

if (!fs.existsSync(localBin)) {
  console.log('Skipping expo-module prepare because the local expo-module binary is unavailable.');
  process.exit(0);
}

const result = spawnSync(localBin, ['prepare'], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  shell: false,
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
