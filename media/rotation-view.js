(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ThinkmaxxRotationView=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
  const transform=(m,p)=>m.map(row=>dot(row,p));
  function normalizedKey(points){const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));return JSON.stringify(points.map(p=>p.map((v,i)=>Math.round((v-min[i])*1e8)/1e8)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]));}
  function alignment(source,target,rotations){
    const key=normalizedKey(target);
    for(const r of rotations){const matrix=r.p.map((axis,i)=>[0,1,2].map(j=>j===axis?r.sign[i]:0));if(normalizedKey(source.map(p=>transform(matrix,p)))===key)return matrix;}
    return null;
  }
  function quaternion(m){
    const trace=m[0][0]+m[1][1]+m[2][2];let q;
    if(trace>0){const t=Math.sqrt(trace+1)*2;q=[(m[2][1]-m[1][2])/t,(m[0][2]-m[2][0])/t,(m[1][0]-m[0][1])/t,t/4];}
    else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]){const t=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2;q=[t/4,(m[0][1]+m[1][0])/t,(m[0][2]+m[2][0])/t,(m[2][1]-m[1][2])/t];}
    else if(m[1][1]>m[2][2]){const t=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2;q=[(m[0][1]+m[1][0])/t,t/4,(m[1][2]+m[2][1])/t,(m[0][2]-m[2][0])/t];}
    else {const t=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2;q=[(m[0][2]+m[2][0])/t,(m[1][2]+m[2][1])/t,t/4,(m[1][0]-m[0][1])/t];}
    q=unit(q);return q[3]<0?q.map(x=>-x):q;
  }
  function interpolate(matrix,t){
    const target=quaternion(matrix),angle=Math.acos(Math.max(-1,Math.min(1,target[3]))),sin=Math.sin(angle);
    const q=angle<1e-8?[0,0,0,1]:target.map((v,i)=>v*Math.sin(t*angle)/sin+(i===3?Math.sin((1-t)*angle)/sin:0));
    const [x,y,z,w]=unit(q);
    return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]];
  }
  function mesh(points){
    const center=[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i]+.5,0)/points.length),occupied=new Set(points.map(p=>p.join(','))),faces=[];
    const definitions=[
      {n:[1,0,0],v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]]},{n:[-1,0,0],v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]]},
      {n:[0,1,0],v:[[0,1,0],[1,1,0],[1,1,1],[0,1,1]]},{n:[0,-1,0],v:[[0,0,0],[0,0,1],[1,0,1],[1,0,0]]},
      {n:[0,0,1],v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]]},{n:[0,0,-1],v:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]}
    ];
    for(const p of points)for(const face of definitions)if(!occupied.has(p.map((v,i)=>v+face.n[i]).join(',')))faces.push({normal:face.n,vertices:face.v.map(v=>v.map((x,i)=>x+p[i]-center[i]))});
    const radius=Math.max(...faces.flatMap(face=>face.vertices.map(p=>Math.hypot(...p))));return {faces,center,radius};
  }
  function camera(yaw=Math.PI/4,pitch=Math.atan(.9/Math.SQRT2)){
    const direction=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)],up=Math.abs(Math.cos(pitch))<1e-6?[0,-1,0]:[0,0,1],right=unit(cross(direction,up)),down=unit(cross(direction,right));return {direction,right,down};
  }
  function projectMesh(solid,matrix,view){
    const scale=105/solid.radius,faces=[];
    for(const face of solid.faces){const normal=transform(matrix,face.normal);if(dot(normal,view.direction)<=1e-7)continue;
      const vertices=face.vertices.map(p=>transform(matrix,p)),depth=vertices.reduce((sum,p)=>sum+dot(p,view.direction),0)/4;
      const light=Math.max(0,Math.min(1,normal[1]*.45+normal[2])),dark=[71,100,123],bright=[180,200,215],color=dark.map((v,i)=>Math.round(v+(bright[i]-v)*light));
      faces.push({depth,color:`rgb(${color.join(',')})`,points:vertices.map(p=>[160+dot(p,view.right)*scale,120+dot(p,view.down)*scale])});
    }
    return faces.sort((a,b)=>a.depth-b.depth);
  }
  function attach({root,read,quiz,reduced}){
    let state=null,frame=0,last=0,drag=null;
    const identity=s=>`${s.topic}:${s.difficulty}:${s.seed}`;
    const details=()=>root.querySelector('.rotation-explanation'),svg=()=>root.querySelector('.rotation-live');
    function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;}
    function paint(){
      const element=svg();if(!element||!state)return;
      const matrix=interpolate(state.matrix,state.progress),view=camera(state.yaw,state.pitch),faces=projectMesh(state.mesh,matrix,view);
      element.innerHTML=faces.map(face=>`<polygon fill="${face.color}" points="${face.points.map(p=>p.map(v=>v.toFixed(3)).join(',')).join(' ')}"/>`).join('');
      element.dataset.progress=String(state.progress);element.dataset.view=state.view;
      const range=root.querySelector('.rotation-progress');if(range)range.value=String(Math.round(state.progress*100));
      const play=root.querySelector('[data-action="rotationPlay"]');if(play){play.textContent=state.playing?'Pause':'Play';play.setAttribute('aria-pressed',String(state.playing));}
      for(const button of root.querySelectorAll('[data-action="rotationCamera"]'))button.setAttribute('aria-pressed',String(button.dataset.view===state.view));
    }
    function tick(now){frame=0;if(!state?.playing||!details()?.open||document.hidden)return;const delta=last?Math.min(100,now-last):0;last=now;state.progress=Math.min(1,state.progress+delta/2800);if(state.progress===1)state.playing=false;paint();if(state.playing)frame=requestAnimationFrame(tick);else last=0;}
    function run(){cancel();if(state?.playing&&details()?.open&&!document.hidden)frame=requestAnimationFrame(tick);}
    function ready(){
      const s=read()?.puzzle;if(s?.topic!=='rotation'||!s.reviewed)return false;
      if(!state||state.id!==identity(s)){
        const q=quiz.item(s),target=q.model.options[q.choices[q.correct]],matrix=alignment(q.model.source,target,quiz.rotations);if(!matrix)return false;
        state={id:identity(s),matrix,mesh:mesh(q.model.source),progress:0,yaw:Math.PI/4,pitch:Math.atan(.9/Math.SQRT2),view:'3d',playing:false,opened:false,open:false};
      }return true;
    }
    function open(){if(!ready())return;state.open=true;if(!state.opened){state.opened=true;state.playing=!reduced();}paint();run();}
    function setView(name){state.view=name;const views={front:[Math.PI/2,0],side:[0,0],top:[0,Math.PI/2],'3d':[Math.PI/4,Math.atan(.9/Math.SQRT2)]};[state.yaw,state.pitch]=views[name]||views['3d'];}
    root.addEventListener('toggle',e=>{if(!e.target.matches('.rotation-explanation'))return;if(e.target.open)open();else {if(state)state.open=false;cancel();}},true);
    root.addEventListener('click',e=>{
      const button=e.target.closest('button[data-action^="rotation"]');if(!button||!ready())return;
      if(button.dataset.action==='rotationPlay'){if(state.progress>=1)state.progress=0;state.playing=!state.playing;if(state.playing)setView('3d');}
      if(button.dataset.action==='rotationEndpoint'){state.playing=false;state.progress=Number(button.dataset.value);setView('3d');}
      if(button.dataset.action==='rotationCamera'){state.playing=false;setView(button.dataset.view);}
      paint();run();
    });
    root.addEventListener('input',e=>{if(!e.target.matches('.rotation-progress')||!ready())return;state.progress=Number(e.target.value)/100;state.playing=false;paint();run();});
    root.addEventListener('pointerdown',e=>{if(!e.target.closest('.rotation-live')||!ready())return;if(e.button!==0)return;state.playing=false;cancel();drag={id:e.pointerId,x:e.clientX,y:e.clientY};svg().setPointerCapture(e.pointerId);paint();});
    root.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;state.yaw+=(e.clientX-drag.x)*.012;state.pitch=Math.max(-Math.PI/2+.01,Math.min(Math.PI/2-.01,state.pitch+(e.clientY-drag.y)*.012));state.view='custom';drag.x=e.clientX;drag.y=e.clientY;paint();});
    const release=e=>{if(drag?.id===e.pointerId)drag=null;};root.addEventListener('pointerup',release);root.addEventListener('pointercancel',release);root.addEventListener('lostpointercapture',release);
    root.addEventListener('keydown',e=>{if(!e.target.matches('.rotation-live')||!ready())return;const changes={ArrowLeft:[-.15,0],ArrowRight:[.15,0],ArrowUp:[0,.15],ArrowDown:[0,-.15]};if(changes[e.key]){e.preventDefault();state.playing=false;cancel();state.yaw+=changes[e.key][0];state.pitch=Math.max(-1.56,Math.min(1.56,state.pitch+changes[e.key][1]));state.view='custom';paint();}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else run();});
    return {beforeRender(){if(state&&details())state.open=details().open;cancel();drag=null;},afterRender(){if(!ready()){state=null;return;}if(state.open){details().open=true;paint();run();}}};
  }
  return {alignment,quaternion,interpolate,transform,mesh,camera,projectMesh,attach};
});
