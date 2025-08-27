// compose_inject.js
(function(){
  'use strict';
  const u = new URL(location.href);
  const isNotesNew = u.pathname.includes('/notes') && (u.pathname.includes('/new') || u.search.includes('compose'));
  const isFeedCompose = u.pathname.startsWith('/home') && u.searchParams.get('action') === 'compose';
  if (!(isNotesNew || isFeedCompose)) return;

  const NOTE_PREFILL_PARAM = 'message';

  setTimeout(async () => {
    try {
      const params = new URL(location.href).searchParams;
      const hadUrlMessage = !!params.get(NOTE_PREFILL_PARAM);
      const token = params.get('note_token');

      const getEditor = () => document.querySelector('.ProseMirror') || document.querySelector('[contenteditable="true"]') || document.querySelector('textarea');

      const start = Date.now();
      let payload = null;
      while (Date.now() - start < 7000) {
        const { pendingNoteText, pendingNoteTs } = await chrome.storage.local.get(['pendingNoteText','pendingNoteTs']);
        if (pendingNoteText && Date.now() - pendingNoteTs < 5 * 60 * 1000) { payload = { text: pendingNoteText }; break; }
        await new Promise(r => setTimeout(r, 100));
      }

      if (payload) {
        const { pendingNoteToken } = await chrome.storage.local.get(['pendingNoteToken']);
        if (!token || (pendingNoteToken && token === pendingNoteToken)) {
          let e = getEditor();
          const mountStart = Date.now();
          while (!e && Date.now() - mountStart < 5000) { await new Promise(r => setTimeout(r, 150)); e = getEditor(); }
          if (e) {
            const ok = await populateEditorRobust(e, payload.text);
            if (ok) {
              chrome.storage.local.remove(['pendingNoteText','pendingNoteTs','pendingNoteToken']);
              return;
            }
          }
        }
      }

      if (hadUrlMessage) {
        showToast('Could not populate the note. Please try again.');
      }
    } catch (err) {
      console.error('[Compose Inject] error', err);
    }
  }, 800);

  function showToast(text){
    try{
      if(document.getElementById('unified-toast')) return;
      const el=document.createElement('div');
      el.id='unified-toast'; el.textContent=text;
      Object.assign(el.style,{position:'fixed',bottom:'16px',right:'16px',zIndex:999999,background:'rgba(0,0,0,0.85)',color:'#fff',padding:'12px 14px',borderRadius:'8px',fontSize:'13px',maxWidth:'420px',lineHeight:'1.35'});
      document.body.appendChild(el); setTimeout(()=>{el.remove()},6000);
    }catch{}
  }

  function makeChunks(text){
    const maxChunk = 1700; const softMin = 1200; const chunks = []; let i = 0;
    while (i < text.length){
      let end = Math.min(i + maxChunk, text.length);
      if (end < text.length){
        const slice = text.slice(i, end);
        let cut = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '), slice.lastIndexOf('\n'));
        if (cut < softMin) cut = -1; end = i + (cut > 0 ? cut + 1 : slice.length);
      }
      chunks.push(text.slice(i, end).trim()); i = end;
    }
    return chunks.filter(Boolean);
  }

  async function dispatchInput(el){
    try{ el.dispatchEvent(new Event('input', { bubbles:true })); el.dispatchEvent(new Event('change', { bubbles:true })); }catch{}
    await new Promise(r=>setTimeout(r,120));
  }

  async function setDirect(el, text){
    try{
      if (el.tagName === 'TEXTAREA'){
        el.focus(); el.value = text; await dispatchInput(el); return true;
      }
      if (el.getAttribute('contenteditable') === 'true' || el.classList.contains('ProseMirror')){
        el.focus();
        const html = text.split('\n').map(line => line.length ? line : '<br>').join('<br>');
        el.innerHTML = html;
        await dispatchInput(el);
        const current = (el.textContent||'').trim();
        if (current && current.length >= Math.min(text.length * 0.9, text.length - 10)) return true;
      }
    }catch(err){ console.warn('[Compose Inject] setDirect failed', err); }
    return false;
  }

  async function insertExec(el, t){
    try{ el.focus(); document.execCommand('insertText', false, t); }catch{}
    if (el.tagName==='TEXTAREA') el.value = (el.value||'') + t;
    else if (!document.execCommand) el.textContent = (el.textContent||'') + t;
    await new Promise(r=>setTimeout(r,120));
  }

  async function populateEditorRobust(el, fullText){
    // 1) Prefer direct set
    if (await setDirect(el, fullText)) return true;
    // 2) Fallback: clear then chunked insert
    try{ el.focus(); document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); }catch{}
    const chunks = makeChunks(fullText);
    for (let i=0;i<chunks.length;i++){
      await insertExec(el, chunks[i]);
      if (i < chunks.length-1) await insertExec(el, '\n\n');
    }
    const current = el.tagName==='TEXTAREA' ? (el.value||'') : (el.textContent||'');
    if (current && current.length >= Math.min(fullText.length * 0.9, fullText.length - 10)) return true;
    // 3) Retry direct once more
    return await setDirect(el, fullText);
  }
})();
