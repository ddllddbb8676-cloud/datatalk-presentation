(()=>{'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const frame=$('#real-app'),camera=$('#app-camera'),world=$('#app-world'),fixture=JSON.parse($('#ui-fixture').textContent);
const sqlText=$('#complex-sql')?.textContent||'';
let ready=false,wide=false,serial=0,typingFrame=0,typing=false,sqlFrame=0,sqlTyping=false,sqlCount=0,cameraFrame=0,cameraTimer=0,cameraSerial=0,cameraPhase='idle',pose=null;
const current=()=>$('.slide.active'),noMotion=()=>document.body.classList.contains('no-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function paintSQL(count){const code=$('#complex-sql');if(!code)return;sqlCount=count;const part=sqlText.slice(0,count);code.innerHTML=part.split('\n').map((line,i)=>{const tokens=line.split(/(--.*$|'[^']*'|\bdemo_[a-z_]+\b|\b(?:WITH|AS|SELECT|FROM|INNER|LEFT|JOIN|ON|AND|WHERE|OVER|PARTITION|BY|ORDER|DESC|ROW_NUMBER|CURRENT_DATE|INTERVAL|NULLIF|COUNT|ROUND|AVG|STDDEV_SAMP|MIN|MAX|GROUP|HAVING)\b)/g);return '<span class="sql-line'+(/\bJOIN\b/.test(line)?' sql-joinrow':'')+'" data-line="'+(i+1)+'">'+tokens.map(t=>{const c=t.startsWith('--')?'sql-comment':t.startsWith("'")?'sql-string':t.startsWith('demo_')?'sql-table':/^[A-Z_]+$/.test(t)?'sql-key':'';return c?'<span class="'+c+'">'+escape(t)+'</span>':escape(t);}).join('')+'</span>';}).join('');const scroll=code.parentElement;scroll.scrollTop=scroll.scrollHeight;$('#sql-progress').textContent=part.split('\n').length+' / '+sqlText.split('\n').length+'줄';const p=count/sqlText.length;$$('[data-sql-step]').forEach((e,i)=>e.classList.toggle('lit',p>=[.12,.40,.75][i]));$('.sql-origin').classList.toggle('sql-done',count>=sqlText.length);}
function startSQL(token){const started=performance.now();sqlTyping=true;paintSQL(0);function tick(now){if(token!==serial)return;const p=noMotion()?1:Math.min(1,(now-started)/6500);paintSQL(Math.floor(sqlText.length*p));if(p<1)sqlFrame=requestAnimationFrame(tick);else sqlTyping=false;}sqlFrame=requestAnimationFrame(tick);}
function typeIn(ui,scene,token){const count=(scene===1?ui.prompt:ui.reply).length,duration=scene===1?2200:1300,start=performance.now();typing=true;ui.type(0);function tick(now){if(token!==serial)return;const progress=noMotion()?1:Math.min(1,(now-start)/duration);ui.type(Math.floor(count*progress));if(progress<1)typingFrame=requestAnimationFrame(tick);else{typing=false;focus(current().dataset.reviewFocus);}}typingFrame=requestAnimationFrame(tick);}
function target(kind){const r=frame.contentWindow.DemoUI.focusRect(kind),scale=Math.min(1.7,1136/(r.width+46),463/(r.height+46));return {x:568-(r.x+r.width/2)*scale,y:231.5-(r.y+r.height/2)*scale,scale};}
function applyPose(p){pose=p;world.style.transform=`translate(${p.x}px,${p.y}px) scale(${p.scale})`;}
function focus(kind){if(ready)applyPose(target(wide?'full':kind));}
function stopCamera(){++cameraSerial;clearTimeout(cameraTimer);cancelAnimationFrame(cameraFrame);cameraPhase='idle';}
function moveTo(kind,duration,token,onFinish){const own=cameraSerial,from=pose,to=target(kind),start=performance.now();function tick(now){if(token!==serial||own!==cameraSerial)return;const p=noMotion()?1:Math.min(1,(now-start)/duration),ease=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;applyPose({x:from.x+(to.x-from.x)*ease,y:from.y+(to.y-from.y)*ease,scale:from.scale+(to.scale-from.scale)*ease});if(p<1)cameraFrame=requestAnimationFrame(tick);else{cameraPhase='idle';onFinish?.();}}cameraFrame=requestAnimationFrame(tick);}
function render(){const token=++serial;cancelAnimationFrame(typingFrame);cancelAnimationFrame(sqlFrame);stopCamera();typing=false;sqlTyping=false;const slide=current(),scene=slide?.dataset.reviewScene;camera.hidden=scene===undefined;camera.inert=camera.hidden;
 if(slide?.classList.contains('sql-origin'))startSQL(token);
 if(camera.hidden||!ready)return;
 const ui=frame.contentWindow.DemoUI,kind=slide.dataset.reviewFocus,mode=slide.dataset.reviewCamera;wide=false;$('#camera-wide').textContent='전체 화면';ui.set(+scene);ui.highlight(null);$('#camera-status').textContent=slide.dataset.reviewLabel;
 camera.classList.remove('review-enter');void camera.offsetWidth;camera.classList.add('review-enter');
 const highlight=()=>ui.highlight(({1:'#input',2:'.question-reminder',3:'#input',9:'#conversation .assistant:last-child .message-text',11:'.anova-result h3'})[scene]||null);
 if(mode==='in'&&!noMotion()){
  cameraPhase='overview';applyPose(target('full'));
  cameraTimer=setTimeout(()=>{if(token!==serial)return;cameraPhase='zoom-in';moveTo(kind,1100,token,()=>{highlight();typeIn(ui,+scene,token);});},650);
 }else if(mode==='out'&&!noMotion()){
  cameraPhase='result';focus(kind);
  cameraTimer=setTimeout(()=>{if(token!==serial)return;ui.highlight(null);cameraPhase='zoom-out';moveTo('full',1200,token,()=>{wide=true;$('#camera-wide').textContent='집중 화면';$('#camera-status').textContent='DataTalk · 조회에서 분석 결과까지, 하나의 작업공간';});},1600);
 }else{
  wide=mode==='out';$('#camera-wide').textContent=wide?'집중 화면':'전체 화면';focus(kind);highlight();if([1,3].includes(+scene))typeIn(ui,+scene,token);
 }
 requestAnimationFrame(()=>{if(token===serial&&cameraPhase!=='zoom-in'&&cameraPhase!=='zoom-out')applyPose(target(cameraPhase==='overview'||wide?'full':kind));});
 setTimeout(()=>{if(token===serial&&cameraPhase!=='zoom-in'&&cameraPhase!=='zoom-out')applyPose(target(cameraPhase==='overview'||wide?'full':kind));},220);
}
frame.addEventListener('load',()=>{if(!frame.contentWindow.DemoUI)return;frame.contentWindow.DemoUI.initialize(fixture);frame.contentDocument.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' ','Escape','n','s','o','f','m','b','?'].includes(e.key.length===1?e.key.toLowerCase():e.key))return;e.preventDefault();e.stopImmediatePropagation();document.dispatchEvent(new KeyboardEvent('keydown',{key:e.key,code:e.code,bubbles:true,cancelable:true}));},true);ready=true;render();frame.contentDocument.fonts.ready.then(()=>{if(current()?.dataset.reviewScene!==undefined)render();});});
frame.src='demo.html';
window.addEventListener('deckchange',render);
$('#camera-wide').addEventListener('click',()=>{stopCamera();wide=!wide;focus(current().dataset.reviewFocus);$('#camera-wide').textContent=wide?'집중 화면':'전체 화면';if(+current().dataset.reviewScene===1&&!typing){typeIn(frame.contentWindow.DemoUI,1,serial);}});
$('#ai-start').addEventListener('click',()=>window.deck.go(4));
new MutationObserver(()=>{if(!noMotion())return;if(sqlTyping){cancelAnimationFrame(sqlFrame);sqlTyping=false;paintSQL(sqlText.length);}if(ready&&!camera.hidden){stopCamera();wide=current().dataset.reviewCamera==='out';focus(current().dataset.reviewFocus);$('#camera-wide').textContent=wide?'집중 화면':'전체 화면';if([1,3].includes(+current().dataset.reviewScene)){cancelAnimationFrame(typingFrame);typing=false;frame.contentWindow.DemoUI.type(1000);}}}).observe(document.body,{attributes:true,attributeFilter:['class']});
const dialog=$('#speaker-script');let returnFocus;function open(){returnFocus=document.activeElement;dialog.showModal();}function close(){dialog.close();returnFocus?.focus();}
$('#script-button').addEventListener('click',open);$('#script-close').addEventListener('click',close);$$('[data-script-filter]').forEach(b=>b.addEventListener('click',()=>{const f=b.dataset.scriptFilter;$$('[data-script-filter]').forEach(x=>x.setAttribute('aria-selected',String(x===b)));$$('.script-card').forEach(x=>x.hidden=f!=='all'&&x.dataset.role!==f);}));$$('[data-script-slide]').forEach(b=>b.addEventListener('click',()=>{close();window.deck.go(+b.dataset.scriptSlide);}));
document.addEventListener('keydown',e=>{if(dialog.open){if(e.key==='Escape'){e.preventDefault();close();}e.stopImmediatePropagation();return;}if(!e.ctrlKey&&!e.metaKey&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&e.key.toLowerCase()==='s'){e.preventDefault();open();}},true);
window.review={ready:()=>ready,getState:()=>({ready,index:window.deck.getIndex(),scene:ready?frame.contentWindow.DemoUI.getScene():null,typing,sqlTyping,sqlCount,cameraPhase,wide,scale:pose?.scale,playing:false}),focus:()=>focus(current().dataset.reviewFocus)};
render();
})();
