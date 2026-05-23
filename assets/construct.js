/* Construct SDK — Bridge */
(function(){
try{window.sessionStorage}catch(e){Object.defineProperty(window,"sessionStorage",{value:{getItem:function(){return null},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null},length:0},configurable:true})}
try{window.localStorage}catch(e){Object.defineProperty(window,"localStorage",{value:{getItem:function(){return null},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null},length:0},configurable:true})}
var pending={};var idCounter=0;var rpcId=0;var stateListeners=[];
var standalone=(function(){try{return window===window.top}catch(e){return true}})();
function mcpFetch(tool,args){
return fetch("/mcp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:++rpcId,method:"tools/call",params:{name:tool,arguments:args||{}}})}).then(function(r){
if(!r.ok)throw new Error("MCP request failed: HTTP "+r.status);
return r.json();
}).then(function(d){
if(d.error)throw new Error(d.error.message||"MCP error");
return d.result;
});
}
function standaloneRequest(method,params){
params=params||{};
if(method==="tools.call")return mcpFetch(params.tool,params.arguments);
if(method==="ui.setTitle"){if(params.title)document.title=params.title;return Promise.resolve();}
if(method==="ui.getTheme")return Promise.resolve({mode:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light",accent:"#6366f1"});
if(method==="ui.close"){try{window.close()}catch(e){}return Promise.resolve();}
if(method==="state.get")return Promise.resolve({});
if(method==="state.set")return Promise.resolve({ok:true});
if(method==="state.patch")return Promise.resolve({ok:true,state:{}});
if(method==="agent.notify"){console.info("[construct] agent.notify (standalone, ignored):",params.message);return Promise.resolve();}
return Promise.reject(new Error("Method not supported in standalone mode: "+method));
}
function notifyStateListeners(state){
for(var i=0;i<stateListeners.length;i++){try{stateListeners[i](state)}catch(err){console.error("[construct] state listener error:",err)}}
}
function sendRequest(method,params){
if(standalone)return standaloneRequest(method,params);
return new Promise(function(resolve,reject){
var id=String(++idCounter);
pending[id]={resolve:resolve,reject:reject};
window.parent.postMessage({type:"construct:request",id:id,method:method,params:params||{}},"*");
});
}
window.addEventListener("message",function(e){
if(!e.data||e.data.type!=="construct:response")return;
var p=pending[e.data.id];if(!p)return;delete pending[e.data.id];
if(e.data.error)p.reject(new Error(e.data.error));else p.resolve(e.data.result);
});
window.addEventListener("message",function(e){
if(e.data&&e.data.type==="construct:state_updated")notifyStateListeners(e.data.state);
});
window.construct={
tools:{
call:function(name,args){return sendRequest("tools.call",{tool:name,arguments:args||{}});},
callText:function(name,args){return this.call(name,args).then(function(r){
if(r&&r.ok!==undefined)r=r.result;
if(r&&r.content&&r.content[0])return r.content[0].text||JSON.stringify(r);
if(typeof r==="string")return r;return JSON.stringify(r);
});}
},
ui:{
setTitle:function(t){return sendRequest("ui.setTitle",{title:t});},
getTheme:function(){return sendRequest("ui.getTheme");},
close:function(){return sendRequest("ui.close");}
},
state:{
get:function(){return sendRequest("state.get");},
set:function(s){return sendRequest("state.set",{state:s}).then(function(r){notifyStateListeners((r&&r.state!==undefined)?r.state:s);return r;});},
patch:function(p){return sendRequest("state.patch",{patch:p}).then(function(r){if(r&&r.state!==undefined)notifyStateListeners(r.state);return r;});},
onUpdate:function(cb){if(typeof cb==="function")stateListeners.push(cb);return function(){var i=stateListeners.indexOf(cb);if(i>=0)stateListeners.splice(i,1);};}
},
agent:{notify:function(m){return sendRequest("agent.notify",{message:m});}},
ready:function(fn){if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",fn);else fn();},
isStandalone:standalone
};
})();
