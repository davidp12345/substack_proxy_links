document.addEventListener('DOMContentLoaded', async () => {
  const repo = document.getElementById('repo');
  const install = document.getElementById('install');
  const { repo_full_name, installation_id, app_install_url } = await chrome.storage.sync.get(['repo_full_name','installation_id','app_install_url']);
  if (repo_full_name) repo.value = repo_full_name;
  if (installation_id) install.value = installation_id;
  document.getElementById('save').addEventListener('click', async ()=>{
    await chrome.storage.sync.set({ repo_full_name: repo.value.trim(), installation_id: install.value.trim() });
    alert('Saved');
  });
  document.getElementById('install-app').addEventListener('click', ()=>{
    const url = app_install_url || 'https://github.com/apps/YOUR_GH_APP_NAME/installations/new';
    window.open(url, '_blank');
  });
});

