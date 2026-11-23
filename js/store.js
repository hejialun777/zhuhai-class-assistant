/* =========================================================================
 * store.js — 本机账号 / 登录状态 / 每个用户自己的课表与待办
 *
 * 纯静态站点没有后端，所以账号、密码摘要和个人数据都只保存在当前浏览器的
 * localStorage 里；不会上传到任何服务器。密码用 SHA-256（加盐）存摘要，
 * 但请把它理解为「本机多用户配置」，而不是学校统一认证。
 * ========================================================================= */
(function (root) {
  'use strict';

  const K_ACCOUNTS = 'zhuke.accounts.v1';
  const K_SESSION  = 'zhuke.session.v1';
  const K_USER     = 'zhuke.user.v1.';
  const K_THEME    = 'zhuke.theme';
  const K_LAST_BACKUP = 'zhuke.backup.lastExport';
  const APP_PREFIXES = ['zhuke.', 'campusTool.'];
  const GUEST      = '__guest__';
  const GUEST_PROFILE = { displayName: '游客', avatar: '🎓' };
  const USERNAME_RE = /^[A-Za-z0-9_一-龥]{2,24}$/;

  let accounts = readJSON(K_ACCOUNTS, []);
  if (!Array.isArray(accounts)) accounts = [];
  let session = GUEST;
  try { session = localStorage.getItem(K_SESSION) || GUEST; } catch (e) { session = GUEST; }
  if (session !== GUEST && !findAccount(session)) session = GUEST;

  let cache = null;
  const listeners = new Set();

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('本机存储写入失败：', e); }
  }

  function emit(type, detail) {
    listeners.forEach((fn) => {
      try { fn(type, detail); } catch (e) { console.error(e); }
    });
  }

  function normalizeUsername(name) {
    return String(name || '').trim().toLowerCase();
  }

  function findAccount(username) {
    const key = normalizeUsername(username);
    return accounts.find((a) => a.username === key) || null;
  }

  function accountByUsername(username) {
    return findAccount(username);
  }

  function emptyUserData(username) {
    const acc = username === GUEST ? null : findAccount(username);
    return {
      profile: {
        displayName: acc ? acc.displayName : (username === GUEST ? GUEST_PROFILE.displayName : username),
        avatar: acc ? acc.avatar : GUEST_PROFILE.avatar,
      },
      tasks: [],
      courses: null,
      pomodoros: [],
    };
  }

  function loadUserData(username) {
    const raw = readJSON(K_USER + username, null);
    const base = emptyUserData(username);
    if (!raw || typeof raw !== 'object') return base;
    return {
      profile: Object.assign({}, base.profile, raw.profile || {}),
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      courses: Array.isArray(raw.courses) ? raw.courses : null,
      pomodoros: Array.isArray(raw.pomodoros) ? raw.pomodoros : [],
    };
  }

  function saveUserData(username, data) {
    writeJSON(K_USER + username, data);
    if (cache && cache.username === username) cache.data = data;
  }

  function currentUsername() { return session; }

  function isGuest() { return session === GUEST; }

  function currentAccount() {
    return session === GUEST ? null : findAccount(session);
  }

  function currentData() {
    if (!cache || cache.username !== session) {
      cache = { username: session, data: loadUserData(session) };
    }
    return cache.data;
  }

  function persistCurrent() {
    saveUserData(session, currentData());
  }

  function getProfile() {
    return Object.assign({}, currentData().profile);
  }

  function getTasks() {
    return currentData().tasks.map((t) => Object.assign({}, t));
  }

  function saveTasks(tasks) {
    const data = currentData();
    data.tasks = Array.isArray(tasks) ? tasks : [];
    persistCurrent();
    emit('data', { scope: 'tasks' });
  }

  /* 返回 null 表示「使用内置课表」；返回 [] 表示用户确实把课表清空了 */
  function getCourses() {
    const c = currentData().courses;
    return Array.isArray(c) ? c.map((x) => JSON.parse(JSON.stringify(x))) : null;
  }

  function saveCourses(courses) {
    const data = currentData();
    data.courses = Array.isArray(courses) ? courses : null;
    persistCurrent();
    emit('data', { scope: 'courses' });
  }

  function resetCourses() {
    const data = currentData();
    data.courses = null;
    persistCurrent();
    emit('data', { scope: 'courses' });
  }

  function appStorageKeys() {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && APP_PREFIXES.some((p) => k.indexOf(p) === 0)) keys.push(k);
      }
    } catch (e) { /* 忽略 */ }
    return keys.sort();
  }

  function getDataUsage() {
    let bytes = 0;
    appStorageKeys().forEach((k) => {
      let v = '';
      try { v = localStorage.getItem(k) || ''; } catch (e) { /* 忽略 */ }
      bytes += (k.length + v.length) * 2;
    });
    return bytes;
  }

  function markBackup() {
    const ts = new Date().toISOString();
    try { localStorage.setItem(K_LAST_BACKUP, ts); } catch (e) { /* 忽略 */ }
    return ts;
  }

  function getLastBackup() {
    try { return localStorage.getItem(K_LAST_BACKUP) || ''; } catch (e) { return ''; }
  }

  function exportBackup() {
    const data = {};
    appStorageKeys().forEach((k) => {
      try { data[k] = localStorage.getItem(k) || ''; } catch (e) { /* 忽略 */ }
    });
    return {
      format: 'zhuke-backup',
      app: '珠科管家',
      version: 1,
      exportedAt: new Date().toISOString(),
      localStorage: data,
    };
  }

  function importBackup(obj) {
    if (!obj || obj.format !== 'zhuke-backup' || !obj.localStorage || typeof obj.localStorage !== 'object') {
      throw new Error('不是有效的珠科管家备份文件');
    }
    const incoming = {};
    Object.keys(obj.localStorage).forEach((k) => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
      if (!APP_PREFIXES.some((p) => k.indexOf(p) === 0)) return;
      const v = obj.localStorage[k];
      if (typeof v === 'string') incoming[k] = v;
    });
    if (!Object.keys(incoming).length) throw new Error('备份文件里没有可恢复的数据');

    appStorageKeys().forEach((k) => {
      try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
    });
    let count = 0;
    Object.keys(incoming).forEach((k) => {
      try { localStorage.setItem(k, incoming[k]); count++; } catch (e) { /* 忽略 */ }
    });
    cache = null;
    return count;
  }

  function getPomodoros() {
    return currentData().pomodoros.map((x) => Object.assign({}, x));
  }

  function addPomodoro(record) {
    const data = currentData();
    data.pomodoros.push(record);
    persistCurrent();
    emit('data', { scope: 'pomodoros' });
  }

  function updateProfile(patch) {
    const profile = Object.assign({}, currentData().profile, patch || {});
    profile.displayName = String(profile.displayName || '').trim().slice(0, 20) || (isGuest() ? '游客' : session);
    profile.avatar = String(profile.avatar || GUEST_PROFILE.avatar);

    currentData().profile = profile;
    persistCurrent();

    const acc = currentAccount();
    if (acc) {
      acc.displayName = profile.displayName;
      acc.avatar = profile.avatar;
      writeJSON(K_ACCOUNTS, accounts);
    }
    emit('profile', { profile: Object.assign({}, profile) });
    return profile;
  }

  function randomToken(bytes) {
    try {
      if (root.crypto && root.crypto.getRandomValues) {
        const arr = new Uint8Array(bytes);
        root.crypto.getRandomValues(arr);
        return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 回退 */ }
    let out = '';
    for (let i = 0; i < bytes; i++) out += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return out;
  }

  function fallbackHash(text) {
    let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
      h2 = (h2 ^ (h2 >>> 13)) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function hashPassword(password, salt) {
    const text = String(salt) + '::' + String(password);
    try {
      if (root.crypto && root.crypto.subtle && root.TextEncoder) {
        const buf = await root.crypto.subtle.digest('SHA-256', new root.TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* 回退 */ }
    return fallbackHash(text);
  }

  function setSession(username) {
    session = username;
    try { localStorage.setItem(K_SESSION, session); } catch (e) { /* 忽略隐私模式限制 */ }
    cache = null;
    emit('auth', { username: session, guest: session === GUEST });
  }

  async function register(opts) {
    const username = normalizeUsername(opts && opts.username);
    const displayName = String((opts && opts.displayName) || '').trim();
    const password = String((opts && opts.password) || '');

    if (!USERNAME_RE.test(username)) {
      throw new Error('用户名需为 2–24 位中文、字母、数字或下划线');
    }
    if (findAccount(username)) throw new Error('这个用户名已经注册过了');
    if (password.length < 4) throw new Error('密码至少 4 位');
    if (displayName.length > 20) throw new Error('名字最多 20 个字');

    const salt = randomToken(16);
    const hash = await hashPassword(password, salt);
    const acc = {
      username,
      displayName: displayName || username,
      avatar: '🎓',
      salt,
      hash,
      createdAt: new Date().toISOString(),
    };
    accounts.push(acc);
    writeJSON(K_ACCOUNTS, accounts);

    const data = emptyUserData(username);
    data.profile.displayName = acc.displayName;
    data.profile.avatar = acc.avatar;

    if (opts && opts.migrateGuest) {
      const guest = loadUserData(GUEST);
      data.tasks = guest.tasks;
      data.courses = guest.courses;
    }
    saveUserData(username, data);

    if (opts && opts.migrateGuest) {
      saveUserData(GUEST, emptyUserData(GUEST));
    }

    setSession(username);
    return acc;
  }

  async function login(username, password) {
    const acc = findAccount(username);
    if (!acc) throw new Error('没有找到这个本机用户');
    const hash = await hashPassword(String(password || ''), acc.salt);
    if (hash !== acc.hash) throw new Error('密码不正确');
    setSession(acc.username);
    return acc;
  }

  async function switchTo(username, password) {
    if (normalizeUsername(username) === GUEST) {
      setSession(GUEST);
      return null;
    }
    return login(username, password);
  }

  function logout() {
    setSession(GUEST);
  }

  function listUsers() {
    return [{
      username: GUEST,
      displayName: GUEST_PROFILE.displayName,
      avatar: loadUserData(GUEST).profile.avatar || GUEST_PROFILE.avatar,
      guest: true,
      current: session === GUEST,
    }].concat(accounts.map((a) => ({
      username: a.username,
      displayName: a.displayName,
      avatar: a.avatar,
      guest: false,
      current: session === a.username,
      createdAt: a.createdAt,
    })));
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  root.ZhukeStore = {
    GUEST,
    currentUsername,
    currentAccount,
    isGuest,
    getProfile,
    updateProfile,
    getTasks,
    saveTasks,
    getCourses,
    saveCourses,
    resetCourses,
    getPomodoros,
    addPomodoro,
    getDataUsage,
    markBackup,
    getLastBackup,
    exportBackup,
    importBackup,
    register,
    login,
    switchTo,
    logout,
    listUsers,
    subscribe,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
