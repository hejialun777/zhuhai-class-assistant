/* =========================================================================
 * app.js — 课表渲染 / 搜索 / 下一节课 / 路线规划 / 地图
 * ========================================================================= */
(function () {
  'use strict';

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const LS_SETTINGS = 'campusTool.settings';
  const LS_MARKERS  = 'campusTool.markerOverrides';

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
  };

  const settings = Object.assign(
    { walkSpeed: TRAVEL.walkSpeed, bikeSpeed: TRAVEL.bikeSpeed, metersPerPx: TRAVEL.metersPerPx },
    JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}')
  );
  const markerOverrides = JSON.parse(localStorage.getItem(LS_MARKERS) || '{}');

  function saveSettings() { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }
  function saveMarkers()  { localStorage.setItem(LS_MARKERS, JSON.stringify(markerOverrides)); }

  /* ---------------------------------------------------------------- 日期 */
  function parseYmd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function md(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }

  const WEEK1 = parseYmd(TERM.week1Monday);
  function mondayOfWeek(n) { return addDays(WEEK1, (n - 1) * 7); }
  function weekOfDate(d) {
    const diff = Math.round((startOfDay(d) - startOfDay(WEEK1)) / 86400000);
    return Math.floor(diff / 7) + 1;
  }
  function hhmmToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minToHHMM(mins) {
    mins = Math.round(mins);
    const h = Math.floor(mins / 60) % 24, m = ((mins % 60) + 60) % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function todayIndex() { const d = new Date().getDay(); return d === 0 ? 7 : d; }

  /* ------------------------------------------------------- 周次有效性 */
  function courseRunsThisWeek(c, week) {
    const w = c.weeks || { type: 'all' };
    switch (w.type) {
      case 'odd':   return week % 2 === 1;
      case 'even':  return week % 2 === 0;
      case 'range': return week >= w.from && week <= w.to;
      case 'later': return false;          // 尚未开课
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

  /* ------------------------------------------------------- 地点工具 */
  function placeById(id) { return PLACES.find((p) => p.id === id); }
  function placePos(p) {
    const o = markerOverrides[p.id];
    return { x: o ? o.x : p.x, y: o ? o.y : p.y };
  }
  const COURSE_PLACE_IDS = new Set(COURSES.map((c) => c.placeId));

  /* 当前起点：优先「我的位置」，否则取下拉框里的地点 */
  function currentFrom() {
    const sel = $('#fromSelect').value;
    if (state.myPos && sel === '__me') {
      return { pos: state.myPos, label: state.myPos.label, placeId: null };
    }
    const p = placeById(sel) || placeById(state.fromId);
    if (!p) return null;
    return { pos: placePos(p), label: p.name, placeId: p.id };
  }

  /* ================================================================ 课表 */
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
    const initial = (curWeek >= 1 && curWeek <= TERM.totalWeeks) ? curWeek : 3;
    state.week = initial;
    sel.value = initial;
  }

  function renderTimetable() {
    const tt = $('#timetable');
    tt.innerHTML = '';

    const mon = mondayOfWeek(state.week), sun = addDays(mon, 6);
    $('#weekRange').textContent =
      `第 ${state.week} 周 · ${ymd(mon)} ~ ${ymd(sun)}`;

    const curWeek = weekOfDate(new Date());
    const todayIdx = todayIndex();

    // 表头
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

    // 时间栏 + 空单元格
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

    // 课程块
    const query = ($('#searchBox').value || '').trim().toLowerCase();
    const hits = new Set();

    COURSES.forEach((c) => {
      const running = courseRunsThisWeek(c, state.week);
      if (c.weeks && c.weeks.type === 'later') { /* 仍然显示，但置灰 */ }

      const first = Math.min.apply(null, c.periods);
      const span = c.periods.length;

      const btn = document.createElement('button');
      btn.className = 'tb-course' + (running ? '' : ' later');
      btn.style.gridColumn = c.day + 1;
      btn.style.gridRow = (first + 1) + ' / span ' + span;
      btn.style.background = c.color;
      if (!running) btn.style.opacity = '.45';
      btn.dataset.id = c.id;

      const label = c.shortName || c.name;
      btn.innerHTML =
        `<span class="cn">${label}</span>` +
        `<span class="cr">${c.building} ${c.room}</span>` +
        (c.teacher ? `<span class="ct">${c.teacher}</span>` : '');

      if (query) {
        const hay = [c.name, c.shortName || '', c.teacher, c.building, c.room, placeById(c.placeId) && placeById(c.placeId).full]
          .join(' ').toLowerCase();
        if (hay.indexOf(query) >= 0) { hits.add(c.id); btn.classList.add('hit'); }
        else btn.classList.add('dim');
      }

      btn.addEventListener('click', () => openCourse(c));
      tt.appendChild(btn);
    });

    // 搜索无结果提示
    if (query && hits.size === 0) {
      const note = document.createElement('div');
      note.className = 'tb-empty-note';
      note.style.gridColumn = '2 / span 7';
      note.style.gridRow = PERIODS.length + 1;
      note.textContent = '没有匹配的课程。';
      tt.appendChild(note);
    }
  }

  /* ======================================================== 下一节课 */
  let tickTimer = null;

  function currentSessionsSorted() {
    return COURSES
      .filter((c) => courseRunsThisWeek(c, state.week))
      .map((c) => {
        const first = Math.min.apply(null, c.periods);
        const last  = Math.max.apply(null, c.periods);
        return {
          c, day: c.day,
          startMin: hhmmToMin(PERIODS[first - 1].start),
          endMin:   hhmmToMin(PERIODS[last - 1].end),
          first, last,
          place: placeById(c.placeId),
        };
      })
      .sort((a, b) => (a.day - b.day) || (a.startMin - b.startMin));
  }

  function renderNext() {
    const box = $('#nextCard');
    const now = new Date();
    const curWeek = weekOfDate(now);
    const isThisWeek = curWeek === state.week;

    const list = currentSessionsSorted();

    if (!list.length) {
      box.className = 'next none';
      $('#nextTitle').textContent = '本周没有安排课程';
      $('#nextMeta').textContent = '（形势与政策I 标注为「多周后」开课）';
      $('#nextCountdown').textContent = '';
      return;
    }

    if (!isThisWeek) {
      const s = list[0];
      box.className = 'next none';
      $('#nextBadge').textContent = `第${state.week}周`;
      $('#nextTitle').textContent = `共 ${list.length} 节课（非本周，仅预览）`;
      $('#nextMeta').textContent =
        `首节：${DAY_NAMES[s.day - 1]} ${PERIODS[s.first - 1].start} ${s.c.name}@${s.place ? s.place.name : ''}${s.c.room}`;
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
      $('#nextTitle').textContent = `${ongoing.c.name} @${ongoing.place ? ongoing.place.name : ongoing.c.building} ${ongoing.c.room}`;
      $('#nextMeta').textContent = `${DAY_NAMES[ongoing.day - 1]} 第${ongoing.first}-${ongoing.last}节 · ${PERIODS[ongoing.first - 1].start}–${PERIODS[ongoing.last - 1].end}`;
      $('#nextCountdown').innerHTML =
        '<span class="cd-label">距离下课还有</span>' + fmtDur(ongoing.endMin - nowMin);
      return;
    }

    if (!target) {
      box.className = 'next none';
      $('#nextBadge').textContent = '本周已结课';
      $('#nextTitle').textContent = '本周课程已全部结束 🎉';
      $('#nextMeta').textContent = `下周共 ${COURSES.filter((c) => courseRunsThisWeek(c, state.week + 1)).length} 节课`;
      $('#nextCountdown').textContent = '';
      return;
    }

    const mins = minsUntilSession(target, now);
    box.className = 'next' + (mins <= 30 ? ' urgent' : '');
    $('#nextBadge').textContent = '下一节课';
    $('#nextTitle').textContent =
      `${target.c.name} @${target.place ? target.place.name : target.c.building} ${target.c.room}`;
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
    const leaveAt = session.startMin - r.seconds / 60 - 5;  // 提前 5 分钟到
    return `从${origin.label}步行约 ${Math.round(r.seconds / 60)} 分钟 · 建议 ${minToHHMM(leaveAt)} 前出发`;
  }

  function fmtDur(mins) {
    mins = Math.max(0, Math.round(mins));
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h <= 0) return m + ' 分钟';
    return h + ' 小时 ' + (m ? m + ' 分' : '');
  }

  /* =========================================================== 弹窗 */
  let modalCourse = null;
  function openCourse(c) {
    modalCourse = c;
    const p = placeById(c.placeId);
    const first = Math.min.apply(null, c.periods), last = Math.max.apply(null, c.periods);
    $('#mTitle').innerHTML = `<span class="swatch" style="background:${c.color}"></span>${c.name}`;
    $('#mSub').textContent = c.note || (courseRunsThisWeek(c, state.week) ? '' : '（本周不上此课）');
    $('#mTime').textContent =
      `${DAY_NAMES[c.day - 1]} 第${first}-${last}节  ${PERIODS[first - 1].start}–${PERIODS[last - 1].end}`;
    $('#mBuilding').textContent = p ? p.full : c.building;
    $('#mRoom').textContent = c.room;
    $('#mTeacher').innerHTML = c.teacher || '<span class="hint">课表截图未提供，可在 js/data.js 的 teacher 字段补充</span>';
    $('#mWeeks').textContent = weeksText(c);
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

  /* 节点 → 人类可读名称（取最近的地点） */
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
    svg.innerHTML = '';

    // 路网
    const gRoads = el('g', { id: 'gRoads', class: state.showRoads ? '' : 'hidden' });
    ROAD.edges.forEach(([a, b]) => {
      const A = ROAD.nodes[a], B = ROAD.nodes[b];
      if (!A || !B) return;
      gRoads.appendChild(el('line', { x1: A[0], y1: A[1], x2: B[0], y2: B[1], class: 'road' }));
    });
    svg.appendChild(gRoads);

    // 路线
    const gRoute = el('g', { id: 'gRoute' });
    if (state.route && state.route.points.length > 1) {
      const d = state.route.points.map((p, i) => (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
      gRoute.appendChild(el('path', { d, class: 'route-casing' }));
      gRoute.appendChild(el('path', { d, class: 'route-line' + (state.route.mode === 'bike' ? ' bike' : '') }));
    }
    svg.appendChild(gRoute);

    // 地点标记
    const gMk = el('g', { id: 'gMk' });
    const origin = currentFrom();
    const fromPos = origin ? origin.pos : null;
    const fromPlaceId = origin ? origin.placeId : null;
    const toPos   = state.toId ? placePos(placeById(state.toId)) : null;

    PLACES.forEach((p) => {
      const pos = placePos(p);
      const isFrom = fromPlaceId === p.id;
      const isTo   = state.toId === p.id;
      const showLabel = COURSE_PLACE_IDS.has(p.id) || isFrom || isTo || p.needsCheck;

      const g = el('g', {
        class: 'mk' + (showLabel ? ' always' : '') + (isFrom ? ' mk-start' : '') + (isTo ? ' mk-end' : ''),
        'data-id': p.id,
      });
      g.appendChild(el('circle', { class: 'mk-dot' + (COURSE_PLACE_IDS.has(p.id) ? ' course' : ''), cx: pos.x, cy: pos.y, r: 8 }));
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

    // GPS / 点选起点
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

  /* 点选模式 */
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
        // 吸附到最近地点，方便辨认
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
    const toSel = $('#toSelect').value;
    const origin = currentFrom();
    if (!origin) return;
    const from = origin.pos, fromLabel = origin.label;
    if (origin.placeId) state.fromId = origin.placeId;

    const toP = placeById(toSel);
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

    // 已在上课地点 → 提示几点前出发
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

  /* =========================================================== Tab */
  function switchTab(name) {
    if (name !== 'schedule' && name !== 'route') name = 'schedule';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'route') renderMap();
  }

  /* =========================================================== 初始化 */
  function init() {
    buildWeekSelect();
    renderTimetable();

    // 起终点下拉
    fillSelect($('#fromSelect'), 'zhuyuan1');
    fillSelect($('#toSelect'), 'mingde');
    state.fromId = 'zhuyuan1';
    state.toId = 'mingde';

    // 周次切换
    $('#weekSelect').addEventListener('change', (e) => {
      state.week = +e.target.value;
      renderTimetable();
      renderNext();
      computeRoute();
    });

    // Tab
    $$('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

    // 搜索
    $('#searchBox').addEventListener('input', renderTimetable);
    $('#clearSearch').addEventListener('click', () => { $('#searchBox').value = ''; renderTimetable(); });

    // 起终点
    // myPos 始终保留；只有下拉框选中「我的位置」时才会被当作起点
    $('#fromSelect').addEventListener('change', computeRoute);
    $('#toSelect').addEventListener('change', (e) => { state.toId = e.target.value; computeRoute(); });
    $('#btnSwap').addEventListener('click', () => {
      const f = $('#fromSelect').value, t = $('#toSelect').value;
      if (f === '__me') { $('#geoStatus').textContent = '起点是「我的位置」，无法交换。'; return; }
      $('#fromSelect').value = t; $('#toSelect').value = f;
      state.fromId = t; state.toId = f;
      computeRoute();
    });

    // 方式
    $('#modeSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      state.mode = btn.dataset.mode;
      $$('#modeSeg button').forEach((b) => b.classList.toggle('active', b === btn));
      computeRoute();
    });

    // 定位 / 点选 / 路网 / 校准
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

    // 弹窗
    $('#mClose').addEventListener('click', closeModal);
    $('#modalMask').addEventListener('click', (e) => { if (e.target === $('#modalMask')) closeModal(); });
    $('#mGo').addEventListener('click', () => {
      if (!modalCourse) return;
      closeModal();
      setDestination(modalCourse.placeId);
    });

    initMapClick();
    bindSettings();
    computeRoute();
    renderNext();
    switchTab((location.hash || '').replace('#', '') || 'schedule');
    window.addEventListener('hashchange', () => switchTab((location.hash || '').replace('#', '')));
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(renderNext, 1000);
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
