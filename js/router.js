/* =========================================================================
 * router.js — 校园路网最短路径
 * 纯计算，不依赖 DOM，可在浏览器与 Node 中复用（便于测试）。
 * ========================================================================= */
(function (root) {
  'use strict';

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function distPt(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  /**
   * @param {object} ROAD      { nodes: {id:[x,y]}, edges: [[a,b], ...] }
   * @param {function} getSettings 返回 { metersPerPx, walkSpeed, bikeSpeed, walkFixed, bikeFixed }
   */
  function createRouter(ROAD, getSettings) {
    // ---- 邻接表 ----
    const nodeAdj = {};
    Object.keys(ROAD.nodes).forEach((k) => { nodeAdj[k] = []; });
    ROAD.edges.forEach(([a, b]) => {
      if (!ROAD.nodes[a] || !ROAD.nodes[b]) return;
      const w = dist(ROAD.nodes[a], ROAD.nodes[b]);
      nodeAdj[a].push({ to: b, w });
      nodeAdj[b].push({ to: a, w });
    });

    /** 把任意点吸附到最近的路段上 */
    function snapToRoad(pt) {
      let best = null;
      ROAD.edges.forEach(([a, b]) => {
        const A = ROAD.nodes[a], B = ROAD.nodes[b];
        if (!A || !B) return;
        const vx = B[0] - A[0], vy = B[1] - A[1];
        const len2 = vx * vx + vy * vy;
        let t = len2 ? ((pt.x - A[0]) * vx + (pt.y - A[1]) * vy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = A[0] + t * vx, py = A[1] + t * vy;
        const d = Math.hypot(pt.x - px, pt.y - py);
        if (!best || d < best.d) best = { d, a, b, t, x: px, y: py, len: Math.sqrt(len2) };
      });
      return best;
    }

    /** Dijkstra（图很小，用线性扫描实现） */
    function dijkstra(adj, src, dst) {
      const distMap = {}, prev = {}, visited = {};
      Object.keys(adj).forEach((k) => { distMap[k] = Infinity; });
      if (!(src in distMap) || !(dst in distMap)) return null;
      distMap[src] = 0;
      for (;;) {
        let u = null, best = Infinity;
        for (const k in distMap) {
          if (!visited[k] && distMap[k] < best) { best = distMap[k]; u = k; }
        }
        if (u === null || u === dst) break;
        visited[u] = true;
        for (const e of adj[u]) {
          if (distMap[u] + e.w < distMap[e.to]) {
            distMap[e.to] = distMap[u] + e.w;
            prev[e.to] = u;
          }
        }
      }
      if (distMap[dst] === Infinity) return null;
      const path = [];
      let cur = dst;
      while (cur !== undefined) { path.unshift(cur); cur = prev[cur]; }
      return path;
    }

    /** 规划路线：任意两点 → 贴路网的最短路径 */
    function planRoute(from, to, mode) {
      if (!from || !to) return null;
      const s = getSettings();
      const a = snapToRoad(from), b = snapToRoad(to);
      if (!a || !b) return null;

      const adj = {};
      Object.keys(nodeAdj).forEach((k) => { adj[k] = nodeAdj[k].map((e) => ({ to: e.to, w: e.w })); });

      // 起终点各自作为临时节点接入路网
      const sa = a.t * a.len, sb = (1 - a.t) * a.len;
      adj.__S = [{ to: a.a, w: sa }, { to: a.b, w: sb }];
      adj[a.a].push({ to: '__S', w: sa });
      if (a.b !== a.a) adj[a.b].push({ to: '__S', w: sb });

      const ta = b.t * b.len, tb = (1 - b.t) * b.len;
      adj.__Z = [{ to: b.a, w: ta }, { to: b.b, w: tb }];
      adj[b.a].push({ to: '__Z', w: ta });
      if (b.b !== b.a) adj[b.b].push({ to: '__Z', w: tb });

      const path = dijkstra(adj, '__S', '__Z');
      if (!path) return null;

      const pts = [{ x: from.x, y: from.y }, { x: a.x, y: a.y }];
      for (let i = 1; i < path.length - 1; i++) {
        const n = path[i];
        if (n === '__S' || n === '__Z') continue;
        const p = ROAD.nodes[n];
        if (p) pts.push({ x: p[0], y: p[1] });
      }
      pts.push({ x: b.x, y: b.y }, { x: to.x, y: to.y });

      // 去掉相邻重复点
      const clean = pts.filter((p, i) => i === 0 || distPt(p, pts[i - 1]) > 0.5);

      let px = 0;
      for (let i = 1; i < clean.length; i++) px += distPt(clean[i - 1], clean[i]);

      const meters = px * s.metersPerPx;
      const bike = mode === 'bike';
      const speed = bike ? s.bikeSpeed : s.walkSpeed;
      const fixed = bike ? s.bikeFixed : s.walkFixed;
      const seconds = meters / speed + fixed;

      return { points: clean, meters, seconds, mode, path, straightPx: distPt(from, to) };
    }

    return { planRoute, snapToRoad, dijkstra, nodeAdj };
  }

  const api = { createRouter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CampusRouter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
