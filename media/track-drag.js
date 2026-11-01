(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./puzzles.js'):root.ThinkmaxxPuzzles);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ThinkmaxxTrackDrag=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const contains=(point,rect)=>point.x>=rect.left&&point.y>=rect.top&&point.x<rect.left+rect.width&&point.y<rect.top+rect.height;
  function bounds(piece,rotation){
    const points=piece.cells.map(p=>P.rotate(p,rotation));
    return{points,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
  }
  function nearest(piece,rotation,point){
    let answer=0,distance=Infinity;
    piece.cells.forEach((p,i)=>{const q=P.rotate(p,rotation),d=(q.x-point.x)**2+(q.y-point.y)**2;if(d<distance){answer=i;distance=d;}});
    return answer;
  }
  function placementAt(piece,rotation,grabIndex,point,rect,side,offset={x:0,y:0}){
    const grabbed=P.rotate(piece.cells[grabIndex],rotation);
    return{origin:{x:Math.round((point.x-rect.left)/rect.width*side-.5-offset.x)-grabbed.x,y:Math.round((point.y-rect.top)/rect.height*side-.5-offset.y)-grabbed.y},rotation};
  }
  function attach({root,read,shape,finish}){
    const doc=root.ownerDocument,win=doc.defaultView,ns='http://www.w3.org/2000/svg';
    let drag=null,frame=0,suppressUntil=0;
    const position=e=>({x:e.clientX,y:e.clientY});
    function gridRect(){
      const grid=root.querySelector('.track-grid');if(!grid)return null;
      const rect=grid.getBoundingClientRect();return{left:rect.left+grid.clientLeft,top:rect.top+grid.clientTop,width:grid.clientWidth,height:grid.clientHeight};
    }
    function trayGrip(button,piece,rotation,point){
      const svg=button.querySelector('svg'),rect=svg.getBoundingClientRect(),b=bounds(piece,rotation);
      const width=(b.maxX-b.minX)*22+24,height=(b.maxY-b.minY)*22+24,scale=Math.min(rect.width/width,rect.height/height);
      const p={x:((point.x-rect.left-(rect.width-width*scale)/2)/scale-12)/22+b.minX,y:((point.y-rect.top-(rect.height-height*scale)/2)/scale-12)/22+b.minY};
      const grabIndex=nearest(piece,rotation,p),q=P.rotate(piece.cells[grabIndex],rotation);
      const close=contains(point,rect)&&Math.hypot(p.x-q.x,p.y-q.y)<.75;
      return{grabIndex,offset:close?{x:p.x-q.x,y:p.y-q.y}:{x:0,y:0}};
    }
    function down(e){
      if(drag||e.button!==0||e.isPrimary===false)return;
      const data=read(),s=data?.puzzle;if(s?.topic!=='tracks'||s.won)return;
      const d=data.catalog[s.difficulty][s.index],point=position(e),button=e.target.closest?.('.piece'),cell=e.target.closest?.('.track-cell');
      let index,grip;
      if(button){index=Number(button.dataset.index);grip=trayGrip(button,d.pieces[index],s.rotations[index],point);}
      else if(cell){
        const x=Number(cell.dataset.x),y=Number(cell.dataset.y);
        const candidates=s.placements.map((p,i)=>p&&P.cells(d,i,p).some(q=>q.x===x&&q.y===y)?i:-1).filter(i=>i>=0);
        if(!candidates.length)return;
        index=candidates.includes(s.selected)?s.selected:candidates[0];
        const rect=gridRect(),grabIndex=P.cells(d,index,s.placements[index]).findIndex(p=>p.x===x&&p.y===y);
        grip={grabIndex,offset:{x:(point.x-rect.left)/rect.width*d.side-.5-x,y:(point.y-rect.top)/rect.height*d.side-.5-y}};
      }else return;
      if(!Number.isInteger(index)||!d.pieces[index])return;
      drag={id:e.pointerId,index,d,piece:d.pieces[index],rotation:s.rotations[index],...grip,start:point,point,active:false,placed:Boolean(s.placements[index]),placement:null,valid:false,overTray:false};
    }
    function activate(){
      drag.active=true;root.classList.add('dragging-track');
      root.querySelector(`.piece[data-index="${drag.index}"]`)?.classList.add('drag-source');
      root.querySelector(`.rails .rail-${drag.index}`)?.classList.add('drag-source');
      drag.float=doc.createElement('div');drag.float.className=`track-drag-float rail-${drag.index}`;drag.float.setAttribute('aria-hidden','true');doc.body.appendChild(drag.float);
      drag.overlay=doc.createElementNS(ns,'svg');drag.overlay.classList.add('drag-placement',`rail-${drag.index}`);drag.overlay.setAttribute('aria-hidden','true');drag.overlay.setAttribute('viewBox',`0 0 ${drag.d.side*40} ${drag.d.side*40}`);
      drag.path=doc.createElementNS(ns,'polyline');drag.overlay.appendChild(drag.path);root.querySelector('.track-board').appendChild(drag.overlay);
      try{root.setPointerCapture(drag.id);}catch{}
      drawShape();frame=win.requestAnimationFrame(scrollFrame);
    }
    function drawShape(){drag.float.innerHTML=shape(drag.piece,drag.rotation,`rail-${drag.index}`);}
    function update(){
      if(!drag?.active)return;
      const rect=gridRect();if(!rect)return;
      const point=drag.point,overBoard=contains(point,rect),tray=root.querySelector('.tray');
      drag.overTray=Boolean(tray&&contains(point,tray.getBoundingClientRect()));
      tray?.classList.toggle('drop-target',drag.overTray&&drag.placed);
      const b=bounds(drag.piece,drag.rotation),cell=rect.width/drag.d.side,scale=cell/22,grabbed=P.rotate(drag.piece.cells[drag.grabIndex],drag.rotation);
      drag.float.style.width=`${((b.maxX-b.minX)*22+24)*scale}px`;drag.float.style.height=`${((b.maxY-b.minY)*22+24)*scale}px`;
      drag.float.style.transform=`translate(${point.x-(grabbed.x-b.minX+drag.offset.x)*cell-12*scale}px,${point.y-(grabbed.y-b.minY+drag.offset.y)*cell-12*scale}px)`;
      drag.float.hidden=overBoard;drag.overlay.hidden=!overBoard;
      for(const cell of root.querySelectorAll('.drop-valid,.drop-invalid'))cell.classList.remove('drop-valid','drop-invalid');
      drag.placement=overBoard?placementAt(drag.piece,drag.rotation,drag.grabIndex,point,rect,drag.d.side,drag.offset):null;
      drag.valid=Boolean(drag.placement&&P.canPlace(drag.d,read().puzzle.placements,drag.index,drag.placement));
      if(drag.placement){
        const points=P.cells(drag.d,drag.index,drag.placement);
        drag.path.setAttribute('points',points.map(p=>`${p.x*40+20},${p.y*40+20}`).join(' '));
        drag.overlay.classList.toggle('invalid',!drag.valid);
        for(const p of points)root.querySelector(`.track-cell[data-x="${p.x}"][data-y="${p.y}"]`)?.classList.add(drag.valid?'drop-valid':'drop-invalid');
      }
    }
    function scrollFrame(){
      if(!drag?.active)return;
      const y=drag.point.y,margin=42,speed=y<margin?-Math.min(14,Math.ceil((margin-y)/3)):y>win.innerHeight-margin?Math.min(14,Math.ceil((y-win.innerHeight+margin)/3)):0;
      if(speed){win.scrollBy({top:speed,behavior:'instant'});update();}
      frame=win.requestAnimationFrame(scrollFrame);
    }
    function move(e){
      if(!drag||e.pointerId!==drag.id)return;
      drag.point=position(e);
      if(!drag.active&&Math.hypot(drag.point.x-drag.start.x,drag.point.y-drag.start.y)>=5)activate();
      if(drag.active){e.preventDefault();update();}
    }
    function clear(){
      const prior=drag;drag=null;win.cancelAnimationFrame(frame);frame=0;
      prior?.float?.remove();prior?.overlay?.remove();root.classList.remove('dragging-track');
      for(const el of root.querySelectorAll('.drag-source,.drop-target,.drop-valid,.drop-invalid'))el.classList.remove('drag-source','drop-target','drop-valid','drop-invalid');
      if(prior)try{if(root.hasPointerCapture(prior.id))root.releasePointerCapture(prior.id);}catch{}
      return prior;
    }
    function up(e){
      if(!drag||e.pointerId!==drag.id)return;
      drag.point=position(e);if(drag.active)update();
      const d=drag;let action=null;
      if(d.active){
        e.preventDefault();suppressUntil=Date.now()+400;
        if(d.overTray&&d.placed)action={type:'remove',index:d.index};
        else if(d.placement)action={type:'place',index:d.index,rotation:d.rotation,x:d.placement.origin.x,y:d.placement.origin.y};
      }else{suppressUntil=Date.now()+400;action={type:'select',index:d.index};}
      clear();finish(action,{invalid:Boolean(d.active&&d.placement&&!d.valid&&!d.overTray)});
    }
    function cancel(){if(!drag)return;if(drag.active)suppressUntil=Date.now()+400;clear();finish(null,{cancelled:true});}
    function key(e){
      if(!drag)return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();}
      else if(drag.active&&e.key.toLowerCase()==='r'&&!e.ctrlKey&&!e.metaKey){e.preventDefault();e.stopImmediatePropagation();drag.rotation=(drag.rotation+(e.shiftKey?3:1))%4;drawShape();update();}
    }
    function click(e){if(e.detail&&Date.now()<suppressUntil){suppressUntil=0;e.preventDefault();e.stopImmediatePropagation();}}
    function nativeDrag(e){if(e.target.closest?.('.piece,.track-cell'))e.preventDefault();}
    root.addEventListener('pointerdown',down);root.addEventListener('dragstart',nativeDrag);
    win.addEventListener('pointermove',move,{passive:false});win.addEventListener('pointerup',up);win.addEventListener('pointercancel',cancel);win.addEventListener('blur',cancel);win.addEventListener('keydown',key,true);win.addEventListener('click',click,true);
    return{busy:()=>Boolean(drag),cancel,dispose(){cancel();root.removeEventListener('pointerdown',down);root.removeEventListener('dragstart',nativeDrag);win.removeEventListener('pointermove',move);win.removeEventListener('pointerup',up);win.removeEventListener('pointercancel',cancel);win.removeEventListener('blur',cancel);win.removeEventListener('keydown',key,true);win.removeEventListener('click',click,true);}};
  }
  return{contains,bounds,nearest,placementAt,attach};
});
