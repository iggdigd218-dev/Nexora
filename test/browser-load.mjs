// محاكاة تحميل الصفحة كاملة في متصفح (jsdom runScripts) مع التقاط أخطاء التشغيل
import 'fake-indexeddb/auto';
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';

const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => errors.push('jsdomError: ' + (e && e.message || e)));
virtualConsole.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8080/',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;

// مكافحة الإكمال للـ APIs غير المتوفرة
window.matchMedia = window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
if (!window.AudioContext) {
  window.AudioContext = class { constructor(){ this.currentTime=0; this.destination={}; } createOscillator(){return {connect(){},start(){},stop(){},setValueAtTime(){},type:''}} createGain(){return {connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}}} };
}

// منع محاولات fetch/serviceWorker
window.fetch = () => Promise.reject(new Error('fetch blocked in test'));
Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined, configurable: true });

setTimeout(() => {
  const bootVisible = !window.document.getElementById('boot-screen').classList.contains('hidden');
  const appHidden = window.document.getElementById('app').classList.contains('hidden');
  console.log('boot screen visible:', bootVisible);
  console.log('app hidden initially:', appHidden);

  // محاكاة إرسال نموذج البداية
  const bootName = window.document.getElementById('boot-name');
  if (bootName) bootName.value = 'مؤسسة الاختبار';
  const form = window.document.getElementById('boot-form');
  if (form) {
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }
  setTimeout(() => {
    const appVisible = !window.document.getElementById('app').classList.contains('hidden');
    console.log('app visible after boot:', appVisible);
    const view = window.document.getElementById('view');
    console.log('view content length:', view ? view.innerHTML.length : 'NONE');
    console.log('view title:', view ? view.querySelector('.view-title')?.textContent : 'NONE');
    if (errors.length) {
      console.log('\n=== أخطاء اكتشفت ===');
      errors.slice(0, 20).forEach(e => console.log('-', e));
    } else {
      console.log('\nلا توجد أخطاء تشغيل ✨');
    }
    process.exit(errors.length ? 1 : 0);
  }, 400);
}, 400);
