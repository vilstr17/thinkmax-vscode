'use strict';
const {normalizeDifficulty,topics}=require('../media/puzzles.js');

// Keep installed users' settings while exposing the new brand in Settings.
// An explicitly chosen thinkmaxx value takes precedence over the old value.
function configuration(workspace) {
  const current=workspace.getConfiguration('thinkmaxx');
  const legacy=workspace.getConfiguration('brainGym');
  return {
    get(key,fallback) {
      const inspected=current.inspect(key);
      const explicit=inspected&&['globalValue','workspaceValue','workspaceFolderValue','globalLanguageValue','workspaceLanguageValue','workspaceFolderLanguageValue'].some(scope=>inspected[scope]!==undefined);
      const value=explicit?current.get(key,fallback):legacy.get(key,current.get(key,fallback));
      if(key==='topic')return ['mix',...topics].includes(value)?value:'mix';
      return key==='difficulty'?normalizeDifficulty(value):value;
    },
    update(key,value,target){return current.update(key,value,target);}
  };
}
module.exports={configuration};
