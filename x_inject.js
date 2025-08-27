(() => {
'use strict';

(async function gate(){
  try{
    const { enabledSources } = await chrome.storage.sync.get(['enabledSources']);
    if (enabledSources && enabledSources.x === false) return; // disabled
  }catch{}
  main();
})();

function main(){
  const NOTE_COMPOSE_ORIGIN = 'https://substack.com';
  const NOTE_COMPOSE_PATH   = '/home';
  const NOTE_PREFILL_PARAM  = 'message';
  const BTN_LABEL = 'Edit in Notes';
  const FLAG = 'data-x-notes-btn';

  const wait = (ms) => new Promise(r=>setTimeout(r,ms));

  function getTweetContainer(node){
    const article = node.closest?.('article[role="article"], article[data-testid="tweet"]') || null;
    if (!article) return null;
    // Exclude Notifications timeline
    const root = article.closest('[data-testid="primaryColumn"]') || document.body;
    const isNotifications = /\/notifications(\b|\/|\?|#)/i.test(location.pathname);
    if (isNotifications) return null;
    return article;
  }

  function safeClick(el){
    try{
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles:true, cancelable:true, view:window }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles:true, cancelable:true, view:window }));
      el.click?.();
    }catch{}
  }

  async function expandShowMore(container){
    const primarySel = 'div[role="button"][data-testid="showMoreButton"]';
    const genericClickable = 'button, a[role="link"], span[role="button"], div[role="button"]';
    // Try multiple passes because X lazily mounts expanded nodes
    for (let pass=0; pass<8; pass++){
      let clicked = false;
      container.querySelectorAll(primarySel).forEach(el=>{ clicked=true; safeClick(el); });
      // Any element whose visible text is "Show more" / "See more"
      container.querySelectorAll(genericClickable).forEach(el=>{
        const t = (el.textContent||'').trim().toLowerCase();
        if (t === 'show more' || t === 'see more' || t === 'more') { clicked = true; safeClick(el); }
      });
      // Inline truncation sometimes places an <span> with the label embedded
      container.querySelectorAll('*').forEach(el=>{
        const t = (el.textContent||'').trim().toLowerCase();
        if (t === 'show more' || t === 'see more') { clicked = true; safeClick(el); }
      });
      if (!clicked) break;
      await wait(120);
    }
  }

  function collectStructuredTweetText(root){
    const textRoot = root.querySelector('[data-testid="tweetText"]') || root.querySelector('div[lang]') || root;
    let text = '';
    try { text = textRoot.innerText || textRoot.textContent || ''; } catch { text = textRoot.textContent || ''; }
    text = String(text)
      .replace(/\r\n?/g, '\n')
      .split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return normalizeTweetTextSpacing(text);
  }

  function normalizeTweetTextSpacing(text){
    const lines = text.split('\n');
    const handleLine = (s) => /^@([A-Za-z0-9_]+)(\s+@([A-Za-z0-9_]+))*$/.test(s.trim());
    for (let i = 1; i < lines.length - 1; i++){
      const prev = lines[i-1].trim();
      const cur = lines[i].trim();
      const next = lines[i+1].trim();
      if (!prev || !next) continue;
      if (!handleLine(cur)) continue;
      const merged = `${prev.replace(/[\s]+$/,'')} ${cur} ${next}`.replace(/\s{2,}/g,' ').trim();
      lines.splice(i-1, 3, merged);
      i = Math.max(0, i-2);
    }
    return lines.join('\n').replace(/\n{3,}/g,'\n\n');
  }

  function collectImageUrls(container){
    const urls = [];
    container.querySelectorAll('div[data-testid="tweetPhoto"] img').forEach(img => {
      const src = img.getAttribute('src') || '';
      if (src) urls.push(src);
      const srcset = img.getAttribute('srcset') || '';
      if (srcset) {
        const best = srcset.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean).pop();
        if (best) urls.push(best);
      }
    });
    return Array.from(new Set(urls));
  }

  function getExpandedUrl(a){
    if (!a) return '';
    return (
      a.getAttribute('data-expanded-url') ||
      a.getAttribute('aria-label') ||
      a.getAttribute('title') ||
      a.getAttribute('href') ||
      ''
    ).trim();
  }

  function isTwitterHost(u){ try { const h = new URL(u).hostname.toLowerCase(); return h.endsWith('twitter.com') || h.endsWith('x.com'); } catch { return false; } }
  function isPicHost(u){ try { return new URL(u).hostname.toLowerCase().includes('pic.twitter.com'); } catch { return false; } }

  function collectEmbeddedExternalLinks(container, bodyText){
    const urls = new Set();
    // Links inside the main text
    const textRoot = container.querySelector('[data-testid="tweetText"]') || container;
    textRoot.querySelectorAll('a[href]').forEach(a => {
      const u = getExpandedUrl(a);
      if (!u) return;
      // Only allow absolute http(s) URLs; skip relative paths like "/GeminiApp" or labels like "@GeminiApp"
      if (!/^https?:\/\//i.test(u)) return;
      if (isTwitterHost(u) || isPicHost(u)) return;
      if (bodyText && bodyText.includes(u)) return; // already present verbatim
      urls.add(u);
    });
    // Card wrapper link
    const card = container.querySelector('div[data-testid="card.wrapper"] a[href]');
    if (card){
      const u = getExpandedUrl(card);
      if (u && /^https?:\/\//i.test(u) && !isTwitterHost(u) && !isPicHost(u) && (!bodyText || !bodyText.includes(u))) urls.add(u);
    }
    return Array.from(urls);
  }

  async function extractTweet(container){
    await expandShowMore(container);
    const text = collectStructuredTweetText(container);
    const images = collectImageUrls(container);
    const links = collectEmbeddedExternalLinks(container, text);

    const blocks = [text];
    if (links.length) blocks.push('', ...links);
    if (images.length) blocks.push('', ...images);
    return blocks.join('\n').trim();
  }

  async function openComposeWith(text){
    const token = `${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
    await chrome.storage.local.set({ pendingNoteText: text, pendingNoteTs: Date.now(), pendingNoteToken: token });
    const p = new URLSearchParams(); p.set('action','compose'); p.set('note_token', token);
    const subset = text.length > 1800 ? text.slice(0,1800) : text; if (subset) p.set(NOTE_PREFILL_PARAM, subset);
    window.open(`${NOTE_COMPOSE_ORIGIN}${NOTE_COMPOSE_PATH}?${p}`, '_blank', 'noopener');
  }

  async function handleClick(container){
    const text = await extractTweet(container);
    if (text) await openComposeWith(text);
  }

  function injectButton(container){
    if (!container || container.getAttribute(FLAG)) return;
    const btn = document.createElement('button'); btn.textContent = BTN_LABEL;
    Object.assign(btn.style, { borderRadius:'999px', padding:'6px 12px', fontSize:'12px', fontWeight:'600', border:'none', background:'#ff5c00', color:'#fff', cursor:'pointer', marginLeft:'8px' });
    btn.addEventListener('click', (e) => { e.stopPropagation(); handleClick(container); });
    const actionBar = container.querySelector('[role="group"][aria-label]') || container.querySelector('div[data-testid="toolBar"]') || container;
    (actionBar || container).appendChild(btn);
    container.setAttribute(FLAG,'1');
  }

  new MutationObserver((muts)=>{
    for (const m of muts){
      m.addedNodes.forEach(n=>{
        if (n.nodeType !== 1) return;
        const c = getTweetContainer(n);
        if (c) { injectButton(c); return; }
        n.querySelectorAll?.('article[role="article"], article[data-testid="tweet"]').forEach(el=>{ const cc=getTweetContainer(el); if(cc) injectButton(cc); });
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  document.querySelectorAll('article[role="article"], article[data-testid="tweet"]').forEach(el=>{ const c=getTweetContainer(el); if(c) injectButton(c); });
}
})();
