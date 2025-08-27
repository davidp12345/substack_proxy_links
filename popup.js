// popup.js
const NOTE_COMPOSE_PATH = '/home';
const NOTE_PREFILL_PARAM = 'message';
// Default proxy host base (used if no custom base saved in chrome.storage.sync)
const DEFAULT_PROXY_HOST_BASE = 'https://davidp12345.github.io/substack_proxy_links/proxies';

class UnifiedPopup {
  constructor() {
    this.candidates = [];
    this.expandedCandidates = new Set();
    this.enabledSources = { substack: true, linkedin: true, x: true };
    this.init();
  }

  async init() {
    try {
      await this.loadToggles();
      this.bindToggleHandlers();

      const tab = await this.getCurrentTab();
      const isSubstackPost = await this.detectSubstackPost(tab.id, tab.url);

      const generateBtn = document.getElementById('generate-btn');
      generateBtn.addEventListener('click', () => this.generateCandidates());
      generateBtn.disabled = !(this.enabledSources.substack && isSubstackPost);

      if (!isSubstackPost) {
        this.showError('Navigate to a Substack post to generate candidates.');
      } else if (this.enabledSources.substack) {
        this.generateCandidates();
      }

      // Prefill proxy input from current tab if it looks like a Substack post
      const proxyInput = document.getElementById('proxy-input');
      if (isSubstackPost) {
        // Clean URL by removing @ prefix if it exists
        let cleanUrl = tab.url;
        if (cleanUrl.startsWith('@')) {
          cleanUrl = cleanUrl.substring(1);
        }
        proxyInput.value = cleanUrl;
      }
      document.getElementById('proxy-copy-url').addEventListener('click', () => this.generateAndCopyProxy());
    } catch (err) {
      console.error('Popup init failed', err);
      this.showError('Extension initialization failed');
    }
  }

  async detectSubstackPost(tabId, tabUrl) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        function: () => {
          try {
            // Clean URL by removing @ prefix if it exists
            let cleanHref = location.href;
            if (cleanHref.startsWith('@')) {
              cleanHref = cleanHref.substring(1);
            }
            
            const u = new URL(cleanHref);
            const path = u.pathname || '';
            const looksLikePostPath = /(^|\/)p\//.test(path) || 
                                    path.includes('/home/post/') || 
                                    path.includes('/posts/') ||
                                    path.includes('/p-');

            // Heuristic: presence of typical Substack DOM markers OR enough article text
            const titleSelectors = ['h1[class*="post-title"]','h1[class*="title"]','.post-header h1','article h1','h1'];
            let hasTitle = false;
            for (const sel of titleSelectors) { const el = document.querySelector(sel); if (el?.textContent?.trim()) { hasTitle = true; break; } }

            const contentSelectors = [
              '.markup p', '.post-content p', 'article p', '.pencraft p',
              'main article p', '[data-testid="post-content"] p', '[data-testid="post-body"] p',
              '.reader .pencraft p'
            ];
            let totalLen = 0; let found = 0;
            for (const sel of contentSelectors) {
              const nodes = document.querySelectorAll(sel);
              if (nodes.length > 0) {
                found = nodes.length;
                totalLen = Array.from(nodes).map(n => (n.textContent||'').trim()).join(' ').length;
                break;
              }
            }

            const metaOk = !!(
              document.querySelector('meta[name="twitter:app:name:iphone"][content="Substack"]') ||
              document.querySelector('meta[property="og:site_name"][content*="Substack"]') ||
              document.querySelector('script[src*="substack"], link[href*="substackcdn"]')
            );
            const hostOk = u.hostname.endsWith('.substack.com') || u.hostname === 'substack.com';
            return (metaOk || hostOk) && (looksLikePostPath || totalLen > 200 || hasTitle);
          } catch { return false; }
        }
      });
      if (result) return true;
      
      // Clean tabUrl by removing @ prefix if it exists
      let cleanTabUrl = tabUrl;
      if (cleanTabUrl.startsWith('@')) {
        cleanTabUrl = cleanTabUrl.substring(1);
      }
      
      try {
        const url = new URL(cleanTabUrl);
        return /(^|\/)p\//.test(url.pathname) || 
               url.pathname.includes('/home/post/') || 
               url.pathname.includes('/p-') ||
               url.hostname.endsWith('.substack.com') || 
               url.hostname === 'substack.com';
      } catch (urlError) {
        console.error('Error parsing URL:', cleanTabUrl, urlError);
        return false;
      }
    } catch (error) {
      console.error('Error in detectSubstackPost:', error);
      try { 
        let cleanTabUrl = tabUrl;
        if (cleanTabUrl.startsWith('@')) {
          cleanTabUrl = cleanTabUrl.substring(1);
        }
        const u = new URL(cleanTabUrl); 
        return /(^|\/)p\//.test(u.pathname) || 
               u.pathname.includes('/home/post/') || 
               u.pathname.includes('/p-') ||
               u.hostname.endsWith('.substack.com') || 
               u.hostname === 'substack.com'; 
      } catch { return false; }
    }
  }

  async loadToggles() {
    const { enabledSources } = await chrome.storage.sync.get(['enabledSources']);
    this.enabledSources = {
      substack: enabledSources?.substack !== false,
      linkedin: enabledSources?.linkedin !== false,
      x: enabledSources?.x !== false
    };
    document.getElementById('toggle-substack').checked = this.enabledSources.substack;
    document.getElementById('toggle-linkedin').checked = this.enabledSources.linkedin;
    document.getElementById('toggle-x').checked = this.enabledSources.x;
  }

  bindToggleHandlers() {
    const save = async () => { await chrome.storage.sync.set({ enabledSources: this.enabledSources }); };
    document.getElementById('toggle-substack').addEventListener('change', async (e) => {
      this.enabledSources.substack = !!e.target.checked; await save();
      const tab = await this.getCurrentTab();
      const isSubstackPost = await this.detectSubstackPost(tab.id, tab.url);
      document.getElementById('generate-btn').disabled = !(this.enabledSources.substack && isSubstackPost);
    });
    document.getElementById('toggle-linkedin').addEventListener('change', (e) => { this.enabledSources.linkedin = !!e.target.checked; save(); });
    document.getElementById('toggle-x').addEventListener('change', (e) => { this.enabledSources.x = !!e.target.checked; save(); });
  }

  async getCurrentTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }

  async generateAndCopyProxy(){
    const status = document.getElementById('proxy-status');
    const progressBox = document.getElementById('proxy-progress');
    const progressText = document.getElementById('proxy-progress-text');
    const progressFill = document.getElementById('proxy-progress-fill');
    const raw = document.getElementById('proxy-input').value.trim();
    if (!raw) { status.textContent = 'Paste a Substack URL'; return; }
    
    // Clean URL by removing @ prefix if it exists
    let cleanUrl = raw;
    if (cleanUrl.startsWith('@')) {
      cleanUrl = cleanUrl.substring(1);
    }
    
    let u; 
    try { 
      u = new URL(cleanUrl); 
    } catch { 
      status.textContent = 'Invalid URL format: ' + cleanUrl; 
      return; 
    }
    
    if (!(u.hostname.endsWith('substack.com') || u.hostname === 'substack.com')) { 
      status.textContent = 'Not a Substack URL: ' + u.hostname; 
      return; 
    }
    status.textContent = 'Generating…';
    progressBox.style.display = 'block';
    progressText.textContent = 'Generating…';
    progressFill.style.width = '10%';
    try{
      const res = await chrome.runtime.sendMessage({ type:'proxy:generate', url: cleanUrl });
      if (!res || !res.ok){
        try { await navigator.clipboard.writeText(cleanUrl); status.textContent = 'Copied original URL (proxy failed)'; }
        catch { status.textContent = res?.error || 'Generation failed'; }
        progressBox.style.display = 'none';
        return;
      }
      const links = document.getElementById('proxy-output-links');
      links.textContent = '';
      const pages = res.pages_url || '';
      const fallback = res.fallback_url || '';
      // Show both links so the user can click the one that already works
      if (pages) {
        const a = document.createElement('a'); a.href = pages; a.textContent = 'Open static Pages link'; a.target='_blank';
        links.appendChild(a); links.appendChild(document.createElement('br'));
      }
      if (fallback && fallback !== pages){
        const b = document.createElement('a'); b.href = fallback; b.textContent = 'Open fallback (works immediately)'; b.target='_blank';
        links.appendChild(b);
      }
      // Copy whichever is immediately ready — background already waited; if not ready, copy fallback
      // Poll readiness up to ~30s; update UI progress and messages
      let ready = !!res.ready;
      const toCheck = pages || fallback;
      const start = Date.now();
      const timeoutMs = 30000; const stepMs = 1500;
      let attempt = 0;
      while(!ready && (Date.now() - start) < timeoutMs){
        attempt++;
        const pct = Math.min(90, Math.round(((Date.now()-start)/timeoutMs)*100));
        progressFill.style.width = pct + '%';
        progressText.textContent = 'Publishing to Pages… (' + pct + '%)';
        try{
          const r = await fetch(toCheck, { method:'HEAD', cache:'no-store' });
          ready = r.status === 200;
        }catch{ ready = false; }
        if (!ready) await new Promise(r=>setTimeout(r, stepMs));
      }

      const copyThis = ready ? pages : (fallback || pages);
      if (copyThis) await navigator.clipboard.writeText(copyThis);
      status.textContent = ready ? 'Ready ✔ (URL copied)' : 'Publishing… fallback copied';
      progressFill.style.width = '100%';
      progressText.textContent = ready ? 'Live on Pages' : 'Using fallback link';
      setTimeout(()=>{ progressBox.style.display = 'none'; }, 600);
    }catch(e){
      console.error('Proxy generation error:', e);
      try { await navigator.clipboard.writeText(cleanUrl); status.textContent = 'Copied original URL (proxy failed)'; }
      catch { status.textContent = 'Generation failed: ' + (e.message || e); }
      progressBox.style.display = 'none';
    }
  }

  async generateCandidates() {
    this.showLoading();
    try {
      const tab = await this.getCurrentTab();
      const postData = await this.extractPostContent(tab.id);
      if (!postData.content || postData.content.length < 100) throw new Error('Insufficient content');
      if (!postData.title) throw new Error('Missing title');
      this.candidates = this.generateSimpleCandidates(postData);
      this.displayCandidates();
    } catch (error) {
      console.error('Error generating candidates:', error);
      this.showError(`Failed: ${error.message}`);
    }
  }

  async extractPostContent(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      function: () => {
        let title = '';
        let content = '';
        let cleanParagraphs = [];
        const titleSelectors = ['h1[class*="post-title"]','h1[class*="title"]','.post-header h1','article h1','h1'];
        for (const sel of titleSelectors) { const el = document.querySelector(sel); if (el?.textContent?.trim()) { title = el.textContent.trim(); break; } }
        const contentSelectors = ['.markup p', '.post-content p', 'article p', '.pencraft p', 'main article p', '[data-testid="post-content"] p', '[data-testid="post-body"] p', '.reader .pencraft p'];
        let found = [];
        for (const sel of contentSelectors) { const nodes = document.querySelectorAll(sel); if (nodes.length > 0) { found = Array.from(nodes); break; } }
        found.forEach(p => { const t = p.textContent?.trim(); if (t && t.length > 50 && !/Share this post|Copy link|Subscribe|Leave a comment/.test(t) && t.length < 1000) { cleanParagraphs.push(t); } });
        content = cleanParagraphs.join('\n\n');
        if (!content || content.length < 100) { const allText = document.body.textContent || ''; const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 30 && !/Share this post|Copy link|Subscribe/.test(s)); content = sentences.slice(0, 5).join('. ').trim(); }
        return { title, content, paragraphs: cleanParagraphs, url: window.location.href };
      }
    });
    return result;
  }

  generateSimpleCandidates(postData) {
    const candidates = [];
    if (!postData.paragraphs || postData.paragraphs.length === 0) throw new Error('No clean content found');

    const sanitize = (t) => (t || '')
      .trim()
      .replace(/^from\s+\"[^\"]+\"\s*:\s*/i, '')
      .replace(/^note\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const splitSentences = (text) => {
      const s = (text || '').trim();
      const parts = s.split(/(?<=[.!?])\s+/g).map(x => x.trim()).filter(Boolean);
      return parts;
    };

    const minLen = 200;
    const maxLen = 800;

    const buildSelfContained = (raw) => {
      let text = sanitize(raw || '');
      text = text.replace(/^(["“])+/, '').replace(/(["”])+$/, '');
      const sentences = splitSentences(text);
      if (sentences.length === 0) return '';

      let acc = '';
      for (let i = 0; i < sentences.length; i++) {
        const candidate = (acc ? acc + ' ' : '') + sentences[i];
        if (candidate.length <= maxLen) {
          acc = candidate;
          if (acc.length >= minLen && /[.!?]$/.test(acc)) {
            const next = sentences[i + 1];
            if (!next || (acc + ' ' + next).length > maxLen) break;
          }
        } else {
          if (!acc) {
            const slice = sentences[i].slice(0, maxLen);
            const lastBoundary = Math.max(
              slice.lastIndexOf('. '),
              slice.lastIndexOf('! '),
              slice.lastIndexOf('? '),
              slice.lastIndexOf('.'),
              slice.lastIndexOf('!'),
              slice.lastIndexOf('?')
            );
            acc = lastBoundary > 120 ? slice.slice(0, lastBoundary + 1).trim() : slice.trim();
          }
          break;
        }
      }
      acc = acc.replace(/[\u2026]+$/g, '').replace(/\s*(?:\.\.\.)\s*$/g, '');
      if (!/[.!?]$/.test(acc)) acc = acc.replace(/[\s,;:]+$/,'').trim() + '.';
      return acc;
    };

    const createCandidate = (type, content, score) => {
      const full = buildSelfContained(content);
      if (full && full.length >= 180 && full.length <= maxLen) return { type, content: full, engagementScore: score };
      return null;
    };

    const paragraphs = postData.paragraphs.map(sanitize).filter(p => p.length > 30);
    const allSentences = splitSentences(paragraphs.join(' ')).map(sanitize).filter(s => s.length > 15 && s.length < 500);

    // Build additional sources: chunk overly long paragraphs by sentence windows
    const chunkedParagraphs = [];
    for (const p of paragraphs) {
      if (p.length <= maxLen) continue;
      const sents = splitSentences(p);
      for (let size = 2; size <= 5; size++) {
        for (let i = 0; i <= sents.length - size; i++) {
          const chunk = sents.slice(i, i + size).join(' ');
          if (chunk.length >= 140 && chunk.length <= 1000) chunkedParagraphs.push(chunk);
        }
      }
    }

    // Sliding windows over all sentences (2–4 sentences) to increase variety
    const sentenceWindows = [];
    for (let size = 2; size <= 4; size++) {
      for (let i = 0; i <= allSentences.length - size; i++) {
        const windowText = allSentences.slice(i, i + size).join(' ');
        if (windowText.length >= 140 && windowText.length <= 1000) sentenceWindows.push(windowText);
      }
    }

    // Prioritization: strong paragraphs, chunked paragraphs, then sentence windows
    const contentPieces = [
      ...paragraphs,
      ...chunkedParagraphs,
      ...sentenceWindows
    ];

    const normalize = (t) => sanitize(t).toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const seen = new Set(); const leadSeen = new Set();

    for (let i = 0, outIdx = 0; i < contentPieces.length && candidates.length < 10; i++) {
      const base = contentPieces[i];
      const built = buildSelfContained(base);
      if (!built) continue;
      const leadKey = normalize(built.slice(0, 100));
      if (leadSeen.has(leadKey)) continue;
      const norm = normalize(built);
      if (seen.has(norm)) continue;

      const cand = createCandidate(`note${outIdx + 1}`, built, 95 - outIdx * 3);
      if (cand) { candidates.push(cand); seen.add(norm); leadSeen.add(leadKey); outIdx++; }
    }

    if (candidates.length === 0 && allSentences.length > 0) {
      for (let i = 0; i < Math.min(5, allSentences.length - 1); i++) {
        const simple = buildSelfContained(allSentences[i] + ' ' + (allSentences[i + 1] || ''));
        if (!simple) continue;
        const cand = { type: `fallback${i + 1}`, content: simple, engagementScore: 50 - i * 5 };
        candidates.push(cand);
        if (candidates.length >= 10) break;
      }
    }

    if (candidates.length === 0) throw new Error('Could not create any candidates');
    return candidates.slice(0, 10).map((c, idx) => ({ ...c, type: `note${idx + 1}` }));
  }

  displayCandidates() {
    const container = document.getElementById('candidates');
    container.innerHTML = '';
    this.candidates.forEach((c, index) => {
      const div = document.createElement('div');
      div.className = 'candidate-item';
      div.innerHTML = `
        <div class="candidate-header">
          <span class="candidate-type">${c.type.toUpperCase()}</span>
          <span class="candidate-score">Score: ${c.engagementScore}</span>
        </div>
        <div class="candidate-content">${this.formatContent(c.content, this.expandedCandidates.has(index))}</div>
        <div class="candidate-actions">
          <button class="see-more-btn" data-index="${index}">${this.expandedCandidates.has(index) ? 'See less' : 'See more'}</button>
          <button class="edit-btn" data-index="${index}">Edit in Notes</button>
        </div>`;
      container.appendChild(div);
    });
    container.querySelectorAll('.edit-btn').forEach(btn => btn.addEventListener('click', e => { const index = parseInt(e.target.dataset.index, 10); this.openInNotesEditor(index); }));
    container.querySelectorAll('.see-more-btn').forEach(btn => btn.addEventListener('click', e => { const index = parseInt(e.target.dataset.index, 10); if (this.expandedCandidates.has(index)) this.expandedCandidates.delete(index); else this.expandedCandidates.add(index); this.displayCandidates(); }));
    this.showCandidates();
  }

  async openInNotesEditor(idx) { const candidate = this.candidates[idx]; await this.openNoteEditorWithText(candidate.content); window.close(); }

  async openNoteEditorWithText(noteText) {
    await chrome.storage.local.set({ pendingNoteText: noteText, pendingNoteTs: Date.now(), pendingNoteToken: `${Date.now()}-${Math.random().toString(36).slice(2,10)}` });
    const params = new URLSearchParams(); params.set('action', 'compose'); params.set(NOTE_PREFILL_PARAM, noteText);
    const composeUrl = `https://substack.com${NOTE_COMPOSE_PATH}?${params.toString()}`;
    await chrome.tabs.create({ url: composeUrl });
  }

  formatContent(content, expanded = false) { const text = expanded ? content : (content.length > 150 ? content.substring(0, 150) + '...' : content); return text.replace(/\n/g, '<br>'); }

  showLoading() { document.getElementById('generate-section').classList.add('hidden'); document.getElementById('candidates').classList.add('hidden'); document.getElementById('error').classList.add('hidden'); document.getElementById('loading').classList.remove('hidden'); }
  showCandidates() { document.getElementById('loading').classList.add('hidden'); document.getElementById('error').classList.add('hidden'); document.getElementById('generate-section').classList.add('hidden'); document.getElementById('candidates').classList.remove('hidden'); }
  showError(message) { document.getElementById('loading').classList.add('hidden'); document.getElementById('candidates').classList.add('hidden'); document.getElementById('error').classList.remove('hidden'); document.getElementById('error-message').textContent = message; }
}

new UnifiedPopup();
