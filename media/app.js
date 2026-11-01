'use strict';
const host=typeof acquireVsCodeApi==='function'?acquireVsCodeApi():window.thinkmaxxPreviewHost;
const P=ThinkmaxxPuzzles;
const titles={lights:'Lights',cube:'Lights 3D',river:'AI River',tracks:'Robot Tracks',sums:'Sum Grid',symbols:'Symbol Grid',rotation:'Mental Rotation'};
const instructions={lights:'Turn every light off by toggling each light and its neighbors.',cube:'Turn every light off by toggling connected lights across all layers.',river:'Bring every model across the river without breaking the crossing rules.',tracks:'Connect the robot to the flag through every checkpoint.'};
const app=document.getElementById('app');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const send=(type,data={})=>host.postMessage({type,...data});
const act=action=>send('action',{action});
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let current=null,previousWin=false,lastIdentity='',routeTimer=null,alertIds=new Set(),helpOpen=false,helpTopic='',deferredState=null;


const mark='<svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M0 4h8v4H4v12H0zm8 0h12v4h4v12h-4V8H8zm0 8h8v4h-4v8H8z"/></svg>';
const robot='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11 1h2v4h6v3h3v12h-3v3H5v-3H2V8h3V5h6z"/><path class="robot-face" d="M6 9h12v7H6z"/><path class="robot-eyes" d="M8 10h2v3H8zm6 0h2v3h-2zM8 18h8v2H8z"/></svg>';
const arrow='<span aria-hidden="true">→</span>';
function button(label,action,attrs=''){return `<button type="button" data-action="${action}" ${attrs}>${label}</button>`;}
function puzzleControls(s,catalog){
  const solved=P.isSolved(s,catalog);
  if(solved)return `<div class="footer-controls">${button('Next '+arrow,'next','class="primary"')}</div>`;
  const quiz=P.quiz.isQuiz(s.topic),check=quiz||s.topic==='tracks';
  const ready=quiz?(P.quiz.isGrid(s.topic)?P.quiz.gridStatus(s).complete:s.choice!==null):s.topic==='tracks'&&P.routeReady(catalog[s.difficulty][s.index],s.placements);
  return `<div class="footer-controls">${button('Hint','hint')}${button('Skip '+arrow,'next')}${check?button('Check','submit',`class="primary" ${ready?'':'disabled'}`):''}</div>`;
}
function puzzleHelp(s){
  let content='';
  if(s.topic==='lights')content='<p>Click a light to flip it and the lights directly above, below, left, and right; diagonals do not change. Finish when every light is off.</p>';
  if(s.topic==='cube')content='<p>Click a light to flip it and its adjacent neighbors in the same layer and the layers above and below. Turn all layers off; diagonals do not change.</p>';
  if(s.topic==='tracks')content='<p>Drag a piece from the tray or move it directly on the board; the preview shows where it will fit. Drop it back in the tray to remove it. Pieces may meet only at their ends and cannot cover blocked cells.</p><p>Pass every checkpoint, then press Check; unused pieces are allowed. <kbd>R</kbd> rotates while dragging, <kbd>Shift+R</kbd> rotates back, and <kbd>Esc</kbd> cancels. You can also select a piece and click its white-dot anchor onto the grid; <kbd>Ctrl/Cmd+Z</kbd> undoes.</p>';
  if(s.topic==='sums')content='<p>Fill every empty cell with a positive whole number. Each number on the right is the sum of its row; each number below is the sum of its column. Click a blank and type. Tab moves to the next blank; Backspace clears it. Check validates the whole grid.</p>';
  if(s.topic==='symbols')content='<p>Fill every empty cell. Each row and column must contain each symbol exactly once. Select a cell, then a symbol below the board. Use × on a placed symbol to remove it, or select it and use Clear. Number keys 1–6 choose symbols in palette order; arrow keys move between editable cells. There are no extra box or diagonal rules. Check validates the whole grid.</p>';
  if(s.topic==='rotation')content='<p>Choose the same solid viewed after a 3D rotation. Cubes stay connected in exactly the same way. Mirrored shapes do not count, and no cube may be moved, added or removed. Shading only shows face direction.</p>';

  if(P.quiz.isQuiz(s.topic))content+=P.quiz.isGrid(s.topic)?'<p>Your entries are saved as you work. Correct a cell any time before solving. Why? shows the reasoning after completion; Next generates another puzzle.</p>':'<p>Select an answer, then Check. Why? shows the reasoning after completion. Skip or Next generates a fresh puzzle.</p>';
  if(s.topic==='river'){
    const rules=P.riverRules(s.difficulty);
    content=`<p>The boat carries you and at most one model. Select a model on your bank and press Cross, or cross alone.</p><ul><li>${rules.pairs.map(([a,b])=>`${P.names[a]} + ${P.names[b]}`).join('; ')} cannot stay together without you.</li><li>Gemini cannot stay with just one other model.</li>${rules.before.map(([a,b])=>`<li>${P.names[a]} must be on the finish bank before you take ${P.names[b]} across.</li>`).join('')}</ul>`;
  }
  return `<div id="puzzle-help" class="puzzle-help" role="region" aria-label="How to play ${titles[s.topic]}" ${helpOpen?'':'hidden'}>${content}</div>`;
}
function setHelp(open){
  helpOpen=open;
  const panel=document.getElementById('puzzle-help'),toggle=app.querySelector('[data-action="help"]');
  if(panel)panel.hidden=!open;
  toggle?.setAttribute('aria-expanded',String(open));
}
function pieceSVG(piece,rotation=0,extra=''){
  const points=piece.cells.map(p=>P.rotate(p,rotation)),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
  const xy=p=>`${(p.x-minX)*22+12},${(p.y-minY)*22+12}`;
  return `<svg class="piece-shape ${extra}" viewBox="0 0 ${(maxX-minX)*22+24} ${(maxY-minY)*22+24}" aria-hidden="true"><polyline points="${points.map(xy).join(' ')}"/><circle cx="${(points[0].x-minX)*22+12}" cy="${(points[0].y-minY)*22+12}" r="3"/></svg>`;
}
function lights(s){
  const layer=z=>`<div class="light-grid side-${s.side}">${Array.from({length:s.side*s.side},(_,i)=>{
    const index=z*s.side*s.side+i;
    return `<button type="button" class="bulb ${s.cells[index]?'on':'off'} ${s.hint?.index===index?'hinted':''}" data-action="press" data-index="${index}" aria-label="${s.topic==='cube'?`Layer ${z+1}, `:''}row ${Math.floor(i/s.side)+1}, column ${i%s.side+1}, ${s.cells[index]?'on':'off'}" aria-pressed="${s.cells[index]}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v2h3v9h-3v4H8v-4H5V5h3zM9 21h6M9 10h6m-3-3v6"/></svg></button>`;
  }).join('')}</div>`;
  if(s.topic==='lights')return `<div class="lights-board" aria-label="Lights puzzle">${layer(0)}</div>`;
  return `<div class="cube-board">${Array.from({length:s.side},(_,z)=>`<section class="cube-layer" aria-label="Layer ${z+1}"><span class="layer-label">L${z+1}<span>layer</span></span>${layer(z)}</section>`).join('')}</div>`;
}
const boatSVG='<svg viewBox="0 0 100 78" aria-hidden="true"><g class="boat-person"><circle cx="44" cy="14" r="5"/><path d="M44 20v18m0-12-10 10m10-10 13 8m-13 4-9 5m9-5 9 5"/></g><path class="boat-hull" d="M10 43h80L76 59H24Z"/><path class="boat-oar" d="m55 34 28 28m-6-6 10 10"/></svg>';
function river(s){
  const bank=right=>`<div class="bank ${right?'right-bank':'left-bank'} ${s.right===right?'current-bank':''}"><span class="bank-title">${right?'finish':'start'}</span>${P.names.map((name,i)=>Boolean(s.mask&(1<<i))===right?`<button type="button" class="model model-${i} ${s.selected===i?'selected':''}" data-action="select" data-index="${i}" ${s.right!==right?'disabled':''} aria-pressed="${s.selected===i}"><span class="model-symbol" aria-hidden="true">${['✳','✦','✴','❖','✧'][i]}</span>${name}</button>`:'').join('')}</div>`;
  const waves='<svg class="river-surface" viewBox="0 0 240 320" preserveAspectRatio="none" aria-hidden="true"><path d="M18 34q10-7 20 0t20 0m82 12q10-7 20 0t20 0M60 98q10-7 20 0t20 0m62-15q10-7 20 0t20 0M15 164q10-7 20 0t20 0m65 21q10-7 20 0t20 0M57 242q10-7 20 0t20 0m55-11q10-7 20 0t20 0M18 295q10-7 20 0t20 0m93-5q10-7 20 0t20 0"/></svg>';
  return `<div class="river-board">${bank(false)}<div class="water" role="group" aria-label="River">${waves}<span class="boat ${s.right?'at-right':'at-left'}" role="img" aria-label="You in a boat at the ${s.right?'finish':'start'} bank">${boatSVG}<span class="boat-label">you</span></span></div>${bank(true)}</div><div class="cross-row">${button('Cross '+(s.selected===null?'alone':`with ${P.names[s.selected]}`)+' '+arrow,'cross','class="primary"')}</div>`;
}
function tracks(s,catalog){
  const d=catalog[s.difficulty][s.index],side=d.side;
  const line=(points,cls)=>`<polyline class="${cls}" points="${points.map(p=>`${p.x*40+20},${p.y*40+20}`).join(' ')}"/>`;
  const pieces=s.placements.map((p,i)=>p?line(P.cells(d,i,p),`rail rail-${i} ${s.selected===i?'selected-rail':''}`):'').join('');
  const hint=s.hint?.placement?line(P.cells(d,s.hint.piece,s.hint.placement),'ghost-rail'):'';
  const selected=s.selected;
  const occupied=new Set(s.placements.flatMap((p,i)=>p?P.cells(d,i,p).map(q=>`${q.x},${q.y}`):[]));
  const grid=Array.from({length:side*side},(_,i)=>{
    const p={x:i%side,y:Math.floor(i/side)},blocked=d.blocked.some(q=>q.x===p.x&&q.y===p.y),start=d.start.x===p.x&&d.start.y===p.y,goal=d.goal.x===p.x&&d.goal.y===p.y,checkpoint=d.checkpoints.some(q=>q.x===p.x&&q.y===p.y);
    const anchor=s.hint?.placement?.origin.x===p.x&&s.hint?.placement?.origin.y===p.y;
    return `<button type="button" class="track-cell ${blocked?'blocked':''} ${occupied.has(`${p.x},${p.y}`)?'occupied':''} ${anchor?'hinted':''} ${start?'start-cell':''} ${goal?'goal-cell':''}" data-action="place" data-x="${p.x}" data-y="${p.y}" ${blocked?'disabled':''} aria-label="Row ${p.y+1}, column ${p.x+1}${blocked?', blocked':start?', robot':goal?', flag':checkpoint?', checkpoint':''}">${blocked?'<span aria-hidden="true">×</span>':start?`<span class="robot" aria-hidden="true">${robot}</span>`:goal?'<span class="flag" aria-hidden="true">⚑</span>':checkpoint?'<span class="checkpoint" aria-hidden="true">◆</span>':''}</button>`;
  }).join('');
  const anchor=selected!==null&&s.placements[selected]?`<rect class="placement-anchor" x="${s.placements[selected].origin.x*40+16}" y="${s.placements[selected].origin.y*40+16}" width="8" height="8"/>`:'';
  return `<div class="tracks-layout"><div class="track-board side-${side}"><div class="track-grid side-${side}">${grid}</div><svg class="rails" viewBox="0 0 ${side*40} ${side*40}" aria-hidden="true">${pieces}${hint}${anchor}</svg></div><div class="tray" aria-label="Track pieces">${d.pieces.map((piece,i)=>`<button type="button" class="piece ${selected===i?'selected':''} ${s.placements[i]?'placed':''}" data-action="select" data-index="${i}" aria-label="Piece ${i+1}, ${s.placements[i]?'placed':'in tray'}, rotated ${s.rotations[i]*90} degrees" aria-pressed="${selected===i}"><span class="piece-number">${String(i+1).padStart(2,'0')}</span>${pieceSVG(piece,s.rotations[i],`rail-${i}`)}</button>`).join('')}</div><div class="track-controls">${button('Rotate ↻','rotate','title="Rotate selected piece (R)"')}${button('To tray','remove',selected===null||!s.placements[selected]?'disabled':'')}${button('Undo','undo',!s.history.length?'disabled':'')}</div>${s.hint?.placement?`<div class="hint-preview">${pieceSVG(d.pieces[s.hint.piece],s.hint.placement.rotation)}<span>White dot = placement anchor</span></div>`:''}</div>`;
}
const symbolNames=['','circle','triangle','square','diamond','plus','star'];
function symbolSVG(value){
  const shapes=['','<circle cx="12" cy="12" r="7"/>','<path d="M12 3 22 21H2Z"/>','<path d="M5 5h14v14H5Z"/>','<path d="m12 2 10 10-10 10L2 12Z"/>','<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7Z"/>','<path d="m12 1 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z"/>'];
  return `<svg class="logic-symbol symbol-${value}" viewBox="0 0 24 24" role="img" aria-label="${symbolNames[value]}">${shapes[value]}</svg>`;
}
function solidGeometry(points){
  const project=([x,y,z])=>[(x-y)*18,(x+y)*9-z*20],vertices=points.flatMap(([x,y,z])=>[0,1].flatMap(a=>[0,1].flatMap(b=>[0,1].map(c=>project([x+a,y+b,z+c])))));
  const minX=Math.min(...vertices.map(p=>p[0])),maxX=Math.max(...vertices.map(p=>p[0])),minY=Math.min(...vertices.map(p=>p[1])),maxY=Math.max(...vertices.map(p=>p[1]));
  return {project,cx:(minX+maxX)/2,cy:(minY+maxY)/2,width:maxX-minX,height:maxY-minY};
}
function solidSVG(points,scale,label){
  const g=solidGeometry(points),occupied=new Set(points.map(p=>p.join(',')));
  const polygon=(vertices,face)=>`<polygon class="solid-${face}" points="${vertices.map(g.project).map(p=>p.join(',')).join(' ')}"/>`;
  const faces=[...points].sort((a,b)=>a.reduce((x,y)=>x+y,0)-b.reduce((x,y)=>x+y,0)).map(([x,y,z])=>[
    !occupied.has([x+1,y,z].join(','))?polygon([[x+1,y,z],[x+1,y+1,z],[x+1,y+1,z+1],[x+1,y,z+1]],'right'):'',
    !occupied.has([x,y+1,z].join(','))?polygon([[x,y+1,z],[x+1,y+1,z],[x+1,y+1,z+1],[x,y+1,z+1]],'left'):'',
    !occupied.has([x,y,z+1].join(','))?polygon([[x,y,z+1],[x+1,y,z+1],[x+1,y+1,z+1],[x,y+1,z+1]],'top'):''
  ].join('')).join('');
  return `<svg class="solid-view" viewBox="0 0 240 180" role="img" aria-label="${escape(label)}"><g transform="translate(120 90) scale(${scale}) translate(${-g.cx} ${-g.cy})">${faces}</g></svg>`;
}
function solidScale(q){const sizes=[q.model.source,...Object.values(q.model.options)].map(solidGeometry);return Math.min(1,210/Math.max(...sizes.map(g=>g.width)),160/Math.max(...sizes.map(g=>g.height)));}
function quizVisual(s,q,reveal=false){
  if(s.topic==='rotation')return `<div class="solid-reference">${solidSVG(q.model.source,solidScale(q),'Reference solid')}</div>`;
  const m=q.model,n=m.n,status=P.quiz.gridStatus(s);
  const cell=i=>{
    const given=Boolean(m.board[i]),value=reveal?m.solution[i]:status.values[i],label=`Row ${Math.floor(i/n)+1}, column ${i%n+1}`;
    const conflict=s.checked&&!s.reviewed&&(status.rows[Math.floor(i/n)]||status.cols[i%n]);
    let content;
    if(given||reveal)content=s.topic==='symbols'?symbolSVG(value):value;
    else if(s.topic==='sums')content=`<input id="grid-cell-${i}" class="sum-entry" data-grid-index="${i}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" spellcheck="false" aria-label="${label}" value="${value||''}" ${s.reviewed?'readonly':''}>`;
    else content=button(value?symbolSVG(value):'·','gridSelect',`id="grid-cell-${i}" data-index="${i}" class="symbol-entry ${s.active===i?'active-entry':''}" aria-label="${label}, ${value?symbolNames[value]:'empty'}" aria-pressed="${s.active===i}" ${s.reviewed?'disabled':''}`)+(value&&!s.reviewed?button('×','clearSymbol',`data-index="${i}" class="remove-symbol" aria-label="Remove ${symbolNames[value]} from ${label}" title="Remove symbol"`):'');
    return `<td class="${given?'given-cell':'editable-cell'} ${conflict?'grid-conflict':''}">${content}</td>`;
  };
  return `<div class="numeric-board-wrap"><table class="numeric-board n-${n}" aria-label="${s.topic==='sums'?'Fill every blank to match the row and column totals':'Fill every blank with one of each symbol per row and column'}"><tbody>${Array.from({length:n},(_,r)=>`<tr>${Array.from({length:n},(_,c)=>cell(r*n+c)).join('')}${s.topic==='sums'?`<th class="edge-total ${s.checked&&status.rows[r]?'invalid-total':''}" scope="row" aria-label="Row ${r+1} total ${m.rowSums[r]}">${m.rowSums[r]}</th>`:''}</tr>`).join('')}${s.topic==='sums'?`<tr>${m.colSums.map((v,i)=>`<th class="edge-total bottom-total ${s.checked&&status.cols[i]?'invalid-total':''}" scope="col" aria-label="Column ${i+1} total ${v}">${v}</th>`).join('')}<td class="sum-corner">Σ</td></tr>`:''}</tbody></table></div>${s.topic==='symbols'&&!reveal?`<div class="grid-symbol-tools" role="group" aria-label="Choose a symbol for the selected cell">${Array.from({length:n},(_,i)=>button(symbolSVG(i+1),'gridValue',`data-value="${i+1}" aria-label="${symbolNames[i+1]} (${i+1})" ${s.reviewed?'disabled':''}`)).join('')}${button('Clear','gridValue',`data-value="0" aria-label="Clear selected cell" ${s.reviewed||!s.entries[s.active]?'disabled':''}`)}</div>`:''}`;
}
function quizChoice(s,q,text){
  if(s.topic==='rotation')return `<span class="solid-option-label">${text}</span>${solidSVG(q.model.options[text],solidScale(q),`Solid ${text}`)}`;
  if(s.topic==='symbols')return symbolSVG(Number(text));
  return escape(text);
}
function rotationExplanation(q){
  const answer=q.choices[q.correct];
  return `<div class="rotation-inspector"><div class="rotation-comparison"><div><span>Reference</span>${solidSVG(q.model.source,solidScale(q),'Reference solid')}</div><div><span>Match ${answer}</span>${solidSVG(q.model.options[answer],solidScale(q),`Correct solid ${answer}`)}</div></div><svg id="rotation-live" class="rotation-live" viewBox="0 0 320 240" role="img" tabindex="0" aria-label="Rotating reference solid. Drag or use arrow keys to inspect."></svg><div class="rotation-playback">${button('Play','rotationPlay','aria-pressed="false"')}${button('Start','rotationEndpoint','data-value="0"')}<input id="rotation-progress" type="range" class="rotation-progress" min="0" max="100" value="0" aria-label="Rotation from reference to correct answer">${button('Match','rotationEndpoint','data-value="1"')}</div><div class="rotation-cameras" role="group" aria-label="View solid from different angles">${[['3d','3D'],['front','Front'],['side','Side'],['top','Top']].map(([value,label])=>button(label,'rotationCamera',`data-view="${value}" aria-pressed="${value==='3d'}"`)).join('')}</div></div>`;
}
function quizView(s){
  const q=P.quiz.item(s),grid=P.quiz.isGrid(s.topic),status=grid?P.quiz.gridStatus(s):null,review=s.reviewed,correct=grid?review:s.choice===q.correct;
  return `<section class="challenge quiz quiz-${s.topic}" aria-label="${titles[s.topic]} quiz">
    <div class="title-row"><div class="puzzle-title"><h1>${titles[s.topic]}</h1>${button('?','help',`class="help-toggle" aria-label="How to play ${titles[s.topic]}" title="How to play" aria-controls="puzzle-help" aria-expanded="${helpOpen}"`)}</div></div>
    ${puzzleHelp(s)}
    ${grid?'<p class="instruction">Fill every empty cell.</p>':''}
    ${quizVisual(s,q)}
    ${grid?'':`<fieldset class="quiz-choices"><legend>${escape(q.prompt)}</legend>${q.choices.map((choice,i)=>button(quizChoice(s,q,choice),'choose',`data-index="${i}" class="quiz-choice ${s.choice===i?'chosen':''} ${review&&i===q.correct?'answer-correct':''}" aria-label="${s.topic==='symbols'?symbolNames[Number(choice)]:s.topic==='rotation'?'Solid '+choice:escape(choice)}" aria-pressed="${s.choice===i}" ${review?'disabled':''}`)).join('')}</fieldset>`}
    ${grid&&s.checked&&!review?`<p class="grid-feedback" role="status">${status.complete?'Not quite. Check the highlighted rows and columns.':'Fill the remaining cells.'}</p>`:''}
    ${review?`<div class="quiz-review ${correct?'quiz-success':''}" role="status" aria-live="polite" tabindex="-1">${correct?'<span class="success-check" aria-hidden="true">✓</span>':''}<strong>${correct?'Solved!':'Not quite.'}</strong>${correct?'':`<p>Answer: ${s.topic==='symbols'?symbolSVG(Number(q.choices[q.correct])):escape(q.choices[q.correct])}</p>`}<details class="quiz-explanation ${s.topic==='rotation'?'rotation-explanation':''}"><summary>Why?</summary>${s.topic==='rotation'?rotationExplanation(q):`<p>${escape(q.explanation)}</p>`}</details></div>`:''}
    ${puzzleControls(s,current.catalog)}
    <p class="feedback" role="status" aria-live="polite">${escape(s.message||'')}</p>
  </section>`;
}
function conversations(data){
  const records=data.conversations||[],alerts=records.filter(r=>r.attention);
  const names={working:'thinking',waiting:'needs you',idle:'ready',active:'open',connecting:'connecting',closed:'closed'};
  const alertText={input:'Needs your input',finished:'Reply finished',interrupted:'Interrupted',failed:'Stopped with an error'};
  return `<aside class="agents-panel" aria-label="AI conversations"><div class="agents-heading"><span class="terminal-label">AI terminals</span><span class="agent-count">${String(records.length).padStart(2,'0')}</span></div>${alerts.length?`<div class="attention-list" role="status" aria-live="polite">${alerts.map(r=>`<article class="attention ${r.attention.kind==='input'?'needs-input':''}"><span class="alert-kicker">${escape(r.provider==='claude'?'Claude Code':'Codex')}</span><strong>${escape(alertText[r.attention.kind]||'Needs you')}</strong><span class="alert-label">${escape(r.label)}</span><div class="alert-actions"><button type="button" class="primary" data-action="openChat" data-id="${escape(r.id)}">Open chat ${arrow}</button><button type="button" class="quiet dismiss-alert" data-action="dismissAlert" data-id="${escape(r.id)}" data-alert-id="${escape(r.attention.id)}" aria-label="Dismiss ${escape(r.provider==='claude'?'Claude':'Codex')} alert">×</button></div></article>`).join('')}</div>`:''}
    ${records.length?`<div class="conversation-list">${records.map(r=>`<article class="conversation"><div class="conversation-top"><span class="phase phase-${escape(r.phase)}"><span class="status-dot" aria-hidden="true"></span>${names[r.phase]||'open'}</span><span class="provider-symbol" aria-hidden="true">${r.provider==='claude'?'✳':'⌘'}</span></div><button type="button" class="conversation-link" data-action="openChat" data-id="${escape(r.id)}"><strong>${r.provider==='claude'?'Claude Code':'Codex'}</strong><span>${escape(r.label)}</span><span class="conversation-arrow" aria-hidden="true">↗</span></button>${r.setup||r.setupError?`<p class="connection-note">${escape(r.setupError||r.setup)}</p>`:''}</article>`).join('')}</div>`:`<div class="empty-agents"><p class="empty-status">No AI terminals</p><div class="launch-actions">${button('Start Codex ↗','startCodex')}${button('Start Claude ↗','startClaude')}</div></div>`}
    ${records.some(r=>r.setup||r.setupError)?button('Connect all terminals ↗','connectAlerts','class="quiet connect-alerts"'):''}
    </aside>`;
}
function preferences(data){
  return `<div class="preferences"><label class="topic-control" for="topic"><span class="terminal-label">practice</span><select id="topic">${[['mix','Shuffle'],...Object.entries(titles)].map(([value,label])=>`<option value="${value}" ${value===data.topic?'selected':''}>${label}</option>`).join('')}</select></label><fieldset class="difficulty-control"><legend class="terminal-label">difficulty</legend><div class="difficulty-levels">${P.difficulties.map(d=>button(d.label,'difficulty',`data-value="${d.id}" title="${d.label} difficulty" aria-pressed="${d.id===data.difficulty}" ${d.id===data.difficulty?'class="selected"':''}`)).join('')}</div></fieldset></div>`;
}
function render(data){
  rotationInspector.beforeRender();
  const focused=document.activeElement;
  const focus=app.contains(focused)?{nodeId:focused.id,...focused.dataset,draft:focused.matches('.sum-entry')?focused.value:undefined,start:focused.selectionStart,end:focused.selectionEnd}:null;
  const priorIdentity=current?`${current.puzzle.topic}:${current.puzzle.difficulty}:${current.puzzle.index??current.puzzle.seed??''}`:'';
  const nextAlertIds=new Set((data.conversations||[]).filter(r=>r.attention).map(r=>r.attention.id)),newAlert=[...nextAlertIds].some(id=>!alertIds.has(id));alertIds=nextAlertIds;
  const wasReviewed=current?.puzzle.reviewed;
  current=data;const s=data.puzzle,win=P.isSolved(s,data.catalog),identity=`${s.topic}:${s.difficulty}:${s.index??s.seed??''}`;
  if(helpTopic!==s.topic){helpTopic=s.topic;helpOpen=false;}
  app.innerHTML=`
    <div class="thinkmaxx ${data.focusMode?'focus-mode':''}">
      <header class="app-header">
        <div class="brand">${mark}<span>THINKMAXX</span></div>
        <div class="header-actions">
          ${button(data.focusMode?'Exit focus ↙':'Focus puzzle ↗','makeRoom',`class="outline-button" aria-pressed="${Boolean(data.focusMode)}" title="${data.focusMode?'Restore puzzle view':'Expand puzzle view'}"`)}
          ${button('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 4 3 2 3-1 2 3 3-1 1-3 3-1 1-3-3-2V8l-3-1-1-4z"/><circle cx="12" cy="12" r="3"/></svg>','settings','class="icon-button" title="Settings" aria-label="Settings"')}
        </div>
      </header>
      <div class="workspace">
        <div class="puzzle-space">
          <div class="intro"><p class="terminal-line"><span class="terminal-prompt" aria-hidden="true">&gt;</span><span class="ready-prompt">a moment to think</span></p></div>
          ${preferences(data)}
          ${P.quiz.isQuiz(s.topic)?quizView(s):win?`
            <section class="solved" aria-live="polite">
              <h1>Solved</h1>
              <p>${s.moves} ${s.moves===1?'move':'moves'}</p>
              ${puzzleControls(s,data.catalog)}
            </section>`:`
            <section class="challenge" aria-label="${titles[s.topic]} puzzle">
              <div class="title-row">
                <div class="puzzle-title">
                  <h1>${titles[s.topic]}</h1>
                  ${button('?','help',`class="help-toggle" aria-label="How to play ${titles[s.topic]}" title="How to play" aria-controls="puzzle-help" aria-expanded="${helpOpen}"`)}
                </div>
                <div class="move-count"><span>${String(s.moves).padStart(2,'0')}</span><small>moves</small></div>
              </div>
              <p class="instruction">${instructions[s.topic]}</p>
              ${puzzleHelp(s)}
              <div class="board-stage">${s.topic==='tracks'?tracks(s,data.catalog):s.topic==='river'?river(s):lights(s)}</div>
              ${puzzleControls(s,data.catalog)}
              <p class="feedback" role="status" aria-live="polite">${escape(s.message||'')}</p>
            </section>`}
        </div>
        ${conversations(data)}
      </div>
      <footer class="app-footer">${button('Hide puzzle ↗','hide','class="quiet"')}</footer>
    </div>`;
  rotationInspector.afterRender();
  if(newAlert)window.scrollTo({top:0,behavior:reduced()?'instant':'smooth'});
  if(focus&&priorIdentity===identity){const target=focus.nodeId?document.getElementById(focus.nodeId):[...app.querySelectorAll('button')].find(b=>['action','index','x','y','value','id'].every(key=>b.dataset[key]===focus[key]));if(target&&focus.draft!==undefined&&!s.reviewed){target.value=focus.draft;target.setSelectionRange(focus.start,focus.end);}(target||app.querySelector('.solved .primary'))?.focus({preventScroll:true});}
  if(P.quiz.isQuiz(s.topic)&&s.reviewed&&!wasReviewed)app.querySelector('.quiz-review')?.focus({preventScroll:true});
  if(win&&!previousWin&&identity===lastIdentity&&(!P.quiz.isQuiz(s.topic)||s.choice===P.quiz.item(s).correct))celebrate();previousWin=win;lastIdentity=identity;
}
app.addEventListener('click',e=>{
  const b=e.target.closest('button[data-action]');if(!b||b.disabled)return;const type=b.dataset.action;
  if(type.startsWith('rotation'))return;
  if(['next','reset','hide','settings','makeRoom','connectAlerts'].includes(type))send(type);
  else if(type==='help')setHelp(!helpOpen);
  else if(type==='clearSymbol')act({type:'setCell',index:Number(b.dataset.index),value:0});
  else if(type==='gridValue')act({type:'setCell',index:current.puzzle.active,value:Number(b.dataset.value)});
  else if(type==='difficulty')send('preference',{key:'difficulty',value:b.dataset.value});
  else if(type==='openChat'||type==='dismissAlert')send(type,{id:b.dataset.id,alertId:b.dataset.alertId});
  else if(type==='startCodex'||type==='startClaude')send('start',{provider:type==='startCodex'?'codex':'claude'});
  else act({type:type==='submit'&&current.puzzle.topic==='tracks'?'go':type,index:b.dataset.index===undefined?undefined:Number(b.dataset.index),x:Number(b.dataset.x),y:Number(b.dataset.y)});
});
app.addEventListener('input',e=>{
  const input=e.target;if(!input.matches('.sum-entry'))return;
  const digits=input.value.replace(/[^0-9]/g,'').slice(0,2);if(input.value!==digits)input.value=digits;
  act({type:'setCell',index:Number(input.dataset.gridIndex),value:digits?Number(digits):0});
});
app.addEventListener('change',e=>{if(e.target.id==='topic')send('preference',{key:'topic',value:e.target.value});});
const rotationInspector=ThinkmaxxRotationView.attach({root:app,read:()=>current,quiz:P.quiz,reduced});
const trackDrag=ThinkmaxxTrackDrag.attach({root:app,read:()=>current,shape:pieceSVG,finish(action,info={}){
  if(deferredState){const data=deferredState;deferredState=null;render(data);}
  if(action){render({...current,puzzle:P.action(current.puzzle,action,current.catalog)});act(action);}
  else if(info.invalid&&current)render({...current,puzzle:{...current.puzzle,message:'That piece does not fit here.'}});
}});
document.addEventListener('keydown',e=>{
  if(trackDrag.busy())return;
  if(e.key==='Escape'&&helpOpen){e.preventDefault();setHelp(false);app.querySelector('[data-action="help"]')?.focus({preventScroll:true});return;}
  if(current&&P.quiz.isGrid(current.puzzle.topic)&&!current.puzzle.reviewed){
    const s=current.puzzle,m=P.quiz.item(s).model,insideGrid=e.target.matches('.sum-entry,.symbol-entry,.grid-symbol-tools button');
    if(insideGrid&&s.topic==='symbols'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      if(/^[1-6]$/.test(e.key)&&Number(e.key)<=m.n){e.preventDefault();act({type:'setCell',index:s.active,value:Number(e.key)});return;}
      if(e.key==='Backspace'||e.key==='Delete'){e.preventDefault();act({type:'setCell',index:s.active,value:0});return;}
    }
    if(insideGrid&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();const index=s.topic==='sums'?Number(e.target.dataset.gridIndex):s.active,delta={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];
      let row=Math.floor(index/m.n)+delta[0],col=index%m.n+delta[1];
      while(row>=0&&row<m.n&&col>=0&&col<m.n){const next=row*m.n+col;if(!m.board[next]){if(s.topic==='symbols')act({type:'gridSelect',index:next});document.getElementById(`grid-cell-${next}`)?.focus({preventScroll:true});break;}row+=delta[0];col+=delta[1];}return;
    }
  }
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if(current?.puzzle.topic==='tracks'&&e.key.toLowerCase()==='r'){e.preventDefault();act({type:'rotate'});}
  if(current?.puzzle.topic==='tracks'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();act({type:'undo'});}
});
window.addEventListener('message',e=>{
  if(e.data?.type!=='state')return;
  if(trackDrag.busy()){
    if(JSON.stringify(e.data.puzzle)===JSON.stringify(current.puzzle)){deferredState=e.data;return;}
    deferredState=null;trackDrag.cancel();
  }
  if(routeTimer){clearInterval(routeTimer);routeTimer=null;}
  const data=e.data;
  if(data.puzzle.topic==='tracks'&&data.puzzle.won&&current?.puzzle.topic==='tracks'&&!current.puzzle.won&&!reduced()){animateRoute(data);return;}
  render(data);
});
function animateRoute(data){
  const board=app.querySelector('.track-board');if(!board){render(data);return;}
  const d=data.catalog[data.puzzle.difficulty][data.puzzle.index],route=P.route(d,data.puzzle.placements);
  for(const b of app.querySelectorAll('.challenge button'))b.disabled=true;
  const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.classList.add('robot-runner');overlay.setAttribute('viewBox',`0 0 ${d.side*40} ${d.side*40}`);overlay.setAttribute('aria-hidden','true');
  const runner=document.createElementNS('http://www.w3.org/2000/svg','rect');runner.setAttribute('width','16');runner.setAttribute('height','16');overlay.appendChild(runner);board.appendChild(overlay);
  const start=app.querySelector('.start-cell .robot');if(start)start.hidden=true;
  let i=0;const step=()=>{const p=route[i++];if(!p){clearInterval(routeTimer);routeTimer=null;render(data);return;}runner.setAttribute('x',p.x*40+12);runner.setAttribute('y',p.y*40+12);};step();routeTimer=setInterval(step,Math.min(65,900/route.length));
}
function celebrate(){
  if(reduced())return;
  const box=document.createElement('div');box.className='confetti';box.setAttribute('aria-hidden','true');
  for(let i=0;i<20;i++){const dot=document.createElement('i');dot.className=`confetti-${i%3}`;dot.style.left=`${5+i*4.7}%`;dot.style.animationDelay=`${(i%4)*.06}s`;box.appendChild(dot);}
  app.appendChild(box);setTimeout(()=>box.remove(),1400);
}
send('ready');
