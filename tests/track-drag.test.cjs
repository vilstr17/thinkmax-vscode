const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../media/puzzles.js'),D=require('../media/track-drag.js'),catalog=require('../media/tracks.json');
test('dragging any point of every catalog piece retains that point through all rotations and board sizes',()=>{
  for(const boards of Object.values(catalog))for(const board of boards)for(const piece of board.pieces)for(let rotation=0;rotation<4;rotation++)for(let grabIndex=0;grabIndex<piece.cells.length;grabIndex++){
    const rect={left:47.25,top:83.5,width:board.side*43.7,height:board.side*43.7},origin={x:2,y:3},grab=P.rotate(piece.cells[grabIndex],rotation),offset={x:.23,y:-.31};
    const point={x:rect.left+(origin.x+grab.x+.5+offset.x)*rect.width/board.side,y:rect.top+(origin.y+grab.y+.5+offset.y)*rect.height/board.side};
    assert.deepEqual(D.placementAt(piece,rotation,grabIndex,point,rect,board.side,offset),{origin,rotation});
  }
});
test('snapping switches at cell boundaries; off-board drops remain outside',()=>{
  const piece={cells:[{x:0,y:0},{x:1,y:0},{x:1,y:1}]},rect={left:100,top:50,width:250,height:250};
  assert.deepEqual(D.placementAt(piece,0,1,{x:199.9,y:75},rect,5).origin,{x:0,y:0});
  assert.deepEqual(D.placementAt(piece,0,1,{x:200.1,y:75},rect,5).origin,{x:1,y:0});
  assert.equal(D.contains({x:350,y:75},rect),false);assert.equal(D.contains({x:99.9,y:75},rect),false);
  assert.equal(D.contains({x:349.9,y:299.9},rect),true);
  assert.equal(D.nearest(piece,1,{x:-1,y:1}),2);
});
const board={side:5,start:{x:0,y:0},goal:{x:4,y:4},checkpoints:[],blocked:[{x:4,y:0}],pieces:[{cells:[{x:0,y:0},{x:1,y:0},{x:2,y:0}]},{cells:[{x:0,y:0},{x:0,y:1},{x:1,y:1}]}]};
const custom={0:[board]};
const state=()=>({version:2,topic:'tracks',difficulty:0,index:0,selected:0,moves:0,placements:[null,null],rotations:[0,0],history:[],won:false,hint:null,message:''});
test('a drop commits the dragged piece and orientation in one undoable move regardless of prior selection',()=>{
  let s=state();const original=structuredClone(s);
  s=P.action(s,{type:'place',index:1,rotation:1,x:2,y:2},custom);
  assert.deepEqual(s.placements[1],{origin:{x:2,y:2},rotation:1});assert.equal(s.placements[0],null);assert.equal(s.rotations[1],1);assert.equal(s.moves,1);assert.equal(s.history.length,1);
  assert.deepEqual(original,state(),'the input state is unchanged');
  s=P.action(s,{type:'undo'},custom);assert.deepEqual(s.placements,original.placements);assert.deepEqual(s.rotations,original.rotations);assert.equal(s.moves,0);
});
test('invalid drops retain the prior location and orientation; moving a piece ignores its old cells',()=>{
  let s=P.action(state(),{type:'place',index:0,rotation:0,x:0,y:0},custom);
  const before=structuredClone(s);
  for(const drop of [{rotation:0,x:2,y:0},{rotation:1,x:0,y:4},{rotation:9,x:1,y:1}]){
    const t=P.action(s,{type:'place',index:0,...drop},custom);
    assert.deepEqual(t.placements,before.placements);assert.deepEqual(t.rotations,before.rotations);assert.equal(t.moves,1);assert.equal(t.history.length,1);
  }
  s=P.action(s,{type:'place',index:0,rotation:0,x:1,y:0},custom);assert.equal(s.placements[0].origin.x,1);assert.equal(s.moves,2);
  s.selected=1;s=P.action(s,{type:'remove',index:0},custom);assert.equal(s.placements[0],null);assert.equal(s.moves,3);
  s=P.action(s,{type:'undo'},custom);assert.equal(s.placements[0].origin.x,1);assert.equal(s.moves,2);
  assert.deepEqual(P.action(s,{type:'place',index:99,x:1,y:1},custom).placements,s.placements);
});
