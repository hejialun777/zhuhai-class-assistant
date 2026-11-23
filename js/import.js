/* =========================================================================
 * import.js — 课表导入解析
 *
 * 支持四种常见输入：
 *   1. 从网页课表复制出来的、带制表符的文本
 *   2. 保存下来的教务系统 / 课表网页 HTML
 *   3. 每行一条的文本：课程名|老师|周一|1-2|1-16|明德楼|A418
 *   4. 本程序格式的 JSON 数组
 *
 * 解析结果只是「候选」，导入前会先预览；解析不准的字段可以在「手动输入」
 * 里继续修改。网页课表没有统一格式，所以这里采用尽力而为的启发式解析。
 * ========================================================================= */
(function (root) {
  'use strict';

  const PALETTE = ['#e8695f', '#5b9bd5', '#6b74c9', '#f0a06a', '#8bc34a',
    '#3fb6a8', '#ef9a9a', '#b6b6b6', '#9c7bd8', '#e0a03a', '#4fa3a5', '#c77dba'];
  let seq = 0;

  const DAY_CHARS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 };

  /* data.js 用顶层 const 声明，不会挂到 window 上；这里通过全局词法作用域读取。 */
  function placesData() {
    try { return typeof PLACES !== 'undefined' && Array.isArray(PLACES) ? PLACES : (root.PLACES || []); }
    catch (e) { return root.PLACES || []; }
  }
  function periodCount() {
    try { return typeof PERIODS !== 'undefined' && Array.isArray(PERIODS) ? PERIODS.length : 12; }
    catch (e) { return 12; }
  }

  function clean(s) {
    return String(s == null ? '' : s)
      .replace(/ /g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function parseDay(text) {
    const s = String(text || '');
    const m = s.match(/(?:星期|周)\s*([一二三四五六日天1-7])/);
    if (m) {
      const c = m[1];
      return /[1-7]/.test(c) ? Number(c) : DAY_CHARS[c] || null;
    }
    return null;
  }

  function parsePeriods(text) {
    const s = String(text || '');
    let m = s.match(/(?:第\s*)?(\d{1,2})\s*[-–—~至]\s*(\d{1,2})\s*节?/);
    if (m) {
      let a = Number(m[1]), b = Number(m[2]);
      if (a > b) { const t = a; a = b; b = t; }
      return range(a, b);
    }
    m = s.match(/第\s*(\d{1,2})\s*节/);
    if (m) return [Number(m[1])];
    if (/^\s*\d{1,2}\s*$/.test(s)) return [Number(s.trim())];
    return null;
  }

  function parseWeeks(text) {
    const s = String(text || '');
    const single = /单周|\(\s*单\s*\)|（\s*单\s*）/.test(s);
    const double = /双周|\(\s*双\s*\)|（\s*双\s*）/.test(s);
    let m = s.match(/第?\s*(\d{1,2})\s*[-–—~至]\s*(\d{1,2})\s*周/);
    if (m) {
      if (single) return { type: 'odd' };
      if (double) return { type: 'even' };
      return { type: 'range', from: Number(m[1]), to: Number(m[2]) };
    }
    m = s.match(/第?\s*(\d{1,2})\s*周/);
    if (m) {
      if (single) return { type: 'odd' };
      if (double) return { type: 'even' };
      return { type: 'range', from: Number(m[1]), to: Number(m[1]) };
    }
    if (single) return { type: 'odd' };
    if (double) return { type: 'even' };
    return { type: 'all' };
  }

  function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }

  function resolvePlaceId(text) {
    const s = String(text || '');
    if (!s) return null;
    let best = null;
    const places = placesData();
    places.forEach((p) => {
      [p.name, p.short, p.full].filter(Boolean).forEach((n) => {
        if (s.indexOf(n) >= 0 && (!best || n.length > best.len)) best = { id: p.id, len: n.length };
      });
    });
    return best ? best.id : null;
  }

  function placeVars() {
    const out = [];
    placesData().forEach((p) => {
      [p.name, p.short, p.full].filter(Boolean).forEach((n) => out.push(n));
    });
    return Array.from(new Set(out)).sort((a, b) => b.length - a.length);
  }

  function stripPlaceNames(text) {
    let s = String(text || '');
    placeVars().forEach((n) => { s = s.split(n).join(' '); });
    return s
      .replace(/[（(][^（）()]{0,20}[)）]/g, ' ')
      .replace(/教室|上课地点|地点|校区/g, ' ')
      .replace(/[|,，;；:：]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function colorFor(name) {
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function courseId() {
    seq += 1;
    return 'imp-' + Date.now().toString(36) + '-' + seq;
  }

  function isMetaLine(line) {
    return /周|节次|学分|课程名称|任课|教师|地点|教室|备注|星期|上午|下午|晚上/.test(line) ||
      /^\s*\d{1,2}(?:[-–—~至]\d{1,2})?\s*$/.test(line);
  }

  function roomFromPlaceLine(line, placeId) {
    const p = placesData().find((x) => x.id === placeId);
    if (!p) return '';
    const variants = [p.name, p.short, p.full].filter(Boolean).sort((a, b) => b.length - a.length);
    for (const v of variants) {
      const idx = line.lastIndexOf(v);
      if (idx < 0) continue;
      const after = clean(line.slice(idx + v.length).replace(/[（(][^（）()]{0,20}[)）]/g, ' '));
      const before = clean(line.slice(0, idx).replace(/[（(][^（）()]{0,20}[)）]/g, ' '));
      const pick = after || before;
      if (!pick) continue;
      if (pick.length <= 15 && /[A-Za-z0-9]/.test(pick) && !/周|节|老师/.test(pick)) {
        return pick;
      }
      const matches = Array.from(pick.matchAll(/([A-Za-z]{1,4}[-]?\d{2,4}[A-Za-z]?|\b\d{3,4}\b)/g));
      if (matches.length) return matches[matches.length - 1][1];
    }
    return '';
  }

  function inferLocation(lines) {
    let building = '';
    let room = '';
    let placeId = null;
    let hitIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const pid = resolvePlaceId(lines[i]);
      if (!pid) continue;
      placeId = pid;
      const p = placesData().find((x) => x.id === pid);
      building = p ? (p.short || p.name) : clean(lines[i]);
      room = roomFromPlaceLine(lines[i], pid);
      hitIndex = i;
      break;
    }

    if (hitIndex >= 0 && !room && lines[hitIndex + 1]) {
      const next = clean(lines[hitIndex + 1]);
      if (/[A-Za-z0-9]/.test(next) && !isMetaLine(next)) room = next;
    }

    if (!room) {
      for (const line of lines) {
        if (isMetaLine(line) || resolvePlaceId(line)) continue;
        const m = line.match(/([A-Za-z]{1,3}[-]?\d{2,4}[A-Za-z]?|\b\d{3,4}\b)/);
        if (m) { room = m[1]; break; }
      }
    }

    return { building, room: String(room || '').replace(/\s+/g, ''), placeId };
  }

  function inferTeacher(lines, name) {
    const candidates = lines.filter((line) => {
      const s = clean(line);
      if (!s || s === name) return false;
      if (s.length < 2 || s.length > 6) return false;
      if (!/^[一-龥·]{2,6}$/.test(s)) return false;
      if (/周|节|课|班|组|楼|室|馆|场|校区|学院|专业|实验|上午|下午|晚上/.test(s)) return false;
      if (resolvePlaceId(s)) return false;
      return true;
    });
    return candidates.length ? candidates[candidates.length - 1] : '';
  }

  function cleanName(line) {
    return clean(line)
      .replace(/^[\[【(（]?\s*(?:必修|选修|实验|理论)\s*[\]】)）]?\s*/g, '')
      .replace(/^(课程名称|课程)[:：]?/, '')
      .trim();
  }

  function nameFromSingleLine(line) {
    let rest = String(line || '')
      .replace(/(?:第\s*)?\d{1,2}\s*[-–—~至]\s*\d{1,2}\s*周(?:\(\s*[单双]\s*\))?/g, ' ')
      .replace(/(?:星期|周)[一二三四五六日天1-7]/g, ' ')
      .replace(/第?\s*\d{1,2}\s*[-–—~至]\s*\d{1,2}\s*节?/g, ' ')
      .replace(/第\s*\d{1,2}\s*节/g, ' ')
      .replace(/[（(][^（）()]{0,20}[)）]/g, ' ');
    placeVars().forEach((n) => { rest = rest.split(n).join(' '); });
    rest = clean(rest
      .replace(/(?:小教|大教|阶梯|多媒体|实验|机房|语音|报告厅|体育馆|教学楼)[A-Za-z]?\d{0,4}[A-Za-z]?/g, ' ')
      .replace(/\b[A-Za-z]{0,3}\d{2,4}[A-Za-z]?\b/g, ' ')
      .replace(/[|,，;；:：]/g, ' '));
    if (!rest) return { name: '', teacher: '' };

    const parts = rest.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && /^[一-龥·]{2,4}$/.test(parts[parts.length - 1])) {
      return {
        name: cleanName(parts.slice(0, -1).join(' ')),
        teacher: parts[parts.length - 1],
      };
    }
    return { name: cleanName(rest), teacher: '' };
  }

  function makeCourseFromBlock(block, hints) {
    hints = hints || {};
    const lines = String(block || '')
      .split('\n')
      .map((x) => clean(x))
      .filter(Boolean);
    if (!lines.length) return null;

    const joined = lines.join(' ');
    const day = hints.day || parseDay(joined);
    const periods = (hints.periods && hints.periods.length) ? hints.periods : parsePeriods(joined);
    if (!day || !periods || !periods.length) return null;

    let name = '';
    for (const line of lines) {
      if (isMetaLine(line)) continue;
      if (resolvePlaceId(line)) continue;
      if (/^[一-龥·]{2,6}$/.test(line) && lines.indexOf(line) > 0 && !/[课论学程]/.test(line)) continue;
      name = cleanName(line);
      if (name) break;
    }

    let lineTeacher = '';
    if (!name) {
      const parsed = nameFromSingleLine(lines[0]);
      name = parsed.name;
      lineTeacher = parsed.teacher;
    }
    if (!name) return null;

    // 「大学英语B I（王莉娜）」这种把老师写在括号里的情况
    let embeddedTeacher = '';
    const tm = name.match(/[（(]([一-龥·]{2,6})[)）]\s*$/);
    if (tm) {
      embeddedTeacher = tm[1];
      name = name.replace(/[（(][^（）()]{2,10}[)）]\s*$/, '').trim();
    }

    const loc = inferLocation(lines);
    const teacher = embeddedTeacher || lineTeacher || inferTeacher(lines, name);

    return {
      id: courseId(),
      name,
      teacher,
      day,
      periods: periods.slice(),
      building: loc.building || '',
      placeId: loc.placeId,
      room: loc.room || '',
      color: colorFor(name),
      weeks: parseWeeks(joined),
      note: '导入课程，请核对时间地点',
    };
  }

  function splitBlocks(text) {
    const raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return [];
    const byBlank = raw.split(/\n\s*\n+/).map((x) => x.trim()).filter(Boolean);
    if (byBlank.length > 1) return byBlank;
    return [raw];
  }

  function dedupe(courses, warnings) {
    const seen = new Set();
    const out = [];
    courses.forEach((c) => {
      if (!c) return;
      if (!c.name || !c.day || !c.periods || !c.periods.length) {
        warnings.push('有一条内容缺少课程名、星期或节次，已跳过');
        return;
      }
      const periods = c.periods.map(Number).filter((p) => p >= 1 && p <= periodCount());
      if (!periods.length) {
        warnings.push(`「${c.name}」的节次无效，已跳过`);
        return;
      }
      periods.sort((a, b) => a - b);
      c.periods = range(periods[0], periods[periods.length - 1]);
      c.day = Math.max(1, Math.min(7, Number(c.day)));
      if (c.weeks && c.weeks.type === 'range') {
        c.weeks.from = Math.max(1, Math.min(30, Number(c.weeks.from) || 1));
        c.weeks.to = Math.max(c.weeks.from, Math.min(30, Number(c.weeks.to) || c.weeks.from));
      }
      c.color = /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : colorFor(c.name);
      c.id = c.id || courseId();
      const key = [c.name, c.day, c.periods.join(',')].join('|');
      if (seen.has(key)) {
        warnings.push(`跳过重复课程「${c.name}」周${c.day} 第${c.periods[0]}-${c.periods[c.periods.length - 1]}节`);
        return;
      }
      seen.add(key);
      out.push(c);
    });
    return out;
  }

  /* --------------------------------------------------------------- JSON */
  function parseJson(text) {
    const warnings = [];
    let data = JSON.parse(text);
    if (data && !Array.isArray(data) && Array.isArray(data.courses)) data = data.courses;
    if (!Array.isArray(data)) throw new Error('JSON 需要是课程数组，或 { courses: [...] }');
    const courses = data.map((item) => {
      if (!item || typeof item !== 'object') return null;
      const name = clean(item.name || item.course || item.title);
      if (!name) return null;
      const day = typeof item.day === 'number' ? item.day : parseDay(item.day || item.weekday || '');
      const periods = Array.isArray(item.periods)
        ? item.periods.map(Number)
        : parsePeriods(item.periods || item.period || item.time || '');
      const weeks = (item.weeks && typeof item.weeks === 'object')
        ? item.weeks
        : parseWeeks(item.weeks || item.week || '');
      let placeId = item.placeId || resolvePlaceId(item.building || item.place || '');
      if (placeId && !placesData().some((p) => p.id === placeId)) placeId = null;
      const p = placeId ? placesData().find((x) => x.id === placeId) : null;
      return {
        id: item.id || courseId(),
        name,
        teacher: clean(item.teacher || ''),
        day,
        periods,
        weeks,
        building: clean(item.building || (p ? p.short : '')),
        placeId,
        room: clean(item.room || ''),
        color: item.color || colorFor(name),
        note: item.note || '',
        shortName: item.shortName || '',
      };
    });
    return { format: 'JSON', courses: dedupe(courses, warnings), warnings };
  }

  /* ------------------------------------------------------- 制表符 / 文本 */
  function findHeaderRow(rows) {
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const dayCols = {};
      rows[r].forEach((cell, c) => {
        const d = parseDay(cell);
        if (d) dayCols[d] = c;
      });
      if (Object.keys(dayCols).length >= 2) return { row: r, dayCols };
    }
    return null;
  }

  function parseTabular(text) {
    const warnings = [];
    const lines = String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    const rows = lines.map((l) => l.split('\t').map(clean));
    const header = findHeaderRow(rows);
    if (!header) return null;

    const courses = [];
    for (let r = header.row + 1; r < rows.length; r++) {
      const row = rows[r];
      const minDayCol = Math.min.apply(null, Object.values(header.dayCols));
      const labelText = row.slice(0, Math.max(1, minDayCol)).join(' ');
      let periods = parsePeriods(labelText) || parsePeriods(row[0] || '');
      Object.keys(header.dayCols).forEach((d) => {
        const col = header.dayCols[d];
        const cell = row[col];
        if (!cell) return;
        if (!periods) {
          const p = parsePeriods(cell);
          if (p) periods = p;
        }
        if (!periods) {
          warnings.push(`第 ${r + 1} 行「周${d}」没有识别出节次`);
          return;
        }
        splitBlocks(cell).forEach((block) => {
          const c = makeCourseFromBlock(block, { day: Number(d), periods });
          if (c) courses.push(c);
          else warnings.push(`第 ${r + 1} 行「周${d}」有一块内容未识别：${clean(block).slice(0, 24)}`);
        });
      });
    }
    return { format: '网页表格文本', courses: dedupe(courses, warnings), warnings };
  }

  function parseStructuredLines(text) {
    const warnings = [];
    const courses = [];
    const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    lines.forEach((line) => {
      if (/^#/.test(line)) return;
      const cells = line.split(/\s*[|｜]\s*|\t+/).map(clean).filter((x) => x !== '');
      if (cells.length < 4) return;
      let name = '', teacher = '', day = null, periods = null, weeksText = '', building = '', room = '';
      if (parseDay(cells[2]) || parseDay(cells[1])) {
        name = cells[0];
        if (parseDay(cells[1])) {
          teacher = ''; day = parseDay(cells[1]); periods = parsePeriods(cells[2] || '');
          weeksText = cells[3] || ''; building = cells[4] || ''; room = cells[5] || '';
        } else {
          teacher = cells[1] || ''; day = parseDay(cells[2]); periods = parsePeriods(cells[3] || '');
          weeksText = cells[4] || ''; building = cells[5] || ''; room = cells[6] || '';
        }
      } else {
        return;
      }
      if (!name || !day || !periods) return;
      const placeId = resolvePlaceId(building);
      const p = placeId ? placesData().find((x) => x.id === placeId) : null;
      courses.push({
        id: courseId(),
        name: cleanName(name),
        teacher: clean(teacher),
        day,
        periods,
        weeks: parseWeeks(weeksText),
        building: p ? p.short : clean(building),
        placeId,
        room: clean(room) || (placeId ? stripPlaceNames(building) : ''),
        color: colorFor(name),
        note: '导入课程，请核对时间地点',
      });
    });
    if (!courses.length) return null;
    return { format: '分隔文本', courses: dedupe(courses, warnings), warnings };
  }

  function parsePlain(text) {
    const warnings = [];
    const lines = String(text).replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    const courses = [];
    splitBlocks(text).forEach((block) => {
      const c = makeCourseFromBlock(block, {});
      if (c) courses.push(c);
      else warnings.push('有一段内容未识别：' + clean(block).slice(0, 40));
    });
    if (!courses.length && lines.length) {
      warnings.push('没有识别出课程。建议粘贴带制表符的课表，或使用「课程名|老师|周一|1-2|1-16|楼栋|教室」格式。');
    }
    return { format: '纯文本', courses: dedupe(courses, warnings), warnings };
  }

  /* --------------------------------------------------------------- HTML */
  function cellText(cell) {
    const clone = cell.cloneNode(true);
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    clone.querySelectorAll('p,div,li').forEach((node) => {
      node.appendChild(node.ownerDocument.createTextNode('\n'));
    });
    return clone.textContent
      .replace(/\r/g, '')
      .split('\n')
      .map((x) => clean(x))
      .filter(Boolean)
      .join('\n');
  }

  function tableGrid(table) {
    const grid = [];
    Array.from(table.rows).forEach((tr, r) => {
      if (!grid[r]) grid[r] = [];
      let c = 0;
      Array.from(tr.cells).forEach((cell) => {
        while (grid[r][c]) c++;
        const rowspan = Math.max(1, cell.rowSpan || 1);
        const colspan = Math.max(1, cell.colSpan || 1);
        for (let i = 0; i < rowspan; i++) {
          if (!grid[r + i]) grid[r + i] = [];
          for (let j = 0; j < colspan; j++) grid[r + i][c + j] = cell;
        }
        c += colspan;
      });
    });
    return grid;
  }

  function parseHtml(html) {
    const warnings = [];
    let courses = [];
    let tables = [];

    if (typeof root.DOMParser === 'function') {
      const doc = new root.DOMParser().parseFromString(String(html), 'text/html');
      tables = Array.from(doc.querySelectorAll('table'));
    } else {
      warnings.push('当前环境不能解析 HTML，请粘贴表格文本');
      return { format: '网页 HTML', courses: [], warnings };
    }

    tables.forEach((table, tableIndex) => {
      const grid = tableGrid(table);
      let headerRow = -1;
      let dayCols = null;
      for (let r = 0; r < Math.min(grid.length, 8); r++) {
        const map = {};
        (grid[r] || []).forEach((cell, c) => {
          const d = cell ? parseDay(cellText(cell)) : null;
          if (d) map[d] = c;
        });
        if (Object.keys(map).length >= 2) { headerRow = r; dayCols = map; break; }
      }
      if (headerRow < 0 || !dayCols) return;

      const seen = new Set();
      const minDayCol = Math.min.apply(null, Object.values(dayCols));
      for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r] || [];
        Object.keys(dayCols).forEach((d) => {
          const col = dayCols[d];
          const cell = row[col];
          if (!cell || seen.has(cell)) return;
          seen.add(cell);

          let r0 = r, r1 = r;
          for (let rr = headerRow + 1; rr < grid.length; rr++) {
            if ((grid[rr] || [])[col] === cell) { r0 = Math.min(r0, rr); r1 = Math.max(r1, rr); }
          }

          let periods = null;
          for (let rr = r0; rr <= r1; rr++) {
            const labels = [];
            for (let cc = 0; cc < minDayCol; cc++) {
              const labelCell = (grid[rr] || [])[cc];
              if (labelCell) labels.push(cellText(labelCell));
            }
            const parsed = parsePeriods(labels.join(' '));
            if (parsed) periods = periods ? Array.from(new Set(periods.concat(parsed))).sort((a, b) => a - b) : parsed;
          }
          if (!periods) {
            warnings.push(`第 ${tableIndex + 1} 个表格有一格没有识别出节次（周${d}）`);
            return;
          }

          const text = cellText(cell);
          if (!text) return;
          splitBlocks(text).forEach((block) => {
            const c = makeCourseFromBlock(block, { day: Number(d), periods });
            if (c) courses.push(c);
            else warnings.push(`未识别课表单元格（周${d}）：${clean(block).slice(0, 24)}`);
          });
        });
      }
    });

    if (!tables.length) {
      const fallback = parsePlain(String(html).replace(/<[^>]+>/g, ' '));
      fallback.format = '网页 HTML';
      return fallback;
    }
    if (!courses.length && !warnings.length) warnings.push('网页里没有找到可识别的课表表格');
    return { format: '网页 HTML', courses: dedupe(courses, warnings), warnings };
  }

  /* --------------------------------------------------------------- 图片 OCR */
  const DAY_CN = ['一', '二', '三', '四', '五', '六', '日'];

  function isPunctWord(s) {
    return /^[\s,，.。;；:：、|丨()（）\[\]【】<>《》!！?？'"“”‘’·\-—_=+*#@%&/\\]+$/.test(s);
  }

  function parseTsvWords(tsv) {
    const out = [];
    String(tsv || '').split('\n').slice(1).forEach((line) => {
      const p = line.split('\t');
      if (p.length < 12 || Number(p[0]) !== 5) return;
      const text = clean(p.slice(11).join('\t'));
      if (!text || isPunctWord(text)) return;
      out.push({
        left: Number(p[6]) || 0,
        top: Number(p[7]) || 0,
        w: Number(p[8]) || 0,
        h: Number(p[9]) || 0,
        conf: Number(p[10]) || 0,
        text,
      });
    });
    return out;
  }

  function nearestPeriodByTime(text) {
    const m = String(text || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    let best = null, bestD = Infinity;
    const list = (typeof PERIODS !== 'undefined' && Array.isArray(PERIODS)) ? PERIODS : [];
    list.forEach((p) => {
      const t = p.start.split(':').map(Number);
      const tm = t[0] * 60 + t[1];
      const d = Math.abs(tm - mins);
      if (d < bestD) { bestD = d; best = p.no; }
    });
    return bestD <= 20 ? best : null;
  }

  function detectPeriodRows(leftWords, H) {
    const sorted = leftWords.slice().sort((a, b) => (a.top + a.h / 2) - (b.top + b.h / 2));
    const groups = [];
    const tol = Math.max(30, H * 0.06);
    sorted.forEach((w) => {
      const c = w.top + w.h / 2;
      const g = groups[groups.length - 1];
      if (g && Math.abs(c - g.c) <= tol) {
        g.items.push(w);
        g.c = (g.c * g.items.length + c) / (g.items.length + 1);
      } else {
        groups.push({ c, items: [w] });
      }
    });

    const rows = [];
    groups.forEach((g) => {
      let p = null;
      for (const w of g.items) {
        if (/^\d{1,2}$/.test(w.text)) {
          const n = Number(w.text);
          if (n >= 1 && n <= 12) { p = n; break; }
        }
      }
      if (!p) {
        for (const w of g.items) {
          const byTime = nearestPeriodByTime(w.text);
          if (byTime) { p = byTime; break; }
        }
      }
      if (p) {
        rows.push({ p, c: g.c, top: Math.min.apply(null, g.items.map((x) => x.top)) });
      }
    });

    const seen = new Set();
    return rows
      .sort((a, b) => a.top - b.top)
      .filter((r) => { if (seen.has(r.p)) return false; seen.add(r.p); return true; });
  }

  function detectDayHeaders(rawWords, H) {
    const found = [];
    const sorted = rawWords.slice().sort((a, b) => a.top - b.top || a.left - b.left);
    sorted.forEach((w) => {
      const m = w.text.match(/(?:星期|周)\s*([一二三四五六日天1-7])/);
      if (!m) return;
      const c = m[1];
      const day = /[1-7]/.test(c) ? Number(c) : DAY_CHARS[c];
      if (day) found.push({ day, cx: w.left + w.w / 2, top: w.top });
    });

    // OCR 有时会把「星期」「一」拆成两个词
    sorted.forEach((w, i) => {
      if (!/^(星期|周)$/.test(w.text)) return;
      const next = sorted.slice(i + 1).find((x) =>
        Math.abs((x.top + x.h / 2) - (w.top + w.h / 2)) < Math.max(w.h, x.h) * 0.8 &&
        x.left >= w.left && x.left - (w.left + w.w) < 45
      );
      if (!next) return;
      const c = next.text.trim();
      const day = /^[1-7]$/.test(c) ? Number(c) : DAY_CHARS[c];
      if (day && /^[一二三四五六日天1-7]$/.test(c)) {
        found.push({ day, cx: (w.left + next.left + next.w) / 2, top: Math.min(w.top, next.top) });
      }
    });

    if (found.length < 2) return null;
    const groups = [];
    found.forEach((f) => {
      const g = groups.find((x) => Math.abs(x.top - f.top) < H * 0.05);
      if (g) g.items.push(f); else groups.push({ top: f.top, items: [f] });
    });
    groups.sort((a, b) => b.items.length - a.items.length);
    const best = groups[0];
    const byDay = {};
    best.items.forEach((f) => { if (!byDay[f.day]) byDay[f.day] = f.cx; });
    const cols = Object.keys(byDay)
      .map((d) => ({ day: Number(d), cx: byDay[d] }))
      .sort((a, b) => a.cx - b.cx);
    return cols.length >= 2 ? cols : null;
  }

  function joinOcrLine(words) {
    words = words.slice().sort((a, b) => a.left - b.left);
    let s = words.map((w) => w.text).join(' ');
    s = s.replace(/([一-龥])\s+(?=[一-龥])/g, '$1');
    return clean(s);
  }

  function weeksToPipe(w) {
    w = w || { type: 'all' };
    if (w.type === 'odd') return '单周';
    if (w.type === 'even') return '双周';
    if (w.type === 'range') return w.from === w.to ? String(w.from) : w.from + '-' + w.to;
    return '';
  }

  function courseToPipe(c) {
    const first = Math.min.apply(null, c.periods);
    const last = Math.max.apply(null, c.periods);
    const day = '周' + (DAY_CN[c.day - 1] || c.day);
    return [c.name, c.teacher || '', day, first + '-' + last,
      weeksToPipe(c.weeks), c.building || '地点待定', c.room || ''].join('|');
  }

  function mergeAdjacentCourses(courses) {
    const out = [];
    courses.forEach((c) => {
      const key = [c.name, c.day, c.teacher || '', c.building || '', c.room || '',
        JSON.stringify(c.weeks || { type: 'all' })].join('|');
      const hit = out.find((x) => {
        if (x.__mergeKey !== key) return false;
        const a = Math.min.apply(null, x.periods), b = Math.max.apply(null, x.periods);
        const c1 = Math.min.apply(null, c.periods), c2 = Math.max.apply(null, c.periods);
        return c1 <= b + 1 && c2 >= a - 1;
      });
      if (hit) {
        const all = hit.periods.concat(c.periods);
        hit.periods = range(Math.min.apply(null, all), Math.max.apply(null, all));
      } else {
        c.__mergeKey = key;
        out.push(c);
      }
    });
    out.forEach((c) => { delete c.__mergeKey; });
    return out;
  }

  function parseOcr(data, dims) {
    const warnings = [];
    const rawText = clean((data && data.text) || '').replace(/ +/g, ' ').trim();
    const W = Number(dims && dims.width) || 0;
    const H = Number(dims && dims.height) || 0;
    const rawWords = parseTsvWords(data && data.tsv);

    if (!rawWords.length || !W || !H) {
      const fallback = parse(rawText);
      fallback.format = '图片 OCR（文字）';
      fallback.warnings = (fallback.warnings || []).concat(['图片版式没有解析出来，已尝试按普通文字识别，请核对。']);
      fallback.text = rawText;
      return fallback;
    }

    const words = rawWords.filter((w) => w.conf >= 40);
    const leftLimit = W * 0.12;
    const leftWords = words.filter((w) => w.left + w.w / 2 < leftLimit);
    const bodyWords = words.filter((w) => w.left + w.w / 2 >= leftLimit);

    let periodRows = detectPeriodRows(leftWords, H);
    if (!periodRows.length) {
      warnings.push('没有识别出左侧的节次/时间，无法可靠还原表格；请检查图片或改用手动输入。');
      const fallback = parse(rawText);
      fallback.format = '图片 OCR（文字）';
      fallback.warnings = (fallback.warnings || []).concat(warnings);
      fallback.text = rawText;
      return fallback;
    }

    const minY = periodRows[0].top - Math.max(10, H * 0.02);

    // 列：优先读星期表头；读不到时按正文列从左到右映射周一、周二…
    let columns = detectDayHeaders(rawWords, H);
    let mappedByHeader = true;
    if (!columns) {
      mappedByHeader = false;
      const items = bodyWords
        .map((w) => ({ w, cx: w.left + w.w / 2 }))
        .filter((x) => (x.w.top + x.w.h / 2) >= minY)
        .sort((a, b) => a.cx - b.cx);
      const clusters = [];
      items.forEach((x) => {
        const g = clusters[clusters.length - 1];
        if (g && x.cx - g.last <= W * 0.1) {
          g.items.push(x.w);
          g.last = x.cx;
        } else {
          clusters.push({ items: [x.w], last: x.cx });
        }
      });
      columns = clusters.map((g, i) => ({
        day: i + 1,
        cx: g.items.reduce((s, w) => s + (w.left + w.w / 2), 0) / g.items.length,
      }));
      if (columns.length) {
        warnings.push('没有读到清晰的星期表头，已按从左到右「周一、周二…」对应各列，请核对星期。');
      }
    }
    if (!columns.length) {
      warnings.push('没有识别出课表列。');
      const fallback = parse(rawText);
      fallback.format = '图片 OCR（文字）';
      fallback.warnings = (fallback.warnings || []).concat(warnings);
      fallback.text = rawText;
      return fallback;
    }
    if (columns.length > 7) columns = columns.slice(0, 7);

    // 行带：用下一行节次标签的位置作为上一行的下边界，避免把地点行分到下一节
    const bands = periodRows.map((r, i) => {
      const start = i === 0 ? 0 : periodRows[i - 1]._end;
      const end = i < periodRows.length - 1
        ? periodRows[i + 1].top - Math.max(6, H * 0.01)
        : H;
      r._end = end;
      return { period: r.p, start, end };
    });

    const cells = {};
    bodyWords.forEach((w) => {
      const cy = w.top + w.h / 2;
      if (cy < minY) return;
      const cx = w.left + w.w / 2;
      let col = columns[0], best = Infinity;
      columns.forEach((c) => {
        const d = Math.abs(cx - c.cx);
        if (d < best) { best = d; col = c; }
      });
      const band = bands.find((b) => cy >= b.start && cy < b.end);
      if (!band) return;
      const key = col.day + '|' + band.period;
      (cells[key] = cells[key] || []).push(w);
    });

    const courses = [];
    Object.keys(cells).forEach((key) => {
      const ws = cells[key].slice().sort((a, b) => (a.top + a.h / 2) - (b.top + b.h / 2));
      const lines = [];
      ws.forEach((w) => {
        const cy = w.top + w.h / 2;
        const line = lines[lines.length - 1];
        if (line && Math.abs(cy - line.c) <= Math.max(18, H * 0.022)) {
          line.items.push(w);
          line.c = (line.c * line.items.length + cy) / (line.items.length + 1);
        } else {
          lines.push({ c: cy, items: [w] });
        }
      });
      const text = lines.map((l) => joinOcrLine(l.items)).filter(Boolean).join('\n');
      if (!text) return;
      const [day, period] = key.split('|').map(Number);
      const c = makeCourseFromBlock(text, { day, periods: [period] });
      if (c) courses.push(c);
    });

    let merged = mergeAdjacentCourses(courses);
    merged = dedupe(merged, warnings);

    if (!merged.length) {
      const fallback = parse(rawText);
      if (fallback.courses && fallback.courses.length) {
        fallback.format = '图片 OCR（文字）';
        fallback.warnings = (fallback.warnings || []).concat(warnings).concat(['图片版式未能还原，已尝试按普通文字解析，请核对。']);
        fallback.text = rawText;
        return fallback;
      }
      warnings.push('图片里没有识别出完整课程。可以换一张更清晰、没有倾斜的截图，或改用手动输入。');
    } else {
      warnings.push('图片识别只作辅助，请核对课程名、星期、节次和地点。');
      if (!mappedByHeader) warnings.push('当前列顺序按周一到周日排列；如果某天没课，可能会错位，请特别核对。');
    }

    return {
      format: '图片 OCR',
      courses: merged,
      warnings,
      text: rawText,
      structuredText: merged.map(courseToPipe).join('\n'),
    };
  }

  /* --------------------------------------------------------------- 入口 */
  function parse(text) {
    const s = String(text == null ? '' : text).replace(/^﻿/, '').trim();
    if (!s) return { format: '空内容', courses: [], warnings: ['内容为空，请先粘贴或上传课表。'] };

    if (/^[\[{]/.test(s)) {
      try { return parseJson(s); }
      catch (e) { return { format: 'JSON', courses: [], warnings: ['JSON 解析失败：' + e.message] }; }
    }

    if (/<table[\s>]|<html[\s>]|<td[\s>]/i.test(s)) {
      return parseHtml(s);
    }

    const tabular = parseTabular(s);
    if (tabular) return tabular;

    const structured = parseStructuredLines(s);
    if (structured) return structured;

    return parsePlain(s);
  }

  root.ScheduleImport = {
    parse,
    parseOcr,
    parseWeeks,
    parsePeriods,
    parseDay,
    resolvePlaceId,
    colorFor,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
