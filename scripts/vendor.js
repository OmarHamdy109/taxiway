// Rebuilds the offline three.js bundle in public/vendor from node_modules (run: npm run vendor).
const { execSync } = require('child_process');
execSync('npx --yes esbuild node_modules/three/build/three.module.js --bundle --minify --format=esm --outfile=public/vendor/three.module.min.js', { stdio: 'inherit' });
