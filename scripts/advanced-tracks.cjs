'use strict';
// Rebuild the additional tiers without changing the original saved-board indices.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../media/tracks.json'),catalog=JSON.parse(fs.readFileSync(file,'utf8'));
const rotate=(p,r)=>{let{x,y}=p;while(r--)[x,y]=[-y,x];return{x,y};};
function board(level,index){
  let seed=271828+level*10007+index*997;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const side=[7,8,9][level-3],length=[32,40,50][level-3],count=[8,9,11][level-3];
  const route=[{x:0,y:Math.floor(random()*side)}],seen=new Set([`${route[0].x},${route[0].y}`]);let nodes=0;
  function grow(){
    if(route.length===length)return true;if(++nodes>200000)return false;
    const head=route.at(-1),options=[[1,0],[0,1],[-1,0],[0,-1]].map(([x,y])=>({x:head.x+x,y:head.y+y,tie:random()})).filter(p=>p.x>=0&&p.y>=0&&p.x<side&&p.y<side&&!seen.has(`${p.x},${p.y}`)).sort((a,b)=>a.tie-b.tie);
    for(const p of options){route.push({x:p.x,y:p.y});seen.add(`${p.x},${p.y}`);if(grow())return true;seen.delete(`${p.x},${p.y}`);route.pop();}return false;
  }
  let prepared=false;
  for(let attempt=0;attempt<32&&!prepared;attempt++){nodes=0;prepared=grow();}
  if(!prepared)throw Error(`Could not prepare ${level}/${index}`);
  const pieces=[],answer=[];let offset=0;
  for(let i=0;i<count;i++){
    const edges=Math.floor((length-1)/count)+(i<(length-1)%count?1:0),origin=route[offset],rotation=Math.floor(random()*4);
    const cells=route.slice(offset,offset+edges+1).map(p=>rotate({x:p.x-origin.x,y:p.y-origin.y},(4-rotation)%4));
    pieces.push({cells});answer.push({origin,rotation});offset+=edges;
  }
  for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1));[pieces[i],pieces[j]]=[pieces[j],pieces[i]];[answer[i],answer[j]]=[answer[j],answer[i]];}
  const blocked=[];
  const candidates=Array.from({length:side*side},(_,i)=>({x:i%side,y:Math.floor(i/side)})).filter(p=>!seen.has(`${p.x},${p.y}`));
  for(let n=0;n<[8,10,12][level-3];n++)blocked.push(candidates.splice(Math.floor(random()*candidates.length),1)[0]);
  const checkpoints=Array.from({length:level},(_,i)=>route[Math.round((i+1)*(length-1)/(level+1))]);
  return{side,start:route[0],goal:route.at(-1),checkpoints,blocked,pieces,answer};
}
for(let level=3;level<6;level++)catalog[level]=Array.from({length:24},(_,i)=>board(level,i));
fs.writeFileSync(file,JSON.stringify(catalog));
console.log('Prepared 24 boards per tier: low / medium / high / Xhigh / max / ultracode.');
