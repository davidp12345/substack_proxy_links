# Proxy Publisher (Vercel)

This microservice accepts a Substack URL and writes a proxy HTML file to a repo's gh-pages branch using a GitHub App installation token.

## Endpoint

POST /api/generate

Body:
```
{ "url": "https://substack.com/home/post/p-123", "repo_full_name": "owner/repo", "installation_id": 12345678 }
```

Response:
```
{ "proxy_url": "https://owner.github.io/repo/proxies/substack-com-home-post-p-123.html" }
```

## GitHub App
- Permissions: Metadata (read), Contents (read & write)
- Install app on the target repository
- Server creates installation access token using GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + installation_id

## Environment
- GITHUB_APP_ID
- GITHUB_APP_PRIVATE_KEY (PEM; escape newlines as \n in env)

## Deploy (Vercel)
```
cd services/proxy-publisher
npm i
vercel --prod
```
Set env vars in Vercel dashboard.
