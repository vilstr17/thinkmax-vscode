'use strict';
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const path=require('node:path');
const MARKER='# Keep each Codex server attached to its terminal.';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function edit(text){
  const newline=text.includes('\r\n')?'\r\n':'\n',lines=text.split(/\r?\n/);
  const headers=[];
  for(let i=0;i<lines.length;i++){
    const m=/^\s*\[\s*(features|"features"|'features')\s*\]\s*(?:#.*)?$/.exec(lines[i]);
    if(m)headers.push(i);
  }
  if(headers.length>1||lines.some(l=>/^\s*(?:features\s*=|features\s*\.\s*daemon_auto_start\s*=)/.test(l)))throw Error('Codex uses a custom features table. Set features.daemon_auto_start = false in its config to connect terminal alerts.');
  const start=headers[0];let end=start===undefined?lines.length:start+1;
  if(start!==undefined)while(end<lines.length&&!/^\s*\[/.test(lines[end]))end++;
  const entries=[];
  if(start!==undefined)for(let i=start+1;i<end;i++)if(/^\s*(?:daemon_auto_start|"daemon_auto_start"|'daemon_auto_start')\s*=/.test(lines[i]))entries.push(i);
  if(entries.length>1)throw Error('Codex has duplicate daemon_auto_start settings. It was left unchanged.');
  const index=entries[0];
  if(index!==undefined){
    if(/^\s*(?:daemon_auto_start|"daemon_auto_start"|'daemon_auto_start')\s*=\s*false\s*(?:#.*)?$/.test(lines[index]))return text;
    if(!/^\s*(?:daemon_auto_start|"daemon_auto_start"|'daemon_auto_start')\s*=\s*true\s*(?:#.*)?$/.test(lines[index]))throw Error('Cannot read the Codex daemon_auto_start setting. It was left unchanged.');
    lines.splice(index,1,MARKER,'daemon_auto_start = false');
  }else if(start!==undefined)lines.splice(start+1,0,MARKER,'daemon_auto_start = false');
  else return text+(text&&!text.endsWith('\n')?newline:'')+newline+'[features]'+newline+MARKER+newline+'daemon_auto_start = false'+newline;
  return lines.join(newline);
}
async function configure(file){
  let original=null;try{original=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const next=edit(original||'');if(next===original)return false;
  await fs.mkdir(path.dirname(file),{recursive:true});
  const backup=original===null?null:await (async()=>{const name=file+'.brain-gym-backup-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');await fs.writeFile(name,original,{flag:'wx',mode:0o600});return name;})();
  let current=null;try{current=await fs.readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(current!==original)throw Error('Codex settings changed during setup. Try again.');
  const temp=file+'.brain-gym-'+process.pid+'.tmp';
  try{
    await fs.writeFile(temp,next,{mode:0o600});await fs.rename(temp,file);
    await fs.writeFile(file+'.brain-gym-terminal-mode.json',JSON.stringify({hash:hash(next),backup}),{mode:0o600});
  }finally{await fs.unlink(temp).catch(()=>{});}
  return true;
}
async function restore(file){
  const stateFile=file+'.brain-gym-terminal-mode.json';
  try{
    const state=JSON.parse(await fs.readFile(stateFile,'utf8')),current=await fs.readFile(file,'utf8');
    // Do not replace settings the user has edited after connecting Brain Gym.
    if(hash(current)!==state.hash)return false;
    if(state.backup){const original=await fs.readFile(state.backup,'utf8');const temp=file+'.brain-gym-'+process.pid+'.tmp';await fs.writeFile(temp,original,{mode:0o600});await fs.rename(temp,file);}
    else await fs.unlink(file);
    await fs.unlink(stateFile);return true;
  }catch(e){if(e.code==='ENOENT')return false;throw e;}
}
module.exports={edit,configure,restore};
