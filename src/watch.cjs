'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {parsePosix,parseWindows}=require('./detection.cjs');
const execute=promisify(execFile);
function route(ancestry, registrations, provider, now=Date.now()){
  for(const pid of ancestry)for(const registry of registrations){
    if(!Number.isFinite(registry.at)||now-registry.at>15000||registry.at>now+5000)continue;
    const client=registry.clients?.find(c=>c.provider===provider&&c.processId===pid);
    if(client)return{ASSISTANT_ACTIVITY_PORT:String(registry.port),ASSISTANT_ACTIVITY_CHANNEL:client.channel,ASSISTANT_ACTIVITY_TOKEN:client.token};
  }
  return null;
}
async function ancestors(){
  const options={timeout:1200,maxBuffer:4*1024*1024,windowsHide:true,encoding:'utf8'};
  let processes;
  if(process.platform==='win32'){
    const {stdout}=await execute('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name) | ConvertTo-Json -Compress"],options);
    processes=parseWindows(stdout);
  }else{
    const {stdout}=await execute('/bin/ps',['-axo','pid=,ppid=,comm='],options);processes=parsePosix(stdout);
  }
  const byId=new Map(processes.map(p=>[p.pid,p.parentPid])),result=[];
  let pid=process.ppid;
  while(pid>1&&result.length<64&&!result.includes(pid)){result.push(pid);pid=byId.get(pid);}
  return result;
}
async function watchRoute(directory,provider){
  if(!['codex','claude'].includes(provider))return null;
  const names=(await fs.readdir(directory)).filter(n=>/^window-[a-f0-9]{32}\.json$/.test(n)).slice(0,64);
  if(!names.length)return null;
  const registrations=[];
  for(const name of names){try{const file=path.join(directory,name);if((await fs.stat(file)).size>131072)continue;registrations.push(JSON.parse(await fs.readFile(file,'utf8')));}catch{}}
  return route(await ancestors(),registrations,provider);
}
module.exports={route,watchRoute};
