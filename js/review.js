(()=>{'use strict';
const $=s=>document.querySelector(s),payload={audio:"audio/narration.mp3?v=825b440163e9",fixture:JSON.parse(document.getElementById("ui-fixture").textContent)};
const audio=$('#demo-voice'),frame=$('#real-app'),world=$('#app-world'),camera=$('#app-camera'),controls=$('#demo-audio-controls');
const stage=$('.stage-wrap');stage.tabIndex=-1;
const focusStage=()=>stage.focus({preventScroll:true});
audio.src=payload.audio;
const duration=62.000625,cues=[
 {page:5,time:0,scene:1,focus:'composer'},
 {page:6,time:8.60,scene:2,focus:'question'},
 {page:7,time:15.87,scene:3,focus:'composer'},
 {page:8,time:23.246,scene:8,focus:'table'},
 {page:9,time:32.65025,scene:9,focus:'message'},
 {page:10,time:41.55025,scene:11,focus:'result'},
 {page:11,time:46.0,scene:12,focus:'boxplot'},
 {page:12,time:52.0,scene:13,focus:'table'}
];
let ready=false,sceneIndex=-1,sceneToken=0,pose=null,lastTyped=-1,lastSfxTick=-1,audioContext=null,clickBuffer=null,sfxCount=0,soundOn=true,wideOverride=null,clockNav=false;
let serial=0,sqlFrame=0,sqlTyping=false,sqlCount=0;
const sqlText=$('#complex-sql')?.textContent||'';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const noMotion=()=>reduced.matches||document.body.classList.contains('no-motion');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const format=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const isDemo=()=>{const i=window.deck.getIndex();return i>=4&&i<=11;};
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function paintSQL(count){const code=$('#complex-sql');if(!code)return;sqlCount=count;const part=sqlText.slice(0,count);code.innerHTML=part.split('\n').map((line,i)=>{const tokens=line.split(/(--.*$|'[^']*'|\bdemo_[a-z_]+\b|\b(?:WITH|AS|SELECT|FROM|INNER|LEFT|JOIN|ON|AND|WHERE|OVER|PARTITION|BY|ORDER|DESC|ROW_NUMBER|CURRENT_DATE|INTERVAL|NULLIF|COUNT|ROUND|AVG|STDDEV_SAMP|MIN|MAX|GROUP|HAVING)\b)/g);return '<span class="sql-line'+(/\bJOIN\b/.test(line)?' sql-joinrow':'')+'" data-line="'+(i+1)+'">'+tokens.map(t=>{const c=t.startsWith('--')?'sql-comment':t.startsWith("'")?'sql-string':t.startsWith('demo_')?'sql-table':/^[A-Z_]+$/.test(t)?'sql-key':'';return c?'<span class="'+c+'">'+esc(t)+'</span>':esc(t);}).join('')+'</span>';}).join('');const scroll=code.parentElement;scroll.scrollTop=scroll.scrollHeight;$('#sql-progress').textContent=part.split('\n').length+' / '+sqlText.split('\n').length+'줄';const p=count/sqlText.length;document.querySelectorAll('[data-sql-step]').forEach((e,i)=>e.classList.toggle('lit',p>=[.12,.40,.75][i]));$('.sql-origin').classList.toggle('sql-done',count>=sqlText.length);}
function startSQL(token){const start=performance.now();sqlTyping=true;paintSQL(0);function tick(now){if(token!==serial)return;const p=noMotion()?1:Math.min(1,(now-start)/6500);paintSQL(Math.floor(sqlText.length*p));if(p<1)sqlFrame=requestAnimationFrame(tick);else sqlTyping=false;}sqlFrame=requestAnimationFrame(tick);}
const target=kind=>{const r=frame.contentWindow.DemoUI.focusRect(kind),scale=Math.min(1.7,1136/(r.width+46),463/(r.height+46));return{x:568-(r.x+r.width/2)*scale,y:231.5-(r.y+r.height/2)*scale,scale};};
const mix=(a,b,p)=>({x:a.x+(b.x-a.x)*p,y:a.y+(b.y-a.y)*p,scale:a.scale+(b.scale-a.scale)*p});
function applyPose(p){pose=p;world.style.transform=`translate(${p.x}px,${p.y}px) scale(${p.scale})`;}
function changeScene(i){
 sceneIndex=i;const cue=cues[i],ui=frame.contentWindow.DemoUI;sceneToken++;lastTyped=-1;lastSfxTick=-1;wideOverride=null;
 const previousFocus=document.activeElement;
 ui.set(cue.scene);ui.highlight(({1:'#input',2:'.question-reminder',3:'#input',9:'#conversation .assistant:last-child .message-text',11:'.anova-result h3'})[cue.scene]||null);
 if(document.activeElement===frame){
  if(previousFocus instanceof HTMLElement&&previousFocus!==frame&&previousFocus.isConnected&&!previousFocus.closest('[inert],[hidden]'))previousFocus.focus({preventScroll:true});
  else focusStage();
  if(document.activeElement===frame)focusStage();
 }
 $('#camera-status').textContent=$('#slide-'+cue.page).dataset.reviewLabel;$('#camera-wide').textContent='전체 화면';
 const token=sceneToken;requestAnimationFrame(()=>{if(token===sceneToken)paint(audio.currentTime,false);});
}
function makeSound(){
 if(audioContext)return;const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx){soundOn=false;$('#demo-sfx').disabled=true;return;}
 audioContext=new AudioCtx();const length=Math.ceil(audioContext.sampleRate*.035);clickBuffer=audioContext.createBuffer(1,length,audioContext.sampleRate);const data=clickBuffer.getChannelData(0);
 let seed=73129,last=0;for(let i=0;i<length;i++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;const noise=seed/4294967296*2-1,t=i/audioContext.sampleRate;const high=noise-last;last=noise;data[i]=(.11*high*Math.exp(-t*260)+.18*Math.sin(2*Math.PI*185*t)*Math.exp(-t*155))*.5;}
}
function keySound(){
 if(!soundOn||!audioContext||audioContext.state!=='running')return;
 const source=audioContext.createBufferSource(),gain=audioContext.createGain();source.buffer=clickBuffer;source.playbackRate.value=.95+Math.random()*.1;gain.gain.value=.20;source.connect(gain);gain.connect(audioContext.destination);source.start();source.onended=()=>{source.disconnect();gain.disconnect();};sfxCount++;
}
function paint(t,sound=true){
 if(!ready||!isDemo())return;
 let next=0;for(let i=1;i<cues.length;i++)if(t>=cues[i].time)next=i;else break;
 if(window.deck.getIndex()!==cues[next].page-1){clockNav=true;window.deck.go(cues[next].page-1);clockNav=false;}
 if(next!==sceneIndex)changeScene(next);
 const cue=cues[sceneIndex],local=Math.max(0,t-cue.time),ui=frame.contentWindow.DemoUI;
 let typing=false,progress=1;
 if(cue.scene===1){progress=clamp((local-1.75)/2.2);typing=local>=1.75&&local<3.95;}
 if(cue.scene===3){progress=clamp(local/1.3);typing=local<1.3;}
 if(noMotion()){progress=1;typing=false;}
 if(cue.scene===1||cue.scene===3){const count=Math.floor((cue.scene===1?ui.prompt:ui.reply).length*progress);if(count!==lastTyped){ui.type(count);lastTyped=count;}}
 const full=target('full'),focus=target(cue.focus);let p=focus;
 if(cue.scene===1&&!noMotion())p=mix(full,focus,ease(clamp((local-.65)/1.1)));
 if(cue.page===12){const out=noMotion()?(t>=duration-2.1?1:0):ease(clamp((t-(duration-2.1))/1.2));p=mix(focus,full,out);if(out>0)ui.highlight(null);if(out===1)$('#camera-status').textContent='DataTalk · 조회에서 분석 결과까지, 하나의 작업공간';}
 if(wideOverride===true)p=full;else if(wideOverride===false)p=focus;
 applyPose(p);$('#camera-wide').textContent=p.scale<.7?'집중 화면':'전체 화면';
 const tick=Math.floor(local*12);if(sound&&!audio.paused&&!audio.seeking&&typing&&tick!==lastSfxTick)keySound();lastSfxTick=tick;
 $('#demo-seek').value=t;$('#demo-time').textContent=format(t);
}
function seek(t){if(!ready)return;audio.currentTime=clamp(t,0,duration-.01);lastSfxTick=-1;if(!isDemo()){clockNav=true;window.deck.go(4);clockNav=false;}paint(audio.currentTime,false);}
async function play(){
 if(!ready)return;if(!audio.paused){audio.pause();paint(audio.currentTime,false);return;}if(!isDemo()||audio.ended||audio.currentTime>=duration-.05)seek(0);
 try{makeSound();if(audioContext)await audioContext.resume();await audio.play();}catch{$('#demo-play').textContent='▶ 재생';$('#announce').textContent='재생 버튼을 다시 눌러 음성과 시연을 시작해 주세요.';}
}
function showCurrent(){
 const active=$('.slide.active');const demo=!!active?.dataset.reviewScene;camera.hidden=!demo;camera.inert=!demo;controls.hidden=!demo;document.body.classList.toggle('offline-audio-active',demo);
 if(!clockNav){serial++;cancelAnimationFrame(sqlFrame);sqlTyping=false;if(active?.classList.contains('sql-origin'))startSQL(serial);}
 if(!demo){if(document.activeElement===frame||document.activeElement.closest?.('#app-camera,#demo-audio-controls'))focusStage();audio.pause();sceneIndex=-1;return;}if(!ready)return;
 if(!clockNav){const next=cues.findIndex(c=>c.page===window.deck.getIndex()+1);if(next!==sceneIndex){audio.currentTime=cues[next].time;sceneIndex=-1;lastSfxTick=-1;}paint(audio.currentTime,false);}
}
$('#demo-play').onclick=play;
$('#demo-restart').onclick=()=>{seek(0);if(audio.paused)play();};
$('#demo-seek').oninput=e=>seek(Number(e.target.value));
$('#demo-sfx').onclick=()=>{soundOn=!soundOn;$('#demo-sfx').setAttribute('aria-pressed',String(soundOn));$('#demo-sfx').textContent=soundOn?'효과음 켬':'효과음 끔';if(soundOn){makeSound();if(!audio.paused)audioContext?.resume();}};
$('#camera-wide').onclick=()=>{wideOverride=!(pose?.scale<.7);paint(audio.currentTime,false);};
$('#ai-start').disabled=true;$('#ai-start').onclick=()=>{seek(0);if(audio.paused)play();};
for(const event of ['play','pause'])audio.addEventListener(event,()=>{$('#demo-play').textContent=audio.paused?'▶ 재생':'Ⅱ 멈춤';$('#demo-play').setAttribute('aria-label',audio.paused?'AI 시연 재생':'AI 시연 일시정지');paint(audio.currentTime,false);});
audio.addEventListener('ended',()=>{if(isDemo()){window.deck.go(12);$('#announce').textContent='AI 시연이 끝났습니다. 13장부터 발표자가 이어서 설명합니다.';}});
audio.addEventListener('seeked',()=>paint(audio.currentTime,false));
audio.addEventListener('error',()=>{$('#announce').textContent='음성을 재생할 수 없습니다. 이 파일을 Chrome 또는 Edge에서 열어 주세요.';});
window.addEventListener('deckchange',showCurrent);
document.addEventListener('keydown',e=>{
 if(e.ctrlKey||e.metaKey||e.altKey||!$('#overview').hidden||!$('#help').hidden)return;
 if(e.target.id==='demo-seek'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();window.deck.go(window.deck.getIndex()+(e.key==='ArrowRight'?1:-1));return;}
 if(e.code==='Space'&&isDemo()&&!e.target.matches?.('input,textarea,select,button')&&!e.target.isContentEditable){e.preventDefault();e.stopImmediatePropagation();play();}
},true);
$('#demo-seek').title='드래그로 재생 위치 조절 · ←/→ 슬라이드 이동 · ↑/↓ 재생 위치 조절';
$('#demo-seek').setAttribute('aria-description','좌우 화살표는 슬라이드를 이동하고, 위아래 화살표는 재생 위치를 조절합니다.');
new MutationObserver(()=>{if(sqlTyping&&noMotion()){cancelAnimationFrame(sqlFrame);paintSQL(sqlText.length);sqlTyping=false;}if(ready&&isDemo())paint(audio.currentTime,false);}).observe(document.body,{attributes:true,attributeFilter:['class']});
frame.addEventListener('load',async()=>{
 const ui=frame.contentWindow.DemoUI;if(!ui)return;
 frame.contentDocument.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const key=e.key.length===1?e.key.toLowerCase():e.key;
  if(!['ArrowLeft','ArrowRight','PageUp','PageDown','Home','End',' ','Escape','f','n','s','o','m','b','?'].includes(key))return;
  e.preventDefault();e.stopImmediatePropagation();
  stage.dispatchEvent(new KeyboardEvent('keydown',{key:e.key,code:e.code,repeat:e.repeat,bubbles:true,cancelable:true}));
 },true);
 ui.initialize(payload.fixture);await frame.contentDocument.fonts.ready;await document.fonts.ready;ready=true;$('#demo-play').disabled=false;$('#demo-play').textContent='▶ 재생';$('#ai-start').disabled=false;showCurrent();
});
frame.src='demo.html?v=a2dbf30b4c5e';
showCurrent();function loop(){if(ready&&isDemo())paint(audio.currentTime);requestAnimationFrame(loop);}requestAnimationFrame(loop);
window.offlineDemo={ready:()=>ready,cues,seek,getState:()=>({ready,index:window.deck.getIndex(),page:window.deck.getIndex()+1,scene:ready?frame.contentWindow.DemoUI.getScene():null,time:audio.currentTime,paused:audio.paused,ended:audio.ended,pose,input:ready?frame.contentDocument.getElementById('input').value:null,sfxCount,sfxEnabled:soundOn,sqlTyping,sqlCount})};
window.review={ready:()=>ready,getState:window.offlineDemo.getState};
})();
