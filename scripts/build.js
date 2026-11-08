// Builds the library and copies the script build into the showcase site.
//   node scripts/build.js          -> dist/ + site/koi-pond.min.js
//   node scripts/build.js --serve  -> rebuild on change and serve site/ on :8000

import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const banner = { js: `/*! koi-pond v${pkg.version} | MIT */` };
const serve = process.argv.includes('--serve');

mkdirSync('dist', { recursive: true });

const builds = [
  { entryPoints: ['src/index.js'], format: 'esm', outfile: 'dist/koi-pond.esm.js', minify: false },
  { entryPoints: ['src/index.js'], format: 'esm', outfile: 'dist/koi-pond.esm.min.js', minify: true },
  {
    entryPoints: ['src/browser.js'],
    format: 'iife',
    globalName: 'KoiPond',
    outfile: 'dist/koi-pond.min.js',
    minify: true,
  },
].map((b) => ({
  bundle: true,
  target: 'es2019',
  banner,
  legalComments: 'none',
  define: { __KOI_POND_VERSION__: JSON.stringify(pkg.version) },
  ...b,
}));

const copyToSite = {
  name: 'copy-to-site',
  setup(build) {
    build.onEnd((r) => {
      if (r.errors.length) return;
      copyFileSync('dist/koi-pond.min.js', 'site/koi-pond.min.js');
    });
  },
};
builds[2].plugins = [copyToSite];

if (serve) {
  const ctxs = await Promise.all(builds.map((b) => esbuild.context(b)));
  await Promise.all(ctxs.map((c) => c.watch()));
  const { port } = await ctxs[2].serve({ servedir: 'site', port: 8000 });
  console.log(`Showcase running at http://localhost:${port}`);
} else {
  for (const b of builds) await esbuild.build(b);
  const size = readFileSync('dist/koi-pond.min.js').length;
  console.log(`Built dist/ (koi-pond.min.js: ${(size / 1024).toFixed(1)} KB) and site/koi-pond.min.js`);
}
