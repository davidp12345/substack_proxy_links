// popup.js - Fixed version with robust URL handling and error recovery
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

      // Enhanced proxy input handling with URL cleaning
      const proxyInput = document.getElementById('proxy-input');
      if (isSubstackPost) {
        // Clean the URL before setting it
        proxyInput.value = this.cleanUrl(tab.url);
      }
      
      document.getElementById('proxy-copy-url').addEventListener('click', () => this.generateAndCopyProxy());
      
      // Add input event listener to clean URLs as they're pasted
      proxyInput.addEventListener('input', (e) => {
        const cleaned = this.cleanUrl(e.target.value);
        if (cleaned !== e.target.value) {
          e.target.value = cleaned;
        }
      });
      
    } catch (err) {
      console.error('Popup init failed', err);
      this.showError('Extension initialization failed');
    }
  }
  
  // Enhanced URL cleaning to handle various edge cases
  cleanUrl(url) {
    if (!url || typeof url !== 'string') return '';
    
    // Remove common prefixes that might be accidentally included
    let cleaned = url.trim()
      .replace(/^@+/, '')           // Remove @ symbols at start
      .replace(/^#+/, '')           // Remove # symbols at start  
      .replace(/^mailto:/, '')      // Remove mailto: prefix
      .replace(/^javascript:/, '')  // Remove javascript: prefix
      .replace(/^['"]+/, '')        // Remove leading quotes
      .replace(/['"]+$/, '');       // Remove trailing quotes
    
    // If it doesn't start with http, try to fix it
    if (cleaned && !cleaned.match(/^https?:\/\//)) {
      // If it looks like a domain, add https://
      if (cleaned.match(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
        cleaned = 'https://' + cleaned;
      }
    }
    
    return cleaned;
  }
  
  // Enhanced URL validation
  isValidSubstackUrl(url) {
    try {
      const cleaned = this.cleanUrl(url);
      if (!cleaned) return false;
      
      const u = new URL(cleaned);
      return (u.hostname.endsWith('.substack.com') || u.hostname === 'substack.com') && 
             u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async detectSubstackPost(tabId, tabUrl) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        function: () => {
          try {
            const u = new URL(location.href);
            const path = u.pathname || '';
            const looksLikePostPath = /(^|\/)p\//.test(path) || path.includes('/home/post/') || path.includes('/posts/');

            // Heuristic: presence of typical Substack DOM markers OR enough article text
            const titleSelectors = ['h1[class*="post-title"]','h1[class*="title"]','.post-header h1','article h1','h1'];
            let hasTitle = false;
            for (const sel of titleSelectors) { 
              const el = document.querySelector(sel); 
              if (el?.textContent?.trim()) { 
                hasTitle = true; 
                break; 
              } 
            }

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
            const hostOk = location.hostname.endsWith('.substack.com') || location.hostname === 'substack.com';
            return (metaOk || hostOk) && (looksLikePostPath || totalLen > 200 || hasTitle);
          } catch { return false; }
        }
      });
      if (result) return true;
      const url = new URL(tabUrl);
      return /(^|\/)p\//.test(url.pathname) || url.pathname.includes('/home/post/') || url.hostname.endsWith('.substack.com') || url.hostname === 'substack.com';
    } catch {
      try { 
        const u = new URL(tabUrl); 
        return /(^|\/)p\//.test(u.pathname) || u.pathname.includes('/home/post/') || u.hostname.endsWith('.substack.com') || u.hostname === 'substack.com'; 
      } catch { 
        return false; 
      }
    }
  }

  async loadToggles() {
    const { enabledSources } = await chrome.storage.sync.get(['enabledSources']);
    if (enabledSources) Object.assign(this.enabledSources, enabledSources);

    ['substack', 'linkedin', 'x'].forEach(source => {
      const checkbox = document.getElementById(`toggle-${source}`);
      if (checkbox) checkbox.checked = !!this.enabledSources[source];
    });
  }

  bindToggleHandlers() {
    const save = () => chrome.storage.sync.set({ enabledSources: this.enabledSources });
    document.getElementById('toggle-substack').addEventListener('change', (e) => { this.enabledSources.substack = !!e.target.checked; save(); });
    document.getElementById('toggle-linkedin').addEventListener('change', (e) => { this.enabledSources.linkedin = !!e.target.checked; save(); });
    document.getElementById('toggle-x').addEventListener('change', (e) => { this.enabledSources.x = !!e.target.checked; save(); });
  }

  async getCurrentTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab; }

  async generateAndCopyProxy(){
    const status = document.getElementById('proxy-status');
    const progressBox = document.getElementById('proxy-progress');
    const progressText = document.getElementById('proxy-progress-text');
    const progressFill = document.getElementById('proxy-progress-fill');
    
    // Enhanced input processing
    const rawInput = document.getElementById('proxy-input').value.trim();
    if (!rawInput) { 
      status.textContent = 'Paste a Substack URL'; 
      return; 
    }
    
    // Clean and validate the URL
    const cleanedUrl = this.cleanUrl(rawInput);
    if (!cleanedUrl) {
      status.textContent = 'Invalid URL format';
      return;
    }
    
    // Additional validation
    if (!this.isValidSubstackUrl(cleanedUrl)) {
      status.textContent = 'Not a valid Substack URL';
      return;
    }
    
    let u;
    try { 
      u = new URL(cleanedUrl); 
    } catch { 
      status.textContent = 'Invalid URL format'; 
      return; 
    }
    
    console.log('🔗 Generating proxy for cleaned URL:', cleanedUrl);
    
    status.textContent = 'Generating…';
    progressBox.style.display = 'block';
    progressText.textContent = 'Generating…';
    progressFill.style.width = '10%';
    
    try {
      // Use the cleaned URL for generation
      const res = await chrome.runtime.sendMessage({ 
        type: 'proxy:generate', 
        url: cleanedUrl 
      });
      
      console.log('📨 Background response:', res);
      
      if (!res || !res.ok) {
        const errorMsg = res?.error || 'Generation failed';
        console.error('❌ Proxy generation failed:', errorMsg);
        
        try { 
          await navigator.clipboard.writeText(cleanedUrl); 
          status.textContent = 'Copied original URL (proxy failed)'; 
        } catch { 
          status.textContent = errorMsg; 
        }
        progressBox.style.display = 'none';
        return;
      }
      
      // Success! Update UI with links
      const links = document.getElementById('proxy-output-links');
      links.textContent = '';
      
      const pages = res.pages_url || '';
      const fallback = res.fallback_url || '';
      
      console.log('✅ Proxy generated:', { pages, fallback, ready: res.ready });
      
      // Show both links so the user can choose
      if (pages) {
        const a = document.createElement('a'); 
        a.href = pages; 
        a.textContent = res.ready ? 'Open static Pages link' : 'Future Pages link (needs deployment)'; 
        a.target = '_blank';
        links.appendChild(a); 
        links.appendChild(document.createElement('br'));
      }
      
      if (fallback && fallback !== pages) {
        const b = document.createElement('a'); 
        b.href = fallback; 
        b.textContent = fallback.startsWith('data:') ? 'Open redirect page (works immediately)' : 'Open fallback link'; 
        b.target = '_blank';
        links.appendChild(b);
      }
      
      // Determine what to copy based on what's ready
      let copyThis = '';
      let statusMsg = '';
      
      if (res.ready && pages) {
        // Pages URL is ready
        copyThis = pages;
        statusMsg = 'Ready ✔ (Pages URL copied)';
        progressFill.style.width = '100%';
        progressText.textContent = 'Live on Pages';
      } else if (fallback) {
        // Use fallback URL
        copyThis = fallback;
        if (fallback.startsWith('data:')) {
          statusMsg = 'Redirect URL copied (works immediately)';
          progressText.textContent = 'Redirect ready';
        } else {
          statusMsg = 'Fallback URL copied';
          progressText.textContent = 'Using fallback';
        }
        progressFill.style.width = '100%';
      } else if (pages) {
        // Future Pages URL
        copyThis = pages;
        statusMsg = 'Pages URL copied (needs deployment)';
        progressFill.style.width = '70%';
        progressText.textContent = 'Needs deployment';
      } else {
        // Fallback to original
        copyThis = cleanedUrl;
        statusMsg = 'Original URL copied';
        progressFill.style.width = '100%';
        progressText.textContent = 'Fallback to original';
      }
      
      // Copy to clipboard
      if (copyThis) {
        try {
          await navigator.clipboard.writeText(copyThis);
          status.textContent = statusMsg;
        } catch (clipboardError) {
          console.error('Clipboard error:', clipboardError);
          status.textContent = 'Generated (manual copy needed)';
        }
      }
      
      // Auto-hide progress after a delay
      setTimeout(() => {
        progressBox.style.display = 'none';
      }, 2000);
      
    } catch (e) {
      console.error('❌ Error in generateAndCopyProxy:', e);
      try { 
        await navigator.clipboard.writeText(cleanedUrl); 
        status.textContent = 'Copied original URL (proxy failed)'; 
      } catch { 
        status.textContent = 'Generation failed'; 
      }
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

      this.candidates = [];
      
      if (this.enabledSources.substack) {
        const substackNote = this.generateSubstackNote(postData);
        this.candidates.push({ type: 'Substack', platform: 'substack', data: substackNote });
      }

      if (this.enabledSources.linkedin) {
        const linkedinPost = this.generateLinkedInPost(postData);
        this.candidates.push({ type: 'LinkedIn', platform: 'linkedin', data: linkedinPost });
      }

      if (this.enabledSources.x) {
        const xPost = this.generateXPost(postData);
        this.candidates.push({ type: 'X (Twitter)', platform: 'x', data: xPost });
      }

      this.displayCandidates();
    } catch (err) {
      console.error('Error generating candidates:', err);
      this.showError('Failed to extract content from the page');
    }
  }

  async extractPostContent(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      function: () => {
        const titleSelectors = ['h1[class*="post-title"]','h1[class*="title"]','.post-header h1','article h1','h1'];
        let title = '';
        for (const sel of titleSelectors) { 
          const el = document.querySelector(sel); 
          if (el?.textContent?.trim()) { 
            title = el.textContent.trim(); 
            break; 
          } 
        }

        const contentSelectors = [
          '.markup p', '.post-content p', 'article p', '.pencraft p',
          'main article p', '[data-testid="post-content"] p', '[data-testid="post-body"] p',
          '.reader .pencraft p'
        ];
        let content = '';
        for (const sel of contentSelectors) {
          const nodes = document.querySelectorAll(sel);
          if (nodes.length > 0) {
            content = Array.from(nodes).map(n => (n.textContent||'').trim()).filter(t => t.length > 10).join('\n\n');
            break;
          }
        }

        const authorSelectors = ['.byline a', '.author-name', '.pencraft[data-testid="author-name"]', '.author'];
        let author = '';
        for (const sel of authorSelectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) { 
            author = el.textContent.trim(); 
            break; 
          }
        }

        return { title, content, author, url: location.href };
      }
    });
    return result;
  }

  generateSubstackNote(postData) {
    const noteText = `${postData.title}\n\n${postData.content.substring(0, 800)}${postData.content.length > 800 ? '...' : ''}\n\nSource: ${postData.url}`;
    return { noteText, targetUrl: postData.url };
  }

  generateLinkedInPost(postData) {
    const maxLength = 3000;
    let post = `${postData.title}\n\n${postData.content}`;
    if (post.length > maxLength) post = post.substring(0, maxLength - 100) + '...';
    post += `\n\nRead the full post: ${postData.url}`;
    return { post, targetUrl: postData.url };
  }

  generateXPost(postData) {
    const maxLength = 280;
    let tweet = `${postData.title}\n\n${postData.url}`;
    if (tweet.length > maxLength) {
      const availableForTitle = maxLength - postData.url.length - 5;
      tweet = `${postData.title.substring(0, availableForTitle)}...\n\n${postData.url}`;
    }
    return { tweet, targetUrl: postData.url };
  }

  displayCandidates() {
    const container = document.getElementById('candidates-container');
    if (this.candidates.length === 0) {
      container.innerHTML = '<p class="error">No candidates generated. Check your source toggles.</p>';
      return;
    }

    container.innerHTML = this.candidates.map((candidate, index) => `
      <div class="candidate-item">
        <div class="candidate-header">
          <span class="candidate-type">${candidate.type}</span>
        </div>
        <div class="candidate-content ${this.expandedCandidates.has(index) ? 'expanded' : 'collapsed'}">
          ${this.formatCandidateData(candidate.data)}
        </div>
        <div class="candidate-actions">
          <button class="see-more-btn" onclick="popup.toggleExpanded(${index})">
            ${this.expandedCandidates.has(index) ? 'Show Less' : 'See More'}
          </button>
          <button class="edit-btn" onclick="popup.editCandidate('${candidate.platform}', ${index})">Edit in ${candidate.type}</button>
        </div>
      </div>
    `).join('');
  }

  formatCandidateData(data) {
    if (data.noteText) return `<p>${this.escapeHtml(data.noteText)}</p>`;
    if (data.post) return `<p>${this.escapeHtml(data.post)}</p>`;
    if (data.tweet) return `<p>${this.escapeHtml(data.tweet)}</p>`;
    return '<p>No content</p>';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  toggleExpanded(index) {
    if (this.expandedCandidates.has(index)) {
      this.expandedCandidates.delete(index);
    } else {
      this.expandedCandidates.add(index);
    }
    this.displayCandidates();
  }

  async editCandidate(platform, index) {
    const candidate = this.candidates[index];
    if (!candidate) return;

    try {
      let targetUrl = '';
      let prefillContent = '';

      if (platform === 'substack') {
        const noteText = candidate.data.noteText || '';
        const params = new URLSearchParams(); 
        params.set('action', 'compose'); 
        params.set(NOTE_PREFILL_PARAM, noteText);
        targetUrl = `https://substack.com${NOTE_COMPOSE_PATH}?${params.toString()}`;
      } else if (platform === 'linkedin') {
        const text = candidate.data.post || '';
        prefillContent = encodeURIComponent(text);
        targetUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${prefillContent}`;
      } else if (platform === 'x') {
        const text = candidate.data.tweet || '';
        prefillContent = encodeURIComponent(text);
        targetUrl = `https://x.com/intent/tweet?text=${prefillContent}`;
      }

      if (targetUrl) {
        await chrome.tabs.create({ url: targetUrl });
      }
    } catch (err) {
      console.error(`Error opening ${platform}:`, err);
      this.showError(`Failed to open ${platform}`);
    }
  }

  showLoading() {
    document.getElementById('candidates-container').innerHTML = '<div class="loading">Generating candidates...</div>';
  }

  showError(message) {
    document.getElementById('candidates-container').innerHTML = `<div class="error">${this.escapeHtml(message)}</div>`;
  }
}

// Global instance for button handlers
let popup;
document.addEventListener('DOMContentLoaded', () => {
  popup = new UnifiedPopup();
});