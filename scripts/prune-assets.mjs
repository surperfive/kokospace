/**
 * 清理 dist/assets 里没被当前 index.html 引用的旧 hash 包。
 *
 * 为什么不用 Vite 自带的 emptyOutDir：Windows 上删除整个 dist 目录会走回收站 API，
 * 一旦失败 vite 直接中断构建（vite.config.ts 里因此关掉了 emptyOutDir）。
 * 这里改成逐文件 unlink —— 单个文件删除是稳的，而且只碰 assets/index-*.{js,css}，
 * 不会误伤 dist 下其它产物。
 *
 * 用法：
 *   node scripts/prune-assets.mjs         只删没被引用的
 *   node scripts/prune-assets.mjs --all   全删（等价于清空构建产物）
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(process.cwd(), 'dist');
const ASSETS = path.join(DIST, 'assets');
const HTML = path.join(DIST, 'index.html');
const pruneAll = process.argv.includes('--all');

if (!fs.existsSync(ASSETS)) {
  console.log('[prune] dist/assets 不存在，跳过');
  process.exit(0);
}

const referenced = new Set();
if (!pruneAll && fs.existsSync(HTML)) {
  const html = fs.readFileSync(HTML, 'utf8');
  for (const m of html.matchAll(/\/assets\/([\w.-]+\.(?:js|css))/g)) {
    referenced.add(m[1]);
  }
}

const HASHED = /^index-[\w-]+\.(js|css)$/;
let removed = 0;
let kept = 0;

for (const name of fs.readdirSync(ASSETS)) {
  if (!HASHED.test(name)) continue;
  if (!pruneAll && referenced.has(name)) {
    kept += 1;
    continue;
  }
  try {
    fs.unlinkSync(path.join(ASSETS, name));
    removed += 1;
  } catch (err) {
    console.warn(`[prune] 删除失败 ${name}: ${err.message}`);
  }
}

console.log(
  `[prune] 保留 ${kept} 个，删除 ${removed} 个旧包${pruneAll ? '（--all 模式）' : ''}`
);
