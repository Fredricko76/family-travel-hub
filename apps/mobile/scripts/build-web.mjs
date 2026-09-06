// Builds the web version into dist/ and adds the tags that make it behave like
// an app on a phone: a web manifest, a home-screen icon, and a theme colour.
// Usage: node scripts/build-web.mjs   (run from apps/mobile)
import { execSync } from 'node:child_process';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

execSync('npx expo export --platform web', { stdio: 'inherit' });

copyFileSync('assets/icon.png', 'dist/icon.png');

const headTags = [
  '<meta name="theme-color" content="#0E7C7B">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="apple-mobile-web-app-title" content="Travel Hub">',
  '<link rel="manifest" href="/manifest.json">',
  '<link rel="apple-touch-icon" href="/icon.png">',
].join('\n');

const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes('rel="manifest"')) {
  writeFileSync('dist/index.html', html.replace('</head>', `${headTags}\n</head>`));
}
console.log('dist/ ready for hosting');
