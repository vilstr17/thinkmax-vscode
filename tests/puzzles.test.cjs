const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../media/puzzles.js');const catalog=require('../media/tracks.json');
test('all 512 Lights boards solve, including after persistence',()=>{
  for(let mask=0;mask<512;mask++){
    let s={version:1,topic:'lights',side:3,difficulty:0,moves:0,cells:Array.from({length:9},(_,i)=>Boolean(mask&(1<<i)))};
    assert.ok(P.restore(s,catalog));const solution=P.lightsSolution(s);assert.ok(solution);
    for(const index of solution)s=P.action(s,{type:'press',index},catalog);assert.ok(P.isSolved(s,catalog),`mask ${mask}`);
  }
});
test('every difficulty generates solvable Lights 3D boards; solver affects all axes',()=>{
  for(let d=0;d<6;d++)for(let seed=1;seed<=30;seed++){
    let x=seed;const random=()=>{x=(x*16807)%2147483647;return(x-1)/2147483646;};
    let s=P.newPuzzle('cube',d,catalog,null,random);assert.equal(P.isSolved(s,catalog),false);assert.ok(P.restore(s,catalog));
    for(const index of P.lightsSolution(s))s=P.action(s,{type:'press',index},catalog);assert.ok(P.isSolved(s,catalog));
  }
  assert.deepEqual(P.neighbors(13,3,true).sort((a,b)=>a-b),[4,10,12,13,14,16,22]);
});
test('AI River rules, reachable states and hints preserve solvability',()=>{
  for(let d=0;d<6;d++){
    let s=P.newPuzzle('river',d,catalog);const answer=P.riverSolution(s);assert.ok(answer?.length);
    for(const passenger of answer){s.selected=passenger;s=P.action(s,{type:'cross'},catalog);assert.equal(s.message,'');assert.ok(P.safe(s.mask,s.right,d));assert.ok(P.restore(s,catalog));}
    assert.ok(P.isSolved(s,catalog));
    for(let mask=0;mask<32;mask++)for(const right of [false,true]){
      if(!P.safe(mask,right,d))continue;const route=P.riverSolution({...s,mask,right});if(!route)continue;
      let t={...s,mask,right};for(const passenger of route){const next=P.riverTransition(t.mask,t.right,passenger,d);assert.ok(next);t={...t,...next};}assert.equal(t.mask,31);assert.equal(t.right,true);
    }
  }
  const s=P.newPuzzle('river',2,catalog);s.selected=3;const next=P.action(s,{type:'cross'},catalog);assert.equal(next.mask,0);assert.match(next.message,/Claude/);
});
test('144 Robot Tracks catalog answers are legal; partial hints and alternate routes solve',()=>{
  let count=0;
  for(const [level,boards]of Object.entries(catalog))for(let index=0;index<boards.length;index++){
    const d=boards[index];let s=P.newPuzzle('tracks',Number(level),catalog);s.index=index;s.placements=Array(d.pieces.length).fill(null);s.rotations=Array(d.pieces.length).fill(0);
    for(let i=0;i<d.answer.length;i++){
      assert.ok(P.canPlace(d,s.placements,i,d.answer[i]),`${level}/${index}/${i}`);s.placements[i]=d.answer[i];s.rotations[i]=d.answer[i].rotation;
    }assert.ok(P.routeReady(d,s.placements));s.won=true;assert.ok(P.isSolved(s,catalog));assert.ok(P.restore(s,catalog));
    const solution=P.trackSolution(d,Array(d.pieces.length).fill(null));assert.ok(solution,`${level}/${index} search`);assert.ok(P.routeReady(d,solution));
    const partial=solution.map((p,i)=>i===0?p:null);assert.ok(P.trackSolution(d,partial),`${level}/${index} compatible hint`);count++;
  }assert.equal(count,144);
});
test('six Lights tiers increase board size and solution depth; all generated puzzles solve',()=>{
  assert.deepEqual(P.difficulties.map(d=>d.label),['low','medium','high','Xhigh','max','ultracode']);
  for(let difficulty=0;difficulty<6;difficulty++)for(let seed=1;seed<=30;seed++){
    let x=seed;const random=()=>{x=(x*16807)%2147483647;return(x-1)/2147483646;};
    let s=P.newPuzzle('lights',difficulty,catalog,null,random);
    assert.equal(s.side,[3,3,4,5,5,6][difficulty]);assert.ok(P.restore(s,catalog));
    const answer=P.lightsSolution(s);assert.ok(answer.length>=[2,4,5,7,9,12][difficulty]);
    for(const index of answer)s=P.action(s,{type:'press',index},catalog);
    assert.ok(P.isSolved(s,catalog));
  }
});
test('legacy progress survives the rename and round-trips after migration',()=>{
  for(const difficulty of [0,1,2])for(const topic of ['lights','cube']){
    const side=topic==='lights'?3:difficulty===0?2:3;
    const cells=Array(side**(topic==='cube'?3:2)).fill(false);
    for(const index of P.neighbors(0,side,topic==='cube'))cells[index]=true;
    const old={version:1,topic,difficulty,side,cells,moves:7};
    const restored=P.restore(old,catalog);assert.ok(restored);assert.equal(restored.version,2);
    assert.equal(restored.moves,7);assert.deepEqual(restored.cells,cells);assert.ok(P.restore(restored,catalog));
  }
  for(let difficulty=0;difficulty<3;difficulty++){
    const old={...P.newPuzzle('tracks',difficulty,catalog),version:1};
    old.placements[0]=catalog[difficulty][old.index].answer[0];old.rotations[0]=old.placements[0].rotation;
    const restored=P.restore(old,catalog);assert.equal(restored.index,old.index);assert.deepEqual(restored.placements,old.placements);
  }
});
test('new river tiers enforce distinct crossing-order rules without making the puzzle impossible',()=>{
  assert.deepEqual(Array.from({length:6},(_,d)=>P.riverRules(d).before.length),[0,0,1,2,3,4]);
  for(let difficulty=2;difficulty<6;difficulty++)for(const[first,second]of P.riverRules(difficulty).before){
    for(let mask=0;mask<32;mask++){
      if(mask&(1<<first)||mask&(1<<second))continue;
      assert.equal(P.riverTransition(mask,false,second,difficulty),null);
    }
  }
});
test('advanced tracks have longer routes and more pieces, and hints respect alternate placement',()=>{
  const expected=[[5,3,9],[6,5,17],[7,7,26],[7,8,32],[8,9,40],[9,11,50]];
  for(let d=0;d<6;d++){
    assert.equal(catalog[d].length,24);
    for(const board of catalog[d])assert.deepEqual([board.side,board.pieces.length,P.route(board,board.answer).length],expected[d]);
  }
  const board={side:3,start:{x:0,y:0},goal:{x:2,y:0},checkpoints:[],blocked:[],pieces:[{cells:[{x:0,y:0},{x:1,y:0}]},{cells:[{x:0,y:0},{x:1,y:0}]}],answer:[{origin:{x:0,y:0},rotation:0},{origin:{x:1,y:0},rotation:0}]};
  const fixed=[{origin:{x:1,y:0},rotation:0},null];
  const answer=P.trackSolution(board,fixed);assert.ok(answer);assert.deepEqual(answer[0],fixed[0]);assert.ok(P.routeReady(board,answer));
});
test('Robot Tracks accepts spare pieces, requires checkpoints and joins ends only',()=>{
  const d={side:5,start:{x:0,y:0},goal:{x:4,y:0},checkpoints:[{x:2,y:0}],blocked:[],pieces:[{cells:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]},{cells:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]},{cells:[{x:0,y:0},{x:0,y:1},{x:0,y:2}]}]};
  const placements=[{origin:{x:0,y:0},rotation:0},{origin:{x:2,y:0},rotation:0},null];assert.ok(P.routeReady(d,placements));
  placements[2]={origin:{x:4,y:2},rotation:0};assert.ok(P.canPlace(d,placements,2,placements[2]));assert.ok(P.routeReady(d,placements));
  assert.equal(P.routeReady({...d,checkpoints:[{x:2,y:2}]},placements),false);
  assert.equal(P.canPlace(d,placements,2,{origin:{x:1,y:0},rotation:0}),false);
});
test('moves, undo and persistence reject corrupt tracks and unreachable lights',()=>{
  let s=P.newPuzzle('tracks',0,catalog);const d=catalog[0][s.index];s.selected=0;s.rotations[0]=d.answer[0].rotation;
  const before=JSON.stringify(s.placements);s=P.action(s,{type:'place',...d.answer[0].origin},catalog);assert.equal(s.moves,1);
  assert.ok(P.restore(s,catalog));s=P.action(s,{type:'undo'},catalog);assert.equal(JSON.stringify(s.placements),before);assert.equal(s.moves,0);
  s.placements[0]={origin:{x:99,y:99},rotation:0};assert.equal(P.restore(s,catalog),null);
  assert.equal(P.restore({version:1,topic:'lights',difficulty:0,moves:0,side:3,cells:[true]},catalog),null);
});
