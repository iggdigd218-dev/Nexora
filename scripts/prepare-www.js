import fs from 'fs';
import path from 'path';

const root = process.cwd();
const www = path.join(root, 'www');
const androidAssets = path.join(root, 'android', 'app', 'src', 'main', 'assets');
const androidPublic = path.join(androidAssets, 'public');

// Prepare www directory
if (fs.existsSync(www)) {
  fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

// Prepare android assets directory
if (!fs.existsSync(androidAssets)) {
  fs.mkdirSync(androidAssets, { recursive: true });
}
if (fs.existsSync(androidPublic)) {
  fs.rmSync(androidPublic, { recursive: true, force: true });
}
fs.mkdirSync(androidPublic, { recursive: true });

const filesToCopy = ['index.html', 'manifest.webmanifest', 'sw.js', 'server.js'];
filesToCopy.forEach(f => {
  const src = path.join(root, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(www, f));
    fs.copyFileSync(src, path.join(androidPublic, f));
  }
});

const dirsToCopy = ['js', 'css', 'icons'];
dirsToCopy.forEach(d => {
  const src = path.join(root, d);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(www, d), { recursive: true });
    fs.cpSync(src, path.join(androidPublic, d), { recursive: true });
  }
});

// Copy capacitor.config.json to android assets
const capConfigSrc = path.join(root, 'capacitor.config.json');
if (fs.existsSync(capConfigSrc)) {
  fs.copyFileSync(capConfigSrc, path.join(androidAssets, 'capacitor.config.json'));
}

console.log('✅ Web assets and Android assets prepared successfully');
