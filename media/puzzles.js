(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./quizzes.js') : root.ThinkmaxxQuizzes); if (typeof module === 'object' && module.exports) module.exports = api; else root.ThinkmaxxPuzzles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (quiz) {
  'use strict';
  const topics = ['lights', 'cube', 'river', 'tracks', ...quiz.topics];
  const names = ['ChatGPT', 'Grok', 'Claude', 'Qwen', 'Gemini'];
  const difficulties = [
    {id:'low',label:'low',lightsSide:3,lightsMoves:3,cubeSide:2,cubeMoves:2,description:'A quick warm-up.'},
    {id:'medium',label:'medium',lightsSide:3,lightsMoves:5,cubeSide:2,cubeMoves:4,description:'A little more to untangle.'},
    {id:'high',label:'high',lightsSide:4,lightsMoves:6,cubeSide:3,cubeMoves:5,description:'More room. More possibilities.'},
    {id:'xhigh',label:'Xhigh',lightsSide:5,lightsMoves:9,cubeSide:3,cubeMoves:8,description:'Think a few moves ahead.'},
    {id:'max',label:'max',lightsSide:5,lightsMoves:12,cubeSide:3,cubeMoves:12,description:'A proper mental workout.'},
    {id:'ultracode',label:'ultracode',lightsSide:6,lightsMoves:18,cubeSide:4,cubeMoves:18,description:'The deepest end of the maze.'}
  ];
  function normalizeDifficulty(value) {
    value=typeof value==='string'?value.toLowerCase():value;
    if(value==='easy')value='low';if(value==='hard')value='high';
    return difficulties.some(d=>d.id===value)?value:'low';
  }
  const difficultyIndex=value=>difficulties.findIndex(d=>d.id===normalizeDifficulty(value));
  const riverOrders=[[],[],[[2,3]],[[2,3],[1,4]],[[2,3],[1,4],[1,2]],[[2,3],[1,4],[1,2],[4,3]]];
  const riverRules=difficulty=>({pairs:difficulty===0?[[0,1]]:[[0,1],[0,2]],before:riverOrders[difficulty]||[]});
  const key = p => `${p.x},${p.y}`;
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const clone = s => JSON.parse(JSON.stringify(s));
  function rotate(point, turns) { let { x, y } = point; for (let i = 0; i < ((turns % 4) + 4) % 4; i++) [x, y] = [-y, x]; return { x, y }; }
  function cells(d, i, placement) { return d.pieces[i].cells.map(p => { const v = rotate(p, placement.rotation); return { x: v.x + placement.origin.x, y: v.y + placement.origin.y }; }); }
  function inside(d, p) { return p.x >= 0 && p.y >= 0 && p.x < d.side && p.y < d.side && !d.blocked.some(b => same(b, p)); }
  function canPlace(d, placements, i, placement) {
    if (!d.pieces[i] || !placement || !Number.isInteger(placement.rotation) || placement.rotation < 0 || placement.rotation > 3 || !Number.isInteger(placement.origin?.x) || !Number.isInteger(placement.origin?.y)) return false;
    const candidate = cells(d, i, placement), joins = new Map();
    if (!candidate.every(p => inside(d, p))) return false;
    for (let j = 0; j < placements.length; j++) {
      if (j === i || !placements[j]) continue;
      const path = cells(d, j, placements[j]);
      for (const p of candidate.filter(p => path.some(q => same(p, q)))) {
        if (!(same(p, candidate[0]) || same(p, candidate.at(-1))) || !(same(p, path[0]) || same(p, path.at(-1)))) return false;
        const count = (joins.get(key(p)) || 0) + 1; if (count > 1) return false; joins.set(key(p), count);
      }
    }
    for (const p of [d.start, d.goal]) if (candidate.some(q => same(p, q)) && (!(same(p, candidate[0]) || same(p, candidate.at(-1))) || joins.has(key(p)))) return false;
    return true;
  }
  function route(d, placements) {
    let head = d.start; const out = [head], used = new Set(), occupied = new Set([key(head)]);
    while (used.size < placements.length) {
      const matches = placements.map((p, i) => p && !used.has(i) ? i : -1).filter(i => i >= 0 && [cells(d, i, placements[i])[0], cells(d, i, placements[i]).at(-1)].some(p => same(p, head)));
      if (matches.length !== 1) break;
      const i = matches[0]; let path = cells(d, i, placements[i]); if (same(path.at(-1), head)) path = path.reverse();
      if (path.slice(1).some(p => occupied.has(key(p)))) break;
      for (const p of path.slice(1)) { out.push(p); occupied.add(key(p)); }
      head = path.at(-1); used.add(i); if (same(head, d.goal)) break;
    }
    return out;
  }
  function routeReady(d, placements) { const r = route(d, placements); return same(r.at(-1), d.goal) && d.checkpoints.every(p => r.some(q => same(p, q))); }
  function trackSolution(d, fixed, maxNodes = 75000) {
    // Prepared routes give instant, compatible hints even on the largest boards.
    if(d.answer&&fixed.every((p,i)=>!p||(d.answer[i]&&(JSON.stringify(cells(d,i,p))===JSON.stringify(cells(d,i,d.answer[i]))||JSON.stringify(cells(d,i,p))===JSON.stringify(cells(d,i,d.answer[i]).reverse())))))return clone(d.answer);
    const count = d.pieces.length, empty = Array(count).fill(null); let nodes = 0, answer = null;
    const variants = d.pieces.map(piece => {
      const out = [], seen = new Set();
      for (let rotation = 0; rotation < 4; rotation++) for (const path of [piece.cells.map(p => rotate(p, rotation)), piece.cells.map(p => rotate(p, rotation)).reverse()]) {
        const normalized = path.map(p => ({ x: p.x - path[0].x, y: p.y - path[0].y })), k = JSON.stringify(normalized);
        if (!seen.has(k)) { seen.add(k); out.push({ rotation, path }); }
      } return out;
    });
    function visit(head, used, occupied, placements) {
      if (answer || ++nodes > maxNodes) return;
      if (same(head, d.goal)) { if (d.checkpoints.every(p => occupied.has(key(p)))) answer = placements; return; }
      for (let i = 0; i < count; i++) if (!used.has(i)) for (const { rotation, path } of variants[i]) {
        const placement = { origin: { x: head.x - path[0].x, y: head.y - path[0].y }, rotation };
        const points = path.map(p => ({ x: p.x + placement.origin.x, y: p.y + placement.origin.y }));
        if (fixed[i]) {
          const existing = cells(d, i, fixed[i]);
          if (JSON.stringify(points) !== JSON.stringify(existing) && JSON.stringify(points) !== JSON.stringify([...existing].reverse())) continue;
        }
        if (!points.every(p => inside(d, p)) || points.slice(1).some(p => occupied.has(key(p))) || points.slice(1, -1).some(p => same(p, d.goal))) continue;
        const preview = placements.map((p, j) => p || fixed[j]);
        if (!canPlace(d, preview, i, placement)) continue;
        const next = [...placements]; next[i] = fixed[i] || placement;
        visit(points.at(-1), new Set([...used, i]), new Set([...occupied, ...points.slice(1).map(key)]), next);
        if (answer) return;
      }
    }
    visit(d.start, new Set(), new Set([key(d.start)]), empty); return answer;
  }
  function neighbors(i, side, cube) {
    const x = i % side, y = Math.floor(i / side) % side, z = Math.floor(i / (side * side));
    return [[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0], ...(cube ? [[0,0,1],[0,0,-1]] : [])].map(([a,b,c]) => [x+a,y+b,z+c]).filter(([a,b,c]) => a>=0 && a<side && b>=0 && b<side && c>=0 && c<(cube?side:1)).map(([a,b,c]) => c*side*side+b*side+a);
  }
  function lightsSolution(state) {
    const n = state.cells.length, rows = Array.from({length:n}, (_, i) => [...Array.from({length:n}, (_, j) => Number(neighbors(j, state.side, state.topic === 'cube').includes(i))), Number(state.cells[i])]);
    const pivots = []; let r = 0;
    for (let c = 0; c < n; c++) {
      const pivot = rows.findIndex((row, i) => i >= r && row[c]); if (pivot < 0) continue;
      [rows[r], rows[pivot]] = [rows[pivot], rows[r]];
      for (let k = 0; k < n; k++) if (k !== r && rows[k][c]) for (let j = c; j <= n; j++) rows[k][j] ^= rows[r][j];
      pivots.push(c); r++;
    }
    if (rows.some(row => row.slice(0,n).every(v => !v) && row[n])) return null;
    const free = Array.from({length:n},(_,i)=>i).filter(i=>!pivots.includes(i)); let best = null;
    for (let mask=0; mask<2**free.length; mask++) {
      const solution=Array(n).fill(0); free.forEach((c,i)=>{solution[c]=(mask>>i)&1;});
      pivots.forEach((c,i)=>{solution[c]=rows[i][n]; for (const j of free) solution[c]^=rows[i][j]&solution[j];});
      const answer=solution.map((v,i)=>v?i:-1).filter(i=>i>=0); if (!best || answer.length<best.length) best=answer;
    } return best;
  }
  function safe(mask, right, difficulty) {
    const alone = right ? 31 ^ mask : mask, {pairs}=riverRules(difficulty);
    return !pairs.some(([a,b]) => alone&(1<<a) && alone&(1<<b)) && !(alone&16 && alone.toString(2).replace(/0/g,'').length===2);
  }
  function riverTransition(mask, right, passenger, difficulty) {
    if (passenger !== null && (!Number.isInteger(passenger) || passenger < 0 || passenger > 4 || Boolean(mask&(1<<passenger))!==right)) return null;
    if (!right && riverRules(difficulty).before.some(([first,second])=>passenger===second&&!(mask&(1<<first)))) return null;
    const next = passenger===null ? mask : mask^(1<<passenger); return safe(next,!right,difficulty) ? {mask:next,right:!right} : null;
  }
  function riverSolution(s) {
    const queue=[{mask:s.mask,right:s.right,path:[]}], visited=new Set([s.mask*2+Number(s.right)]); let head=0;
    while (head<queue.length) {
      const item=queue[head++]; if(item.mask===31 && item.right) return item.path;
      for (const passenger of [null,0,1,2,3,4]) {
        const next=riverTransition(item.mask,item.right,passenger,s.difficulty); if(!next) continue;
        const k=next.mask*2+Number(next.right); if(visited.has(k)) continue; visited.add(k); queue.push({...next,path:[...item.path,passenger]});
      }
    } return null;
  }
  function newPuzzle(topic, difficulty, catalog, previous, random=Math.random) {
    difficulty=Number.isInteger(difficulty)&&difficulties[difficulty]?difficulty:0;
    if(![...topics,'mix'].includes(topic))topic='mix';
    if(topic==='mix') {const available=topics.filter(t=>t!==previous?.topic);topic=available[Math.floor(random()*available.length)];}
    if(quiz.isQuiz(topic))return quiz.create(topic,difficulty,previous,random);
    const s={version:2,topic,difficulty,moves:0,message:'',hint:null,won:false};
    if(topic==='lights'||topic==='cube') {
      const level=difficulties[difficulty];s.side=topic==='lights'?level.lightsSide:level.cubeSide;
      const size=s.side**(topic==='cube'?3:2),count=topic==='lights'?level.lightsMoves:level.cubeMoves;
      const minimum=(topic==='lights'?[2,4,5,7,9,12]:[2,3,4,6,8,12])[difficulty];
      let best=[],bestLength=-1;
      for(let attempt=0;attempt<32;attempt++){
        s.cells=Array(size).fill(false);const available=s.cells.map((_,i)=>i);
        for(let n=0;n<count;n++){
          const i=available.splice(Math.floor(random()*available.length),1)[0];
          for(const j of neighbors(i,s.side,topic==='cube'))s.cells[j]=!s.cells[j];
        }
        const length=lightsSolution(s).length;
        if(length>bestLength){best=s.cells;bestLength=length;}
        if(length>=minimum)break;
      }
      s.cells=best;
      if(!s.cells.some(Boolean))for(const j of neighbors(0,s.side,topic==='cube'))s.cells[j]=!s.cells[j];
    } else if(topic==='river') Object.assign(s,{mask:0,right:false,selected:null});
    else {
      const options=catalog[String(difficulty)]; let index=Math.floor(random()*options.length);
      if(previous?.topic==='tracks' && previous.difficulty===difficulty && index===previous.index) index=(index+1)%options.length;
      Object.assign(s,{index,placements:Array(options[index].pieces.length).fill(null),rotations:Array(options[index].pieces.length).fill(0),selected:0,history:[]});
    } return s;
  }
  function isSolved(s,catalog) { if(quiz.isQuiz(s.topic))return s.reviewed; if(s.topic==='tracks') return Boolean(s.won && routeReady(catalog[s.difficulty][s.index],s.placements)); if(s.topic==='river') return s.mask===31&&s.right; return !s.cells.some(Boolean); }
  function remember(s) { s.history.push({placements:clone(s.placements),rotations:[...s.rotations],moves:s.moves}); if(s.history.length>100) s.history.shift(); }
  function action(previous,a,catalog) {
    const s=clone(previous); if(!a||typeof a.type!=='string'||isSolved(s,catalog)) return s;
    s.message=''; s.hint=null;
    if(quiz.isQuiz(s.topic))return quiz.action(s,a);
    if((s.topic==='lights'||s.topic==='cube') && a.type==='press' && Number.isInteger(a.index) && a.index>=0 && a.index<s.cells.length) { for(const i of neighbors(a.index,s.side,s.topic==='cube')) s.cells[i]=!s.cells[i]; s.moves++; }
    if(s.topic==='river') {
      if(a.type==='select' && Number.isInteger(a.index) && a.index>=0 && a.index<5 && Boolean(s.mask&(1<<a.index))===s.right) s.selected=s.selected===a.index?null:a.index;
      if(a.type==='cross') {
        const next=riverTransition(s.mask,s.right,s.selected,s.difficulty);
        if(next) { Object.assign(s,next); s.selected=null; s.moves++; }
        else {const order=!s.right&&riverRules(s.difficulty).before.find(([first,second])=>s.selected===second&&!(s.mask&(1<<first)));s.message=order?`${names[order[0]]} must cross before ${names[order[1]]}.`:'That leaves rivals alone, or one model alone with Gemini.';}
      }
    }
    if(s.topic==='tracks') {
      const d=catalog[s.difficulty][s.index];let i=s.selected;
      if((a.type==='place'||a.type==='remove')&&a.index!==undefined){
        if(!Number.isInteger(a.index)||a.index<0||a.index>=d.pieces.length)return s;
        i=a.index;s.selected=i;
      }
      if(a.type==='select' && Number.isInteger(a.index) && a.index>=0 && a.index<d.pieces.length) s.selected=a.index;
      if(a.type==='place' && i!==null) {
        const placement={origin:{x:a.x,y:a.y},rotation:a.rotation===undefined?s.rotations[i]:a.rotation};
        if(canPlace(d,s.placements,i,placement)) { if(JSON.stringify(placement)!==JSON.stringify(s.placements[i])) {remember(s);s.placements[i]=placement;s.rotations[i]=placement.rotation;s.moves++;} }
        else s.message='That piece does not fit here.';
      }
      if(a.type==='rotate' && i!==null) {
        const rotation=(s.rotations[i]+1)%4, placement=s.placements[i] ? {...s.placements[i],rotation}:null;
        if(!placement||canPlace(d,s.placements,i,placement)) {remember(s);s.rotations[i]=rotation;if(placement)s.placements[i]=placement;s.moves++;}
        else s.message='Return this piece to the tray to rotate it.';
      }
      if(a.type==='remove' && i!==null && s.placements[i]) {remember(s);s.placements[i]=null;s.moves++;}
      if(a.type==='undo' && s.history.length) Object.assign(s,s.history.pop());
      if(a.type==='go') {if(routeReady(d,s.placements)) s.won=true;else s.message='Connect the robot to the flag through every dot.';}
    }
    if(a.type==='hint') {
      if(s.topic==='lights'||s.topic==='cube') {const next=lightsSolution(s)?.[0];s.hint={index:next};s.message='Try the highlighted light.';}
      if(s.topic==='river') {const solution=riverSolution(s);if(solution?.length){s.selected=solution[0];s.message=s.selected===null?'Cross with an empty boat.':`Take ${names[s.selected]} across.`;}}
      if(s.topic==='tracks') {
        const d=catalog[s.difficulty][s.index], solution=trackSolution(d,s.placements);
        if(solution) {
          const i=solution.findIndex((p,j)=>p&&!s.placements[j]);
          if(i>=0){s.selected=i;s.hint={piece:i,placement:solution[i]};s.message=`Place piece ${i+1} on the highlighted anchor, facing the preview.`;}
          else s.message='The route is ready. Press Check.';
        } else s.message='Move a placed piece back to the tray and try again.';
      }
    }
    return s;
  }
  function restore(raw,catalog) {
    try {
      if(!raw||![1,2].includes(raw.version)||!topics.includes(raw.topic)||!Number.isInteger(raw.difficulty)||!difficulties[raw.difficulty]||(raw.version===1&&raw.difficulty>2)||!Number.isInteger(raw.moves)||raw.moves<0) return null;
      const s=clone(raw);s.message='';s.hint=null;
      if(quiz.isQuiz(s.topic))return quiz.restore(s);
      if(s.topic==='lights'||s.topic==='cube') {
        const level=difficulties[s.difficulty],legacy=s.version===1||s.legacyLayout===true;
        const side=legacy?(s.topic==='lights'?3:s.difficulty===0?2:3):(s.topic==='lights'?level.lightsSide:level.cubeSide);
        if(legacy&&s.difficulty>2)return null;
        if(s.side!==side||!Array.isArray(s.cells)||s.cells.length!==side**(s.topic==='cube'?3:2)||!s.cells.every(v=>typeof v==='boolean')||!lightsSolution(s))return null;
        if(legacy)s.legacyLayout=true;
      }
      if(s.topic==='river') {if(!Number.isInteger(s.mask)||s.mask<0||s.mask>31||typeof s.right!=='boolean'||!safe(s.mask,s.right,s.difficulty)||!riverSolution(s))return null;if(s.selected!==null&&(!Number.isInteger(s.selected)||s.selected<0||s.selected>4||Boolean(s.mask&(1<<s.selected))!==s.right))s.selected=null;}
      if(s.topic==='tracks') {
        if(!Number.isInteger(s.index))return null;const d=catalog[s.difficulty]?.[s.index];if(!d||!Array.isArray(s.placements)||s.placements.length!==d.pieces.length||!Array.isArray(s.rotations)||s.rotations.length!==d.pieces.length||!s.rotations.every(v=>Number.isInteger(v)&&v>=0&&v<4))return null;
        const placed=Array(d.pieces.length).fill(null);
        for(let i=0;i<placed.length;i++)if(s.placements[i]) {if(s.placements[i].rotation!==s.rotations[i]||!canPlace(d,placed,i,s.placements[i]))return null;placed[i]=s.placements[i];}
        if(!Number.isInteger(s.selected)||s.selected<0||s.selected>=d.pieces.length)s.selected=0;
        s.history=[];s.won=Boolean(s.won&&routeReady(d,placed));
      }
      s.version=2;return s;
    }catch{return null;}
  }
  return {quiz,topics,names,difficulties,normalizeDifficulty,difficultyIndex,riverRules,newPuzzle,action,restore,isSolved,neighbors,lightsSolution,riverTransition,riverSolution,safe,cells,canPlace,route,routeReady,trackSolution,rotate};
});
