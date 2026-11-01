'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const P=require('../media/puzzles.js');
const catalog=require('../media/tracks.json');

test('placed symbols have individually targeted remove buttons, while givens stay fixed',()=>{
  let state=P.newPuzzle('symbols',0,catalog),model=P.quiz.item(state).model;
  const blank=model.board.indexOf(0),given=model.board.findIndex(Boolean);
  state=P.action(state,{type:'setCell',index:blank,value:1},catalog);
  assert.notEqual(state.active,blank,'placing a symbol advances the selection');
  const listeners={},messages=[];
  const app={innerHTML:'',contains:()=>false,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(name,fn)=>{listeners[name]=fn;}};
  const host={postMessage:message=>messages.push(message)};
  const context={ThinkmaxxPuzzles:P,ThinkmaxxRotationView:{attach:()=>({beforeRender(){},afterRender(){}})},ThinkmaxxTrackDrag:{attach:()=>({busy:()=>false})},
    document:{getElementById:()=>app,activeElement:null,addEventListener(){}},window:{thinkmaxxPreviewHost:host,addEventListener:(name,fn)=>{listeners['window:'+name]=fn;}},
    matchMedia:()=>({matches:true}),setTimeout,clearTimeout,setInterval,clearInterval};
  vm.runInNewContext(fs.readFileSync(require.resolve('../media/app.js'),'utf8'),context);
  listeners['window:message']({data:{type:'state',puzzle:state,catalog,topic:'symbols',difficulty:'low',conversations:[]}});
  const removal=[...app.innerHTML.matchAll(/data-action="clearSymbol"[^>]*data-index="(\d+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(removal,[blank]);assert.ok(!removal.includes(given));
  assert.match(app.innerHTML,/aria-label="Clear selected cell"/);
  assert.doesNotMatch(app.innerHTML,/Logic Circuit/);
  const target={disabled:false,dataset:{action:'clearSymbol',index:String(blank)}};
  listeners.click({target:{closest:()=>target}});
  const action=messages.at(-1).action;
  assert.equal(action.type,'setCell');assert.equal(action.index,blank);assert.equal(action.value,0);
  state=P.action(state,action,catalog);
  assert.equal(state.entries[blank],0);assert.equal(P.quiz.gridStatus(state).values[given],model.board[given]);
  assert.deepEqual(P.action(state,{type:'setCell',index:given,value:0},catalog),state);
});
