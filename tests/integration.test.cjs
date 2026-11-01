const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const http=require('node:http');const {spawn}=require('node:child_process');
const {reduce,shouldShow}=require('../src/lifecycle.cjs');const {createBridge}=require('../src/bridge.cjs');const {metadata}=require('../src/signal.cjs');const {mergeHooks,installHooks,EVENTS,command}=require('../src/hooks.cjs');
const event=(name,at,extra={})=>({event:name,session:'A',turn:'one',at,...extra});
test('working, input, completion, cancellation and stale signals follow the selected session',()=>{
  let s=reduce(null,event('SessionStart',100),100);s=reduce(s,event('UserPromptSubmit',101),101);assert.equal(s.phase,'working');
  assert.ok(shouldShow(s,{enabled:true,selected:true,focused:true,now:102,staleMs:50}));
  for(const key of ['enabled','selected','focused'])assert.equal(shouldShow(s,{enabled:true,selected:true,focused:true,[key]:false,now:102,staleMs:50}),false);
  assert.equal(shouldShow(s,{enabled:true,selected:true,focused:true,now:200,staleMs:50}),false);
  s=reduce(s,event('PermissionRequest',102),102);assert.equal(s.phase,'waiting');
  s=reduce(s,event('PostToolUse',103),103);assert.equal(s.phase,'working');
  s=reduce(s,event('Stop',104),104);assert.equal(s.phase,'idle');
  assert.equal(reduce(s,event('PostToolUse',105),105).phase,'idle');
  assert.equal(reduce(s,event('UserPromptSubmit',103),106).phase,'idle');
  s=reduce(s,event('UserPromptSubmit',107,{turn:'two'}),107);assert.equal(s.phase,'working');
  assert.equal(reduce(s,event('Stop',108),108).phase,'working');
  assert.equal(reduce(s,event('Stop',109,{session:'B',turn:'two'}),109).phase,'working');
  assert.equal(reduce(s,event('Stop',110,{turn:'two',agent:true}),110).phase,'working');
  s=reduce(s,event('Interrupt',111,{turn:'two'}),111);assert.equal(s.phase,'idle');
  s=reduce(s,event('SessionEnd',111,{turn:'two'}),111);assert.equal(s.phase,'closed');
  s=reduce(s,event('SessionStart',112,{session:'B',turn:''}),112);assert.equal(s.phase,'idle');assert.equal(s.session,'B');
  s=reduce(s,event('process-exit',112,{session:''}),112);assert.equal(s.phase,'closed');assert.equal(reduce(s,event('UserPromptSubmit',113),113).phase,'closed');
  assert.equal(reduce(s,event('SessionStart',114,{session:'C'}),114).phase,'closed');
});
test('Claude input requests and notifications hide the puzzle and resume afterward',()=>{
  let s=reduce(null,event('UserPromptSubmit',100,{turn:''}),100);
  s=reduce(s,event('PreToolUse',101,{turn:'',tool:'AskUserQuestion'}),101);assert.equal(s.phase,'waiting');
  s=reduce(s,event('PostToolUse',102,{turn:''}),102);assert.equal(s.phase,'working');
  s=reduce(s,event('Notification',103,{turn:'',notification:'permission_prompt'}),103);assert.equal(s.phase,'waiting');
  s=reduce(s,event('ElicitationResult',104,{turn:''}),104);assert.equal(s.phase,'working');
  s=reduce(s,event('StopFailure',105,{turn:''}),105);assert.equal(s.phase,'idle');
});
test('hook merging is repeatable and keeps existing configuration and hooks',()=>{
  const original={permissions:{allow:['Read']},hooks:{Stop:[{matcher:'',hooks:[{type:'command',command:'echo existing'}]}]}};
  for(const provider of ['codex','claude'])for(const windows of [false,true]){
    const merged=mergeHooks(original,provider,windows?'C:\\VS Code\\Code.exe':'/Code Helper',windows?'C:\\Brain Gym\\signal.cjs':'/Brain Gym/signal.cjs',windows);
    assert.deepEqual(merged.permissions,original.permissions);assert.equal(merged.hooks.Stop[0].hooks[0].command,'echo existing');
    assert.equal(merged.hooks.Stop.length,2);assert.deepEqual(mergeHooks(merged,provider,windows?'C:\\VS Code\\Code.exe':'/Code Helper',windows?'C:\\Brain Gym\\signal.cjs':'/Brain Gym/signal.cjs',windows),merged);
    assert.deepEqual(mergeHooks(merged,provider,'','',windows,true),original);
    assert.equal(Object.keys(merged.hooks).length,EVENTS[provider].length);
  }
  assert.match(command("/a' b",'/sender'),/'"'"'/);
});
test('setup backs up originals; disconnect preserves foreign hooks; invalid JSON is unchanged',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brain-gym-test-'));
  try{
    await fs.mkdir(path.join(dir,'.claude'));const file=path.join(dir,'.claude/settings.local.json');const original='{"permissions":{"allow":["Read"]}}\n';await fs.writeFile(file,original);
    await installHooks(dir,'claude','/runtime','/sender');assert.ok((await fs.readdir(path.dirname(file))).some(n=>n.includes('brain-gym-backup')));
    await installHooks(dir,'claude','','',false,true);assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),JSON.parse(original));
    await fs.writeFile(file,'{broken');await assert.rejects(installHooks(dir,'claude','/runtime','/sender'),/invalid JSON/);assert.equal(await fs.readFile(file,'utf8'),'{broken');
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('hook metadata excludes every content field',()=>{
  const m=metadata({hook_event_name:'Stop',session_id:'private-session',turn_id:'private-turn',prompt:'secret',last_assistant_message:'secret',transcript_path:'/secret',tool_input:{password:'secret'}},123);
  assert.equal(m.at,123);assert.equal(m.session.length,64);assert.equal(m.turn.length,64);assert.equal(JSON.stringify(m).includes('secret'),false);assert.equal(JSON.stringify(m).includes('private'),false);
});
function post(port,channel,token,body){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:`/${channel}`,method:'POST',headers:{Authorization:`Bearer ${token}`}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(JSON.stringify(body));});}
test('bridge isolates terminal channels, authenticates callbacks and sender fails silently',async()=>{
  const received=[],bridge=await createBridge((id,e)=>received.push([id,e]));const channel='a'.repeat(32),token='b'.repeat(64);bridge.register(channel,token);
  try{
    assert.equal(await post(bridge.port,channel,'wrong',event('Stop',Date.now())),403);
    assert.equal(await post(bridge.port,channel,token,{event:'bad',session:'A',at:Date.now()}),400);
    assert.equal(await post(bridge.port,channel,token,event('UserPromptSubmit',Date.now(),{prompt:'secret'})),204);assert.equal(received.length,1);assert.equal(JSON.stringify(received).includes('secret'),false);
    const script=path.join(__dirname,'../src/signal.cjs');
    const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{env:{...process.env,BRAIN_GYM_PORT:String(bridge.port),BRAIN_GYM_CHANNEL:channel,BRAIN_GYM_TOKEN:token}});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('exit',code=>resolve({code,out,err}));child.stdin.end(JSON.stringify({hook_event_name:'Stop',session_id:'real',prompt:'secret'}));});
    assert.deepEqual(result,{code:0,out:'',err:''});assert.equal(received.length,2);assert.equal(received[1][1].event,'Stop');
    bridge.remove(channel);assert.equal(await post(bridge.port,channel,token,event('Stop',Date.now())),403);
  }finally{bridge.dispose();}
});
test('ordinary watcher uses current registration instead of stale inherited launcher credentials after reload',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brain-gym-watch-reload-')),received=[],bridge=await createBridge((id,e)=>received.push([id,e]));
 const channel='c'.repeat(32),token='d'.repeat(64);bridge.register(channel,token);
 try{
  await fs.writeFile(path.join(dir,'window-'+ 'a'.repeat(32)+'.json'),JSON.stringify({at:Date.now(),port:bridge.port,clients:[{provider:'codex',processId:process.pid,channel,token}]}));
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[path.join(__dirname,'../src/signal.cjs'),'--watch',dir,'codex'],{env:{...process.env,BRAIN_GYM_PORT:'1',BRAIN_GYM_CHANNEL:'e'.repeat(32),BRAIN_GYM_TOKEN:'f'.repeat(64)}});let out='',err='';
   child.on('error',reject);child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('exit',code=>resolve({code,out,err}));child.stdin.end(JSON.stringify({hook_event_name:'PermissionRequest',session_id:'private-id',tool_input:{secret:'secret'}}));
  });
  assert.deepEqual(result,{code:0,out:'',err:''});assert.equal(received.length,1);assert.equal(received[0][0],channel);assert.equal(received[0][1].event,'PermissionRequest');assert.equal(JSON.stringify(received).includes('secret'),false);
 }finally{bridge.dispose();await fs.rm(dir,{recursive:true,force:true});}
});

test('provider-visible hook commands use neutral names and migrate old hooks without touching others',()=>{
  const old={hooks:{Stop:[{hooks:[{type:'command',command:'echo keep'}]},{hooks:[{type:'command',command:'old --brain-gym-hook-v1'}]}]}};
  for(const provider of ['codex','claude'])for(const windows of [false,true]){
    const watch={directory:windows?'C:\\Data\\assistant-activity-bridge\\activity':'/data/assistant-activity-bridge/activity',provider};
    const merged=mergeHooks(old,provider,windows?'C:\\Editor\\Code.exe':'/Editor/Code',windows?'C:\\Data\\assistant-activity-bridge\\signal.cjs':'/data/assistant-activity-bridge/signal.cjs',windows,false,watch);
    assert.equal(merged.hooks.Stop[0].hooks[0].command,'echo keep');
    for(const groups of Object.values(merged.hooks))for(const group of groups)for(const hook of group.hooks){
      if(hook.command==='echo keep')continue;
      assert.match(hook.command,/--activity-bridge-v1/);
      assert.doesNotMatch(hook.command,/brain.?gym|thinkmaxx/i);
      if(hook.commandWindows)assert.doesNotMatch(hook.commandWindows,/brain.?gym|thinkmaxx/i);
    }
    const removed=mergeHooks(merged,provider,'','',windows,true);
    assert.deepEqual(removed,{hooks:{Stop:[{hooks:[{type:'command',command:'echo keep'}]}]}});
  }
});
test('hook helper is copied to a neutral shared location and remains runnable',async()=>{
  const runtime=require('../src/hook-runtime.cjs'),dir=await fs.mkdtemp(path.join(os.tmpdir(),'activity-helper-'));
  try{
    const location=await runtime.prepare(path.join(dir,'braingym-local.brain-gym'),path.join(__dirname,'..'));
    assert.doesNotMatch(location.script,/brain.?gym|thinkmaxx/i);
    for(const file of ['signal.cjs','watch.cjs','detection.cjs'])assert.ok((await fs.stat(path.join(location.base,file))).isFile());
    const helper=require(location.script);assert.equal(typeof helper.send,'function');
    await runtime.prepare(path.join(dir,'braingym-local.brain-gym'),path.join(__dirname,'..'));
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
