'use strict';
const vscode = require('vscode');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { createBridge } = require('./bridge.cjs');
const { installHooks } = require('./hooks.cjs');
const hookRuntime = require('./hook-runtime.cjs');
const codexTerminal=require('./codex-terminal.cjs');
const { reduce } = require('./lifecycle.cjs');
const {processSnapshot,findAssistant,claudeActivity,processCwd}=require('./detection.cjs');
const {observe,summary}=require('./attention.cjs');
const P = require('../media/puzzles.js');
const {configuration}=require('./settings.cjs');
function resolveExecutable(name) {
  if (path.isAbsolute(name)) { if (fs.existsSync(name)) return name; throw Error(`Cannot find ${name}. Check thinkmaxx Settings.`); }
  if (/[\\/]/.test(name)) throw Error('Use an executable name or an absolute path in thinkmaxx Settings.');
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) for (const suffix of extensions) {
    const candidate = path.join(dir, name + suffix); try { fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK); return candidate; } catch {}
  }
  throw Error(`Cannot find ${name}. Install and sign in to the CLI, or set its path in thinkmaxx Settings.`);
}
function activate(context) {
  const catalog = JSON.parse(fs.readFileSync(path.join(context.extensionPath, 'media/tracks.json'), 'utf8'));
  const terminals = new Map(), sessions = new Map();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10);
  status.command = 'thinkmaxx.preview'; status.text = '$(lightbulb) thinkmaxx'; status.show();
  const output = vscode.window.createOutputChannel('thinkmaxx');
  let panel = null, preview = false, disposed = false, showTimer = null, scanning=false, dismissed=false, focusMode=false;
  let returnTerminal=null, registryWrite=Promise.resolve();
  const hookPaths=hookRuntime.location(context.globalStorageUri.fsPath);
  const registryDirectory=hookPaths.directory;
  let hookRuntimePromise;
  const prepareHooks=()=>hookRuntimePromise ||= hookRuntime.prepare(context.globalStorageUri.fsPath,context.extensionPath).catch(e=>{hookRuntimePromise=null;throw e;});
  const registryFile=path.join(registryDirectory,`window-${crypto.randomBytes(16).toString('hex')}.json`);
  const setupProjects=new Map(),disconnectedProjects=new Set(context.workspaceState.get('disconnectedProjects',[]));
  let saved = context.globalState.get('puzzles.v1', {});
  let activeKey = 'shared';
  if(!saved.shared&&saved.preview)saved.shared=saved.preview;
  const config = () => configuration(vscode.workspace);
  const difficulty = () => P.difficultyIndex(config().get('difficulty', 'low'));
  let preferenceSignature=JSON.stringify([config().get('topic','mix'),difficulty()]);
  function refreshPreferences(){
    const next=JSON.stringify([config().get('topic','mix'),difficulty()]);
    if(next===preferenceSignature)return;preferenceSignature=next;
    sessions.set(activeKey,P.newPuzzle(config().get('topic','mix'),difficulty(),catalog));save(activeKey);
  }
  const puzzleFor = key => {
    if (!sessions.has(key)) sessions.set(key, P.restore(saved[key], catalog) || P.newPuzzle(config().get('topic','mix'),difficulty(),catalog));
    return sessions.get(key);
  };
  const save = key => {
    saved = { ...saved, [key]: sessions.get(key) };
    const keys = Object.keys(saved); for (const k of keys.slice(0, Math.max(0, keys.length-40))) delete saved[k];
    return context.globalState.update('puzzles.v1', saved);
  };
  function post(force=false) {
    if (!panel)return;
    const record=terminals.get(vscode.window.activeTerminal);
    const payload={ type:'state', puzzle:puzzleFor(activeKey), preview, focusMode, enabled:config().get('enabled'), topic:config().get('topic'), difficulty:P.difficulties[puzzleFor(activeKey).difficulty].id, provider:record?.provider || '', phase:record?.state?.phase||'', conversations:summary([...terminals.values()]), autoConnect:config().get('autoConnectAlerts',true) };
    const signature=JSON.stringify(payload);if(!force&&panel.brainGymLastPost===signature)return;
    panel.brainGymLastPost=signature;panel.webview.postMessage({...payload,catalog});
  }
  function hide() {
    clearTimeout(showTimer);showTimer=null;focusMode=false;
    if(panel){panel.brainGymAutoClose=true;panel.dispose();panel=null;}
  }
  function open(key, restored=null) {
    if(disposed)return;
    activeKey='shared';puzzleFor(activeKey);
    if(panel){if(restored&&restored!==panel)restored.dispose();post();return;}
    const view=restored||vscode.window.createWebviewPanel('brainGym','thinkmaxx',{viewColumn:vscode.ViewColumn.Active,preserveFocus:true},{enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]});
    panel=view;view.title='thinkmaxx';view.webview.options={enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]};
    const uri=name=>view.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri,'media',name));
    const nonce=crypto.randomBytes(18).toString('hex');
    view.webview.html=`<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${view.webview.cspSource} data:; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${uri('style.css')}"><title>thinkmaxx</title></head><body><main id="app"></main><script nonce="${nonce}" src="${uri('quizzes.js')}"></script><script nonce="${nonce}" src="${uri('puzzles.js')}"></script><script nonce="${nonce}" src="${uri('track-drag.js')}"></script><script nonce="${nonce}" src="${uri('rotation-view.js')}"></script><script nonce="${nonce}" src="${uri('app.js')}"></script></body></html>`;
    view.onDidDispose(()=>{
      if(panel===view){panel=null;focusMode=false;}
      if(!view.brainGymAutoClose&&!disposed){preview=false;dismissed=true;}
    },null,context.subscriptions);
    view.webview.onDidReceiveMessage(async m=>{
      try {
        if(!m||typeof m!=='object')return;
        if(m.type==='ready'){post(true);return;}
        if(m.type==='action'){
          sessions.set(activeKey,P.action(puzzleFor(activeKey),m.action,catalog));await save(activeKey);post();
        }else if(m.type==='next'||m.type==='reset'){
          const prior=puzzleFor(activeKey);
          const next=m.type==='reset'&&prior.topic==='tracks'?{...prior,placements:prior.placements.map(()=>null),rotations:prior.rotations.map(()=>0),moves:0,history:[],won:false,hint:null,message:''}:P.newPuzzle(m.type==='reset'?prior.topic:config().get('topic','mix'),difficulty(),catalog,m.type==='reset'?undefined:prior);
          sessions.set(activeKey,next);await save(activeKey);post();
        }else if(m.type==='preference'){
          if(m.key==='topic'&&['mix',...P.topics].includes(m.value))await config().update('topic',m.value,vscode.ConfigurationTarget.Global);
          else if(m.key==='difficulty'&&P.difficulties.some(d=>d.id===m.value))await config().update('difficulty',m.value,vscode.ConfigurationTarget.Global);
          else return;
          refreshPreferences();await save(activeKey);post();
        }else if(m.type==='hide'){dismissed=true;preview=false;hide();}
        else if(m.type==='start'&&['codex','claude'].includes(m.provider))await launch(m.provider);
        else if(m.type==='makeRoom')await makeRoom();
        else if(m.type==='openChat')openChat(m.id);
        else if(m.type==='dismissAlert'){const r=[...terminals.values()].find(r=>r.id===m.id);if(r&&r.attention?.id===m.alertId){r.attention=null;post();}}
        else if(m.type==='connectAlerts')await reconnectAlerts();
        else if(m.type==='settings')vscode.commands.executeCommand('thinkmaxx.settings');
      }catch(e){vscode.window.showErrorMessage(`thinkmaxx: ${e.message}`);}
    },null,context.subscriptions);
    // preserveFocus is essential: the assistant terminal keeps its keyboard focus.
  }
  async function showPuzzle(){
    dismissed=false;preview=true;returnTerminal=vscode.window.activeTerminal||returnTerminal;
    // Move focus out of the terminal before closing its panel so VS Code does not
    // restore terminal focus and reopen it during the prompt transition.
    open('shared');panel?.reveal(vscode.ViewColumn.Active,false);await vscode.commands.executeCommand('workbench.action.closePanel');
  }
  async function makeRoom(){focusMode=!focusMode;await showPuzzle();post();}
  function openChat(id){
    const terminal=[...terminals.keys()].find(t=>terminals.get(t).id===id);
    if(!terminal||!vscode.window.terminals.includes(terminal))return;
    const r=terminals.get(terminal);r.attention=null;returnTerminal=terminal;terminal.show(false);post();
  }
  function notify(record,attention){
    if(!attention)return;
    const title=record.provider==='claude'?'Claude Code':'Codex';
    const label=summary([...terminals.values()]).find(r=>r.id===record.id)?.label||record.label;
    const message=attention.kind==='input'?`${title} needs your input`:attention.kind==='interrupted'?`${title} was interrupted`:attention.kind==='failed'?`${title} stopped with an error`:`${title} finished`;
    dismissed=false;
    if(config().get('notifications',true))vscode.window.showInformationMessage(`${message} · ${label}`,'Open chat','Open puzzle').then(choice=>{
      if(disposed)return;if(choice==='Open chat')openChat(record.id);else if(choice==='Open puzzle')showPuzzle();
    });
    update();
  }
  const bridgePromise=createBridge((channel,event)=>{
    const record=[...terminals.values()].find(r=>r.channel===channel);if(!record)return;
    const wasWorking=record.state?.phase==='working';
    const previous=event.event==='UserPromptSubmit'&&event.session!==record.state?.session?null:record.state;
    const attention=observe(record,reduce(previous,event),{event:event.event,at:event.at});
    record.source='hooks';record.setup='';record.setupError='';
    if(event.event==='UserPromptSubmit')dismissed=false;
    if(!wasWorking&&record.state.phase==='working'&&event.event==='UserPromptSubmit'&&config().get('makeRoomWhileWorking',true)&&config().get('enabled',true)&&vscode.window.state.focused&&terminals.get(vscode.window.activeTerminal)===record)showPuzzle();
    notify(record,attention);update();
  }).catch(e=>{output.appendLine(`Lifecycle bridge unavailable: ${e.message}`);return null;});
  function publishRegistry(){
    registryWrite=registryWrite.catch(()=>{}).then(async()=>{
      if(disposed)return;const bridge=await bridgePromise;if(!bridge)return;
      const clients=[...terminals.values()].filter(r=>r.processId&&r.channel&&r.token).map(r=>({provider:r.provider,processId:r.processId,channel:r.channel,token:r.token}));
      await fs.promises.mkdir(registryDirectory,{recursive:true});
      const temp=registryFile+'.tmp';await fs.promises.writeFile(temp,JSON.stringify({at:Date.now(),port:bridge.port,clients}),{mode:0o600});await fs.promises.rename(temp,registryFile);
    });
    return registryWrite;
  }
  function update(){
    if(disposed)return;
    const records=[...terminals.values()],enabled=config().get('enabled',true),attention=records.filter(r=>r.attention),working=records.filter(r=>r.state?.phase==='working').length;
    status.text=`$(${attention.length?'bell':'lightbulb'}) thinkmaxx${attention.length?` · ${attention.length} alert${attention.length===1?'':'s'}`:working?` · ${working} working`:!enabled?' · off':''}`;
    status.backgroundColor=attention.length?new vscode.ThemeColor('statusBarItem.warningBackground'):undefined;
    status.tooltip='Open thinkmaxx puzzles and reply alerts.';
    if(panel){post();return;}
    if(dismissed||!vscode.window.state.focused||(!enabled&&!preview))return;
    if(!preview&&!records.length)return;
    if(showTimer)return;
    showTimer=setTimeout(()=>{
      showTimer=null;if(disposed||dismissed||!vscode.window.state.focused)return;
      if(!preview&&!config().get('enabled',true))return;
      if(!preview&&!terminals.size)return;
      open('shared');
    },config().get('showDelayMs',1200));
  }
  async function connectAlerts(terminal,record){
    if(record.managed||record.setupAttempted||!config().get('autoConnectAlerts',true))return;
    record.setupAttempted=true;
    if(context.globalState.get(`userHooks.${record.provider}`)){
      record.userHooks=true;
      try{const override=config().get('nodePath',''),runtime=override?resolveExecutable(override):process.execPath;await prepareHooks();await installHooks(os.homedir(),record.provider,runtime,hookPaths.script,process.platform==='win32',false,{directory:registryDirectory,provider:record.provider,file:context.globalState.get(`userHooks.${record.provider}`)});}catch(e){record.setupError=`Could not connect alerts: ${e.message}`;return;}
      if(record.provider==='codex'){try{await codexTerminal.configure(path.join(path.dirname(context.globalState.get('userHooks.codex')),'config.toml'));record.setup=record.source==='hooks'?'':'Restart Codex to apply the terminal connection.';}catch(e){record.setupError=e.message;}}
      else record.setup=record.source==='hooks'?'':'Restart Claude Code if alerts are missing.';
      return;
    }
    if(!vscode.workspace.isTrusted){record.setup='Trust this workspace to connect activity alerts.';return;}
    const cwd=await processCwd(record.processId).catch(()=>null)||terminal.shellIntegration?.cwd?.fsPath||terminal.creationOptions?.cwd?.fsPath||terminal.creationOptions?.cwd;
    const folders=vscode.workspace.workspaceFolders?.filter(f=>f.uri.scheme==='file')||[];
    const root=typeof cwd==='string'?folders.map(f=>f.uri.fsPath).filter(r=>{const relative=path.relative(r,cwd);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}).sort((a,b)=>b.length-a.length)[0]:null;
    if(!root){record.setup='This terminal is outside the project. Connect all terminals for alerts.';record.requiresUserHooks=true;return;}
    record.requiresUserHooks=false;
    if(disconnectedProjects.has(root)){record.setup='Activity alerts disconnected for this project.';return;}
    const projectKey=`${root}:${record.provider}`;
    if(!setupProjects.has(projectKey))setupProjects.set(projectKey,(async()=>{
      const override=config().get('nodePath','');const runtime=override?resolveExecutable(override):process.execPath;
      await prepareHooks();
      await installHooks(root,record.provider,runtime,hookPaths.script,process.platform==='win32',false,{directory:registryDirectory,provider:record.provider});
      if(record.provider==='codex')await codexTerminal.configure(path.join(root,'.codex/config.toml'));
    })());
    try{
      await setupProjects.get(projectKey);
      record.setup=record.provider==='codex'?'Trust thinkmaxx hooks in /hooks, then restart Codex.':'Restart Claude Code to enable activity alerts.';
    }catch(e){record.setupError=`Could not connect alerts: ${e.message}`;output.appendLine(record.setupError);}
  }
  async function scanAll(){
    if(disposed||scanning)return;scanning=true;
    try{
      const candidates=vscode.window.terminals.slice(0,64);
      if(!candidates.length){update();return;}
      const processes=await processSnapshot();
      for(const terminal of candidates){
        if(disposed)return;const pid=await terminal.processId;if(!pid)continue;
        const detected=findAssistant(pid,processes),existing=terminals.get(terminal);
        if(!detected){
          if(existing&&!existing.managed){if(existing.channel)(await bridgePromise)?.remove(existing.channel);terminals.delete(terminal);}continue;
        }
        if(!vscode.window.terminals.includes(terminal))continue;
        let record=existing;
        if(!record||record.processId&&record.processId!==detected.pid){
          if(record?.channel)(await bridgePromise)?.remove(record.channel);
          const channel=crypto.randomBytes(16).toString('hex'),token=crypto.randomBytes(32).toString('hex');
          (await bridgePromise)?.register(channel,token);
          record={id:channel,channel,token,key:`${detected.provider}:process-${detected.pid}`,provider:detected.provider,source:'process',state:{phase:'active',lastAt:Date.now(),session:'',turn:''}};
          terminals.set(terminal,record);
        }
        record.id||=record.channel;record.provider=detected.provider;record.processId=detected.pid;record.label=terminal.name||'Terminal';
        // Hook events stay authoritative once connected; process presence never overwrites them.
        if(record.source!=='hooks'){
          const activity=detected.provider==='claude'?await claudeActivity(detected.pid):null;
          if(activity){record.source='metadata';notify(record,observe(record,{...record.state,...activity,lastAt:Date.now()}));}
          else {record.source='process';record.state={phase:'active',session:record.state.session||'',lastAt:Date.now()};record.sawWork=false;}
        }
      }
      await publishRegistry();
      for(const [terminal,record] of terminals)await connectAlerts(terminal,record);
      update();
    }catch(e){
      if(!context.brainGymDetectionErrorLogged){output.appendLine(`Automatic terminal detection unavailable: ${e.message}`);context.brainGymDetectionErrorLogged=true;}
      update();
    }finally{scanning=false;}
  }
  async function rootFolder() {
    if(!vscode.workspace.isTrusted)throw Error('Trust this workspace before connecting an assistant.');
    const folders=vscode.workspace.workspaceFolders?.filter(f=>f.uri.scheme==='file');
    if(!folders?.length)throw Error('Open a project folder before starting an assistant.');
    if(folders.length===1)return folders[0].uri.fsPath;
    const choice=await vscode.window.showQuickPick(folders.map(f=>({label:f.name,description:f.uri.fsPath,folder:f})),{placeHolder:'Choose the project for this assistant'});
    return choice?.folder.uri.fsPath;
  }
  async function launch(provider,resume=false) {
    const root=await rootFolder();if(!root)return;
    const executable=resolveExecutable(config().get(`${provider}Path`,provider));
    const override=config().get('nodePath','');const runtime=override?resolveExecutable(override):process.execPath;
    const bridge=await bridgePromise;if(!bridge)throw Error('The local activity connection is unavailable. Reload VS Code.');
    await prepareHooks();
    await installHooks(root,provider,runtime,hookPaths.script);
    if(provider==='codex')await codexTerminal.configure(path.join(root,'.codex/config.toml'));
    const channel=crypto.randomBytes(16).toString('hex'),token=crypto.randomBytes(32).toString('hex');bridge.register(channel,token);
    const args=resume?(provider==='codex'?['resume']:['--resume']):[];
    const terminal=vscode.window.createTerminal({name:provider==='codex'?'thinkmaxx · Codex':'thinkmaxx · Claude',cwd:root,shellPath:runtime,shellArgs:[path.join(context.extensionPath,'src/launcher.cjs'),executable,...args],env:{ELECTRON_RUN_AS_NODE:override?null:'1',ASSISTANT_ACTIVITY_PORT:String(bridge.port),ASSISTANT_ACTIVITY_CHANNEL:channel,ASSISTANT_ACTIVITY_TOKEN:token},isTransient:true});
    terminals.set(terminal,{id:channel,token,managed:true,label:terminal.name,provider,channel,key:`${provider}:${channel}`,state:{phase:'connecting',session:'',turn:'',lastAt:0}});
    preview=false;terminal.show(false);update();
    if(provider==='codex')vscode.window.showInformationMessage('Trust thinkmaxx hooks in Codex /hooks to enable alerts.');
  }
  async function reconnectAlerts(){
    if(!vscode.workspace.isTrusted)throw Error('Trust this VS Code workspace before connecting activity alerts.');
    const bridge=await bridgePromise;if(!bridge)throw Error('The activity connection is unavailable. Reload VS Code.');
    const outside=[...terminals.values()].filter(r=>r.requiresUserHooks);
    for(const provider of new Set([...outside.map(r=>r.provider),...['codex','claude'].filter(p=>context.globalState.get(`userHooks.${p}`))])){
      const directory=provider==='codex'?(process.env.CODEX_HOME||path.join(os.homedir(),'.codex')):(process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude'));
      const override=config().get('nodePath',''),runtime=override?resolveExecutable(override):process.execPath;
      const file=path.join(directory,provider==='codex'?'hooks.json':'settings.json');
      await prepareHooks();
      await installHooks(os.homedir(),provider,runtime,hookPaths.script,process.platform==='win32',false,{directory:registryDirectory,provider,file});
      if(provider==='codex')await codexTerminal.configure(path.join(directory,'config.toml'));
      await context.globalState.update(`userHooks.${provider}`,file);
      for(const r of [...terminals.values()].filter(r=>r.provider===provider)){r.requiresUserHooks=false;r.userHooks=true;r.setup=provider==='codex'?'Trust thinkmaxx hooks in /hooks, then restart Codex.':'Restart Claude Code to enable activity alerts.';}
    }
    disconnectedProjects.clear();await context.workspaceState.update('disconnectedProjects',[]);setupProjects.clear();
    for(const r of terminals.values())if(!r.userHooks)r.setupAttempted=false;
    await scanAll();
  }
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer('brainGym',{async deserializeWebviewPanel(view){dismissed=false;open('shared',view);}}));
  const command=(name,handler)=>{const run=async()=>{try{return await handler();}catch(e){vscode.window.showErrorMessage(`thinkmaxx: ${e.message}`);}};context.subscriptions.push(vscode.commands.registerCommand(name,run),vscode.commands.registerCommand(name.replace(/^thinkmaxx\./,'brainGym.'),run));};
  command('thinkmaxx.startCodex',()=>launch('codex'));command('thinkmaxx.startClaude',()=>launch('claude'));
  command('thinkmaxx.resumeCodex',()=>launch('codex',true));command('thinkmaxx.resumeClaude',()=>launch('claude',true));
  command('thinkmaxx.preview',()=>showPuzzle());
  command('thinkmaxx.makeRoom',()=>makeRoom());
  command('thinkmaxx.returnToChat',()=>{const t=returnTerminal||vscode.window.activeTerminal;if(t)openChat(terminals.get(t)?.id);});
  command('thinkmaxx.connectAlerts',()=>reconnectAlerts());
  command('thinkmaxx.removeUserHooks',async()=>{for(const provider of ['codex','claude']){const file=context.globalState.get(`userHooks.${provider}`);if(file){await installHooks(os.homedir(),provider,'','',process.platform==='win32',true,{file});if(provider==='codex')await codexTerminal.restore(path.join(path.dirname(file),'config.toml'));await context.globalState.update(`userHooks.${provider}`,undefined);}}vscode.window.showInformationMessage('Account-wide alerts disconnected. Restart open assistants to apply.');});
  command('thinkmaxx.toggle',async()=>{preview=false;await config().update('enabled',!config().get('enabled',true),vscode.ConfigurationTarget.Global);if(!config().get('enabled',true))hide();else dismissed=false;update();});
  command('thinkmaxx.settings',()=>vscode.commands.executeCommand('workbench.action.openSettings','@ext:braingym-local.brain-gym'));
  command('thinkmaxx.removeHooks',async()=>{const root=await rootFolder();if(!root)return;disconnectedProjects.add(root);await context.workspaceState.update('disconnectedProjects',[...disconnectedProjects]);await installHooks(root,'codex','','',false,true);await installHooks(root,'claude','','',false,true);await codexTerminal.restore(path.join(root,'.codex/config.toml'));vscode.window.showInformationMessage('Disconnected from this project. Restart open assistants to apply.');});
  const switched=()=>{update();scanAll();};
  context.subscriptions.push(status,output,vscode.window.onDidChangeActiveTerminal(switched),vscode.window.onDidOpenTerminal(()=>scanAll()),vscode.window.onDidChangeWindowState(()=>{update();scanAll();}),vscode.workspace.onDidChangeConfiguration(e=>{if(e.affectsConfiguration('thinkmaxx')||e.affectsConfiguration('brainGym')){refreshPreferences();update();scanAll();}}),vscode.window.onDidCloseTerminal(terminal=>{const r=terminals.get(terminal);if(r){if(r.channel)bridgePromise.then(b=>b?.remove(r.channel));terminals.delete(terminal);update();}}));
  const tick=setInterval(update,1000),detectTick=setInterval(scanAll,1500);
  context.subscriptions.push({dispose(){disposed=true;clearInterval(tick);clearInterval(detectTick);hide();registryWrite.finally(()=>fs.promises.unlink(registryFile).catch(()=>{}));bridgePromise.then(b=>b?.dispose());}});
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(()=>{for(const r of terminals.values())r.setupAttempted=false;scanAll();}),vscode.workspace.onDidGrantWorkspaceTrust(()=>{for(const r of terminals.values())r.setupAttempted=false;scanAll();}));
  update();scanAll();
  return {getActivity:()=>({conversations:summary([...terminals.values()]),panelOpen:Boolean(panel),focusMode,puzzle:JSON.parse(JSON.stringify(puzzleFor('shared')))}),openChat};
}
module.exports={activate,resolveExecutable};
