import { App } from '@octokit/app';

export default async function handler(req, res){
  try{
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const proto = Object.getOwnPropertyNames(App.prototype);
    const hasGetInstallationOctokit = proto.includes('getInstallationOctokit');
    const hasGetInstallationAccessToken = proto.includes('getInstallationAccessToken');

    res.status(200).json({
      ok: true,
      node: process.versions?.node,
      methods: { hasGetInstallationOctokit, hasGetInstallationAccessToken },
      timestamp: Date.now()
    });
  }catch(e){
    res.status(500).json({ ok:false, error: String(e.message||e) });
  }
}


