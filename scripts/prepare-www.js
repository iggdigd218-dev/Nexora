import fs from 'fs';
import path from 'path';

const root = process.cwd();
const www = path.join(root, 'www');

if (fs.existsSync(www)) {
  fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

const filesToCopy = ['index.html', 'manifest.webmanifest', 'sw.js', 'server.js'];
filesToCopy.forEach(f => {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(www, f));
  }
});

const dirsToCopy = ['js', 'css', 'icons'];
dirsToCopy.forEach(d => {
  const src = path.join(root, d);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(www, d), { recursive: true });
  }
});

console.log('✅ Web assets prepared in www/ for Capacitor Android build');
