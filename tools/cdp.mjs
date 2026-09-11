// Driver mínimo de Chrome headless via CDP.
// Uso: node tools/cdp.mjs <url> tools/scenarios/<cenario>.json   (capturas em tools/shots/)
// actions: [{wait:ms} | {shot:name} | {eval:expr} | {keyDown:code} | {keyUp:code} | {press:code}]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [url, actionsFile] = process.argv.slice(2);
const actions = JSON.parse(readFileSync(actionsFile, 'utf8'));
const outDir = join(here, 'shots');
mkdirSync(outDir, { recursive: true });
const port = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('google-chrome', [
  '--headless=new', `--remote-debugging-port=${port}`, '--window-size=1280,720',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
  '--no-first-run', '--no-default-browser-check', `--user-data-dir=${join(here, '.chrome-profile')}`,
  'about:blank',
], { stdio: 'ignore' });

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break; } catch { await sleep(200); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.consoleAPICalled') {
    logs.push(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push('[EXCEPTION] ' + (d.exception?.description ?? d.text));
  } else if (msg.method === 'Log.entryAdded') {
    logs.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
  }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});

const KEYS = {
  KeyW: ['w', 87], KeyA: ['a', 65], KeyS: ['s', 83], KeyD: ['d', 68], KeyC: ['c', 67],
  Space: [' ', 32], ShiftLeft: ['Shift', 16], Escape: ['Escape', 27],
};
const keyEvt = (type, code) => {
  const [key, vk] = KEYS[code];
  return send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(2500);

for (const a of actions) {
  if (a.wait) await sleep(a.wait);
  else if (a.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${a.shot}.png`), Buffer.from(r.result.data, 'base64'));
    console.log(`shot -> shots/${a.shot}.png`);
  } else if (a.eval) {
    const r = await send('Runtime.evaluate', { expression: a.eval, returnByValue: true, awaitPromise: true });
    console.log(`eval ${a.label ?? a.eval.slice(0, 60)} =>`, JSON.stringify(r.result.result?.value ?? r.result.exceptionDetails?.text));
  } else if (a.keyDown) await keyEvt('keyDown', a.keyDown);
  else if (a.keyUp) await keyEvt('keyUp', a.keyUp);
  else if (a.press) { await keyEvt('keyDown', a.press); await sleep(50); await keyEvt('keyUp', a.press); }
}

console.log('--- console ---\n' + (logs.join('\n') || '(vazio)'));
ws.close();
chrome.kill();
process.exit(0);
