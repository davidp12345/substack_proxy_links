(() => {
'use strict';

(async function gate(){
  try{
    const { enabledSources } = await chrome.storage.sync.get(['enabledSources']);
    if (enabledSources && enabledSources.linkedin === false) return; // disabled
  }catch{}
  main();
})();

function main(){
  const NOTE_COMPOSE_ORIGIN = 'https://substack.com';
  const NOTE_COMPOSE_PATH   = '/home';
  const NOTE_PREFILL_PARAM  = 'message';
  const BTN_LABEL = 'Edit in Notes';

  const FLAG = 'data-li-notes-btn';
  const PENDING_PERMALINK_KEY = 'pendingLiPermalinkUrl';
  const PENDING_PERMALINK_TS  = 'pendingLiPermalinkTs';

  const wait = (ms) => new Promise(r=>setTimeout(r,ms));
  const unique = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const TRACKING_PARAMS = new Set([
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','utm_name',
    'gclid','fbclid','mc_eid','mkt_tok','igshid','si',
    'trk','trackingId','refId','originalSubdomain','midToken','lipi','eoid','gen','ocid'
  ]);

  function stripTracking(urlStr){
    try{
      const u = new URL(urlStr, location.origin);
      if (/^lnkd\.in$/i.test(u.hostname)) { u.search = ''; u.hash = ''; return u.toString(); }
      const kept = []; u.searchParams.forEach((v,k) => { if(!TRACKING_PARAMS.has(k.toLowerCase())) kept.push([k,v]); });
      u.search = ''; kept.forEach(([k,v]) => u.searchParams.append(k,v)); u.hash = '';
      return u.toString();
    }catch{ return urlStr; }
  }

  function isValidMediaUrl(urlStr){
    try{
      const u = new URL(urlStr, location.origin);
      const host = u.hostname.toLowerCase();
      if (host.endsWith('static.licdn.com')) return false;
      if (!host.endsWith('media.licdn.com')) return false;
      const path = u.pathname;
      if (!/\/dms\/image\//.test(path)) return false;
      if (!/feedshare/i.test(path)) return false;
      if (/articleshare|author|logo|company-logo_|profile|emoji|reaction|reactions|like|love|icons?/i.test(path)) return false;
      return true;
    }catch{ return false; }
  }

  function sanitizeText(text){
    if(!text) return '';
    let t = text
      // Collapse hashtag tokens: "#word" or "#  word" -> "word"
      .replace(/(^|\s)#\s*([\p{L}\p{N}_-]+)/gu, (m, p1, w) => (p1 ? p1 : '') + w)
      // Legacy pattern just in case any joined tokens remain
      .replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, (m, p1) => (p1 ? p1 : ''));
    t = t.split('\n').map((line) => line.replace(/[ \t]{2,}/g, ' ').trim()).join('\n');
    t = t.replace(/\n{3,}/g, '\n\n').trim();
    return t;
  }

  function getPostContainer(node) {
    const activity = node.closest?.('[data-urn^="urn:li:activity:"]') || null;
    if (!activity) return null;
    // Skip LinkedIn profile grid/list views where clicking opens the standalone post page.
    // We avoid showing "Edit in Notes" here to reduce noise; the real extraction will run on the post page.
    if (location.pathname.startsWith('/in/') || location.pathname.startsWith('/company/')) return null;
    if (activity.closest?.('.comments-comments-list, .comments-comment-item, .feed-shared-social-action-bar')) return null;
    const classStr = (activity.getAttribute('class') || '').toLowerCase();
    if (/jobs|marketplace|ad-|sponsored/.test(classStr)) return null;
    if (isPromotedPost(activity)) return null;
    return activity;
  }

  function isPromotedPost(activity){
    try{
      const header = activity.querySelector('.update-components-actor, .feed-shared-actor__container, .update-components-actor__sub-description') || activity;
      const candidates = header.querySelectorAll('span, a, div');
      for (const el of candidates){ const t = (el.textContent || '').trim(); if (/^Promoted$/i.test(t)) return true; }
      if (/\bpromoted\b/i.test(header.textContent || '')) return true;
    }catch{}
    return false;
  }

  function headerMount(container) {
    return (
      container.querySelector('.update-components-actor, .feed-shared-actor, .update-components-actor__meta') ||
      container.querySelector('header') ||
      container
    );
  }

  async function expandSeeMore(container, tries = 8) {
    if (!container) return false;
    let did = false;
    for (let i=0;i<tries;i++) {
      const candidates = [
        '.feed-shared-inline-show-more-text__button',
        'button[aria-expanded="false"][aria-controls*="expandable"]',
        'button[aria-label*="See more"]'
      ].flatMap(sel => Array.from(container.querySelectorAll(sel)));
      if (!candidates.length) break;
      for (const el of candidates) { try { el.click(); did = true; } catch {} }
      await wait(120);
    }
    return did;
  }

  async function waitForStability(el, {timeoutMs=900, step=100, samples=2}={}) {
    const stop = Date.now()+timeoutMs; let lastLen = -1, stable = 0;
    while (Date.now() < stop) { const len = (el.textContent || '').length; if (len > 0 && len === lastLen) { if (++stable >= samples) break; } else { stable = 0; lastLen = len; } await wait(step); }
  }

  function collectStructuredText(root) {
    const blocks = new Set(['P','DIV','LI','UL','OL','H1','H2','H3','H4','H5','H6']);
    const isVisuallyHidden = (el) => {
      try{
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return true;
        const cls = (el.className || '').toString().toLowerCase();
        if (/visually-hidden|sr-only|a11y|screen-reader|assistive/i.test(cls)) return true;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
        const w = parseFloat(cs.width), h = parseFloat(cs.height);
        if (cs.position === 'absolute' && (w <= 1 || h <= 1)) return true;
      }catch{}
      return false;
    };
    function walk(node, out) {
      if (!node) return; if (node.nodeType === 3) { const t = (node.textContent || '').replace(/\s+/g, ' ').trim(); if (t) out.push(t); return; }
      if (node.nodeType !== 1) return; const el = node; if (isVisuallyHidden(el)) return; const style = getComputedStyle(el); if (style.display === 'none' || style.visibility === 'hidden') return;
      if (el.tagName === 'BR') { out.push('\n'); return; }
      const text = (el.textContent || '').trim().toLowerCase(); if (text === 'see more' || text === 'see translation' || text === '…') return;
      const beforeLen = out.length; for (const child of el.childNodes) walk(child, out); const afterLen = out.length;
      if (afterLen > beforeLen && (blocks.has(el.tagName) || style.display === 'list-item')) { out.push('\n'); if (['P','DIV','LI'].includes(el.tagName)) out.push('\n'); }
    }
    const out = []; walk(root, out); let s = out.join(' ').replace(/[ \t]*\n[ \t]*/g, '\n'); s = s.replace(/\n{3,}/g, '\n\n').trim(); return s;
  }

  function getBodyRoot(container) {
    return (
      container.querySelector('.update-components-text') ||
      container.querySelector('.feed-shared-update-v2__description') ||
      container
    );
  }

  function findOriginalRepostCard(container){
    try{
      const topContent = container.querySelector('.feed-shared-update-v2') || container;
      const nestedCards = Array.from(topContent.querySelectorAll('.feed-shared-update-v2 .feed-shared-update-v2'));
      let best = null; let bestLen = 0;
      for (const card of nestedCards){
        if (!card.querySelector('.update-components-actor')) continue;
        const body = getBodyRoot(card); if (!body) continue;
        const text = collectStructuredText(body); const len = text ? text.length : 0; if (len > bestLen) { best = card; bestLen = len; }
      }
      return best;
    }catch{ return null; }
  }

  function findPermalink(container) {
    const a = container.querySelector('a[href*="/feed/update/urn:li:activity:"]') || container.querySelector('a[href*="/posts/"][href*="activity"]') || container.querySelector('a[href*="/feed/update/"]');
    if (!a) return null; try { return new URL(a.getAttribute('href'), location.origin).href; } catch { return null; }
  }

  function findImageLinks(container) {
    const srcs = []; const selectors = 'img, [data-delayed-url], [data-src], [style*="background-image"]';
    container.querySelectorAll(selectors).forEach(el => {
      if (el.closest('.comments-comments-list, .comments-comment-item')) return;
      const candidates = []; const src = el.getAttribute('src'); if (src) candidates.push(src);
      const srcset = el.getAttribute('srcset') || ''; if (srcset) srcset.split(',').forEach(s=>{ const u=s.trim().split(' ')[0]; if(u) candidates.push(u); });
      const delayed = el.getAttribute('data-delayed-url'); if (delayed) candidates.push(delayed);
      const dataSrc = el.getAttribute('data-src'); if (dataSrc) candidates.push(dataSrc);
      const style = el.getAttribute('style') || ''; const m = style.match(/background-image:\s*url\(("|')?([^"')]+)(\1)?\)/i); if (m && m[2]) candidates.push(m[2]);
      for (const c of candidates){ if (!c) continue; if (isValidMediaUrl(c)) srcs.push(stripTracking(c)); }
    });
    return unique(srcs);
  }

  function findExternalLinks() { return []; }
  function looksTruncated(text) { return text.endsWith('…') || text.endsWith('...') || /See more$/i.test(text); }

  async function extractPost(container) {
    await expandSeeMore(container, 8);
    const body = getBodyRoot(container); await waitForStability(body);
    const raw = collectStructuredText(body); let text = sanitizeText(raw);
    const originalCard = findOriginalRepostCard(container);
    if (originalCard){ const origBody = getBodyRoot(originalCard); const origText = sanitizeText(collectStructuredText(origBody)); if (origText && origText.length > text.length) { text = origText; } else if (origText && origText.length && text && text.length) { text = `${text}\n\n${origText}`; } }
    const imgLinks = findImageLinks(originalCard || container);
    let extLinks = findExternalLinks(container);
    const permalink = findPermalink(container);
    const urlRegex = /https?:\/\/[\w.-]+(?:\/[\w\-._~:\/?#\[\]@!$&'()*+,;=%]*)?/gi;
    const urlsInText = new Set((text.match(urlRegex) || []).map(stripTracking));
    extLinks = extLinks.filter((l) => !urlsInText.has(stripTracking(l)));
    const lines = [text]; if (imgLinks.length) lines.push('', ...imgLinks); if (extLinks.length) lines.push('', ...extLinks); if (permalink) lines.push('', stripTracking(permalink));
    return lines.join('\n').trim();
  }

  async function openComposeWith(text) {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    await chrome.storage.local.set({ pendingNoteText: text, pendingNoteTs: Date.now(), pendingNoteToken: token });
    const p = new URLSearchParams(); p.set('action','compose'); p.set('note_token', token);
    const subset = text.length > 1800 ? text.slice(0,1800) : text; if (subset) p.set(NOTE_PREFILL_PARAM, subset);
    window.open(`${NOTE_COMPOSE_ORIGIN}${NOTE_COMPOSE_PATH}?${p}`, '_blank', 'noopener');
  }

  async function handleClick(container) {
    const text = await extractPost(container);
    if (!text || looksTruncated(text)) {
      const pl = findPermalink(container);
      if (pl) { await chrome.storage.local.set({ [PENDING_PERMALINK_KEY]: pl, [PENDING_PERMALINK_TS]: Date.now() }); window.open(pl, '_blank', 'noopener'); return; }
    }
    if (text) await openComposeWith(text);
  }

  (async function maybeHandlePermalinkMode(){
    try{
      const { [PENDING_PERMALINK_KEY]:url, [PENDING_PERMALINK_TS]:ts } = await chrome.storage.local.get([PENDING_PERMALINK_KEY, PENDING_PERMALINK_TS]);
      if (!url || !ts || Date.now()-ts > 60_000) return;
      const here = location.href; const getId = (u)=>{ try{ return (String(u).match(/urn:li:activity:\d+/)||[])[0] || ''; }catch{ return ''; } };
      if (!getId(here) || (getId(url) && getId(here)!==getId(url))) return;
      for (let i=0;i<40;i++){
        const c = document.querySelector('[data-urn^="urn:li:activity:"], article, div.feed-shared-update-v2');
        if (c) { const container = getPostContainer(c) || c; const text = await extractPost(container); if (text) await openComposeWith(text); break; }
        await wait(100);
      }
      chrome.storage.local.remove([PENDING_PERMALINK_KEY, PENDING_PERMALINK_TS]);
    }catch{}
  })();

  function injectButton(container) {
    if (!container || container.getAttribute(FLAG)) return;
    const btn = document.createElement('button'); btn.textContent = BTN_LABEL;
    Object.assign(btn.style, { borderRadius:'999px', padding:'6px 12px', fontSize:'12px', fontWeight:'600', border:'none', background:'#ff5c00', color:'#fff', cursor:'pointer', marginLeft:'8px' });
    btn.addEventListener('click', (e) => { e.stopPropagation(); handleClick(container); });

    const actorRow = container.querySelector('.update-components-actor, .feed-shared-actor__container');
    const overflowBtn = container.querySelector('button[aria-label*="More" i], button[aria-label*="actions" i], .feed-shared-control-menu__trigger, button[aria-expanded][aria-haspopup]');
    let placed = false;
    if (actorRow && overflowBtn && overflowBtn.parentElement) {
      try {
        const headerContainer = overflowBtn.parentElement;
        if (getComputedStyle(headerContainer).display === 'flex') { headerContainer.insertBefore(btn, overflowBtn); }
        else { Object.assign(btn.style, { position:'absolute', right: (overflowBtn.offsetWidth + 8) + 'px', top:'0' }); headerContainer.style.position = headerContainer.style.position || 'relative'; headerContainer.appendChild(btn); }
        placed = true;
      } catch {}
    }
    if (!placed) {
      const description = container.querySelector('.feed-shared-update-v2__description, .update-components-text');
      let mount; if (description && description.parentElement) {
        mount = description.parentElement.querySelector('.li-notes-toolbar');
        if (!mount) { mount = document.createElement('div'); mount.className = 'li-notes-toolbar'; Object.assign(mount.style, { display:'flex', gap:'8px', margin:'8px 0 4px 0' }); description.parentElement.insertBefore(mount, description); }
      } else { mount = headerMount(container); }
      mount.appendChild(btn);
    }
    container.setAttribute(FLAG,'1');
  }

  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        const container = getPostContainer(n);
        if (container) { injectButton(container); return; }
        n.querySelectorAll?.('[data-urn^="urn:li:activity:"]').forEach((el)=>{ const c=getPostContainer(el); if(c) injectButton(c); });
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll('[data-urn^="urn:li:activity:"]').forEach((el)=>{ const c=getPostContainer(el); if(c) injectButton(c); });

  function injectProfileGridOverlays(){
    // Also disable overlays on profile pages to avoid buttons in grid previews
    if (location.pathname.startsWith('/in/') || location.pathname.startsWith('/company/')) return;
    document.querySelectorAll('a[href*="/feed/update/urn:li:activity:"] div.feed-shared-update-v2').forEach(card => {
      if (card.getAttribute('data-li-notes-overlay')) return;
      const container = getPostContainer(card); if (!container) return;
      const overlay = document.createElement('button'); overlay.textContent = BTN_LABEL;
      Object.assign(overlay.style, { position:'absolute', left:'8px', top:'8px', zIndex: 3, borderRadius:'999px', padding:'6px 12px', fontSize:'12px', fontWeight:'600', border:'none', background:'#ff5c00', color:'#fff', cursor:'pointer' });
      overlay.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); const container = getPostContainer(card) || card.closest('[data-urn^="urn:li:activity:"]') || card; handleClick(container); });
      const wrapper = card.closest('a[href*="/feed/update/urn:li:activity:"]'); if (wrapper && getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
      (wrapper || card).appendChild(overlay); card.setAttribute('data-li-notes-overlay','1');
    });
  }

  setInterval(injectProfileGridOverlays, 1000);
}
})();
