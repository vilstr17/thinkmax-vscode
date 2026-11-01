const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../media/puzzles.js'),catalog=require('../media/tracks.json'),Q=P.quiz;
const generated=(topic,difficulty,seed)=>Q.item({topic,difficulty,seed});
test('generated puzzles preserve answers, editable entries, reviews and persistence',()=>{
 for(const topic of Q.topics)for(let difficulty=0;difficulty<6;difficulty++)for(let seed=0;seed<80;seed++){
  let s=Q.create(topic,difficulty,null,()=>seed/4294967296),q=Q.item(s);
  assert.ok(q.prompt.length<30&&q.explanation);assert.equal(q.choices.length,4);assert.equal(new Set(q.choices).size,4);assert.ok(q.correct>=0&&q.correct<4);
  assert.deepEqual(P.restore(s,catalog),s);assert.deepEqual(Q.item(JSON.parse(JSON.stringify(s))),q);
  assert.equal(P.isSolved(P.action(s,{type:'submit'},catalog),catalog),false);
  if(Q.isGrid(topic)){
    const original=structuredClone(s);
    for(let i=0;i<q.model.board.length;i++)if(!q.model.board[i])s=P.action(s,{type:'setCell',index:i,value:q.model.solution[i]},catalog);
    assert.deepEqual(original.entries,Array(q.model.board.length).fill(0));assert.ok(Q.gridStatus(s).complete);assert.equal(P.isSolved(s,catalog),false);assert.deepEqual(P.restore(s,catalog),s);
    s=P.action(s,{type:'submit'},catalog);assert.ok(P.isSolved(s,catalog));assert.deepEqual(P.restore(s,catalog),s);assert.deepEqual(P.action(s,{type:'setCell',index:s.active,value:0},catalog),s);
  }else{
    assert.deepEqual(P.action(s,{type:'choose',index:99},catalog),s);s=P.action(s,{type:'choose',index:q.correct},catalog);s=P.action(s,{type:'submit'},catalog);assert.ok(P.isSolved(s,catalog));assert.deepEqual(P.restore(s,catalog),s);assert.deepEqual(P.action(s,{type:'choose',index:0},catalog),s);
    const wrong=P.action({...s,reviewed:false,moves:0,choice:(q.correct+1)%4},{type:'submit'},catalog);assert.equal(wrong.reviewed,false);assert.equal(P.isSolved(wrong,catalog),false);assert.match(wrong.message,/Try another/);assert.notEqual(wrong.choice,q.correct);assert.ok(P.restore(wrong,catalog));
  }
 }
});
test('editable grids protect givens, allow correction and clear, and reject invalid writes',()=>{
 for(const topic of ['sums','symbols']){
  let s=P.newPuzzle(topic,3,catalog),m=Q.item(s).model,blank=m.board.indexOf(0),given=m.board.findIndex(Boolean);
  for(const action of [{type:'setCell',index:given,value:1},{type:'setCell',index:-1,value:1},{type:'setCell',index:blank,value:1.5},{type:'setCell',index:blank,value:-1},{type:'setCell',index:blank,value:topic==='symbols'?m.n+1:100}])assert.deepEqual(P.action(s,action,catalog),s);
  for(let i=0;i<m.board.length;i++)if(!m.board[i])s=P.action(s,{type:'setCell',index:i,value:m.solution[i]},catalog);
  const bad=topic==='sums'?m.solution[blank]+1:m.solution[blank]%m.n+1;s=P.action(s,{type:'setCell',index:blank,value:bad},catalog);s=P.action(s,{type:'submit'},catalog);
  assert.equal(s.reviewed,false);assert.equal(s.checked,true);assert.ok(Q.gridStatus(s).rows.some(Boolean)||Q.gridStatus(s).cols.some(Boolean));assert.ok(P.restore(s,catalog));
  s=P.action(s,{type:'setCell',index:blank,value:0},catalog);assert.equal(s.entries[blank],0);assert.equal(s.checked,false);assert.equal(Q.gridStatus(s).complete,false);
  s=P.action(s,{type:'setCell',index:blank,value:m.solution[blank]},catalog);s=P.action(s,{type:'submit'},catalog);assert.ok(s.reviewed);assert.ok(Q.gridStatus(s).correct);
 }
});
test('legacy single-answer grid progress migrates without losing the seed',()=>{
 for(const topic of ['sums','symbols'])for(const reviewed of [false,true])for(const right of [false,true]){
  const current=P.newPuzzle(topic,2,catalog),q=Q.item(current),legacy={...current,choice:right?q.correct:(q.correct+1)%4,reviewed,moves:reviewed?1:0};
  for(const key of ['gridVersion','entries','active','checked'])delete legacy[key];
  const restored=P.restore(legacy,catalog);assert.ok(restored);assert.equal(restored.seed,legacy.seed);assert.equal(restored.reviewed,reviewed&&right);
  if(reviewed&&right)assert.ok(Q.gridStatus(restored).correct);else assert.equal(restored.entries[q.model.target],Number(q.choices[legacy.choice]));
 }
});
test('sum grids have unique solutions that require more than reading a single total',()=>{
 for(let d=0;d<6;d++)for(let seed=0;seed<200;seed++){
  const q=generated('sums',d,seed),{n,board,target,rowSums,colSums}=q.model,a=[...board];
  assert.ok(board.filter((v,i)=>Math.floor(i/n)===Math.floor(target/n)&&!v).length>1);assert.ok(board.filter((v,i)=>i%n===target%n&&!v).length>1);
  // A leaf in the row/column constraint graph uniquely fixes its sole unknown.
  while(a.some(v=>!v)){let progress=false;for(let axis=0;axis<2;axis++)for(let i=0;i<n;i++){const indices=Array.from({length:n},(_,j)=>axis?j*n+i:i*n+j),blanks=indices.filter(j=>!a[j]);if(blanks.length!==1)continue;const total=(axis?colSums:rowSums)[i],known=indices.reduce((sum,j)=>sum+a[j],0);a[blanks[0]]=total-known;assert.ok(a[blanks[0]]>0);progress=true;}assert.ok(progress,'Each unknown must be uniquely determined');}
  for(let i=0;i<n;i++){assert.equal(a.slice(i*n,i*n+n).reduce((x,y)=>x+y,0),rowSums[i]);assert.equal(a.filter((_,j)=>j%n===i).reduce((x,y)=>x+y,0),colSums[i]);}assert.equal(q.choices[q.correct],String(a[target]));
 }
});
function independentLatin(board,n){const a=[...board],out=[];function go(){if(out.length===2)return;const i=a.indexOf(0);if(i<0){out.push([...a]);return;}const r=Math.floor(i/n),c=i%n;for(let v=1;v<=n;v++){if(a.slice(r*n,r*n+n).includes(v)||a.some((x,j)=>j%n===c&&x===v))continue;a[i]=v;go();a[i]=0;}}go();return out;}
test('symbol grids have exactly one solution and the target needs nontrivial deduction',()=>{
 for(let d=0;d<6;d++)for(let seed=0;seed<120;seed++){
  const q=generated('symbols',d,seed),{n,board,target}=q.model,answers=independentLatin(board,n);assert.equal(answers.length,1);assert.equal(q.choices[q.correct],String(answers[0][target]));
  const used=new Set([...board.slice(Math.floor(target/n)*n,Math.floor(target/n)*n+n),...board.filter((_,i)=>i%n===target%n)].filter(Boolean));assert.ok(n-used.size>1,'Target is not a direct single missing symbol');
 }
});
function normalize(points){const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));return points.map(p=>p.map((v,i)=>v-min[i])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);}
function independentRotations(points){const out=[];for(const p of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){const inversions=Number(p[0]>p[1])+Number(p[0]>p[2])+Number(p[1]>p[2]);for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){if((-1)**inversions*x*y*z!==1)continue;out.push(JSON.stringify(normalize(points.map(v=>[v[p[0]]*x,v[p[1]]*y,v[p[2]]*z]))));}}return new Set(out);}
test('spatial choices contain exactly one true rotation and three distinct, connected foils',()=>{
 assert.equal(Q.rotations.length,24);
 for(let d=0;d<6;d++)for(let seed=0;seed<160;seed++){
  const q=generated('rotation',d,seed),{source,options}=q.model,reference=independentRotations(source),matches=[];assert.equal(reference.size,24);
  for(const [name,solid]of Object.entries(options)){assert.equal(solid.length,source.length);assert.equal(new Set(solid.map(p=>p.join(','))).size,source.length);assert.ok(Q.connected(solid));if(reference.has(JSON.stringify(normalize(solid))))matches.push(name);}
  assert.deepEqual(matches,[q.choices[q.correct]]);const keys=Object.values(options).map(p=>[...independentRotations(p)].sort()[0]);assert.equal(new Set(keys).size,4);
 }
});
test('fresh seeds generate varied boards and the mix includes only current topics',()=>{
 const correctLabels=new Set();for(let seed=0;seed<100;seed++){const q=generated('rotation',0,seed);correctLabels.add(q.choices[q.correct]);}assert.equal(correctLabels.size,4);
 for(const topic of Q.topics){const seen=new Set();for(let seed=0;seed<100;seed++)seen.add(JSON.stringify(generated(topic,0,seed).model));assert.equal(seen.size,100);}
 for(const previous of [null,...P.topics.map(topic=>({topic}))])for(let i=0;i<100;i++){const s=P.newPuzzle('mix',0,catalog,previous,()=>i/100);assert.ok(P.topics.includes(s.topic));assert.notEqual(s.topic,previous?.topic);}
 const seen=new Set(Array.from({length:100},(_,i)=>P.newPuzzle('mix',0,catalog,null,()=>i/100).topic));assert.equal(seen.size,P.topics.length);
 const prior=P.newPuzzle('rotation',0,catalog,null,()=>0),next=P.newPuzzle('rotation',0,catalog,prior,()=>0);assert.notEqual(prior.seed,next.seed);
});
test('invalid and retired saved quizzes are discarded',()=>{
 const s=P.newPuzzle('sums',0,catalog);for(const change of [{seed:-1},{seed:2**32},{seed:1.1},{choice:4},{reviewed:true},{moves:1},{reviewed:'yes'}])assert.equal(P.restore({...s,...change},catalog),null);
 for(const change of [{entries:[]},{entries:s.entries.map(()=>-1)},{active:-1},{checked:'yes'},{gridVersion:2},{choice:0}])assert.equal(P.restore({...s,...change},catalog),null);
 for(const topic of ['data','deduction','reasoning','tracing','circuit'])assert.equal(P.restore({...s,topic},catalog),null);
});

test('every quiz offers a hint without entering or submitting an answer',()=>{
 for(const topic of Q.topics){const s=P.newPuzzle(topic,0,catalog),next=P.action(s,{type:'hint'},catalog);assert.ok(next.message);assert.equal(next.reviewed,false);assert.deepEqual(next.entries,s.entries);assert.equal(next.choice,s.choice);assert.ok(P.restore(next,catalog));}
});
