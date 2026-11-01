const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {firstTokens,providerFor,parsePosix,parseWindows,findAssistant,claudeActivity}=require('../src/detection.cjs');const {shouldShow}=require('../src/lifecycle.cjs');
test('ordinary terminal process trees detect both CLIs and exclude unrelated terminals',()=>{
  const processes=parsePosix('100 1 /bin/zsh\n101 100 /usr/local/bin/node\n102 101 /opt/codex\n103 102 /opt/codex\n200 1 /bin/zsh\n201 200 /Users/me/.local/bin/claude\n300 1 /bin/zsh\n301 300 /usr/bin/node\n');
  processes.find(p=>p.pid===101).commandLine='node /usr/local/lib/node_modules/@openai/codex/bin/codex.js';
  processes.find(p=>p.pid===102).commandLine='/opt/codex';processes.find(p=>p.pid===103).commandLine='/opt/codex app-server';
  processes.find(p=>p.pid===301).commandLine='node /project/app.js codex claude';
  assert.deepEqual(findAssistant(100,processes),{provider:'codex',pid:102,rootPid:100});
  assert.deepEqual(findAssistant(200,processes),{provider:'claude',pid:201,rootPid:200});
  assert.equal(findAssistant(300,processes),null);assert.equal(findAssistant(999,processes),null);
});
test('Windows process metadata handles paths with spaces and npm launchers',()=>{
  const processes=parseWindows(JSON.stringify([
    {ProcessId:50,ParentProcessId:1,Name:'powershell.exe',ExecutablePath:'C:\\Windows\\powershell.exe'},
    {ProcessId:51,ParentProcessId:50,Name:'node.exe',ExecutablePath:'C:\\Program Files\\nodejs\\node.exe',CommandLine:'"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\My Name\\node_modules\\@openai\\codex\\bin\\codex.js"'},
    {ProcessId:52,ParentProcessId:51,Name:'codex.exe',ExecutablePath:'C:\\Program Files\\Codex\\codex.exe',CommandLine:'"C:\\Program Files\\Codex\\codex.exe"'},
    {ProcessId:60,ParentProcessId:1,Name:'pwsh.exe'},
    {ProcessId:61,ParentProcessId:60,Name:'claude.exe',ExecutablePath:'C:\\Users\\My Name\\claude.exe'}]));
  assert.deepEqual(findAssistant(50,processes),{provider:'codex',pid:52,rootPid:50});assert.equal(findAssistant(60,processes).provider,'claude');
  assert.deepEqual(firstTokens('"C:\\Program Files\\node.exe" "C:\\My Name\\script.js"'),['C:\\Program Files\\node.exe','C:\\My Name\\script.js']);
});
test('terminal names and prompt words do not count as a provider; services and one-shot jobs are excluded',()=>{
  for(const commandLine of ['codex sandbox macos -- /bin/bash','codex agents','codex queue','codex app-server','codex mcp-server','codex --help','codex --version','codex exec task'])assert.equal(providerFor({executable:'/opt/codex',commandLine}),null);
  for(const commandLine of ['claude --print task','claude -p task','claude --output-format stream-json'])assert.equal(providerFor({executable:'/opt/claude',commandLine}),null);
  assert.equal(providerFor({executable:'/usr/bin/python3',commandLine:'python3 codex.py'}),null);
  assert.equal(providerFor({executable:'/bin/zsh',commandLine:'zsh -c echo codex'}),null);
  assert.equal(providerFor({executable:'/usr/bin/node',commandLine:'node /other/cli.js --codex'}),null);
  assert.equal(providerFor({executable:'/usr/bin/node',commandLine:'node /path/@anthropic-ai/claude-code/cli.js'}),'claude');
  assert.equal(providerFor({executable:'/opt/codex',commandLine:'codex -p work'}),'codex');
});
test('automatic detection follows an active session without claiming that it is busy',()=>{
  const state={phase:'active',lastAt:100};assert.ok(shouldShow(state,{enabled:true,selected:true,focused:true,staleMs:1000,now:200}));
  assert.equal(shouldShow(state,{enabled:true,selected:false,focused:true,staleMs:1000,now:200}),false);
});
test('Claude process metadata maps busy, waiting and idle, hashes identity, and excludes workers',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brain-gym-metadata-'));await fs.mkdir(path.join(dir,'sessions'));
  try{
    for(const [status,phase]of Object.entries({busy:'working',waiting:'waiting',idle:'idle',shell:'active'})){
      await fs.writeFile(path.join(dir,'sessions/123.json'),JSON.stringify({kind:'interactive',status,sessionId:'private-session',cwd:'/private/project',prompt:'secret'}));
      const result=await claudeActivity(123,dir);assert.equal(result.phase,phase);assert.equal(result.session.length,64);assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(JSON.stringify(result).includes('secret'),false);
    }
    await fs.writeFile(path.join(dir,'sessions/123.json'),JSON.stringify({kind:'daemon',status:'busy'}));assert.equal(await claudeActivity(123,dir),null);
    await fs.writeFile(path.join(dir,'sessions/123.json'),'{broken');assert.equal(await claudeActivity(123,dir),null);
    assert.equal(await claudeActivity(456,dir),null);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
