/* =========================================================================
 * ocr.js — 课表图片 OCR
 *
 * 只有用户主动点「开始识别」时才从 CDN 加载 Tesseract.js 和中文语言包，
 * 不会影响页面正常打开。第一次识别需要下载约 20MB 的中文模型，之后浏览器
 * 会缓存；识别过程中图片不会上传到服务器。
 * ========================================================================= */
(function (root) {
  'use strict';

  const SCRIPT_URLS = [
    'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js',
  ];
  const WORKER_CONFIGS = [
    {
      workerPath: 'https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js',
    },
    {
      workerPath: 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-simd.wasm.js',
    },
  ];
  const LANG_PATH = 'https://tessdata.projectnaptha.com/4.0.0';

  let scriptPromise = null;
  let workerPromise = null;
  let worker = null;
  let progressCb = null;

  function loadOneScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      const timer = setTimeout(() => reject(new Error('加载超时')), 30000);
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('加载失败')); };
      document.head.appendChild(s);
    });
  }

  async function loadScript() {
    if (root.Tesseract) return;
    if (scriptPromise) return scriptPromise;
    scriptPromise = (async () => {
      let lastErr = null;
      for (const src of SCRIPT_URLS) {
        try { await loadOneScript(src); return; } catch (e) { lastErr = e; }
      }
      scriptPromise = null;
      throw new Error('OCR 引擎加载失败，请检查网络后重试' + (lastErr ? '' : ''));
    })();
    return scriptPromise;
  }

  function emit(msg) {
    if (typeof progressCb === 'function') {
      try { progressCb(msg); } catch (e) { /* 忽略界面回调错误 */ }
    }
  }

  async function getWorker() {
    await loadScript();
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      let lastErr = null;
      for (const cfg of WORKER_CONFIGS) {
        try {
          emit({ status: 'loading engine', progress: 0 });
          const w = await root.Tesseract.createWorker('chi_sim+eng', 1, {
            workerPath: cfg.workerPath,
            corePath: cfg.corePath,
            langPath: LANG_PATH,
            logger: emit,
          });
          worker = w;
          return w;
        } catch (e) {
          lastErr = e;
        }
      }
      workerPromise = null;
      worker = null;
      throw new Error('OCR 引擎初始化失败：' + (lastErr && lastErr.message ? lastErr.message : '未知错误'));
    })();
    return workerPromise;
  }

  async function recognize(file, opts) {
    opts = opts || {};
    progressCb = opts.onProgress || null;
    emit({ status: 'loading engine', progress: 0 });
    const w = await getWorker();
    try {
      const ret = await w.recognize(file, {}, { text: true, tsv: true, blocks: false });
      return ret.data;
    } catch (e) {
      throw new Error('图片识别失败：' + (e && e.message ? e.message : '请换一张更清晰的截图'));
    }
  }

  async function terminate() {
    if (worker) {
      try { await worker.terminate(); } catch (e) { /* 忽略 */ }
    }
    worker = null;
    workerPromise = null;
    progressCb = null;
  }

  root.ScheduleOCR = { recognize, terminate };
})(typeof globalThis !== 'undefined' ? globalThis : this);
