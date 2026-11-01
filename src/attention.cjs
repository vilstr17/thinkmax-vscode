'use strict';
// Keep attention per conversation. A repeated poll never creates another alert.
function observe(record,next,{event='',at=Date.now()}={}){
  const previous=record.state;
  record.state=next;
  if(next.session&&previous?.session&&next.session!==previous.session){record.attention=null;record.sawWork=false;}
  if(event==='SessionStart'){record.attention=null;record.sawWork=false;return null;}
  if(next.phase==='active'){record.sawWork=false;return null;}
  if(next.phase==='working'){
    record.sawWork=true;record.attention=null;
    return null;
  }
  let kind=null;
  if(next.phase==='waiting'&&previous?.phase!=='waiting')kind='input';
  if(next.phase==='idle'&&record.sawWork&&previous?.phase!=='idle'){
    kind=event==='Interrupt'?'interrupted':event==='StopFailure'?'failed':'finished';record.sawWork=false;
  }
  if(next.phase==='closed'){record.attention=null;record.sawWork=false;}
  if(!kind)return null;
  record.attention={id:`${record.id}:${at}:${kind}`,kind,at};
  return record.attention;
}
function summary(records){
  return records.map((r,i)=>({id:r.id,provider:r.provider,label:records.filter(other=>other.label===r.label).length>1?`${r.label} · terminal ${i+1}`:r.label,phase:r.state?.phase||'active',attention:r.attention||null,connected:r.source==='hooks'||r.source==='metadata',setup:r.source==='hooks'?'':r.source==='metadata'&&r.setup?'Live status connected. Connect all terminals for full activity alerts.':r.setup||'',setupError:r.setupError||''}));
}
module.exports={observe,summary};
