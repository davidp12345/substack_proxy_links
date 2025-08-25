export default async function handler(req, res){
  try{
    const u = req.query?.u || req.query?.url;
    if (!u || !/^https?:\/\/([\w.-]+\.)?substack\.com\//i.test(u)) { res.status(400).send('Bad request'); return; }
    const safe = String(u).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url='${safe}'"><script>location.replace('${safe}')</script><title>Redirecting…</title></head><body></body></html>`;
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.status(200).send(html);
  }catch(e){ res.status(500).send('Error'); }
}
export default async function handler(req, res) {
  try {
    const u = req.query?.u || req.url?.split('?u=')[1];
    if (!u || !/^https?:\/\/([\w.-]+\.)?substack\.com\//i.test(decodeURIComponent(u))) {
      res.status(400).send('Invalid or missing u');
      return;
    }
    const target = decodeURIComponent(u);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url='${target}'"><script>location.replace('${target}')</script><title>Redirecting…</title></head><body></body></html>`);
  } catch (e) {
    res.status(500).send('Error');
  }
}

