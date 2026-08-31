(() => {
  if (window.__vistaPlayPlaybackAgent) return;
  window.__vistaPlayPlaybackAgent = true;

  const media = new Set();
  const enforcing = new WeakSet();
  let targetRate = 1;
  let observer;

  const post = (payload) => {
    try { window.VistaPlayPlayback?.postMessage(JSON.stringify(payload)); } catch { /* bridge unavailable */ }
  };

  const report = (element) => post({
    type: 'agent:state',
    rate: Number(element.playbackRate) || 1,
    targetRate,
    mediaCount: media.size,
  });

  const apply = (element) => {
    if (!(element instanceof HTMLMediaElement)) return;
    if (Math.abs(element.playbackRate - targetRate) <= 0.001) { report(element); return; }
    enforcing.add(element);
    try { element.playbackRate = targetRate; }
    finally { queueMicrotask(() => enforcing.delete(element)); }
    report(element);
  };

  const onRateChange = (event) => {
    const element = event.currentTarget;
    if (!(element instanceof HTMLMediaElement)) return;
    if (!enforcing.has(element) && Math.abs(element.playbackRate - targetRate) > 0.001) {
      apply(element);
      return;
    }
    report(element);
  };

  const bind = (element) => {
    if (!(element instanceof HTMLMediaElement) || media.has(element)) return;
    media.add(element);
    element.addEventListener('ratechange', onRateChange, { passive: true });
    element.addEventListener('loadedmetadata', () => apply(element), { passive: true });
    apply(element);
  };

  const scan = (root) => {
    if (root instanceof HTMLMediaElement) bind(root);
    if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return;
    root.querySelectorAll?.('video, audio').forEach(bind);
  };

  const startObserver = () => {
    scan(document);
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) scan(node);
      for (const element of [...media]) if (!element.isConnected) media.delete(element);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  window.VistaPlayPlayback.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type !== 'agent:setRate') return;
      const next = Number(message.rate);
      if (!Number.isFinite(next)) return;
      targetRate = Math.max(0.25, Math.min(8, next));
      for (const element of media) apply(element);
    } catch { /* ignore malformed messages */ }
  };

  if (document.documentElement) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  post({ type: 'agent:ready' });
})();
