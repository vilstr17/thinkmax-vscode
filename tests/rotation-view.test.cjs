const {test}=require('node:test'),assert=require('node:assert/strict');
const Q=require('../media/quizzes.js'),V=require('../media/rotation-view.js');
const identity=[[1,0,0],[0,1,0],[0,0,1]],near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const determinant=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
function shapeKey(points){const min=[0,1,2].map(i=>Math.min(...points.map(p=>p[i])));return JSON.stringify(points.map(p=>p.map((v,i)=>Math.round((v-min[i])*1e7)/1e7)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]));}
test('all 24 rotations interpolate rigidly, including 180-degree turns',()=>{
 for(const r of Q.rotations){const m=r.p.map((axis,i)=>[0,1,2].map(j=>j===axis?r.sign[i]:0));
  for(const t of [0,.1,.25,.5,.75,.9,1]){const a=V.interpolate(m,t);near(determinant(a),1);for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(a[i].reduce((sum,v,k)=>sum+v*a[j][k],0),i===j?1:0);if(t===0)for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(a[i][j],identity[i][j]);if(t===1)for(let i=0;i<3;i++)for(let j=0;j<3;j++)near(a[i][j],m[i][j]);}
 }
});
test('explanation ends at the exact correct solid for every tier, and never matches a foil',()=>{
 for(let difficulty=0;difficulty<6;difficulty++)for(let seed=0;seed<80;seed++){
  const q=Q.item({topic:'rotation',difficulty,seed}),{source,options}=q.model,target=options[q.choices[q.correct]],matrix=V.alignment(source,target,Q.rotations);assert.ok(matrix);near(determinant(matrix),1);
  const end=V.interpolate(matrix,1);assert.equal(shapeKey(source.map(p=>V.transform(end,p))),shapeKey(target));
  for(const [name,solid]of Object.entries(options))if(name!==q.choices[q.correct])assert.equal(V.alignment(source,solid,Q.rotations),null);
 }
});
test('mesh exposes all six face directions, removes shared faces, and renders from every side',()=>{
 assert.equal(V.mesh([[0,0,0]]).faces.length,6);assert.equal(V.mesh([[0,0,0],[1,0,0]]).faces.length,10);
 const shape=[[0,0,0],[1,0,0],[1,1,0],[1,1,1]],solid=V.mesh(shape);
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const pitch of [-Math.PI/2,0,Math.PI/2]){
  const faces=V.projectMesh(solid,identity,V.camera(yaw,pitch));assert.ok(faces.length);for(const face of faces){assert.ok(Number.isFinite(face.depth));for(const [x,y]of face.points){assert.ok(x>=0&&x<=320&&y>=0&&y<=240);}}
 }
});
