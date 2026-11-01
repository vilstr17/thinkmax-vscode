'use strict';
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const execute=promisify(execFile);
const base=value=>path.win32.basename(value.replace(/\//g,'\\')).toLowerCase();
function firstTokens(text,limit=5){
  const result=[];let value='',quote='',active=false;
  for(const c of String(text||'').slice(0,2048)){
    if(quote){if(c===quote)quote='';else value+=c;active=true;}
    else if(c==='"'||c==="'"){quote=c;active=true;}
    else if(/\s/.test(c)){if(active){result.push(value);value='';active=false;if(result.length>=limit)break;}}
    else{value+=c;active=true;}
  }
  if(active&&result.length<limit)result.push(value);return result;
}
function providerFor(process){
  const name=base(process.executable||process.name||''),tokens=firstTokens(process.commandLine);
  let provider=null,offset=1;
  if(/^(codex|codexcli)(\.exe)?$/.test(name))provider='codex';
  else if(/^claude(\.exe)?$/.test(name))provider='claude';
  else if(/^(node|nodejs|bun)(\.exe)?$/.test(name)){
    const script=tokens[1]||'',file=base(script);
    if(/^(codex|codex\.js|codex\.mjs)$/.test(file)||(file==='cli.js'&&/[@/]openai[/\\]codex[/\\]/i.test(script)))provider='codex';
    else if(/^(claude|claude\.js|claude\.mjs)$/.test(file)||(file==='cli.js'&&/[@/]anthropic-ai[/\\]claude-code[/\\]/i.test(script)))provider='claude';
    offset=2;
  }
  if(!provider)return null;
  // Provider services, setup commands and one-shot commands are not interactive terminals.
  const args=tokens.slice(offset);
  if(args.some(t=>['sandbox','agents','queue','archive','unarchive','delete','debug','app-server','mcp-server','exec-server','remote-control','exec','review','login','logout','completion','doctor','features','update','help','--help','-h','--version','-V'].includes(t)))return null;
  if(provider==='claude'&&args.some(t=>['-p','--print','--output-format','--input-format'].includes(t)))return null;
  return provider;
}
function parsePosix(text){return String(text).split('\n').flatMap(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);return m?[{pid:Number(m[1]),parentPid:Number(m[2]),executable:m[3],name:base(m[3]),commandLine:''}]:[];});}
function parseWindows(text){const value=JSON.parse(String(text).replace(/^\uFEFF/,''));return(value===null?[]:Array.isArray(value)?value:[value]).map(p=>({pid:Number(p.ProcessId),parentPid:Number(p.ParentProcessId),executable:p.ExecutablePath||p.Name||'',name:p.Name||'',commandLine:p.CommandLine||''}));}
function findAssistant(rootPid,processes){
  if(!Number.isInteger(rootPid)||rootPid<1)return null;
  const children=new Map();for(const p of processes){if(!children.has(p.parentPid))children.set(p.parentPid,[]);children.get(p.parentPid).push(p);}
  const roots=processes.filter(p=>p.pid===rootPid),queue=[...roots],seen=new Set();
  for(let head=0;head<queue.length&&head<1500;head++){
    const p=queue[head];if(seen.has(p.pid))continue;seen.add(p.pid);
    const provider=providerFor(p);
    if(provider){
      // Prefer the native child over its npm launcher. Both belong to the same terminal.
      const native=(children.get(p.pid)||[]).find(c=>providerFor(c)===provider&&!/^(node|nodejs|bun)(\.exe)?$/.test(base(c.executable)));
      return{provider,pid:(native||p).pid,rootPid};
    }
    queue.push(...(children.get(p.pid)||[]));
  }
  return null;
}
async function processSnapshot(platform=process.platform){
  const options={timeout:3500,maxBuffer:4*1024*1024,windowsHide:true,encoding:'utf8'};
  if(platform==='win32'){
    const script="$ErrorActionPreference='Stop'; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine) | ConvertTo-Json -Compress";
    const {stdout}=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],options);return parseWindows(stdout);
  }
  const {stdout}=await execute('/bin/ps',['-axo','pid=,ppid=,comm='],options);const processes=parsePosix(stdout);
  const ids=processes.filter(p=>/^(codex|codexcli|claude|node|nodejs|bun)$/.test(p.name)).map(p=>p.pid);
  if(ids.length){
    const details=await execute('/bin/ps',['-p',ids.join(','),'-o','pid=,args='],options);
    const byId=new Map(processes.map(p=>[p.pid,p]));
    for(const line of details.stdout.split('\n')){const m=/^\s*(\d+)\s+(.*)$/.exec(line);if(m&&byId.has(Number(m[1])))byId.get(Number(m[1])).commandLine=m[2];}
  }
  return processes;
}
async function claudeActivity(pid,directory=process.env.CLAUDE_CONFIG_DIR||path.join(os.homedir(),'.claude')){
  try{
    const file=path.join(directory,'sessions',`${pid}.json`),stat=await fs.stat(file);if(stat.size>262144)return null;
    const record=JSON.parse(await fs.readFile(file,'utf8'));
    if(record.kind&&record.kind!=='interactive')return null;
    if(!['busy','idle','waiting','shell'].includes(record.status))return null;
    const session=typeof record.sessionId==='string'?crypto.createHash('sha256').update(record.sessionId).digest('hex'):'';
    return{phase:record.status==='busy'?'working':record.status==='idle'?'idle':record.status==='waiting'?'waiting':'active',session};
  }catch{return null;}
}
async function processCwd(pid){
  if(process.platform==='win32')return null;
  if(process.platform==='linux'){try{return await fs.readlink(`/proc/${pid}/cwd`);}catch{return null;}}
  try{
    const {stdout}=await execute('/usr/sbin/lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{timeout:1200,maxBuffer:65536,encoding:'utf8'});
    return stdout.split('\n').find(s=>s.startsWith('n'))?.slice(1)||null;
  }catch{return null;}
}
module.exports={firstTokens,providerFor,parsePosix,parseWindows,findAssistant,processSnapshot,claudeActivity,processCwd};
