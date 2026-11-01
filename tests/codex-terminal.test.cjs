const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {edit,configure,restore}=require('../src/codex-terminal.cjs');
test('Codex terminal compatibility preserves other settings, tables and line endings',()=>{
  for(const newline of ['\n','\r\n']){
    const original=['model = "example"','[features]','memories = true','daemon_auto_start = true # selected before','[hooks.state."private"]','trusted_hash = "unchanged"',''].join(newline);
    const next=edit(original);assert.match(next,/daemon_auto_start = false/);assert.match(next,/memories = true/);assert.match(next,/trusted_hash = "unchanged"/);assert.equal(edit(next),next);
    if(newline==='\r\n')assert.equal(next.replaceAll('\r\n','').includes('\n'),false);
  }
  assert.match(edit('model="example"\n[projects."/demo"]\ntrust_level="trusted"\n'),/\[features\]/);
  assert.equal(edit('[features]\ndaemon_auto_start = false\n'),'[features]\ndaemon_auto_start = false\n');
  for(const text of ['features = { daemon_auto_start = true }','features.daemon_auto_start = true','[features]\ndaemon_auto_start = "custom"'])assert.throws(()=>edit(text),/custom|Cannot read/);
});
test('Codex compatibility backs up settings and restores only unedited files',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'brain-gym-codex-mode-')),file=path.join(dir,'config.toml');
  try{
    const original='model="example"\n[features]\nmemories=true\n';await fs.writeFile(file,original);
    assert.equal(await configure(file),true);assert.equal(await configure(file),false);assert.equal(await restore(file),true);assert.equal(await fs.readFile(file,'utf8'),original);
    await configure(file);await fs.appendFile(file,'\n# edited by user\n');assert.equal(await restore(file),false);assert.match(await fs.readFile(file,'utf8'),/edited by user/);
    await fs.unlink(file);await fs.unlink(file+'.brain-gym-terminal-mode.json');await configure(file);assert.equal(await restore(file),true);await assert.rejects(fs.stat(file),{code:'ENOENT'});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
