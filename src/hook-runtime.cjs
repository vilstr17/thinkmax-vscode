'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
// A neutral shared location keeps provider-visible hook commands independent of branding.
function location(globalStorage){
  const base=path.join(path.dirname(globalStorage),'assistant-activity-bridge');
  return {directory:path.join(base,'activity'),script:path.join(base,'signal.cjs'),base};
}
async function prepare(globalStorage,extensionPath){
  const paths=location(globalStorage);
  await fs.mkdir(paths.base,{recursive:true,mode:0o700});
  await fs.mkdir(paths.directory,{recursive:true,mode:0o700});
  for(const name of ['signal.cjs','watch.cjs','detection.cjs']){
    const target=path.join(paths.base,name),temp=target+'.'+process.pid+'-'+crypto.randomBytes(8).toString('hex')+'.tmp';
    try{await fs.copyFile(path.join(extensionPath,'src',name),temp);await fs.rename(temp,target);}
    finally{await fs.unlink(temp).catch(()=>{});}
  }
  return paths;
}
module.exports={location,prepare};
