const{test}=require('node:test');const assert=require('node:assert/strict');
const{configuration}=require('../src/settings.cjs');
const P=require('../media/puzzles.js');
function workspace(values,updates=[]){return{getConfiguration(section){const value=values[section]||{};return{inspect:key=>value[key]===undefined?{defaultValue:'low'}:{globalValue:value[key]},get:(key,fallback)=>value[key]??fallback,update:(...args)=>updates.push([section,...args])};}};}
test('existing preferences survive, including false, zero, and old difficulty names',()=>{
  const c=configuration(workspace({brainGym:{enabled:false,showDelayMs:0,difficulty:'hard',topic:'tracks'}}));
  assert.equal(c.get('enabled',true),false);assert.equal(c.get('showDelayMs',1200),0);assert.equal(c.get('difficulty'),'high');assert.equal(c.get('topic'),'tracks');
  assert.equal(P.normalizeDifficulty('easy'),'low');assert.equal(P.normalizeDifficulty('Xhigh'),'xhigh');assert.equal(P.difficultyIndex('nonsense'),0);
});
test('new settings take precedence and new preferences use the thinkmaxx namespace',()=>{
  const updates=[],c=configuration(workspace({brainGym:{difficulty:'hard',notifications:true},thinkmaxx:{difficulty:'ultracode',notifications:false}},updates));
  assert.equal(c.get('difficulty'),'ultracode');assert.equal(c.get('notifications'),false);c.update('difficulty','xhigh',1);
  assert.deepEqual(updates,[['thinkmaxx','difficulty','xhigh',1]]);
});

test('removed selections fall back to the full mix',()=>{
 for(const topic of ['data','focused','deduction','reasoning','tracing','circuit']){
  assert.equal(configuration(workspace({thinkmaxx:{topic}})).get('topic'),'mix');
  assert.equal(configuration(workspace({brainGym:{topic}})).get('topic'),'mix');
 }
 assert.equal(P.restore({version:2,topic:'data',difficulty:0,moves:0},{}),null);
 assert.ok(!P.topics.includes('data'));
});
