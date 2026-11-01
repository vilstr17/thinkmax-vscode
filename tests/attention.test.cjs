const {test}=require('node:test'),assert=require('node:assert/strict');
const {observe,summary}=require('../src/attention.cjs');const {route}=require('../src/watch.cjs');
test('background conversation alerts are independent, deduplicated and cleared on fresh work',()=>{
 const a={id:'a',provider:'codex',label:'One'},b={id:'b',provider:'claude',label:'Two'};
 assert.equal(observe(a,{phase:'idle',session:'a'}),null,'no old completion at discovery');
 observe(a,{phase:'working',session:'a'});observe(b,{phase:'working',session:'b'});
 assert.equal(observe(a,{phase:'waiting',session:'a'},{at:1}).kind,'input');
 assert.equal(observe(a,{phase:'waiting',session:'a'},{at:2}),null);
 assert.equal(observe(b,{phase:'idle',session:'b'},{at:3}).kind,'finished');
 assert.equal(summary([a,b]).filter(r=>r.attention).length,2);
 assert.equal(observe(b,{phase:'idle',session:'b'},{at:4}),null);
 observe(a,{phase:'working',session:'a'});assert.equal(a.attention,null);assert.equal(b.attention.kind,'finished');
 observe(a,{phase:'idle',session:'a'},{event:'Interrupt'});assert.equal(a.attention.kind,'interrupted');
 observe(a,{phase:'closed',session:'a'});assert.equal(a.attention,null);
});
test('new conversation identity never reports prior work as its completion',()=>{
 const r={id:'a'};observe(r,{phase:'working',session:'one'});assert.equal(observe(r,{phase:'idle',session:'two'}),null);
});
test('ordinary hook routes only to the exact assistant ancestor and provider, across windows',()=>{
 const registrations=[{at:100,port:1,clients:[{provider:'codex',processId:12,channel:'a',token:'A'}]},{at:100,port:2,clients:[{provider:'claude',processId:20,channel:'b',token:'B'},{provider:'codex',processId:30,channel:'c',token:'C'}]}];
 assert.deepEqual(route([44,30,3],registrations,'codex',200),{ASSISTANT_ACTIVITY_PORT:'2',ASSISTANT_ACTIVITY_CHANNEL:'c',ASSISTANT_ACTIVITY_TOKEN:'C'});
 assert.equal(route([44,30,3],registrations,'claude',200),null);assert.equal(route([40,41,3],registrations,'codex',200),null);
 assert.equal(route([12],registrations,'codex',20000),null);assert.equal(route([12],[{...registrations[0],at:10000}],'codex',200),null);
});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {mergeHooks,installHooks}=require('../src/hooks.cjs');
test('ordinary-session hook commands support macOS, native Windows Codex and native Windows Claude',()=>{
 const watch={directory:'C:\\My Profile\\Brain Gym',provider:'codex'};
 const codex=mergeHooks({},'codex','C:\\VS Code\\Code.exe','C:\\My Profile\\signal.cjs',true,false,watch).hooks.Stop[0].hooks[0];
 assert.match(codex.commandWindows,/--watch "C:\\My Profile\\Brain Gym" codex/);assert.match(codex.commandWindows,/if exist/);
 const claude=mergeHooks({},'claude','C:\\VS Code\\Code.exe','C:\\My Profile\\signal.cjs',true,false,{...watch,provider:'claude'}).hooks.Stop[0].hooks[0];
 assert.equal(claude.shell,'powershell');assert.match(claude.command,/Test-Path -LiteralPath/);assert.match(claude.command,/--watch 'C:\\My Profile\\Brain Gym' claude/);
 const mac=mergeHooks({},'codex','/Code Helper','/My Profile/signal.cjs',false,false,{directory:'/My Profile/Brain Gym',provider:'codex'}).hooks.Stop[0].hooks[0];
 assert.match(mac.command,/\[ -f '\/My Profile\/signal.cjs' \]/);assert.match(mac.command,/--watch '\/My Profile\/Brain Gym' codex/);
});
test('explicit account connector preserves original settings and removes only Brain Gym entries',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brain-gym-account-test-'));
 try{const file=path.join(dir,'custom-claude/settings.json'),watch={directory:path.join(dir,'registry'),provider:'claude',file};await fs.mkdir(path.dirname(file));
 const original={theme:'dark',hooks:{Stop:[{hooks:[{type:'command',command:'echo foreign'}]}]}};await fs.writeFile(file,JSON.stringify(original));
 await installHooks(dir,'claude','/runtime','/signal',false,false,watch);const installed=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(installed.theme,'dark');assert.equal(installed.hooks.Stop.length,2);
 await installHooks(dir,'claude','','',false,true,watch);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),original);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('session startup and uncertain shell activity never invent completion alerts',()=>{
 const r={id:'a'};observe(r,{phase:'working',session:'one'});assert.equal(observe(r,{phase:'idle',session:'one'},{event:'SessionStart'}),null);
 observe(r,{phase:'working',session:'one'});observe(r,{phase:'active',session:'one'});assert.equal(observe(r,{phase:'idle',session:'one'}),null);
});

test('Claude idle reminders preserve completion and never request fresh input',()=>{
 const {reduce}=require('../src/lifecycle.cjs');
 const r={id:'claude'};
 const apply=(event,at,notification='')=>observe(r,reduce(r.state,{event,at,notification,session:'one',turn:'turn'},at),{event,at});
 apply('UserPromptSubmit',1);
 assert.equal(apply('Stop',2).kind,'finished');
 const finished=r.attention;
 assert.equal(apply('Notification',3,'idle_prompt'),null);
 assert.equal(r.state.phase,'idle');assert.equal(r.attention,finished);
 assert.equal(apply('Notification',4,'idle_prompt'),null);
 apply('UserPromptSubmit',5);
 assert.equal(apply('Notification',6,'permission_prompt').kind,'input');
 apply('PostToolUse',7);
 assert.equal(apply('Notification',8,'idle_prompt').kind,'finished','idle reminder recovers a missed Stop');
 assert.equal(r.state.phase,'idle');
 assert.equal(reduce(r.state,{event:'PostToolUse',at:9,session:'one',turn:'turn'},9).phase,'idle','completion keeps late tool events from restarting the turn');
});

test('delayed input requests cannot reopen an explicitly completed turn',()=>{
 const {reduce}=require('../src/lifecycle.cjs');
 for(const end of [{event:'Stop'},{event:'Notification',notification:'idle_prompt'}]){
  const r={id:'claude'};
  const apply=(e,at)=>observe(r,reduce(r.state,{session:'one',turn:'turn',at,...e},at),{event:e.event,at});
  apply({event:'UserPromptSubmit'},1);assert.equal(apply(end,2).kind,'finished');
  const finished=r.attention,closed=r.state;
  for(const e of [{event:'PermissionRequest'},{event:'Elicitation'},{event:'PreToolUse',tool:'AskUserQuestion'},{event:'Notification',notification:'permission_prompt'},{event:'Notification',notification:'elicitation_dialog'}]){
   assert.equal(apply(e,3),null);assert.equal(r.state,closed);assert.equal(r.attention,finished);
  }
  apply({event:'UserPromptSubmit'},4);
  assert.equal(apply({event:'PermissionRequest'},5).kind,'input','fresh work may ask for input again');
 }
});
