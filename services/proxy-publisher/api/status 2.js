export default async function handler(req, res){
  try{
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    const { pages_url } = req.query || {};
    if (!pages_url) { res.status(400).json({ ready:false, error:'missing pages_url' }); return; }
    const ok = await headOk(pages_url);
    res.status(200).json({ ready: ok });
  }catch(e){ res.status(500).json({ ready:false, error:String(e.message||e) }); }
}

async function headOk(url){
  try{
    const r = await fetch(url, { method:'HEAD' });
    if (r.status === 200) return true;
    if (r.status === 404) return false;
    return false;
  }catch{ return false; }
}

