(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ThinkmaxxQuizzes=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const topics=['sums','symbols','rotation'],cache=new Map();
  const isQuiz=topic=>topics.includes(topic);
  const normalize=points=>{const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));return points.map(p=>p.map((v,i)=>v-min[i])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);};
  const signature=points=>JSON.stringify(normalize(points));
  const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]],rotations=[];
  for(const p of permutations){const parity=((p[1]-p[0])*(p[2]-p[0])*(p[2]-p[1])/2);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])if(parity*x*y*z===1)rotations.push({p,sign:[x,y,z]});}
  const turn=(points,r)=>normalize(points.map(v=>r.p.map((axis,i)=>v[axis]*r.sign[i])));
  const canonical=points=>rotations.map(r=>signature(turn(points,r))).sort()[0];
  const neighbors=p=>[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]].map(v=>v.map((x,i)=>x+p[i]));
  function connected(points){const keys=new Set(points.map(p=>p.join(','))),seen=new Set(),queue=[points[0]];while(queue.length){const p=queue.pop(),key=p.join(',');if(seen.has(key))continue;seen.add(key);queue.push(...neighbors(p).filter(q=>keys.has(q.join(','))&&!seen.has(q.join(','))));}return seen.size===points.length;}
  function clearView(points){const occupied=new Set(points.map(p=>p.join(',')));return points.every(p=>!points.some(q=>q.every((v,i)=>v>p[i]))&&[[1,0,0],[0,1,0],[0,0,1]].filter(delta=>occupied.has(p.map((v,i)=>v+delta[i]).join(','))).length<3);}
  function solveLatin(board,n,limit=2){const a=[...board],solutions=[];function visit(){if(solutions.length>=limit)return;let target=-1,options=[];for(let i=0;i<a.length;i++)if(!a[i]){const row=Math.floor(i/n),col=i%n,used=new Set();for(let j=0;j<n;j++){used.add(a[row*n+j]);used.add(a[j*n+col]);}const possible=Array.from({length:n},(_,j)=>j+1).filter(v=>!used.has(v));if(!possible.length)return;if(target<0||possible.length<options.length){target=i;options=possible;if(options.length===1)break;}}if(target<0){solutions.push([...a]);return;}for(const v of options){a[target]=v;visit();if(solutions.length>=limit)break;}a[target]=0;}visit();return solutions;}
  function item(s){
    const key=`${s.topic}:${s.difficulty}:${s.seed}`;if(cache.has(key))return cache.get(key);
    let seed=s.seed>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const integer=(a,b)=>a+Math.floor(random()*(b-a+1));
    const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=integer(0,i);[a[i],a[j]]=[a[j],a[i]];}return a;};
    const d=s.difficulty;let model,answer,choices,explanation,prompt;
    if(s.topic==='sums'){
      const n=[3,3,4,4,5,5][d],values=Array.from({length:n*n},()=>integer(1,d<3?9:15));
      const rows=shuffle(Array.from({length:n},(_,i)=>i)),cols=shuffle(Array.from({length:n},(_,i)=>i));
      const path=[rows[0]*n+cols[0]];for(let i=1;i<n;i++)path.push(rows[i]*n+cols[i-1],rows[i]*n+cols[i]);
      const target=path[Math.floor(path.length/2)],board=values.map((v,i)=>path.includes(i)?0:v);
      const rowSums=Array.from({length:n},(_,r)=>values.slice(r*n,r*n+n).reduce((a,b)=>a+b,0));
      const colSums=Array.from({length:n},(_,c)=>values.filter((_,i)=>i%n===c).reduce((a,b)=>a+b,0));
      answer=String(values[target]);choices=[answer,...shuffle(Array.from({length:25},(_,i)=>i+1).filter(v=>v!==values[target]&&Math.abs(v-values[target])<=6)).slice(0,3).map(String)];
      model={n,board,target,rowSums,colSums,solution:values};prompt='Find ?';
      // Record a compact deduction chain for the optional answer explanation.
      const work=[...board],steps=[];while(!work[target]){let progress=false;for(let axis=0;axis<2;axis++)for(let i=0;i<n;i++){const cells=Array.from({length:n},(_,j)=>axis?j*n+i:i*n+j),blank=cells.filter(k=>!work[k]);if(blank.length===1){const known=cells.reduce((sum,k)=>sum+work[k],0),total=(axis?colSums:rowSums)[i];work[blank[0]]=total-known;steps.push(`${axis?'Column':'Row'} ${i+1}: ${total} − ${known} = ${total-known}`);progress=true;}}if(!progress)throw Error('Unsolvable sum grid');}
      explanation=steps.join(' · ');
    }
    if(s.topic==='symbols'){
      const n=[4,4,5,5,6,6][d],rows=shuffle(Array.from({length:n},(_,i)=>i)),cols=shuffle(Array.from({length:n},(_,i)=>i)),labels=shuffle(Array.from({length:n},(_,i)=>i+1));
      const full=rows.flatMap(r=>cols.map(c=>labels[(r+c)%n])),board=[...full],goal=[9,10,14,16,22,24][d];let removed=0;
      for(const i of shuffle(Array.from({length:n*n},(_,i)=>i))){const prior=board[i];board[i]=0;if(solveLatin(board,n,2).length===1)removed++;else board[i]=prior;if(removed>=goal)break;}
      const candidates=i=>{const used=new Set();for(let j=0;j<n;j++){used.add(board[Math.floor(i/n)*n+j]);used.add(board[j*n+i%n]);}return labels.filter(v=>!used.has(v));};
      const blanks=board.map((v,i)=>v?null:{i,count:candidates(i).length}).filter(Boolean),hardest=Math.max(...blanks.map(v=>v.count));
      const target=shuffle(blanks.filter(v=>v.count===hardest))[0].i;answer=String(full[target]);choices=[answer,...shuffle(labels.filter(v=>v!==full[target])).slice(0,3).map(String)];
      model={n,board,target};prompt='Which symbol fits ?';explanation='Every row and column contains each symbol once. The grid has exactly one solution.';
      model.solution=full;
    }
    if(s.topic==='rotation'){
      const count=[6,7,8,9,10,12][d];let source;
      for(let attempt=0;attempt<1000;attempt++){
        const points=[[0,0,0]];while(points.length<count){const next=neighbors(points[integer(0,points.length-1)])[integer(0,5)];if(!points.some(p=>p.every((v,i)=>v===next[i]))&&next.every(v=>Math.abs(v)<=3))points.push(next);}
        const normalized=normalize(points),extents=[0,1,2].map(i=>Math.max(...normalized.map(p=>p[i])));
        // Require a fully spatial, asymmetric solid; mirror foils must differ under rotation.
        if(extents.some(v=>!v)||new Set(rotations.map(r=>signature(turn(normalized,r)))).size<24)continue;
        if(canonical(normalized)===canonical(normalized.map(([x,y,z])=>[-x,y,z])))continue;
        const views=rotations.map(r=>turn(normalized,r)).filter(clearView);if(views.length<2)continue;source=shuffle(views)[0];break;
      }
      if(!source)throw Error('Could not generate spatial solid');
      const same=rotations.map(r=>turn(source,r)).filter(p=>signature(p)!==signature(source)&&clearView(p)),correct=shuffle(same)[0];
      const wrong=[],seen=new Set([canonical(source)]);
      const mirror=source.map(([x,y,z])=>[-x,y,z]),mirrorViews=rotations.map(r=>turn(mirror,r)).filter(clearView);wrong.push(shuffle(mirrorViews)[0]);seen.add(canonical(mirror));
      for(let attempt=0;wrong.length<3&&attempt<1000;attempt++){
        const remove=integer(0,source.length-1),remaining=source.filter((_,i)=>i!==remove),anchor=remaining[integer(0,remaining.length-1)],next=neighbors(anchor)[integer(0,5)];
        if(remaining.some(p=>p.every((v,i)=>v===next[i])))continue;
        const changed=normalize([...remaining,next]);if(!connected(changed))continue;
        const k=canonical(changed);if(seen.has(k))continue;const views=rotations.map(r=>turn(changed,r)).filter(clearView);if(!views.length)continue;seen.add(k);wrong.push(shuffle(views)[0]);
      }
      if(wrong.length!==3)throw Error('Could not generate spatial foils');
      const solids=shuffle([correct,...wrong]),labels=['A','B','C','D'];model={source,options:Object.fromEntries(labels.map((label,i)=>[label,solids[i]]))};
      answer=labels[solids.indexOf(correct)];choices=[...labels];prompt='Same solid, rotated?';explanation='Rotation preserves every cube and connection. The highlighted option is the same solid; the others are mirrored or rearranged.';
    }
    choices=shuffle(choices);const result={context:prompt,prompt,choices,correct:choices.indexOf(answer),explanation,model};
    if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,result);return result;
  }
  const isGrid=topic=>topic==='sums'||topic==='symbols';
  function gridStatus(s){
    const m=item(s).model,values=m.board.map((v,i)=>v||s.entries?.[i]||0),complete=values.every(Boolean);
    const rows=[],cols=[];
    for(let i=0;i<m.n;i++){
      const row=values.slice(i*m.n,(i+1)*m.n),col=values.filter((_,j)=>j%m.n===i);
      const invalid=(line,total)=>s.topic==='sums'?line.every(Boolean)&&line.reduce((a,b)=>a+b,0)!==total:new Set(line.filter(Boolean)).size!==line.filter(Boolean).length;
      rows.push(invalid(row,m.rowSums?.[i]));cols.push(invalid(col,m.colSums?.[i]));
    }
    return {values,complete,correct:complete&&!rows.some(Boolean)&&!cols.some(Boolean),rows,cols};
  }
  function initializeGrid(s){const m=item(s).model;Object.assign(s,{gridVersion:1,entries:Array(m.board.length).fill(0),active:m.board.indexOf(0),checked:false});return s;}
  function create(topic,difficulty,previous,random){let seed=Math.floor(random()*4294967296)>>>0;if(seed===previous?.seed)seed=(seed+1)>>>0;const s={version:2,topic,difficulty,seed,choice:null,reviewed:false,moves:0,message:'',hint:null,won:false};return isGrid(topic)?initializeGrid(s):s;}
  function validBase(s){return isQuiz(s.topic)&&Number.isInteger(s.seed)&&s.seed>=0&&s.seed<=4294967295&&typeof s.reviewed==='boolean'&&(s.choice===null||Number.isInteger(s.choice)&&s.choice>=0&&s.choice<4)&&(!s.reviewed||s.choice!==null)&&s.moves===(s.reviewed?1:0);}
  function valid(s){
    if(!validBase(s))return false;if(!isGrid(s.topic))return true;
    const m=item(s).model,max=s.topic==='symbols'?m.n:99;
    return s.gridVersion===1&&Array.isArray(s.entries)&&s.entries.length===m.board.length&&s.entries.every((v,i)=>Number.isInteger(v)&&v>=0&&v<=max&&(!m.board[i]||v===0))&&Number.isInteger(s.active)&&s.active>=0&&s.active<m.board.length&&!m.board[s.active]&&typeof s.checked==='boolean'&&(s.reviewed?s.checked:s.choice===null)&&(!s.reviewed||s.choice===item(s).correct&&gridStatus(s).correct);
  }
  function restore(s){
    if(!validBase(s))return null;
    if(isGrid(s.topic)&&s.gridVersion===undefined){
      const q=item(s),oldChoice=s.choice,solved=s.reviewed&&oldChoice===q.correct;initializeGrid(s);
      if(solved){s.entries=q.model.board.map((v,i)=>v?0:q.model.solution[i]);s.checked=true;}
      else {if(oldChoice!==null)s.entries[q.model.target]=Number(q.choices[oldChoice]);s.choice=null;s.reviewed=false;s.moves=0;}
    }
    return valid(s)?s:null;
  }
  function action(s,a){
    if(s.reviewed)return s;
    if(a.type==='hint'){
      const q=item(s);
      if(isGrid(s.topic)){
        const values=gridStatus(s).values,i=q.model.board.findIndex((v,i)=>!v&&values[i]!==q.model.solution[i]);
        s.message=i<0?'Every cell is filled correctly. Press Check.':s.topic==='sums'?`Row ${Math.floor(i/q.model.n)+1}, column ${i%q.model.n+1}: try ${q.model.solution[i]}.`:`Row ${Math.floor(i/q.model.n)+1}, column ${i%q.model.n+1}: try ${['','circle','triangle','square','diamond','plus','star'][q.model.solution[i]]}.`;
      }else s.message='Follow the longest chain of cubes and compare where each branch joins it. Rotating preserves these connections; mirroring reverses them.';
      return s;
    }
    if(isGrid(s.topic)){
      const m=item(s).model,editable=i=>Number.isInteger(i)&&i>=0&&i<m.board.length&&!m.board[i];
      if(a.type==='gridSelect'&&editable(a.index))s.active=a.index;
      if(a.type==='setCell'&&editable(a.index)&&Number.isInteger(a.value)&&a.value>=0&&a.value<=(s.topic==='symbols'?m.n:99)){
        s.entries[a.index]=a.value;s.active=a.index;s.checked=false;s.message='';
        if(s.topic==='symbols'&&a.value){for(let j=1;j<m.board.length;j++){const i=(a.index+j)%m.board.length;if(!m.board[i]&&!s.entries[i]){s.active=i;break;}}}
      }
      if(a.type==='submit'){
        const result=gridStatus(s);s.checked=true;
        if(result.correct){s.reviewed=true;s.choice=item(s).correct;s.moves=1;}
        else s.message=result.complete?'Not quite. Check the highlighted rows and columns.':'Fill the remaining cells.';
      }
      return s;
    }
    if(a.type==='choose'&&Number.isInteger(a.index)&&a.index>=0&&a.index<4)s.choice=a.index;
    if(a.type==='submit'&&s.choice!==null){if(s.choice===item(s).correct){s.reviewed=true;s.moves=1;}else s.message='Not quite. Try another solid.';}return s;
  }
  return {topics,isQuiz,isGrid,item,create,valid,restore,action,gridStatus,solveLatin,rotations,turn,canonical,connected};
});
