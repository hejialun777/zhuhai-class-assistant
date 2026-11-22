/* =========================================================================
 * app.js — 珠科管家
 * 课表 / 下一节课 / 每日待办 / 月历 / 账号与课表管理 / 路线规划 / 地图
 * ========================================================================= */
(function () {
  'use strict';

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const Store = window.ZhukeStore;
  const Importer = window.ScheduleImport;

  const LS_SETTINGS = 'campusTool.settings';
  const LS_MARKERS  = 'campusTool.markerOverrides';
  const AVATAR_EMOJIS = ['🎓', '🐻', '🦊', '🐼', '🐨', '🐯', '🐸', '🐧', '🌻', '🍀', '🚀', '⭐'];

  /* ---------------------------------------------------------------- 状态 */
  const state = {
    week: 1,
    mode: 'walk',            // walk | bike
    fromId: null,
    toId: null,
    myPos: null,             // {x, y, from:'gps'|'pick', label}
    pickMode: false,
    editMode: false,
    showRoads: false,
    dragging: null,
    route: null,
    selectedDate: startOfDay(new Date()),
    calMonth: null,
    mineSection: 'profile',
    coursePane: 'import',
    editingCourseId: null,
    pendingImport: null,
    pendingAvatar: null,
  };
  state.calMonth = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);

  let activeCourses = (typeof COURSES !== 'undefined') ? COURSES : [];

  function readLocalJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
  }
  const settings = Object.assign(
    { walkSpeed: TRAVEL.walkSpeed, bikeSpeed: TRAVEL.bikeSpeed, metersPerPx: TRAVEL.metersPerPx },
    readLocalJSON(LS_SETTINGS)
  );
  const markerOverrides = readLocalJSON(LS_MARKERS);

  function saveSettings() { try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (e) { /* 忽略 */ } }
  function saveMarkers()  { try { localStorage.setItem(LS_MARKERS, JSON.stringify(markerOverrides)); } catch (e) { /* 忽略 */ } }

  /* ---------------------------------------------------------------- 工具 */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function parseYmd(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function md(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
  function mdCN(d) { return `${d.getMonth() + 1}月${d.getDate()}日`; }
  function mondayOfDate(d) {
    const x = startOfDay(d);
    return addDays(x, -((x.getDay() + 6) % 7));
  }
  function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minToHHMM(mins) {
    mins = Math.round(mins);
    const h = Math.floor(mins / 60) % 24, m = ((mins % 60) + 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function todayIndex() { const d = new Date().getDay(); return d === 0 ? 7 : d; }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  function isPhone() { return window.innerWidth <= 720; }

  function avatarHtml(avatar) {
    const a = String(avatar || '🎓');
    if (/^data:image\//.test(a)) return `<img src="${esc(a)}" alt="">`;
    return esc(a || '🎓');
  }
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const WEEK1 = parseYmd(TERM.week1Monday);
  function mondayOfWeek(n) { return addDays(WEEK1, (n - 1) * 7); }
  function weekOfDate(d) {
    const diff = Math.round((startOfDay(d) - startOfDay(WEEK1)) / 86400000);
    return Math.floor(diff / 7) + 1;
  }

  /* ------------------------------------------------------- 周次有效性 */
  function courseRunsThisWeek(c, week) {
    const w = c.weeks || { type: 'all' };
    switch (w.type) {
      case 'odd':   return week % 2 === 1;
      case 'even':  return week % 2 === 0;
      case 'range': return week >= w.from && week <= w.to;
      case 'later': return false;
      default:      return true;
    }
  }
  function weeksText(c) {
    const w = c.weeks || { type: 'all' };
    switch (w.type) {
      case 'odd':   return '单周';
      case 'even':  return '双周';
      case 'range': return `第 ${w.from}–${w.to} 周`;
      case 'later': return '多周后开课（周次待确认）';
      default:      return '每周';
    }
  }
  function weeksInputText(w) {
    w = w || { type: 'all' };
    if (w.type === 'odd') return '单周';
    if (w.type === 'even') return '双周';
    if (w.type === 'range') return w.from === w.to ? String(w.from) : `${w.from}-${w.to}`;
    return '';
  }

  /* ------------------------------------------------------- 课程源 */
  function refreshActiveCourses() {
    const custom = Store.getCourses();
    activeCourses = custom === null ? COURSES : custom;
  }
  function coursePlace(c) { return c.placeId ? placeById(c.placeId) : null; }
  function courseBuilding(c) {
    const p = coursePlace(c);
    return p ? p.short : (c.building || '地点待定');
  }
  function coursePlaceIds() {
    return new Set(activeCourses.map((c) => c.placeId).filter(Boolean));
  }
  function courseDedupeKey(c) {
    const ps = (c.periods || []).slice().sort((a, b) => a - b);
    return [c.name, c.day, ps.join(',')].join('|');
  }

  /* ------------------------------------------------------- 地点工具 */
  function placeById(id) { return PLACES.find((p) => p.id === id); }
  function placePos(p) {
    const o = markerOverrides[p.id];
    return { x: o ? o.x : p.x, y: o ? o.y : p.y };
  }
  function currentFrom() {
    const sel = $('#fromSelect').value;
    if (state.myPos && sel === '__me') {
      return { pos: state.myPos, label: state.myPos.label, placeId: null };
    }
    const p = placeById(sel) || placeById(state.fromId);
    if (!p) return null;
    return { pos: placePos(p), label: p.name, placeId: p.id };
  }

  /* ================================================================ 顶栏 */
  function renderUserChip() {
    const p = Store.getProfile();
    $('#chipAvatar').innerHTML = avatarHtml(p.avatar);
    $('#chipName').textContent = p.displayName || '游客';
    $('#chipName').title = Store.isGuest() ? '游客模式，点击进入我的' : '@' + Store.currentUsername();
  }

  function buildWeekSelect() {
    const sel = $('#weekSelect');
    sel.innerHTML = '';
    const curWeek = weekOfDate(new Date());
    for (let w = 1; w <= TERM.totalWeeks; w++) {
      const mon = mondayOfWeek(w), sun = addDays(mon, 6);
      const opt = document.createElement('option');
      opt.value = w;
      opt.textContent = `第${w}周 (${md(mon)}–${md(sun)})${w === curWeek ? ' · 本周' : ''}`;
      sel.appendChild(opt);
    }
    const initial = (curWeek >= 1 && curWeek <= TERM.totalWeeks) ? curWeek : 1;
    state.week = initial;
    sel.value = initial;
  }

  /* ================================================================ 课表 */
  function renderTimetable() {
    const tt = $('#timetable');
    if (!tt) return;
    tt.innerHTML = '';

    const mon = mondayOfWeek(state.week), sun = addDays(mon, 6);
    $('#weekRange').textContent = `第 ${state.week} 周 · ${ymd(mon)} ~ ${ymd(sun)}`;

    const curWeek = weekOfDate(new Date());
    const todayIdx = todayIndex();

    const corner = document.createElement('div');
    corner.className = 'tb-corner';
    corner.textContent = '节次';
    tt.appendChild(corner);

    for (let d = 1; d <= 7; d++) {
      const el = document.createElement('div');
      el.className = 'tb-day' + (state.week === curWeek && d === todayIdx ? ' today' : '');
      el.innerHTML = `<div class="d">${DAY_NAMES[d - 1]}</div><div class="n">${md(addDays(mon, d - 1))}</div>`;
      el.style.gridColumn = d + 1;
      el.style.gridRow = 1;
      tt.appendChild(el);
    }

    for (let p = 1; p <= PERIODS.length; p++) {
      const per = PERIODS[p - 1];
      const t = document.createElement('div');
      t.className = 'tb-time';
      t.style.gridColumn = 1;
      t.style.gridRow = p + 1;
      t.innerHTML = `<b>${per.no}</b>${per.start}`;
      tt.appendChild(t);

      for (let d = 1; d <= 7; d++) {
        const cell = document.createElement('div');
        cell.className = 'tb-cell';
        cell.style.gridColumn = d + 1;
        cell.style.gridRow = p + 1;
        tt.appendChild(cell);
      }
    }

    const query = ($('#searchBox').value || '').trim().toLowerCase();
    const hits = new Set();
    const courses = activeCourses;

    if (!courses.length) {
      const note = document.createElement('div');
      note.className = 'tb-blank';
      note.style.gridColumn = '2 / span 7';
      note.style.gridRow = PERIODS.length + 1;
      note.textContent = '当前课表还没有课程。去「我的 → 课表」导入或手动添加。';
      tt.appendChild(note);
    }

    courses.forEach((c) => {
      const running = courseRunsThisWeek(c, state.week);
      const first = Math.min.apply(null, c.periods);
      const span = c.periods.length;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tb-course' + (running ? '' : ' later');
      btn.style.gridColumn = c.day + 1;
      btn.style.gridRow = (first + 1) + ' / span ' + span;
      btn.style.background = c.color || '#5b9bd5';
      if (!running) btn.style.opacity = '.45';
      btn.dataset.id = c.id;

      const label = c.shortName || c.name;
      const p = coursePlace(c);
      btn.innerHTML =
        `<span class="cn">${esc(label)}</span>` +
        `<span class="cr">${esc(courseBuilding(c))} ${esc(c.room || '')}</span>` +
        (c.teacher ? `<span class="ct">${esc(c.teacher)}</span>` : '');

      if (query) {
        const hay = [c.name, c.shortName || '', c.teacher, c.building, c.room,
          p ? p.full : ''].join(' ').toLowerCase();
        if (hay.indexOf(query) >= 0) { hits.add(c.id); btn.classList.add('hit'); }
        else btn.classList.add('dim');
      }

      btn.addEventListener('click', () => openCourse(c));
      tt.appendChild(btn);
    });

    if (query && hits.size === 0) {
      const note = document.createElement('div');
      note.className = 'tb-empty-note';
      note.style.gridColumn = '2 / span 7';
      note.style.gridRow = PERIODS.length + 1;
      note.textContent = '没有匹配的课程。';
      tt.appendChild(note);
    }

    renderLegend();
  }

  function renderLegend() {
    const el = $('#courseLegend');
    if (!el) return;
    const seen = new Set();
    const items = [];
    activeCourses.forEach((c) => {
      const key = (c.shortName || c.name) + '|' + (c.color || '');
      if (seen.has(key)) return;
      seen.add(key);
      items.push(`<span><i style="background:${esc(c.color || '#5b9bd5')}"></i>${esc(c.shortName || c.name)}</span>`);
    });
    el.innerHTML = items.join('');
  }

  /* ======================================================== 下一节课 */
  let tickTimer = null;

  function currentSessionsSorted() {
    return activeCourses
      .filter((c) => courseRunsThisWeek(c, state.week))
      .map((c) => {
        const first = Math.min.apply(null, c.periods);
        const last  = Math.max.apply(null, c.periods);
        return {
          c, day: c.day,
          startMin: hhmmToMin(PERIODS[first - 1].start),
          endMin:   hhmmToMin(PERIODS[last - 1].end),
          first, last,
          place: coursePlace(c),
        };
      })
      .sort((a, b) => (a.day - b.day) || (a.startMin - b.startMin));
  }

  function renderNext() {
    const box = $('#nextCard');
    if (!box) return;
    const now = new Date();
    const curWeek = weekOfDate(now);
    const isThisWeek = curWeek === state.week;
    const list = currentSessionsSorted();

    if (!list.length) {
      box.className = 'next none';
      $('#nextBadge').textContent = '下一节课';
      $('#nextTitle').textContent = '本周没有安排课程';
      $('#nextMeta').textContent = activeCourses.length
        ? '可以在「我的 → 课表」里检查周次或导入课表'
        : '去「我的 → 课表」导入或手动添加课程';
      $('#nextCountdown').textContent = '';
      return;
    }

    if (!isThisWeek) {
      const s = list[0];
      box.className = 'next none';
      $('#nextBadge').textContent = `第${state.week}周`;
      $('#nextTitle').textContent = `共 ${list.length} 节课（非本周，仅预览）`;
      $('#nextMeta').textContent =
        `首节：${DAY_NAMES[s.day - 1]} ${PERIODS[s.first - 1].start} ${s.c.name}@${s.place ? s.place.name : courseBuilding(s.c)}${s.c.room || ''}`;
      $('#nextCountdown').textContent = '';
      return;
    }

    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const today = todayIndex();

    let target = null, ongoing = null;
    for (const s of list) {
      if (s.day === today && nowMin >= s.startMin && nowMin <= s.endMin) { ongoing = s; break; }
      if (s.day > today || (s.day === today && s.startMin > nowMin)) { target = s; break; }
    }

    if (ongoing) {
      box.className = 'next';
      $('#nextBadge').textContent = '正在上课';
      $('#nextTitle').textContent = `${ongoing.c.name} @${ongoing.place ? ongoing.place.name : courseBuilding(ongoing.c)} ${ongoing.c.room || ''}`;
      $('#nextMeta').textContent = `${DAY_NAMES[ongoing.day - 1]} 第${ongoing.first}-${ongoing.last}节 · ${PERIODS[ongoing.first - 1].start}–${PERIODS[ongoing.last - 1].end}`;
      $('#nextCountdown').innerHTML =
        '<span class="cd-label">距离下课还有</span>' + fmtDur(ongoing.endMin - nowMin);
      return;
    }

    if (!target) {
      box.className = 'next none';
      $('#nextBadge').textContent = '本周已结课';
      $('#nextTitle').textContent = '本周课程已全部结束 🎉';
      $('#nextMeta').textContent = `下周共 ${activeCourses.filter((c) => courseRunsThisWeek(c, state.week + 1)).length} 节课`;
      $('#nextCountdown').textContent = '';
      return;
    }

    const mins = minsUntilSession(target, now);
    box.className = 'next' + (mins <= 30 ? ' urgent' : '');
    $('#nextBadge').textContent = '下一节课';
    $('#nextTitle').textContent =
      `${target.c.name} @${target.place ? target.place.name : courseBuilding(target.c)} ${target.c.room || ''}`;
    $('#nextMeta').textContent =
      `${DAY_NAMES[target.day - 1]} 第${target.first}-${target.last}节 · ` +
      `${PERIODS[target.first - 1].start}–${PERIODS[target.last - 1].end} · ` +
      (target.c.teacher || '老师待补充');

    const leave = suggestLeave(target);
    $('#nextCountdown').innerHTML =
      '<span class="cd-label">距上课</span>' + fmtDur(mins) +
      (leave ? `<div class="cd-sub">${leave}</div>` : '');
  }

  function minsUntilSession(s, now) {
    const today = todayIndex();
    const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    if (s.day === today) return s.startMin - nowMin;
    let dayGap = s.day - today;
    if (dayGap < 0) dayGap += 7;
    return dayGap * 24 * 60 - nowMin + s.startMin;
  }

  function suggestLeave(session) {
    const origin = currentFrom();
    if (!origin || !session.place) return '';
    const r = planRoute(origin.pos, placePos(session.place), 'walk');
    if (!r || !isFinite(r.seconds)) return '';
    const leaveAt = session.startMin - r.seconds / 60 - 5;
    return `从${origin.label}步行约 ${Math.round(r.seconds / 60)} 分钟 · 建议 ${minToHHMM(leaveAt)} 前出发`;
  }

  function fmtDur(mins) {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h <= 0) return m + ' 分钟';
    return h + ' 小时 ' + (m ? m + ' 分' : '');
  }

  /* =========================================================== 课程弹窗 */
  let modalCourse = null;
  function openCourse(c) {
    modalCourse = c;
    const p = coursePlace(c);
    const first = Math.min.apply(null, c.periods), last = Math.max.apply(null, c.periods);
    $('#mTitle').innerHTML = `<span class="swatch" style="background:${esc(c.color || '#5b9bd5')}"></span>${esc(c.name)}`;
    $('#mSub').textContent = c.note || (courseRunsThisWeek(c, state.week) ? '' : '（本周不上此课）');
    $('#mTime').textContent =
      `${DAY_NAMES[c.day - 1]} 第${first}-${last}节  ${PERIODS[first - 1].start}–${PERIODS[last - 1].end}`;
    $('#mBuilding').textContent = p ? p.full : (c.building || '未关联校园地点');
    $('#mRoom').textContent = c.room || '未填写';
    $('#mTeacher').innerHTML = c.teacher ? esc(c.teacher) : '<span class="hint">未填写，可在「我的 → 课表」补充</span>';
    $('#mWeeks').textContent = weeksText(c);
    const go = $('#mGo');
    go.disabled = !p;
    go.textContent = p ? '规划去这里的路线' : '未关联校园地点';
    $('#modalMask').classList.add('show');
  }
  function closeModal() { $('#modalMask').classList.remove('show'); }

  /* =========================================================== 路网 */
  const router = CampusRouter.createRouter(ROAD, () => ({
    metersPerPx: settings.metersPerPx,
    walkSpeed: settings.walkSpeed,
    bikeSpeed: settings.bikeSpeed,
    walkFixed: TRAVEL.walkFixed,
    bikeFixed: TRAVEL.bikeFixed,
  }));
  const planRoute = router.planRoute;
  function distPt(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  const nodeLabelCache = {};
  function nodeLabel(k) {
    if (nodeLabelCache[k] !== undefined) return nodeLabelCache[k];
    const n = ROAD.nodes[k];
    if (!n) return (nodeLabelCache[k] = null);
    let best = null, bestD = Infinity;
    PLACES.forEach((p) => {
      const pos = placePos(p);
      const d = Math.hypot(pos.x - n[0], pos.y - n[1]);
      if (d < bestD) { bestD = d; best = p; }
    });
    nodeLabelCache[k] = bestD <= 110 ? best.short : null;
    return nodeLabelCache[k];
  }

  function routeSteps(fromLabel, toLabel, r) {
    const names = [];
    (r.path || []).forEach((k) => {
      const l = nodeLabel(k);
      if (l && names[names.length - 1] !== l) names.push(l);
    });
    const via = names.filter((n) => n !== fromLabel && n !== toLabel);
    const steps = [`从「${fromLabel}」出发`];
    if (via.length) steps.push('途经：' + via.slice(0, 6).join(' → ') + (via.length > 6 ? ' …' : ''));
    steps.push(`沿校园道路行进约 ${Math.round(r.meters)} 米`);
    steps.push(`到达「${toLabel}」`);
    return steps;
  }

  function fmtTime(sec) {
    const m = Math.round(sec / 60);
    if (m < 60) return m + ' 分钟';
    return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分';
  }

  /* =========================================================== 地图 */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function renderMap() {
    const svg = $('#mapSvg');
    if (!svg) return;
    svg.innerHTML = '';

    const gRoads = el('g', { id: 'gRoads', class: state.showRoads ? '' : 'hidden' });
    ROAD.edges.forEach(([a, b]) => {
      const A = ROAD.nodes[a], B = ROAD.nodes[b];
      if (!A || !B) return;
      gRoads.appendChild(el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'road' }));
    });
    svg.appendChild(gRoads);

    const gRoute = el('g', { id: 'gRoute' });
    if (state.route && state.route.points.length > 1) {
      const d = state.route.points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
      gRoute.appendChild(el('path', { d, class: 'route-casing' }));
      gRoute.appendChild(el('path', { d, class: 'route-line' + (state.route.mode === 'bike' ? ' bike' : '') }));
    }
    svg.appendChild(gRoute);

    const gMk = el('g', { id: 'gMk' });
    const origin = currentFrom();
    const fromPos = origin ? origin.pos : null;
    const fromPlaceId = origin ? origin.placeId : null;
    const toPos   = state.toId ? placePos(placeById(state.toId)) : null;
    const courseIds = coursePlaceIds();

    PLACES.forEach((p) => {
      const pos = placePos(p);
      const isFrom = fromPlaceId === p.id;
      const isTo   = state.toId === p.id;
      const showLabel = courseIds.has(p.id) || isFrom || isTo || p.needsCheck;

      const g = el('g', {
        class: 'mk' + (showLabel ? ' always' : '') + (isFrom ? ' mk-start' : '') + (isTo ? ' mk-end' : ''),
        'data-id': p.id,
      });
      g.appendChild(el('circle', { class: 'mk-dot' + (courseIds.has(p.id) ? ' course' : ''), cx: pos.x, cy: pos.y, r: 8 }));
      const t = el('text', { class: 'mk-label', x: pos.x + 13, y: pos.y + 5.5 });
      t.textContent = p.short + (p.needsCheck ? ' ?' : '');
      g.appendChild(t);

      const title = el('title');
      title.textContent = (p.full || p.name) + (p.note ? '｜' + p.note : '');
      g.appendChild(title);

      g.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (state.pickMode) { setStartFromPoint(pos, p.name); return; }
        if (state.editMode) return;
        setDestination(p.id);
      });
      gMk.appendChild(g);
    });

    if (state.myPos) {
      const g = el('g', { class: 'mk mk-start always' });
      g.appendChild(el('circle', { class: 'mk-dot', cx: state.myPos.x, cy: state.myPos.y, r: 9 }));
      const t = el('text', { class: 'mk-label', x: state.myPos.x + 13, y: state.myPos.y + 5.5 });
      t.textContent = state.myPos.label || '我的位置';
      g.appendChild(t);
      gMk.appendChild(g);
    }

    svg.appendChild(gMk);

    if (state.editMode) enableDrag(svg);
  }

  function svgPoint(evt) {
    const svg = $('#mapSvg');
    const r = svg.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) / r.width * 1280,
      y: (evt.clientY - r.top) / r.height * 587,
    };
  }

  let dragBound = false;
  function enableDrag(svg) {
    svg.querySelectorAll('.mk[data-id]').forEach((g) => {
      g.style.cursor = 'grab';
      g.addEventListener('pointerdown', (ev) => {
        state.dragging = g.getAttribute('data-id');
        g.style.cursor = 'grabbing';
        try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* 忽略 */ }
        ev.preventDefault();
      });
    });
    if (dragBound) return;
    dragBound = true;

    svg.addEventListener('pointermove', (ev) => {
      if (!state.dragging) return;
      const pt = svgPoint(ev);
      markerOverrides[state.dragging] = { x: Math.round(pt.x), y: Math.round(pt.y) };
      const g = svg.querySelector('.mk[data-id="' + state.dragging + '"]');
      if (g) {
        g.querySelector('circle').setAttribute('cx', pt.x);
        g.querySelector('circle').setAttribute('cy', pt.y);
        const t = g.querySelector('text');
        t.setAttribute('x', pt.x + 13); t.setAttribute('y', pt.y + 5.5);
      }
    });
    const stop = () => { state.dragging = null; };
    svg.addEventListener('pointerup', stop);
    svg.addEventListener('pointercancel', stop);
    window.addEventListener('pointerup', stop);
  }

  function initMapClick() {
    const svg = $('#mapSvg');
    svg.addEventListener('click', (ev) => {
      if (!state.pickMode) return;
      const pt = svgPoint(ev);
      setStartFromPoint({ x: Math.round(pt.x), y: Math.round(pt.y) }, '地图点选位置');
    });
  }

  function setStartFromPoint(pos, label) {
    state.myPos = { x: pos.x, y: pos.y, label };
    state.fromId = null;
    state.pickMode = false;
    $('#pickTools').style.display = 'none';
    $('#geoStatus').textContent = `起点已设为：${label}`;
    refreshFromSelect();
    computeRoute();
  }

  /* =========================================================== GPS */
  function locate() {
    const st = $('#geoStatus');
    if (!navigator.geolocation) {
      st.textContent = '此浏览器不支持定位，请用「在地图上点选起点」。';
      return;
    }
    st.textContent = '正在定位…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        const x = GEO.anchorPx.x + (lng - GEO.anchorLatLng.lng) * GEO.metersPerDegLng / settings.metersPerPx;
        const y = GEO.anchorPx.y - (lat - GEO.anchorLatLng.lat) * GEO.metersPerDegLat / settings.metersPerPx;

        if (x < -60 || x > 1340 || y < -60 || y > 650) {
          st.innerHTML = `定位成功（±${Math.round(accuracy)} m），但坐标落在校园示意图范围之外（${lat.toFixed(5)}, ${lng.toFixed(5)}）。<br>请改用「在地图上点选起点」。`;
          return;
        }
        let near = null, nd = Infinity;
        PLACES.forEach((p) => {
          const pp = placePos(p);
          const d = Math.hypot(pp.x - x, pp.y - y);
          if (d < nd) { nd = d; near = p; }
        });
        const label = nd <= 60 ? `我的位置（${near.short}附近）` : '我的位置（GPS）';
        state.myPos = { x, y, label };
        state.fromId = null;
        state.pickMode = false;
        $('#pickTools').style.display = 'none';
        refreshFromSelect();
        st.innerHTML = `定位成功（±${Math.round(accuracy)} m）→ 已映射到示意图 ${Math.round(x)},${Math.round(y)}` +
          (nd <= 60 ? `，判定你在「${near.short}」附近。` : '。') +
          ` 若不准，可点「在地图上点选起点」手动指定。`;
        computeRoute();
        renderMap();
      },
      (err) => {
        const tips = {
          1: '定位权限被拒绝，请在浏览器地址栏允许定位；或使用「在地图上点选起点」。',
          2: '无法获取定位信息（设备定位未开启？）。',
          3: '定位超时，请重试。',
        };
        st.textContent = (tips[err.code] || '定位失败。') +
          ' 注意：直接双击打开 html 文件时浏览器会禁用定位，请用 README 里的方式启动本地服务。';
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  /* =========================================================== 下拉框 */
  function fillSelect(sel, selectedId) {
    sel.innerHTML = '';
    const cats = {};
    PLACES.forEach((p) => { (cats[p.cat] = cats[p.cat] || []).push(p); });
    const order = ['教学楼', '公共', '餐饮', '宿舍', '体育', '生活', '景观', '校门', '交通'];
    order.forEach((cat) => {
      if (!cats[cat]) return;
      const og = document.createElement('optgroup');
      og.label = cat;
      cats[cat].forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.full || p.name;
        if (p.id === selectedId) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  }

  function refreshFromSelect() {
    const sel = $('#fromSelect');
    if (state.myPos) {
      let o = sel.querySelector('option[value="__me"]');
      if (!o) {
        o = document.createElement('option');
        o.value = '__me';
        sel.insertBefore(o, sel.firstChild);
      }
      o.textContent = '📍 ' + state.myPos.label;
      sel.value = '__me';
    } else {
      sel.value = state.fromId || PLACES[0].id;
    }
  }

  function setDestination(placeId) {
    state.toId = placeId;
    $('#toSelect').value = placeId;
    switchTab('route');
    computeRoute();
    renderMap();
  }

  /* =========================================================== 计算路线 */
  function computeRoute() {
    const toSel = $('#toSelect');
    if (!toSel) return;
    const origin = currentFrom();
    if (!origin) return;
    const from = origin.pos, fromLabel = origin.label;
    if (origin.placeId) state.fromId = origin.placeId;

    const toP = placeById(toSel.value);
    if (!toP) return;
    const to = placePos(toP);
    const toLabel = toP.full || toP.name;

    if (distPt(from, to) < 4) {
      $('#resTime').textContent = '0 分钟';
      $('#resTime').className = 'result-time';
      $('#resMeta').textContent = '起点与终点是同一个地方';
      $('#resLeave').textContent = '';
      $('#resSteps').innerHTML = '';
      state.route = null;
      renderMap();
      return;
    }

    const r = planRoute(from, to, state.mode);
    if (!r) {
      $('#resTime').textContent = '—';
      $('#resMeta').textContent = '这两点之间暂时算不出路线';
      $('#resLeave').textContent = '';
      $('#resSteps').innerHTML = '';
      state.route = null;
      renderMap();
      return;
    }

    state.route = r;
    $('#resTime').textContent = fmtTime(r.seconds);
    $('#resTime').className = 'result-time' + (state.mode === 'bike' ? ' bike' : '');
    $('#resMeta').textContent =
      `${state.mode === 'bike' ? '骑行' : '步行'} · ${fromLabel} → ${toLabel} · 约 ${Math.round(r.meters)} 米 · ` +
      `${state.mode === 'bike' ? '按 ' + (settings.bikeSpeed * 3.6).toFixed(1) : '按 ' + (settings.walkSpeed * 3.6).toFixed(1)} km/h 估算`;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const list = currentSessionsSorted();
    const today = todayIndex();
    const nxt = list.find((s) => (s.day === today && s.startMin > nowMin) || s.day > today);
    if (nxt && state.toId === nxt.c.placeId && nxt.day === today) {
      $('#resLeave').textContent = `要在 ${PERIODS[nxt.first - 1].start} 上课，最晚 ${minToHHMM(nxt.startMin - r.seconds / 60)} 出发`;
    } else {
      $('#resLeave').textContent = '';
    }

    const ul = $('#resSteps');
    ul.innerHTML = '';
    routeSteps(fromLabel, toLabel, r).forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ul.appendChild(li);
    });

    renderMap();
  }

  /* =========================================================== 设置 */
  function bindSettings() {
    const w = $('#walkSpeed'), b = $('#bikeSpeed'), s = $('#scalePx');
    w.value = settings.walkSpeed; b.value = settings.bikeSpeed; s.value = settings.metersPerPx;
    const sync = () => {
      $('#walkSpeedVal').textContent = (settings.walkSpeed * 3.6).toFixed(1) + ' km/h';
      $('#bikeSpeedVal').textContent = (settings.bikeSpeed * 3.6).toFixed(1) + ' km/h';
      $('#scalePxVal').textContent = settings.metersPerPx.toFixed(1) + ' 米/像素';
    };
    sync();
    w.addEventListener('input', () => { settings.walkSpeed = +w.value; sync(); saveSettings(); computeRoute(); renderNext(); });
    b.addEventListener('input', () => { settings.bikeSpeed = +b.value; sync(); saveSettings(); computeRoute(); renderNext(); });
    s.addEventListener('input', () => { settings.metersPerPx = +s.value; sync(); saveSettings(); computeRoute(); renderNext(); });

    $('#btnSettings').addEventListener('click', () => $('#settingsBox').classList.toggle('show'));
    $('#btnResetSettings').addEventListener('click', () => {
      settings.walkSpeed = TRAVEL.walkSpeed;
      settings.bikeSpeed = TRAVEL.bikeSpeed;
      settings.metersPerPx = TRAVEL.metersPerPx;
      w.value = settings.walkSpeed; b.value = settings.bikeSpeed; s.value = settings.metersPerPx;
      sync(); saveSettings(); computeRoute(); renderNext();
    });
  }

  /* =========================================================== 待办 */
  function tasksForDate(date) {
    const key = ymd(date);
    return Store.getTasks()
      .filter((t) => t.date === key)
      .sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      });
  }

  function setSelectedDate(date, syncWeek) {
    state.selectedDate = startOfDay(date);
    if (syncWeek !== false) {
      const w = weekOfDate(state.selectedDate);
      if (w >= 1 && w <= TERM.totalWeeks && w !== state.week) {
        state.week = w;
        const sel = $('#weekSelect');
        if (sel) sel.value = String(w);
        renderTimetable();
        renderNext();
      }
    }
    renderTodo();
  }

  function renderTodo() {
    const tasks = tasksForDate(state.selectedDate);
    const pending = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);
    const selected = state.selectedDate;
    const today = startOfDay(new Date());

    const monday = mondayOfDate(selected);
    const sunday = addDays(monday, 6);
    $('#weekNavLabel').textContent = `${mdCN(monday)} – ${mdCN(sunday)}`;

    const allTasks = Store.getTasks();
    const counts = {};
    allTasks.forEach((t) => { counts[t.date] = (counts[t.date] || 0) + 1; });

    const strip = $('#dayStrip');
    strip.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const key = ymd(d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-btn' +
        (sameDay(d, selected) ? ' selected' : '') +
        (sameDay(d, today) ? ' today' : '') +
        (counts[key] ? ' has-tasks' : '');
      btn.dataset.date = key;
      btn.title = `${mdCN(d)} ${DAY_NAMES[i]}${counts[key] ? ' · ' + counts[key] + ' 条待办' : ''}`;
      btn.innerHTML = `<span class="wd">${DAY_NAMES[i]}</span><span class="dn">${d.getDate()}</span><span class="dot"></span>`;
      strip.appendChild(btn);
    }

    $('#todoDateLabel').textContent = `${mdCN(selected)} ${DAY_NAMES[(selected.getDay() + 6) % 7]}`;
    $('#todoTodayTag').textContent = sameDay(selected, today) ? '今天' : '';

    let progress = '这一天还没有任务';
    if (tasks.length) {
      progress = done.length === tasks.length ? `全部完成 🎉 · ${tasks.length} 条` : `${done.length} / ${tasks.length} 已完成`;
    }
    $('#todoProgress').textContent = progress;

    const list = $('#taskList');
    if (!tasks.length) {
      list.innerHTML = '<div class="task-empty"><span class="big">☁️</span>还没有待办，添加一条吧</div>';
    } else {
      let html = '';
      if (pending.length) {
        html += '<div class="task-section-label">待完成</div>';
        pending.forEach((t) => { html += taskItemHtml(t); });
      }
      if (done.length) {
        html += '<div class="task-section-label">已完成</div>';
        done.forEach((t) => { html += taskItemHtml(t); });
      }
      list.innerHTML = html;
    }

    $('#todoFoot').textContent = tasks.length
      ? `共 ${tasks.length} 条 · ${pending.length} 条未完成`
      : '任务只保存在当前账号的这台设备上';
  }

  function taskItemHtml(t) {
    return `<div class="task-item${t.done ? ' done' : ''}" data-id="${esc(t.id)}">
      <button class="task-check" type="button" data-action="toggle" data-id="${esc(t.id)}" aria-label="${t.done ? '标记为未完成' : '标记为完成'}" aria-pressed="${t.done ? 'true' : 'false'}"></button>
      <div class="task-body">
        <div class="task-text">${esc(t.text)}</div>
        ${t.time ? `<div class="task-meta">⏰ ${esc(t.time)}</div>` : ''}
      </div>
      <button class="task-del" type="button" data-action="del" data-id="${esc(t.id)}" aria-label="删除任务">×</button>
    </div>`;
  }

  function addTask(text, time) {
    text = String(text || '').trim();
    if (!text) { $('#taskInput').focus(); return; }
    const tasks = Store.getTasks();
    tasks.push({
      id: uid('t-'),
      text,
      date: ymd(state.selectedDate),
      time: String(time || ''),
      done: false,
      createdAt: new Date().toISOString(),
      completedAt: null,
    });
    Store.saveTasks(tasks);
    $('#taskInput').value = '';
    $('#taskTime').value = '';
    $('#taskInput').focus();
    toast('已添加任务');
  }

  function toggleTask(id) {
    const tasks = Store.getTasks();
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.done = !t.done;
    t.completedAt = t.done ? new Date().toISOString() : null;
    Store.saveTasks(tasks);
  }

  function deleteTask(id) {
    const tasks = Store.getTasks().filter((x) => x.id !== id);
    Store.saveTasks(tasks);
    toast('已删除任务');
  }

  /* =========================================================== 月历 */
  function openCalendar() {
    state.calMonth = new Date(state.selectedDate.getFullYear(), state.selectedDate.getMonth(), 1);
    renderCalendar();
    $('#calendarMask').classList.add('show');
  }
  function closeCalendar() { $('#calendarMask').classList.remove('show'); }

  function renderCalendar() {
    const y = state.calMonth.getFullYear(), m = state.calMonth.getMonth();
    $('#calTitle').textContent = `${y}年${m + 1}月`;

    const byDate = {};
    Store.getTasks().forEach((t) => { (byDate[t.date] = byDate[t.date] || []).push(t); });
    Object.keys(byDate).forEach((k) => {
      byDate[k].sort((a, b) => {
        if (!!a.done !== !!b.done) return a.done ? 1 : -1;
        return (a.time || '99:99').localeCompare(b.time || '99:99');
      });
    });

    const first = new Date(y, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = addDays(first, -offset);
    const today = startOfDay(new Date());
    const selected = state.selectedDate;

    const grid = $('#calGrid');
    grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const key = ymd(d);
      const tasks = byDate[key] || [];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal-day' +
        (d.getMonth() !== m ? ' other-month' : '') +
        (sameDay(d, today) ? ' today' : '') +
        (sameDay(d, selected) ? ' selected' : '') +
        (tasks.length ? ' has-tasks' : '');
      btn.dataset.date = key;
      btn.title = tasks.length ? tasks.map((t) => (t.done ? '✓ ' : '') + t.text).join('\n') : mdCN(d);
      let html = `<span class="cal-day-num">${d.getDate()}</span>`;
      tasks.slice(0, 2).forEach((t) => {
        html += `<span class="cal-task${t.done ? ' done' : ''}">${esc(t.text)}</span>`;
      });
      if (tasks.length > 2) html += `<span class="cal-more">+${tasks.length - 2} 条</span>`;
      btn.innerHTML = html;
      grid.appendChild(btn);
    }
  }

  /* =========================================================== My 页面 */
  function showMineSection(name) {
    if (!['profile', 'timetable', 'accounts'].includes(name)) name = 'profile';
    state.mineSection = name;
    $$('.mine-tab').forEach((b) => b.classList.toggle('active', b.dataset.mine === name));
    $$('.mine-section').forEach((s) => s.classList.toggle('active', s.id === 'mine-' + name));
  }

  function setCoursePane(name) {
    if (!['import', 'manual', 'list'].includes(name)) name = 'import';
    state.coursePane = name;
    $$('.mine-subtab').forEach((b) => b.classList.toggle('active', b.dataset.coursePane === name));
    $$('.course-pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + name));
  }

  function renderMine() {
    renderProfile();
    renderCourseAdmin();
    renderAccounts();
    renderSessionMini();
    showMineSection(state.mineSection);
    setCoursePane(state.coursePane);
  }

  function isMineActive() {
    return $('#panel-mine').classList.contains('active');
  }

  function renderSessionMini() {
    const el = $('#mineSessionMini');
    if (!el) return;
    el.textContent = Store.isGuest() ? '游客模式 · 未登录' : '@' + Store.currentUsername();
  }

  function renderProfile() {
    const p = Store.getProfile();
    const avatar = state.pendingAvatar || p.avatar;

    $('#profileName').value = p.displayName || '';
    $('#profileRole').textContent = Store.isGuest()
      ? '游客模式 · 未登录；注册后可以切换用户'
      : `@${Store.currentUsername()} · 本机账号`;
    $('#guestNotice').hidden = !Store.isGuest();
    $('#profileAvatarPreview').innerHTML = avatarHtml(avatar);

    const choices = $('#avatarChoices');
    choices.innerHTML = AVATAR_EMOJIS.map((e) =>
      `<button class="avatar-choice${e === avatar ? ' active' : ''}" type="button" data-avatar="${e}" aria-label="选择头像 ${e}">${e}</button>`
    ).join('');

    renderProfileStats();
  }

  function renderProfileStats() {
    const tasks = Store.getTasks();
    const custom = Store.getCourses();
    const courses = custom === null ? COURSES : custom;
    const names = new Set(courses.map((c) => c.name));
    $('#profileStats').innerHTML = `
      <div class="stat-tile"><b>${tasks.length}</b><span>全部待办</span></div>
      <div class="stat-tile"><b>${tasks.filter((t) => t.done).length}</b><span>已完成</span></div>
      <div class="stat-tile"><b>${names.size}</b><span>课表课程</span></div>`;
  }

  function updateAvatarPreview() {
    const avatar = state.pendingAvatar || Store.getProfile().avatar;
    $('#profileAvatarPreview').innerHTML = avatarHtml(avatar);
    $$('#avatarChoices .avatar-choice').forEach((b) => {
      b.classList.toggle('active', b.dataset.avatar === avatar);
    });
  }

  function resizeAvatarFile(file, cb) {
    if (!file || !/^image\//.test(file.type)) { toast('请选择图片文件'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        cb(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => toast('图片读取失败');
      img.src = reader.result;
    };
    reader.onerror = () => toast('图片读取失败');
    reader.readAsDataURL(file);
  }

  /* --------------------------------------------------------- 课表管理 */
  function renderCourseAdmin() {
    const custom = Store.getCourses();
    const list = activeCourses;
    const source = $('#courseSource');
    if (source) {
      source.textContent = custom === null
        ? `正在使用内置示例课表 · ${list.length} 个上课时段`
        : `我的自定义课表 · ${list.length} 个上课时段`;
    }
    const count = $('#courseCount');
    if (count) count.textContent = String(list.length);
    const reset = $('#btnResetCourses');
    if (reset) reset.disabled = custom === null;
    renderCourseList();
  }

  function renderCourseList() {
    const el = $('#courseList');
    if (!el) return;
    if (!activeCourses.length) {
      el.innerHTML = '<div class="course-empty">当前课表是空的。可以导入或手动添加课程。</div>';
      return;
    }
    let html = '';
    for (let d = 1; d <= 7; d++) {
      const list = activeCourses
        .filter((c) => c.day === d)
        .sort((a, b) => Math.min.apply(null, a.periods) - Math.min.apply(null, b.periods));
      if (!list.length) continue;
      html += `<div class="course-group-label">${DAY_NAMES[d - 1]}</div>`;
      list.forEach((c) => {
        const first = Math.min.apply(null, c.periods);
        const last = Math.max.apply(null, c.periods);
        html += `<div class="course-row">
          <span class="course-color" style="background:${esc(c.color || '#5b9bd5')}"></span>
          <div class="course-info">
            <div class="ci-name">${esc(c.name)}</div>
            <div class="ci-sub">第${first}-${last}节 · ${esc(weeksText(c))} · ${esc(courseBuilding(c))} ${esc(c.room || '')}${c.teacher ? ' · ' + esc(c.teacher) : ''}</div>
          </div>
          <div class="course-actions">
            <button class="btn small" type="button" data-edit-course="${esc(c.id)}">编辑</button>
            <button class="btn small" type="button" data-del-course="${esc(c.id)}">删除</button>
          </div>
        </div>`;
      });
    }
    el.innerHTML = html;
  }

  function seedCourseList() {
    const custom = Store.getCourses();
    return custom === null ? clone(COURSES) : custom;
  }

  function fillCourseFormSelects() {
    const start = $('#courseStart'), end = $('#courseEnd');
    [start, end].forEach((sel) => {
      sel.innerHTML = '';
      PERIODS.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.no;
        o.textContent = `${p.no} 节 (${p.start})`;
        sel.appendChild(o);
      });
    });
    start.value = '1';
    end.value = '2';

    const place = $('#coursePlace');
    place.innerHTML = '<option value="">不关联校园地点</option>';
    const cats = {};
    PLACES.forEach((p) => { (cats[p.cat] = cats[p.cat] || []).push(p); });
    ['教学楼', '公共', '餐饮', '宿舍', '体育', '生活', '景观', '校门', '交通'].forEach((cat) => {
      if (!cats[cat]) return;
      const og = document.createElement('optgroup');
      og.label = cat;
      cats[cat].forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.full || p.name;
        og.appendChild(o);
      });
      place.appendChild(og);
    });
  }

  function resetCourseForm() {
    state.editingCourseId = null;
    $('#editCourseId').value = '';
    $('#courseName').value = '';
    $('#courseTeacher').value = '';
    $('#courseDay').value = '1';
    $('#courseStart').value = '1';
    $('#courseEnd').value = '2';
    $('#courseWeeks').value = '';
    $('#coursePlace').value = '';
    $('#courseRoom').value = '';
    $('#courseColor').value = '#5b9bd5';
    $('#manualFormTitle').textContent = '手动添加课程';
    $('#btnCourseSubmit').textContent = '添加到课表';
    $('#btnCourseCancel').hidden = true;
  }

  function editCourse(id) {
    const c = activeCourses.find((x) => x.id === id);
    if (!c) return;
    state.editingCourseId = id;
    const first = Math.min.apply(null, c.periods), last = Math.max.apply(null, c.periods);
    $('#editCourseId').value = id;
    $('#courseName').value = c.name || '';
    $('#courseTeacher').value = c.teacher || '';
    $('#courseDay').value = String(c.day);
    $('#courseStart').value = String(first);
    $('#courseEnd').value = String(last);
    $('#courseWeeks').value = weeksInputText(c.weeks);
    $('#coursePlace').value = c.placeId || '';
    $('#courseRoom').value = c.room || '';
    $('#courseColor').value = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#5b9bd5';
    $('#manualFormTitle').textContent = '编辑课程';
    $('#btnCourseSubmit').textContent = '保存修改';
    $('#btnCourseCancel').hidden = false;
    setCoursePane('manual');
    $('#pane-manual').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function submitCourseForm(ev) {
    ev.preventDefault();
    const name = $('#courseName').value.trim();
    if (!name) { toast('请填写课程名'); $('#courseName').focus(); return; }
    let start = Number($('#courseStart').value);
    let end = Number($('#courseEnd').value);
    if (end < start) { const t = start; start = end; end = t; }
    const periods = [];
    for (let i = start; i <= end; i++) periods.push(i);
    const day = Number($('#courseDay').value);
    const placeId = $('#coursePlace').value || null;
    const p = placeId ? placeById(placeId) : null;
    const weeksRaw = $('#courseWeeks').value.trim();

    const list = seedCourseList();
    const editing = state.editingCourseId;
    const course = {
      id: editing || uid('manual-'),
      name,
      teacher: $('#courseTeacher').value.trim(),
      day,
      periods,
      building: p ? p.short : '地点待定',
      placeId,
      room: $('#courseRoom').value.trim(),
      color: $('#courseColor').value || '#5b9bd5',
      weeks: weeksRaw ? Importer.parseWeeks(weeksRaw) : { type: 'all' },
      note: '手动添加的课程',
    };

    if (editing) {
      const i = list.findIndex((x) => x.id === editing);
      if (i >= 0) list[i] = course; else list.push(course);
    } else {
      list.push(course);
    }
    Store.saveCourses(list);
    resetCourseForm();
    setCoursePane('list');
    toast(editing ? '课程已更新' : '课程已添加');
  }

  function deleteCourse(id) {
    const c = activeCourses.find((x) => x.id === id);
    if (!c) return;
    if (!window.confirm(`删除课程「${c.name}」？`)) return;
    const list = seedCourseList();
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    Store.saveCourses(list);
    if (state.editingCourseId === id) resetCourseForm();
    toast('课程已删除');
  }

  function parseImport() {
    const text = $('#importText').value;
    const result = Importer.parse(text);
    state.pendingImport = result;
    renderImportPreview(result);
    if (result.courses.length) toast(`已识别 ${result.courses.length} 个上课时段`);
    else toast('没有识别出课程，请查看下方提示');
  }

  function renderImportPreview(result) {
    const el = $('#importPreview');
    const replace = $('#btnImportReplace');
    const append = $('#btnImportAppend');
    if (!result) {
      el.innerHTML = '';
      replace.disabled = true;
      append.disabled = true;
      return;
    }
    const ok = result.courses.length > 0;
    replace.disabled = !ok;
    append.disabled = !ok;

    let html = `<div class="import-summary">识别格式：<b>${esc(result.format)}</b> · 找到 <b>${result.courses.length}</b> 个上课时段</div>`;
    if (result.warnings && result.warnings.length) {
      const shown = result.warnings.slice(0, 6);
      html += `<div class="import-warnings"><b>需要注意</b><ul>${shown.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>${result.warnings.length > 6 ? `<div>还有 ${result.warnings.length - 6} 条提示…</div>` : ''}</div>`;
    }
    if (ok) {
      html += '<div class="preview-list">';
      result.courses.slice(0, 30).forEach((c) => {
        const first = Math.min.apply(null, c.periods);
        const last = Math.max.apply(null, c.periods);
        html += `<div class="preview-item">
          <span class="dot" style="background:${esc(c.color || '#5b9bd5')}"></span>
          <div class="pv-main">
            <div>${esc(c.name)}${c.teacher ? ' · ' + esc(c.teacher) : ''}</div>
            <div class="pv-sub">${DAY_NAMES[c.day - 1]} 第${first}-${last}节 · ${esc(weeksText(c))} · ${esc(c.building || '地点待定')} ${esc(c.room || '')}</div>
          </div>
        </div>`;
      });
      if (result.courses.length > 30) html += `<div class="preview-empty">还有 ${result.courses.length - 30} 条未展开…</div>`;
      html += '</div>';
    } else if (!result.warnings || !result.warnings.length) {
      html += '<div class="preview-empty">没有识别出课程。</div>';
    }
    el.innerHTML = html;
  }

  function importReplace() {
    const result = state.pendingImport;
    if (!result || !result.courses.length) return;
    if (!window.confirm(`将用识别出的 ${result.courses.length} 个上课时段替换当前课表，继续？`)) return;
    Store.saveCourses(result.courses.map(clone));
    state.pendingImport = null;
    renderImportPreview(null);
    setCoursePane('list');
    toast('课表已替换');
  }

  function importAppend() {
    const result = state.pendingImport;
    if (!result || !result.courses.length) return;
    const list = seedCourseList();
    const seen = new Set(list.map(courseDedupeKey));
    let added = 0;
    result.courses.forEach((c) => {
      const key = courseDedupeKey(c);
      if (seen.has(key)) return;
      seen.add(key);
      list.push(clone(c));
      added++;
    });
    if (!added) { toast('这些课程已经在课表里了'); return; }
    Store.saveCourses(list);
    state.pendingImport = null;
    renderImportPreview(null);
    setCoursePane('list');
    toast(`已追加 ${added} 个上课时段`);
  }

  /* --------------------------------------------------------- 账号 */
  function renderAccounts() {
    renderCurrentAccount();
    renderAccountList();
    renderSessionMini();
  }

  function renderCurrentAccount() {
    const el = $('#currentAccountBox');
    if (!el) return;
    const p = Store.getProfile();
    const acc = Store.currentAccount();
    el.innerHTML = `<div class="current-account">
      <span class="avatar-mid">${avatarHtml(p.avatar)}</span>
      <div class="acct-id">
        <b>${esc(p.displayName)}</b>
        <span>${acc ? '@' + esc(acc.username) : '游客模式 · 数据保存在本机'}</span>
      </div>
      ${acc ? '<button class="btn small" type="button" data-account-action="logout">退出登录</button>' : '<span class="acct-badge">游客</span>'}
    </div>`;
  }

  function renderAccountList() {
    const el = $('#accountList');
    if (!el) return;
    const users = Store.listUsers();
    el.innerHTML = users.map((u) => {
      if (u.current) {
        return `<div class="acct-row" data-user="${esc(u.username)}">
          <div class="acct-main">
            <span class="avatar-mid">${avatarHtml(u.avatar)}</span>
            <div class="acct-id"><b>${esc(u.displayName)}</b><span>${u.guest ? '游客模式' : '@' + esc(u.username)}</span></div>
            <span class="acct-badge">当前</span>
          </div>
        </div>`;
      }
      if (u.guest) {
        return `<div class="acct-row" data-user="${esc(u.username)}">
          <div class="acct-main">
            <span class="avatar-mid">${avatarHtml(u.avatar)}</span>
            <div class="acct-id"><b>${esc(u.displayName)}</b><span>不登录，直接使用游客数据</span></div>
            <button class="btn small" type="button" data-switch-guest="1">切换</button>
          </div>
        </div>`;
      }
      return `<div class="acct-row" data-user="${esc(u.username)}">
        <div class="acct-main">
          <span class="avatar-mid">${avatarHtml(u.avatar)}</span>
          <div class="acct-id"><b>${esc(u.displayName)}</b><span>@${esc(u.username)}</span></div>
          <button class="btn small" type="button" data-switch-start="1">切换</button>
        </div>
        <form class="acct-switch" data-switch-form="1" hidden>
          <input type="password" placeholder="输入密码" autocomplete="current-password">
          <button class="btn small primary" type="button" data-switch-confirm="1">确认</button>
          <button class="btn small ghost" type="button" data-switch-cancel="1">取消</button>
        </form>
      </div>`;
    }).join('');
  }

  function showMineAccountsAndRegister() {
    showMineSection('accounts');
    renderAccounts();
    const form = $('#registerForm');
    if (form.hidden) {
      form.hidden = false;
      $('#btnToggleRegister').textContent = '收起';
    }
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function handleLogin(ev) {
    ev.preventDefault();
    const btn = ev.target.querySelector('button[type="submit"]');
    const err = $('#loginError');
    err.textContent = '';
    btn.disabled = true;
    try {
      const acc = await Store.login($('#loginUser').value, $('#loginPass').value);
      $('#loginForm').reset();
      toast(`已登录：${acc.displayName}`);
      showMineSection('profile');
    } catch (e) {
      err.textContent = e.message || '登录失败';
    } finally {
      btn.disabled = false;
    }
  }

  async function handleRegister(ev) {
    ev.preventDefault();
    const btn = ev.target.querySelector('button[type="submit"]');
    const err = $('#registerError');
    err.textContent = '';
    const pass = $('#regPass').value;
    if (pass !== $('#regPass2').value) {
      err.textContent = '两次输入的密码不一致';
      return;
    }
    btn.disabled = true;
    try {
      const acc = await Store.register({
        username: $('#regUser').value,
        displayName: $('#regName').value,
        password: pass,
        migrateGuest: $('#regMigrate').checked,
      });
      $('#registerForm').reset();
      $('#registerForm').hidden = true;
      $('#btnToggleRegister').textContent = '展开';
      toast(`已注册并登录：${acc.displayName}`);
      showMineSection('profile');
    } catch (e) {
      err.textContent = e.message || '注册失败';
    } finally {
      btn.disabled = false;
    }
  }

  async function handleAccountSwitch(row, password) {
    const username = row.dataset.user;
    try {
      const acc = await Store.switchTo(username, password);
      toast(acc ? `已切换到 ${acc.displayName}` : '已切换到游客模式');
    } catch (e) {
      toast(e.message || '切换失败');
    }
  }

  /* =========================================================== Tab */
  function switchTab(name) {
    if (!['schedule', 'route', 'mine'].includes(name)) name = 'schedule';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    $('#weekTools').hidden = name !== 'schedule';
    $('#weekRange').hidden = name !== 'schedule';
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'route') renderMap();
    if (name === 'mine') renderMine();
  }

  /* =========================================================== 初始化 */
  function init() {
    refreshActiveCourses();
    buildWeekSelect();
    fillCourseFormSelects();
    renderUserChip();
    renderTimetable();
    renderTodo();

    fillSelect($('#fromSelect'), 'zhuyuan1');
    fillSelect($('#toSelect'), 'mingde');
    state.fromId = 'zhuyuan1';
    state.toId = 'mingde';

    $('#weekSelect').addEventListener('change', (e) => {
      state.week = +e.target.value;
      renderTimetable();
      renderNext();
      computeRoute();
    });

    $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    $('#topUserChip').addEventListener('click', () => switchTab('mine'));

    $('#searchBox').addEventListener('input', renderTimetable);
    $('#clearSearch').addEventListener('click', () => { $('#searchBox').value = ''; renderTimetable(); });

    /* 待办 */
    $('#taskForm').addEventListener('submit', (e) => {
      e.preventDefault();
      addTask($('#taskInput').value, $('#taskTime').value);
    });
    $('#taskList').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'toggle') toggleTask(btn.dataset.id);
      if (btn.dataset.action === 'del') deleteTask(btn.dataset.id);
    });
    $('#dayStrip').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-date]');
      if (btn) setSelectedDate(parseYmd(btn.dataset.date), true);
    });
    $('#prevWeek').addEventListener('click', () => setSelectedDate(addDays(state.selectedDate, -7), true));
    $('#nextWeek').addEventListener('click', () => setSelectedDate(addDays(state.selectedDate, 7), true));
    $('#btnToday').addEventListener('click', () => setSelectedDate(new Date(), true));

    /* 月历 */
    $('#btnCalendar').addEventListener('click', openCalendar);
    $('#calClose').addEventListener('click', closeCalendar);
    $('#calendarMask').addEventListener('click', (e) => { if (e.target === $('#calendarMask')) closeCalendar(); });
    $('#calPrev').addEventListener('click', () => {
      state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    $('#calNext').addEventListener('click', () => {
      state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + 1, 1);
      renderCalendar();
    });
    $('#calToday').addEventListener('click', () => {
      const now = new Date();
      state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      setSelectedDate(now, true);
      renderCalendar();
    });
    $('#calGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-date]');
      if (!btn) return;
      setSelectedDate(parseYmd(btn.dataset.date), true);
      closeCalendar();
    });

    /* 我的导航 */
    $('.mine-nav').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mine]');
      if (!btn) return;
      showMineSection(btn.dataset.mine);
      if (btn.dataset.mine === 'accounts') renderAccounts();
      if (btn.dataset.mine === 'timetable') renderCourseAdmin();
    });
    $('#courseTabs').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-course-pane]');
      if (btn) setCoursePane(btn.dataset.coursePane);
    });

    /* 用户资料 */
    $('#avatarChoices').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-avatar]');
      if (!btn) return;
      state.pendingAvatar = btn.dataset.avatar;
      updateAvatarPreview();
    });
    $('#profileAvatarPreview').addEventListener('click', () => $('#avatarFile').click());
    $('#btnUploadAvatar').addEventListener('click', () => $('#avatarFile').click());
    $('#avatarFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      resizeAvatarFile(file, (dataUrl) => {
        state.pendingAvatar = dataUrl;
        updateAvatarPreview();
        toast('头像已选好，点「保存资料」生效');
      });
    });
    $('#btnSaveProfile').addEventListener('click', () => {
      const name = $('#profileName').value.trim();
      if (!name) { toast('名字不能为空'); $('#profileName').focus(); return; }
      const avatar = state.pendingAvatar || Store.getProfile().avatar;
      state.pendingAvatar = null;
      Store.updateProfile({ displayName: name, avatar });
      toast('资料已保存');
      renderProfile();
    });
    $('#btnGoRegister').addEventListener('click', showMineAccountsAndRegister);

    /* 课表导入 */
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) { toast('文件超过 3MB，请只上传课表相关页面'); return; }
      file.text().then((text) => {
        $('#importText').value = text;
        parseImport();
      }).catch(() => toast('文件读取失败'));
    });
    $('#btnParseImport').addEventListener('click', parseImport);
    $('#btnImportReplace').addEventListener('click', importReplace);
    $('#btnImportAppend').addEventListener('click', importAppend);

    /* 手动课表 */
    $('#courseForm').addEventListener('submit', submitCourseForm);
    $('#btnCourseCancel').addEventListener('click', () => { resetCourseForm(); setCoursePane('list'); });
    $('#courseList').addEventListener('click', (e) => {
      const edit = e.target.closest('button[data-edit-course]');
      const del = e.target.closest('button[data-del-course]');
      if (edit) editCourse(edit.dataset.editCourse);
      if (del) deleteCourse(del.dataset.delCourse);
    });
    $('#btnResetCourses').addEventListener('click', () => {
      if (Store.getCourses() === null) { toast('当前已经是内置课表'); return; }
      if (!window.confirm('恢复为内置示例课表？你导入或手动添加的课表会被替换。')) return;
      Store.resetCourses();
      resetCourseForm();
      toast('已恢复内置课表');
    });

    /* 账号 */
    $('#loginForm').addEventListener('submit', handleLogin);
    $('#registerForm').addEventListener('submit', handleRegister);
    $('#btnToggleRegister').addEventListener('click', () => {
      const form = $('#registerForm');
      form.hidden = !form.hidden;
      $('#btnToggleRegister').textContent = form.hidden ? '展开' : '收起';
    });
    $('#currentAccountBox').addEventListener('click', (e) => {
      if (e.target.closest('button[data-account-action="logout"]')) {
        Store.logout();
        toast('已退出登录，切换到游客模式');
      }
    });
    $('#accountList').addEventListener('click', (e) => {
      const row = e.target.closest('.acct-row');
      if (!row) return;
      const guest = e.target.closest('button[data-switch-guest]');
      if (guest) { handleAccountSwitch(row, ''); return; }
      const start = e.target.closest('button[data-switch-start]');
      if (start) {
        const form = row.querySelector('[data-switch-form]');
        if (form) { form.hidden = false; const input = form.querySelector('input'); if (input) input.focus(); }
        return;
      }
      const cancel = e.target.closest('button[data-switch-cancel]');
      if (cancel) {
        const form = row.querySelector('[data-switch-form]');
        if (form) form.hidden = true;
        return;
      }
      const confirm = e.target.closest('button[data-switch-confirm]');
      if (confirm) {
        const input = row.querySelector('[data-switch-form] input');
        handleAccountSwitch(row, input ? input.value : '');
      }
    });

    /* 路线 */
    $('#fromSelect').addEventListener('change', computeRoute);
    $('#toSelect').addEventListener('change', (e) => { state.toId = e.target.value; computeRoute(); });
    $('#btnSwap').addEventListener('click', () => {
      const f = $('#fromSelect').value, t = $('#toSelect').value;
      if (f === '__me') { $('#geoStatus').textContent = '起点是「我的位置」，无法交换。'; return; }
      $('#fromSelect').value = t; $('#toSelect').value = f;
      state.fromId = t; state.toId = f;
      computeRoute();
    });
    $('#modeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      state.mode = btn.dataset.mode;
      $$('#modeSeg button').forEach((b) => b.classList.toggle('active', b === btn));
      computeRoute();
    });
    $('#btnLocate').addEventListener('click', locate);
    $('#btnPickOnMap').addEventListener('click', () => {
      state.pickMode = true;
      $('#pickTools').style.display = 'block';
      $('#geoStatus').textContent = '点选模式：在地图上单击以设定起点。';
    });
    $('#btnCancelPick').addEventListener('click', () => {
      state.pickMode = false; $('#pickTools').style.display = 'none';
    });
    $('#btnRoads').addEventListener('click', () => {
      state.showRoads = !state.showRoads;
      $('#btnRoads').classList.toggle('active', state.showRoads);
      const g = $('#gRoads');
      if (g) g.classList.toggle('hidden', !state.showRoads);
    });
    $('#btnEditMk').addEventListener('click', () => setEditMode(true));
    $('#btnCancelEdit').addEventListener('click', () => setEditMode(false));
    $('#btnResetMk').addEventListener('click', () => {
      Object.keys(markerOverrides).forEach((k) => delete markerOverrides[k]);
      saveMarkers(); nodeLabelCacheReset(); renderMap(); computeRoute();
    });
    $('#btnSaveMk').addEventListener('click', () => {
      saveMarkers();
      setEditMode(false);
      $('#geoStatus').textContent = '地点位置已保存到本机浏览器。';
    });

    /* 弹窗 */
    $('#mClose').addEventListener('click', closeModal);
    $('#modalMask').addEventListener('click', (e) => { if (e.target === $('#modalMask')) closeModal(); });
    $('#mGo').addEventListener('click', () => {
      if (!modalCourse || !coursePlace(modalCourse)) return;
      closeModal();
      setDestination(modalCourse.placeId);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeModal(); closeCalendar(); }
    });

    initMapClick();
    bindSettings();
    computeRoute();
    renderNext();

    Store.subscribe((type) => {
      if (type === 'auth') {
        state.editingCourseId = null;
        state.pendingImport = null;
        state.pendingAvatar = null;
        refreshActiveCourses();
        renderUserChip();
        renderTimetable();
        renderNext();
        renderTodo();
        if (isMineActive()) renderMine();
        if ($('#calendarMask').classList.contains('show')) renderCalendar();
      } else if (type === 'profile') {
        renderUserChip();
        if (isMineActive()) {
          renderProfile();
          renderAccounts();
        }
      } else {
        refreshActiveCourses();
        renderTimetable();
        renderNext();
        renderTodo();
        if (isMineActive()) {
          renderCourseAdmin();
          renderProfileStats();
          renderSessionMini();
        }
        if ($('#calendarMask').classList.contains('show')) renderCalendar();
      }
    });

    switchTab((location.hash || '').replace('#', '') || 'schedule');
    window.addEventListener('hashchange', () => switchTab((location.hash || '').replace('#', '')));

    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(renderNext, 1000);

    // 页面跨过午夜时，任务栏自动跟到新的一天
    let lastTodayKey = ymd(new Date());
    setInterval(() => {
      const nowKey = ymd(new Date());
      if (nowKey === lastTodayKey) return;
      const wasShowingToday = ymd(state.selectedDate) === lastTodayKey;
      lastTodayKey = nowKey;
      if (wasShowingToday) setSelectedDate(new Date(), true);
      else renderTodo();
      renderTimetable();
      renderNext();
    }, 30000);
  }

  function setEditMode(on) {
    state.editMode = on;
    state.dragging = null;
    $('#editTools').style.display = on ? 'block' : 'none';
    $('#btnEditMk').classList.toggle('active', on);
    $('#mapWrap').classList.toggle('editing', on);
    nodeLabelCacheReset();
    renderMap();
    if (!on) computeRoute();
  }

  function nodeLabelCacheReset() { Object.keys(nodeLabelCache).forEach((k) => delete nodeLabelCache[k]); }

  document.addEventListener('DOMContentLoaded', init);
})();
