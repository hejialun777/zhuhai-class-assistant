/* 数据自检：语法、地点挂载节点、路网连通性、路线耗时是否合理 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
const src = fs.readFileSync(path.join(root, 'js/data.js'), 'utf8')
  + '\n;globalThis.__dump = { ROAD, PLACES, COURSES, PERIODS, TERM, GEO, TRAVEL };';
vm.runInContext(src, ctx, { filename: 'js/data.js' });

const { ROAD, PLACES, COURSES, PERIODS, TRAVEL } = ctx.__dump;
const { createRouter } = require(path.join(root, 'js/router.js'));

let bad = 0;
const err = (m) => { console.log('  x ' + m); bad++; };

console.log('== 路网 ==');
const nodeIds = Object.keys(ROAD.nodes);
console.log(`  节点 ${nodeIds.length} 个，边 ${ROAD.edges.length} 条`);

const adj = {};
nodeIds.forEach((k) => (adj[k] = []));
for (const [a, b] of ROAD.edges) {
  if (!ROAD.nodes[a]) { err(`边引用了不存在的节点: ${a}`); continue; }
  if (!ROAD.nodes[b]) { err(`边引用了不存在的节点: ${b}`); continue; }
  adj[a].push(b); adj[b].push(a);
}

const seen = new Set(['nanmen1']); const q = ['nanmen1'];
while (q.length) { const u = q.shift(); for (const v of adj[u]) if (!seen.has(v)) { seen.add(v); q.push(v); } }
const unreachable = nodeIds.filter((k) => !seen.has(k));
if (unreachable.length) err(`路网不连通，孤立节点: ${unreachable.join(', ')}`);
else console.log('  路网全连通');

console.log('== 地点 ==');
const missing = PLACES.filter((p) => !ROAD.nodes[p.node]);
if (missing.length) err(`地点挂载了不存在的路网节点: ${missing.map((p) => p.id + '->' + p.node).join(', ')}`);
else console.log(`  ${PLACES.length} 个地点的挂载节点均存在`);

const ids = PLACES.map((p) => p.id);
const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
if (dup.length) err(`地点 id 重复: ${dup.join(', ')}`);

const oob = PLACES.filter((p) => p.x < 0 || p.x > 1280 || p.y < 0 || p.y > 587);
if (oob.length) err(`地点坐标超出底图范围: ${oob.map((p) => p.id).join(', ')}`);
else console.log('  地点坐标均在底图范围内');

console.log('== 课程 ==');
for (const c of COURSES) {
  if (!PLACES.some((p) => p.id === c.placeId)) err(`课程「${c.name}」的 placeId 不存在: ${c.placeId}`);
  if (c.day < 1 || c.day > 7) err(`课程「${c.name}」day 越界: ${c.day}`);
  for (const p of c.periods) if (p < 1 || p > PERIODS.length) err(`课程「${c.name}」节次越界: ${p}`);
  const s = [...c.periods].sort((a, b) => a - b);
  for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1] + 1) err(`课程「${c.name}」节次不连续`);
}
const cell = {};
for (const c of COURSES) for (const p of c.periods) {
  const k = c.day + '-' + p;
  if (cell[k]) err(`时间冲突：周${c.day} 第 ${p} 节 被「${cell[k]}」和「${c.name}」占用`);
  cell[k] = c.name;
}
console.log(`  ${COURSES.length} 门次课程，无冲突`);

/* ---------------- 路线耗时合理性 ---------------- */
console.log('== 路线耗时（步行 / 骑行） ==');
const router = createRouter(ROAD, () => ({
  metersPerPx: TRAVEL.metersPerPx, walkSpeed: TRAVEL.walkSpeed, bikeSpeed: TRAVEL.bikeSpeed,
  walkFixed: TRAVEL.walkFixed, bikeFixed: TRAVEL.bikeFixed,
}));
const P = (id) => PLACES.find((p) => p.id === id);
const fmt = (s) => (s < 60 ? Math.round(s) + '秒' : Math.round(s / 60) + '分');

function show(aId, bId) {
  const a = P(aId), b = P(bId);
  const w = router.planRoute(a, b, 'walk');
  const k = router.planRoute(a, b, 'bike');
  if (!w || !k) { err(`${aId} -> ${bId} 无法规划路线`); return; }
  const ratio = w.meters / (Math.hypot(a.x - b.x, a.y - b.y) * TRAVEL.metersPerPx);
  console.log(`  ${a.short.padEnd(6, '　')} -> ${b.short.padEnd(6, '　')}  ` +
    `${String(Math.round(w.meters)).padStart(5)}m  步行 ${fmt(w.seconds).padStart(4)}  ` +
    `骑行 ${fmt(k.seconds).padStart(4)}  绕行系数 ${ratio.toFixed(2)}`);
  if (ratio < 1.0) err(`${aId}->${bId} 绕行系数 < 1，说明路网有穿越性错误`);
  if (w.meters > 4000) err(`${aId}->${bId} 距离 ${Math.round(w.meters)}m 过大，疑似绕远`);
}

// 宿舍 -> 教学楼
show('zhuyuan1', 'mingde');
show('rongyuan1', 'bowen');
show('rongyuan4', 'minxue');
show('meiyuan6', 'mingde');
show('songyuan2', 'mingde');
show('teacher', 'bowen');
// 跨湖（验证不会直接穿过湖心湖）
show('zhuyuan1', 'zhixing');
show('nanmen', 'bowen');
// 校园两端
show('nanmen', 'songyuan2');
show('gate2', 'wuhuan');
// 上课地点两两
show('mingde', 'bowen');
show('bowen', 'minxue');
show('mingde', 'swim');
// 同地点
const same = router.planRoute(P('mingde'), P('mingde'), 'walk');
if (same.meters > 1) err(`同地点距离应为 0，实际 ${same.meters}`);

/* ---------------- DOM 选择器交叉检查 ---------------- */
console.log('== 页面选择器 ==');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

const htmlIds = new Set();
for (const m of html.matchAll(/\bid="([^"]+)"/g)) htmlIds.add(m[1]);
// 脚本里动态创建的 id（el('g', { id: 'xxx' }) / setAttribute('id', 'xxx')）
for (const m of appSrc.matchAll(/\bid:\s*'([A-Za-z0-9_-]+)'/g)) htmlIds.add(m[1]);
const refIds = new Set();
for (const m of appSrc.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) refIds.add(m[1]);

const missingIds = [...refIds].filter((i) => !htmlIds.has(i));
if (missingIds.length) err(`app.js 引用了 index.html 中不存在的 id: ${missingIds.join(', ')}`);
else console.log(`  app.js 引用的 ${refIds.size} 个 id 均存在于 index.html`);

// 反向：HTML 里有但脚本从没用过的 id（只提示，不算错误）
const unused = [...htmlIds].filter((i) => !refIds.has(i) && !appSrc.includes(`#${i}`));
if (unused.length) console.log(`  （提示）index.html 中未被脚本引用的 id: ${unused.join(', ')}`);

// 脚本文件是否都被 index.html 引入
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
for (const s of scripts) {
  if (!fs.existsSync(path.join(root, s))) err(`index.html 引入了不存在的脚本: ${s}`);
}
for (const f of ['js/data.js', 'js/router.js', 'js/store.js', 'js/import.js', 'js/ocr.js', 'js/app.js']) {
  if (!scripts.includes(f)) err(`index.html 没有引入 ${f}`);
}
console.log(`  index.html 引入的脚本: ${scripts.join(', ')}`);

// 样式文件里的类名是否在 HTML/JS 中被用到
const css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const cssClasses = new Set();
for (const m of css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) cssClasses.add(m[1]);
const usedText = html + appSrc;
const orphan = [...cssClasses].filter((c) => !new RegExp(`(class="[^"]*\\b${c}\\b|'[^']*\\b${c}\\b|\\b${c}\\b)`).test(usedText));
if (orphan.length) console.log(`  （提示）CSS 中未用到的类: ${orphan.join(', ')}`);

console.log(bad ? `\n共 ${bad} 处问题` : '\n全部检查通过');
process.exit(bad ? 1 : 0);
