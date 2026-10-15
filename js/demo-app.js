const $ = id => document.getElementById(id);
const icon = name => '<svg class="dt-ui-icon" aria-hidden="true"><use href="#'+name+'"/></svg>';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = location.pathname.replace(/\/datatalk\/?$/, '').replace(/\/$/, '');
const apiBase = root + '/api/datatalk';
const token = document.querySelector('meta[name="csrf-token"]').content;
const fileMode = location.protocol === 'file:';
const model = {ready:false,summary:[],cache:new Map(),current:null,modules:[],catalogue:null,
               expanded:new Set(),graphCollapsed:new Set(),graphForm:null,histories:new Map(),composing:false,tab:'table',busy:null,setup:'',error:'',generation:0,
               toolOpen:false,toolSearch:'',catalogSearch:'',schemaDraft:new Set(),
               draftTarget:null,split:.5,cacheStatus:null,cacheStatusAt:0,cacheStatusError:false,cacheRequestSerial:0,cacheRequest:null,cachePollTimer:null,cacheRefreshQueued:false,cacheOutcomes:new Map()};
try { const x=Number(localStorage.getItem('datatalk.v2.chat.width'));if(x>=.25&&x<=.75)model.split=x; } catch {}
function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const a=Array.from(b,x=>x.toString(16).padStart(2,'0'));
  return a.slice(0,4).join('')+'-'+a.slice(4,6).join('')+'-'+a.slice(6,8).join('')+'-'+a.slice(8,10).join('')+'-'+a.slice(10).join('');
}
const apiRequests=new Set(),jobStopRequests=new Set();
const terminalJobStates=new Set(['completed','cancelled','failed']);
const guardedWorkspacePosts=new Set(['/chat','/execute','/export','/analysis/execute','/analysis/submit','/quick-extract/plan','/eds/plan','/graph/create','/graph/update','/workspace/delete','/table/delete','/graph/delete']);
const pendingQueryStorageKey='datatalk.v4.pendingQueries:'+root;
const pendingQueryReceipts=new Map();
try{const saved=JSON.parse(sessionStorage.getItem(pendingQueryStorageKey)||'[]');if(Array.isArray(saved))for(const entry of saved.slice(0,200)){if(entry&&typeof entry.query_id==='string'&&/^[a-zA-Z0-9_-]{8,128}$/.test(entry.query_id)&&typeof entry.workspace_id==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(entry.workspace_id)&&['query','export','graph'].includes(entry.kind)){const safe={query_id:entry.query_id,workspace_id:entry.workspace_id,kind:entry.kind};pendingQueryReceipts.set(entry.query_id,safe);setLocalJob(entry.workspace_id,{...safe,state:'interrupted',local_unconfirmed:true,message:'이전 요청의 완료 여부를 확인합니다. 상태 확인 전 자동으로 다시 실행하지 않습니다.'});}}}catch{}
function persistPendingQueries(){try{sessionStorage.setItem(pendingQueryStorageKey,JSON.stringify([...pendingQueryReceipts.values()]));}catch{}}
function rememberPendingQuery(wid,qid,kind='query'){if(!wid||!qid)return;pendingQueryReceipts.set(qid,{workspace_id:wid,query_id:qid,kind});persistPendingQueries();}
function forgetPendingQuery(qid){if(pendingQueryReceipts.delete(qid))persistPendingQueries();}

function quietConnectionError(error){return ['CONNECTION_REFRESHED','AUTH_STATE_CHANGED','QUERY_STATUS_CONFIRMED'].includes(error?.code);}
function connectionError(code,message){const error=new Error(message);error.code=code;return error;}
function unresolvedJobs(wid=model.current?.id){return (model.jobs?.get(wid)||[]).filter(j=>['running','cancelling','interrupted'].includes(j.state));}
function workspaceHasUnresolvedJob(wid=model.current?.id){return !!wid&&(model.jobStatusUnknown?.has(wid)||unresolvedJobs(wid).length>0);}
function setLocalJob(wid,job){if(!wid||!job?.query_id)return;model.jobs??=new Map();const jobs=model.jobs.get(wid)||[],old=jobs.find(j=>j.query_id===job.query_id);if(old&&terminalJobStates.has(old.state)&&job.state!==old.state)return;model.jobs.set(wid,jobs.filter(j=>j.query_id!==job.query_id).concat({...old,...job}));}
function uncertainQuery(wid,qid,kind='query',message='서버의 실행 상태를 확인하지 못했습니다. 자동으로 다시 실행하지 않습니다. 상태를 확인하거나 DB 중단을 요청해 주세요.'){rememberPendingQuery(wid,qid,kind);setLocalJob(wid,{query_id:qid,kind,state:'interrupted',local_unconfirmed:true,message});}
function resetApiTransport(reason='refresh'){model.connectionEpoch=(model.connectionEpoch||0)+1;for(const request of apiRequests){request.stopReason=reason;request.controller.abort();}}
function expireAuthentication(error){if(model.authRequired)return;dt6StopSpeaking();model.authRequired=true;queue42.clear();model.generation++;resetApiTransport('auth');stopCachePolling(true);clearTimeout(jobsPoll);clearTimeout(analysisPoll);jobRecoverySerial++;recoveringJobs=false;model.ready=false;model.current=null;model.peekTable=null;model.summary=[];model.cache.clear();model.jobs=new Map();model.jobStatusUnknown=new Set();model.jobWorkspaceRefresh=new Set();model.recoveredExports=new Map();pendingQueryReceipts.clear();persistPendingQueries();model.modules=[];model.catalogue=null;model.graphForm=null;model.graphSetupSource=null;model.histories.clear();tableGraphIndexes.clear();analysisUI=null;analysisCache.clear();model.cacheOutcomes.clear();quickDrafts.clear();edsxDrafts.clear();edsxSelections.clear();quickUI=null;edsxUI=null;questionSelections.clear();if(tableTypesUI){clearTypeTimers(tableTypesUI);tableTypesUI=null;}for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();model.setup=error.code==='CSRF_INVALID'?'로그인 상태가 변경되었습니다. 페이지를 새로고침하고 사내 인증을 확인해 주세요.':'로그인 세션이 만료되었거나 인증이 필요합니다. 사내 로그인 후 다시 연결해 주세요.';model.error='';$('connection-status').textContent='인증 필요';render();}
async function api(path,body,requestOptions={}) {return window.DemoUI.api(path,body,requestOptions);}
function toast(message) {
  const x=$('toast');x.textContent=message;x.classList.remove('hidden');
  clearTimeout(window.__toast);window.__toast=setTimeout(()=>x.classList.add('hidden'),4500);
}
function apply(ws) {
  if(model.current&&model.current.id!==ws.id)dt6StopSpeaking();
  if(model.current&&model.current.id!==ws.id){model.peekTable=null;clearTimeout(analysisPoll);analysisUI=null;model.graphForm=null;model.graphSetupSource=null;$('analysis-dialog').close();$('types-dialog').close();$('eds-dialog').close();$('quick-dialog').close();$('eds-extract-dialog').close();}
  try{sessionStorage.setItem('datatalk.v2.active.workspace',ws.id);}catch{}
  model.current=ws;model.cache.set(ws.id,ws);model.expanded.add(ws.id);
  for(const [ref,state] of tableGraphIndexes){state.graphs=(state.graphs||[]).filter(g=>g.workspace_id!==ws.id&& !String(g.canonical_ref||'').startsWith(ws.id+'.')).concat((ws.graphs||[]).filter(g=>g.source_ref===ref).map(g=>({...g,workspace_id:ws.id,canonical_ref:ws.id+'.'+g.id})));}
  const entry={id:ws.id,name:ws.name,revision:ws.revision,table_count:ws.tables.length};
  const index=model.summary.findIndex(x=>x.id===ws.id);
  if(index<0)model.summary.push(entry);else model.summary[index]={...model.summary[index],...entry};
}
function currentGraph() { return model.current?.graphs?.find(x=>x.id===model.current.selected_graph_id) || null; }
function canSend(raw=$('input').value) {return model.ready&&!!model.current&&!!String(raw||'').trim();}
function updateComposer(){ $('send').disabled=!canSend();const queued=work42Active();$('send').setAttribute('aria-label',queued?'대기열에 추가':'요청 전송');$('send').title=queued?'대기열에 추가':'요청 전송';const mode=queued?'queue':'send';if($('send').dataset.mode42!==mode){$('send').dataset.mode42=mode;$('send').innerHTML=queued?'<span>대기열에 추가</span>':icon('arrow');}$('send').classList.toggle('queue-send42',queued);queue42Render();updateStop42(); }
function currentTable() {
  return model.current?.tables?.find(x=>x.id===model.current.selected_table_id) || null;
}
function tableName(t) { return t?.id || ''; }
function dateLabel(timestamp) {
  if(!timestamp)return '기록 없음';
  const d=new Date(timestamp);
  return Number.isFinite(d.getTime())?
    new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',
       day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d)+' (한국시간)':
    '기록 없음';
}
function renderNav() {
  $('workspace-nav').innerHTML=model.summary.map(item=>{
    const ws=model.cache.get(item.id),expanded=model.expanded.has(item.id);
    const tables=expanded?'<div class="table-list">'+(
      ws? (ws.tables.length?ws.tables.map(t=>'<div class="table-row"><button class="table-item '+(model.current?.id===item.id&&t.id===ws.selected_table_id?'active':'')+
         '" data-open-table="'+esc(item.id+'.'+t.id)+'" title="'+esc(item.id+'.'+t.id+' · '+t.title)+'"><span class="table-identity"><span class="table-alias-line"><span class="alias">'+esc(t.id)+
         '</span>'+cacheBadgeHTML(t,item.id+'.'+t.id)+'</span><span class="table-title">'+esc(t.title)+'</span></span></button>'+
         '<button class="table-action" data-rename="'+esc(item.id+'.'+t.id)+'" aria-label="'+esc(t.id)+' 이름 수정" title="이름 수정">✎</button>'+
         '<button class="table-action danger" data-delete="'+esc(item.id+'.'+t.id)+'" aria-label="'+esc(t.id)+' 삭제" title="테이블 삭제">×</button></div>').join(''):
         '<p class="list-empty">아직 만든 테이블이 없어요.</p>') :
         '<p class="list-empty">목록을 불러오는 중...</p>')+'</div>':'';
    return '<div class="workspace-entry"><button class="workspace-row '+(model.current?.id===item.id?'active':'')+
        '" data-workspace="'+esc(item.id)+'" title="'+esc(item.name)+' 작업공간으로 이동"><span class="alias">'+esc(item.id)+
        '</span><span class="ws-label">'+esc(item.name)+'</span><small>'+esc(item.table_count||0)+'</small></button>'+
        '<button class="expand-workspace" data-expand="'+esc(item.id)+'" aria-expanded="'+expanded+'" aria-label="'+
        esc(item.id)+' 테이블 목록 '+(expanded?'접기':'펼치기')+'">'+(expanded?'⌄':'›')+'</button><button class="workspace-delete" data-delete-workspace="'+esc(item.id)+'" title="워크스페이스 삭제" aria-label="'+esc(item.id)+' 워크스페이스 삭제">×</button></div>'+tables;
  }).join('') || '<p class="list-empty">새 작업공간을 만들면 여기에 표시돼요.</p>';
  $('new-workspace').disabled=!model.ready||!!model.busy;
  $('eds-open').disabled=!model.ready||!!model.busy||workspaceHasUnresolvedJob();
}
const keywords=new Set('SELECT FROM WHERE JOIN LEFT RIGHT INNER FULL OUTER ON AS WITH RECURSIVE GROUP BY HAVING ORDER LIMIT OFFSET UNION ALL DISTINCT AND OR NOT IS NULL BETWEEN IN CASE WHEN THEN ELSE END OVER PARTITION ROWS RANGE COUNT SUM AVG MIN MAX CAST COALESCE EXISTS ASC DESC TRUE FALSE INTERSECT EXCEPT'.split(' '));
function sqlHTML(sql) {
  const raw=String(sql||'');
  const pattern=/(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:[^"]|"")*"|:[A-Za-z_][\w]*|\$\d+|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[\s\S])/g;
  return [...raw.matchAll(pattern)].map(m=>{
    const s=m[0];let name='';
    if(s.startsWith('--')||s.startsWith('/*'))name='sql-comment';
    else if(s.startsWith("'"))name='sql-string';
    else if(s.startsWith('"'))name='sql-identifier';
    else if(s.startsWith(':')||/^\$\d+$/.test(s))name='sql-param';
    else if(/^\d/.test(s))name='sql-number';
    else if(keywords.has(s.toUpperCase()))name='sql-keyword';
    else if(/^[a-z_]/i.test(s)&&/^\s*\(/.test(raw.slice(m.index+s.length)))name='sql-function';
    return name?'<span class="'+name+'">'+esc(s)+'</span>':esc(s);
  }).join('');
}
// One selection draft per workspace; never reuse it for a different question.
const questionSelections = new Map();
function questionState(ws=model.current) {
  const pq=ws?.pending_question;if(!pq)return null;
  const options=Array.isArray(pq.options)?pq.options:[];
  const key=JSON.stringify([pq.id||null,pq.question,pq.required_fields,options]);
  let state=questionSelections.get(ws.id);
  if(!state||state.key!==key){state={key,selected:new Set()};questionSelections.set(ws.id,state);}
  return state;
}
function questionView(ws) {
  const pq=ws.pending_question,options=Array.isArray(pq.options)?pq.options:[];
  const head='<div class="question-reminder"><strong>확인할 조건</strong><p>'+esc(pq.question)+'</p>';
  if(!options.length)return head+'<small>조건을 알려주면 이어서 진행해요.</small></div>';
  const state=questionState(ws),blocked=!!model.busy||!model.ready;
  const refs=pq.external_refs||[];
  return head+(refs.length?'<p class="question-context"><small>다른 작업공간 참조 · '+refs.map(esc).join(', ')+'</small></p>':'')+
    '<small>필요한 항목을 선택하세요. 여러 개를 고를 수 있어요.</small>'+
    '<div class="option-chips" role="group" aria-label="질문에 답할 항목 선택">'+options.map((value,i)=>
      '<button type="button" class="chip'+(state.selected.has(i)?' selected':'')+'" data-question-option="'+i+
      '" aria-pressed="'+state.selected.has(i)+'" '+(blocked?'disabled':'')+'>'+esc(value)+'</button>').join('')+'</div>'+
    '<div class="question-actions"><span role="status">'+state.selected.size+'개 선택</span>'+
    '<button type="button" data-question-clear '+(blocked||!state.selected.size?'disabled':'')+'>선택 해제</button>'+
    '<button type="button" class="primary" data-question-confirm '+(blocked||!state.selected.size?'disabled':'')+'>선택 완료</button></div>'+
    '<small>다른 조건이나 궁금한 점은 아래 대화창에 입력해도 돼요.</small></div>';
}
function questionAction(button) {
  if(model.busy||!model.ready||!model.current?.pending_question)return;
  const options=model.current.pending_question.options||[],state=questionState();
  if(button.dataset.questionOption!==undefined){
    const i=Number(button.dataset.questionOption);if(!Number.isInteger(i)||i<0||i>=options.length)return;
    if(state.selected.has(i))state.selected.delete(i);else state.selected.add(i);
    renderChat();document.querySelector('[data-question-option="'+i+'"]')?.focus({preventScroll:true});return;
  }
  if(button.dataset.questionClear!==undefined){state.selected.clear();renderChat();document.querySelector('[data-question-option]')?.focus({preventScroll:true});return;}
  if(button.dataset.questionConfirm!==undefined&&state.selected.size){
    const selected=options.filter((_,i)=>state.selected.has(i));
    // Use the established ask/api path, including CSRF, revision and busy guards.
    const refs=model.current.pending_question.external_refs||[];
    ask((refs.length?'참조: '+refs.join(', ')+'\n':'')+'선택한 항목: '+JSON.stringify(selected)+'\n이 선택으로 이어서 진행해줘.');
  }
}
function bindingConditions(p) {
  const params=p.params??{},positional=Array.isArray(params);
  const entries=Object.entries(params);
  const rows=entries.map(([name,value])=>'<div><span>'+esc(positional?'위치 '+(Number(name)+1):name)+
    '</span><strong>'+esc(value===null?'NULL':JSON.stringify(value))+'</strong></div>').join('');
  return '<section class="binding-values" aria-label="SQL 실행 조건"><strong>적용할 바인딩 값</strong>'+
    (entries.length?'<div class="condition-list">'+rows+'</div>':'<p class="proposal-note">바인딩 값 없음 · SQL에 직접 작성된 조건도 확인해 주세요.</p>')+
    '<div class="condition-list"><div><span>결과 방식</span><strong>'+esc(p.operation==='replace'?'기존 결과 갱신':'새 결과 생성')+
    '</strong></div></div></section>';
}

function proposalView(p) {
  if(p.kind==='analysis') {
    const m=model.modules.find(x=>x.id===p.module_id&&x.version===p.module_version);
    const rows=[['도구',(m?.name||p.module_id)+' · v'+p.module_version],
      ['대상',p.source_ref],['데이터 범위','선택한 기간·조건의 전체 결과'],
      ...Object.entries(p.parameters||{}).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):String(v)])];
    return '<section class="query-proposal analysis-proposal"><div class="proposal-top">◇ '+esc(p.title)+' <span class="pending-label">실행 전 조건 확인</span></div>'+
      '<div class="condition-list">'+rows.map(([a,b])=>'<div><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></div>').join('')+'</div>'+
      '<p class="proposal-note">전체 결과 캐시가 있으면 재사용하고, 없으면 원본 조건의 전체 데이터를 확보합니다. 미리보기 행만으로 분석하지 않습니다.</p>'+
      '<div class="confirm-actions"><button class="primary" data-execute="'+esc(p.id)+'" '+(model.busy||workspaceHasUnresolvedJob()?'disabled':'')+'>분석 실행</button></div></section>';
  }
  return '<section class="query-proposal"><div class="proposal-top">⌘ '+esc(p.title)+' <span class="pending-label">SQL 실행 전 확인</span></div>'+ 
    (p.join_expression?'<div class="proposal-note">결합 관계: '+esc(p.join_expression)+'</div>':'')+
    bindingConditions(p)+typeChangeSummaryHTML(p.requested_type_changes||[])+'<pre class="highlighted">'+sqlHTML(p.physical_sql||p.sql)+'</pre>'+ 
    '<p class="proposal-note">문자열 조건은 대소문자를 구분할 수 있어요. 값의 철자와 기간을 확인해 주세요.</p>'+ 
    '<div class="confirm-actions"><button class="primary" data-execute="'+esc(p.id)+'" '+(model.busy||workspaceHasUnresolvedJob()?'disabled':'')+'>SQL 실행</button>'+ 
    '<button data-copy-proposal="'+esc(p.id)+'">SQL 복사</button></div></section>';
}
function emptyQueryView(info){
  return '<section class="query-proposal empty-query-card" role="status"><div class="proposal-top">조회 결과 0행 <span class="pending-label">저장하지 않음</span></div>'+ 
    '<p class="proposal-note">기존 테이블도 그대로예요. 기간·조건을 수정해 다시 요청해 주세요. 특히 문자열 조건값의 대소문자를 확인해 주세요.</p>'+ 
    '<details><summary>실행했던 SQL과 바인딩 값 보기</summary><pre class="highlighted">'+sqlHTML(info.sql)+'</pre><pre>'+esc(JSON.stringify(info.params??{},null,2))+'</pre></details>'+ 
    '<div class="confirm-actions"><button data-retry-empty>조건 수정해서 다시 추출 ↗</button></div></section>';
}
function typeFailureView(info){
  return '<section class="query-proposal empty-query-card api-type-warning" role="status"><div class="proposal-top">자료형 확인 필요 <span class="pending-label">SQL 실행 중단</span></div>'+ 
    '<p>SQL 비교·변환에 사용한 컬럼의 자료형과 조건값을 확인해 주세요. 필요한 경우 대화에서 명시적 변환 SQL을 새로 제안받고, 내용을 확인한 뒤 실행하세요.</p>'+ 
    '<details><summary>실패한 SQL과 바인딩 값 보기</summary><pre class="highlighted">'+sqlHTML(info.sql)+'</pre><pre>'+esc(JSON.stringify(info.params??{},null,2))+'</pre></details>'+ 
    '<div class="confirm-actions">'+(info.source_ref?'<button data-table-types="'+esc(info.source_ref)+'">컬럼·자료형 열기</button>':'')+'<button data-retry-type>수정 SQL 요청하기 ↗</button></div></section>';
}
function dt6Mascot(speaking=false){return '<svg class="dt6-mascot'+(speaking?' dt6-speaking':'')+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect class="dt6-tile" width="64" height="64" rx="15"/><path class="dt6-face" d="M32 10C17 10 10 14 10 29v9c0 7 2 10 4 13L12 56c-.6 1.6.8 2.2 2.3 1.5L23 54h12c15 0 19-6 19-21v-5c0-14-7-18-22-18Z"/><circle class="dt6-eye" cx="23" cy="31" r="3.6"/><circle class="dt6-eye" cx="42" cy="31" r="3.6"/><path class="dt6-mouth-smile" d="M27 40Q32 45 37 40"/><ellipse class="dt6-mouth-open" cx="32" cy="41" rx="3.5" ry="4.2"/></svg>';}
let dt6Reply=null,dt6ReplyTimer=0;
function dt6StopSpeaking(){clearTimeout(dt6ReplyTimer);dt6Reply=null;document.querySelectorAll('.dt6-speaking').forEach(el=>el.classList.remove('dt6-speaking'));}
function dt6BeginReply(ws,oldCount){dt6StopSpeaking();const messages=ws?.messages||[];if(messages.length<=oldCount)return;let index=-1;for(let i=messages.length-1;i>=oldCount;i--)if(messages[i].role==='assistant'){index=i;break;}if(index<0)return;dt6Reply={workspace:ws.id,index,until:Date.now()+1600};dt6ReplyTimer=setTimeout(dt6StopSpeaking,1600);}
function dt6IsReply(ws,index){return !model.authRequired&&dt6Reply?.workspace===ws?.id&&dt6Reply.index===index&&Date.now()<dt6Reply.until;}
document.addEventListener('visibilitychange',()=>{if(document.hidden)dt6StopSpeaking();});
addEventListener('pagehide',dt6StopSpeaking);

function renderChat() {
  const ws=model.current,t=currentTable(),selectedGraph=currentGraph();
  $('title').textContent=ws?ws.id+' · '+ws.name:'데이터와 대화 시작';
  let html='';
  if(model.setup) {
    html='<div class="welcome"><div class="orb">'+dt6Mascot()+'</div><h1>대화에서 시작하는 데이터.</h1></div>'+
      '<div class="status-card"><strong>연결 상태 확인</strong><p>'+esc(model.setup)+'</p><button data-boot>다시 확인</button></div>';
  } else if(ws) {
    html=ws.messages.length?'<div class="eyebrow">WORKSPACE '+esc(ws.id)+'</div>':
      '<div class="welcome"><div class="orb">'+dt6Mascot()+'</div><h1>질문에서 시작해,<br><em>결과까지 이어가세요.</em></h1>'+
      '<p>원하는 기간과 조건을 말해 주세요. 필요한 내용은 대화로 먼저 확인합니다.</p>'+
      '<div class="examples"><button class="example" data-prompt="조회 가능한 테이블을 알려줘."><b>어떤 데이터가 있을까?</b><small>원본 찾기 ↗</small></button>'+
      '<button class="example" data-template42="FAB_MAIN"><b>FAB_MAIN 공정 데이터 추출</b><small>조건 입력 ↗</small></button>'+
      '<button class="example" data-template42="FAB_METRO"><b>FAB_METRO 계측 데이터 추출</b><small>AVG 기본 · 조건 입력 ↗</small></button></div></div>';
    html+=(ws.messages||[]).map((msg,mi)=>{
      if(msg.role==='user')return '<div class="user"><div class="bubble message-text">'+esc(msg.content)+'</div></div>';
      const result=ws.tables.find(x=>x.id===msg.table_id);
      return '<div class="assistant"><div class="ai-icon">'+dt6Mascot(dt6IsReply(ws,mi))+'</div><div class="answer"><div class="author">DataTalk <span>데이터 어시스턴트</span></div>'+
        '<p class="message-text">'+esc(msg.content)+'</p>'+(msg.api_help?renderApiHelp(msg.api_help,mi):'')+(msg.empty_result?emptyQueryView(msg.empty_result):'')+(msg.type_failure?typeFailureView(msg.type_failure):'')+
        (result?'<button class="result-link" data-open-table="'+esc(ws.id+'.'+result.id)+'"><span class="alias">'+
            esc(result.id)+'</span><span><strong>'+esc(result.title)+'</strong><small>'+esc(ws.id+'.'+result.id)+
            ' · '+esc(result.origin_type==='api'?'분석 결과':'조회 결과')+'</small></span><span class="right">↗</span></button>':'')+
        '</div></div>';
    }).join('');
    if(ws.pending_question)html+=questionView(ws);
    else questionSelections.delete(ws.id);
    if(ws.pending_proposal)html+=proposalView(ws.pending_proposal);
  }
  if(model.error)html+='<div class="inline-error" role="alert">'+esc(model.error)+'</div>';
  if(model.busy)html+='<div class="operation-bar" role="status">'+(model.busy.kind==='chat'?dt6Mascot(!model.busy.cancelRequested&&!model.authRequired&&!document.hidden):'<i></i>')+'<span>'+esc(model.busy.label)+'</span>'+
    (model.busy.cancelable?'<button data-cancel '+(model.busy.cancelRequested?'disabled':'')+'>'+
       (model.busy.cancelRequested?'중단 요청됨':'중단 요청')+'</button>':'')+'</div>';
  if(ws)html+=recoveredJobsHTML(ws)+recoveredExportHTML(ws)+analysisCard(ws);
  $('conversation').innerHTML=html;
  $('context-strip').innerHTML=ws?'<span class="context-workspace">현재 작업공간 <b>'+esc(ws.id)+'</b></span>'+
     (model.peekTable?'<span>다른 작업공간 미리보기 <b>'+esc(model.peekTable.workspace.id+'.'+model.peekTable.table.id)+'</b> · 대화는 '+esc(ws.id)+'에서 계속</span>':selectedGraph?'<span>선택한 그래프 <b>'+esc(selectedGraph.id)+'</b> · 원본 '+esc(selectedGraph.source_ref)+'</span>':t?'<span>선택한 결과 <b>'+esc(t.id)+'</b></span>':'')+
     (ws.selected_schemas?.length?'<span class="context-schema">스키마 '+esc(ws.selected_schemas.join(' · '))+'</span>':''):
     '<span>작업공간 연결을 확인하고 있어요.</span>';
  const pinned=ws?.selected_module,m=model.modules.find(x=>x.id===pinned?.id&&x.version===pinned?.version);
  $('selected-tool').innerHTML=pinned?'<span class="selected-tool">'+esc(m?.name||pinned.id)+' · v'+
     esc(pinned.version)+' <button data-unpin aria-label="선택한 분석 도구 해제">×</button></span>':'';
  $('input').disabled=!model.ready;
  updateComposer();
  $('tool-toggle').disabled=!model.ready||!ws||!!model.busy||workspaceHasUnresolvedJob();
}
// DATATALK_RESULT_NUMBER_UI_FIX_2026_10_12_3 — display only, never write data.
function dtNumber4(value,grouping=false){
 if(typeof value==='string'){
  const text=value.trim(),m=/^([+-]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if(m){
   const fraction=m[3]||'';
   if(/^0+$/.test(m[2])&&fraction.slice(0,4)==='0000'&&/[1-9]/.test(fraction)){
    const number=Number(text);if(number!==0&&Number.isFinite(number))return dtNumber4(number,grouping);
   }
   let scaled=BigInt(m[2])*10000n+BigInt((fraction+'0000').slice(0,4));
   if((fraction[4]||'0')>='5')scaled+=1n;
   let integer=(scaled/10000n).toString(),decimal=(scaled%10000n).toString().padStart(4,'0').replace(/0+$/,'');
   if(grouping)integer=integer.replace(/\B(?=(\d{3})+(?!\d))/g,',');
   return (m[1]==='-'&&scaled!==0n?'-':'')+integer+(decimal?'.'+decimal:'');
  }
  if(/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(text))value=Number(text);else return value;
 }
 if(typeof value!=='number'||!Number.isFinite(value))return String(value??'—');
 if(value!==0&&Math.abs(value)<.0001)return value.toExponential(4).replace(/(\.\d*?[1-9])0+e/,'$1e').replace(/\.0+e/,'e');
 const key=grouping?'grouped':'plain';dtNumber4._formats??={};dtNumber4._formats[key]??=new Intl.NumberFormat('en-US',{maximumFractionDigits:4,minimumFractionDigits:0,useGrouping:grouping});return dtNumber4._formats[key].format(Object.is(value,-0)?0:value);
}
function dtAnalysisText4(value){
 return String(value??'').replace(/(?<![\w.:-])[-+]?\d+(?:\.\d+)(?:[eE][-+]?\d+)?(?![\w.:-])/g,x=>dtNumber4(x));
}

function dtCell4(value,column){const kind=columnKind(typeof column==='string'?'':column.type??column.oid);return typeof value==='number'||typeof value==='string'&&['integer','number'].includes(kind)?dtNumber4(value):typeof value==='object'?JSON.stringify(value):value;}
function tableHTML(t) {
  const cols=t.columns||[],rows=t.rows||[],edsSelect=edsxSelectable(t),edsSelected=edsSelect?edsxSelection(t):null;
  const kind=c=>columnKind(typeof c==='string'?'':c.type),cls=c=>['integer','number'].includes(kind(c))?'cell-number':['date','datetime'].includes(kind(c))?'cell-date':'cell-text';
  return edsxDrilldownHTML(t)+'<div class="table-wrap panel-table"><table><thead><tr>'+(edsSelect?'<th scope="col">선택</th>':'')+'<th scope="col" class="cell-number">#</th>'+cols.map(c=>'<th scope="col" class="'+cls(c)+'">'+esc(typeof c==='string'?c:c.name)+'<small class="column-type">'+esc(typeof c==='string'?'자료형 미확인':columnTypeLabel(c.type??c.oid))+'</small></th>').join('')+'</tr></thead><tbody>'+ (rows.length?rows.map((row,i)=>'<tr>'+(edsSelect?'<td>'+(edsxRowTarget(t,row)?'<input class="edsx-result-select" type="checkbox" data-edsx-result-row="'+i+'" aria-label="'+(i+1)+'행 대상 선택" '+(edsSelected.has(i)?'checked':'')+'>':'')+'</td>':'')+'<td class="cell-number">'+esc(i+1)+'</td>'+cols.map((c,j)=>{const v=Array.isArray(row)?row[j]:row[typeof c==='string'?c:c.name];return '<td class="'+cls(c)+'">'+(v===null?'<em class="null">NULL</em>':esc(dtCell4(v,c)))+'</td>';}).join('')+'</tr>').join(''):'<tr><td colspan="'+(cols.length+1+(edsSelect?1:0))+'" class="no-rows">결과 행이 없습니다.</td></tr>')+'</tbody></table></div>';
}
window.DataTalkNumberDisplayHotfix='DATATALK_RESULT_NUMBER_UI_FIX_2026_10_12_3';
function qualityHTML(t){
  const a=t.analysis||{},r=a.result||{},q=a.data_quality||r.data_quality||{},n=v=>Number.isFinite(v)?v.toLocaleString():'확인 안 됨';
  if(!Object.keys(q).length)return '';
  const excluded=q.excluded_rows??q.dropped_rows??(Number.isFinite(q.input_rows)&&Number.isFinite(q.used_rows)?q.input_rows-q.used_rows:null);
  return '<div class="data-quality-summary"><strong>분석에 사용한 데이터</strong><span>전체 '+n(q.input_rows)+'건</span><span>사용 '+n(q.used_rows)+'건</span><span>제외 '+n(excluded)+'건</span><small>'+esc(q.exclusion_reason||'제외 사유와 분석 조건은 출처에서 확인해 주세요.')+'</small></div>';
}
function joinHTML(t){
  const d=t.join_diagnostics;if(!d)return '';
  const warnings=d.warnings||[],checks=d.checks||[];
  return '<div class="join-diagnostics"><strong>결합 확인 · '+esc(d.scope==='full'?'전체 데이터':d.scope==='preview'?'미리보기 범위':'검사 범위 확인 필요')+'</strong>'+warnings.map(x=>'<p>'+esc(typeof x==='string'?x:x.message)+'</p>').join('')+(checks.length?'<details><summary>검사 내역</summary><pre>'+esc(JSON.stringify(checks,null,2))+'</pre></details>':'')+'</div>';
}
function analysisDetails(t) {
  const a=t.analysis||{},r=a.result||{},q=a.data_quality||{};
  const p=r.presentation||{};
  if(p.short_summary)return compactAnalysisResult(p)+'<details class="api-advanced"><summary>분석 조건·상세 결과</summary><pre class="api-result-json">'+esc(JSON.stringify({parameters:a.parameters,data_quality:q,result:r,warnings:a.warnings},null,2))+'</pre></details>';
  return '<div class="analysis-details">'+(p.summary?'<div class="analysis-interpretation"><h3>'+esc(p.headline)+'</h3><p>'+esc(p.summary)+'</p><p>'+esc(p.descriptive_comparison||'')+'</p>'+(p.limitations?.length?'<details><summary>해석 시 확인할 점</summary><ul>'+p.limitations.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details>':'')+'</div>':'')+'<div class="condition-list">'+
    [['API',a.module_name||a.module_id],['버전',a.module_version],['원본',a.source_ref],['전체 입력 행수',q.input_rows??'기록 없음'],['사용 행수',q.used_rows??'기록 없음'],['입력 추출 시각',dateLabel(t.source_extracted_at)],...Object.entries(a.parameters||{}).map(([k,v])=>[k,Array.isArray(v)?v.join(', '):String(v)])]
    .map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+
    '<details><summary>API 결과 설명</summary><pre class="api-result-json">'+esc(JSON.stringify(r,null,2))+'</pre></details>'+
    (a.casts?'<details class="analysis-cast-history"><summary>분석용 자료형 변환</summary>'+Object.entries(a.casts).map(([n,r])=>esc(n)+' → '+esc(r.target)+(r.thousands?' · 천 단위 쉼표 제거':'')+(r.trim?' · 공백 제거':'')).join('<br>')+'</details>':'')+
    (a.warnings?.length?'<div class="analysis-warnings">'+a.warnings.map(x=>'<p>'+esc(typeof x==='string'?x:x.message)+'</p>').join('')+'</div>':'')+'</div>';
}

let linkedSelection=null,linkedSelectionRequest=null,linkedSelectionSequence=0;
function renderPanel() {
  const t=currentTable(),ws=model.current,g=currentGraph();
  if(!g||model.peekTable)clearLinkedSelection();
  if(model.peekTable||model.tab==='board'||(!g&&model.tab!=='graph'))window.DataTalkVisuals?.deactivate?.();
  if(model.peekTable&&ws){renderPeekTable();return;}
  if(model.tab==='board')model.tab='table';
  if(g){renderGraphPanel(g);return;}
  $('panel-title').textContent=t?ws.id+'.'+t.id:'Results';
  $('panel-sub').textContent=t?t.title:'왼쪽에서 테이블을 선택해 주세요';
  if(model.graphForm&&model.graphSetupSource&&(!t||model.graphForm.source_ref!==ws.id+'.'+t.id)){$('panel-title').textContent='New graph · '+model.graphForm.source_ref;$('panel-sub').textContent='저장 위치 '+ws.id+' · 원본 '+model.graphForm.source_ref;$('panel-content').innerHTML=graphCollectionHTML(model.graphForm.source_ref)+graphFormHTML(model.graphSetupSource,null);syncGraphForm();return;}
  if(!t) {
    $('panel-content').innerHTML='<div class="empty-panel">'+icon('table')+'<h2>여기에 결과가 쌓여요</h2><p>대화로 SQL을 실행하거나 분석 도구를 호출하면<br>만든 테이블을 이곳에서 볼 수 있어요.</p><button data-orphan-graphs>원본이 없는 이전 그래프 확인</button></div>';
    return;
  }
  const isApi=t.origin_type==='api',tab=model.tab==='sql'&&!isApi?'sql':
    model.tab==='history'?'history':model.tab==='graph'?'graph':model.tab==='details'&&isApi?'details':'table';
  model.tab=tab;
  let body=tab==='table'?tableHTML(t):tab==='sql'?
    '<div class="sql-panel"><pre><code>'+sqlHTML(t.sql)+'</code></pre><div class="param-title">바인딩 값</div><pre>'+
      esc(JSON.stringify(t.params??{},null,2))+'</pre></div>':tab==='history'?historyHTML(t):tab==='graph'?tableGraphHTML(t,ws):analysisDetails(t);
  $('panel-content').innerHTML=
    qualityHTML(t)+joinHTML(t)+lineageHTML(t,ws)+cacheInfoHTML(t,ws.id+'.'+t.id)+
    '<section class="result"><div class="result-head"><div><div class="result-title">'+icon(isApi?'spark':'table')+
      esc(t.title)+'</div><div class="result-meta">'+esc(t.rows.length.toLocaleString())+
      (t.truncated?'행 미리보기 · 전체 결과는 CSV로 다운로드':'행 · '+(isApi?'분석 결과':'조회 결과'))+
      ' · '+esc(t.columns.length)+'개 컬럼</div></div></div>'+
    '<div class="tabs"><button class="tab '+(tab==='table'?'active':'')+'" data-tab="table">Table</button>'+
      '<button class="tab '+(tab===(isApi?'details':'sql')?'active':'')+'" data-tab="'+(isApi?'details':'sql')+'">'+
        (isApi?'Analysis details':'&lt;/&gt; SQL')+'</button><span class="spacer"></span>'+
      '<button class="tab '+(tab==='graph'?'active':'')+'" data-table-graphs="'+esc(ws.id+'.'+t.id)+'">Graph</button><button class="tab '+(tab==='history'?'active':'')+'" data-history>History</button><button class="tab" data-table-types>Column types</button><button class="tab" data-api-open>＋ Run API</button>'+(!isApi?'<button class="tab" data-copy-sql>Copy SQL</button>':'')+'</div>'+
      body+'<div class="result-foot"><span>'+esc(ws.id+'.'+t.id)+'</span>'+
      '<button data-export '+(model.busy?'disabled':'')+'>'+icon('download')+' Download CSV</button></div></section>'+
    '<p class="pane-note">'+(isApi?'분석 결과표는 저장된 값으로 내려받습니다.':
      'SQL 전체 CSV는 다운로드 시점에 같은 조건으로 다시 조회합니다.')+
      '<br>추출: '+esc(dateLabel(t.extracted_at||t.updated_at||t.created_at))+
      (t.type_changes?.length?' · 자료형 변경: '+esc(dateLabel(t.type_changes.at(-1).at)):'')+
      (t.version>1?' · 첫 생성: '+esc(dateLabel(t.created_at)):'')+'</p>';
  syncGraphForm();
}
// Graphs are owned by their source table in the UI; canonical g references remain stable.
const tableGraphIndexes=new Map();
function knownTableGraphs(ref){
  const indexed=tableGraphIndexes.get(ref)?.graphs||[],items=new Map(indexed.map(g=>[g.canonical_ref,g]));
  for(const ws of model.cache.values())for(const g of ws.graphs||[])if(g.source_ref===ref)items.set(ws.id+'.'+g.id,{...g,workspace_id:ws.id,canonical_ref:ws.id+'.'+g.id});
  return [...items.values()];
}
function graphCardsHTML(graphs){return graphs.map(g=>{
  const ref=g.canonical_ref||g.workspace_id+'.'+g.id,selected=currentGraph()?.canonical_ref===ref;
  return '<div class="table-graph-card '+(selected?'active':'')+'"><button data-open-graph="'+esc(ref)+'" aria-label="'+esc(ref)+' 열기"><span class="alias">'+esc(ref)+'</span><strong>'+esc(g.title)+'</strong><small>'+esc(g.spec?.chart_type||g.chart_type||g.chart?.type||'Graph')+(g.origin_type==='api'?' · API result':'')+(g.stale?' · 원본 변경됨':'')+'</small></button><div class="table-graph-actions"><button data-rename="'+esc(ref)+'" aria-label="'+esc(ref)+' 이름 수정">✎ Rename</button><button data-delete="'+esc(ref)+'" aria-label="'+esc(ref)+' 삭제">× Delete</button></div></div>';
}).join('');}
function graphCollectionHTML(ref,{allowNew=true}={}){
  const state=tableGraphIndexes.get(ref),graphs=knownTableGraphs(ref);
  return '<section class="table-graph-collection" data-graph-source="'+esc(ref)+'" data-allow-new="'+allowNew+'"><header><div><strong>Graphs · '+esc(ref)+'</strong><small>이 테이블로 만든 그래프 · 다른 작업공간의 그래프는 해당 작업공간에서 열립니다.</small></div>'+(allowNew?'<button data-graph-new="'+esc(ref)+'">＋ New graph</button>':'')+'</header>'+(graphs.length?'<div class="table-graph-list">'+graphCardsHTML(graphs)+'</div>':'<p class="list-empty">'+(state?.loading?'저장된 그래프를 확인하고 있어요…':'저장된 그래프가 없어요. New graph로 시작하세요.')+'</p>')+(state?.error?'<p class="inline-error">'+esc(state.error)+' <button data-graph-index-retry="'+esc(ref)+'">Retry</button></p>':'')+'<button class="orphan-graphs-link" data-orphan-graphs>원본이 없는 이전 그래프 확인</button></section>';
}
function refreshGraphCollectionDOM(ref){
  for(const section of document.querySelectorAll('.table-graph-collection'))if(section.dataset.graphSource===ref)section.outerHTML=graphCollectionHTML(ref,{allowNew:section.dataset.allowNew!=='false'});
}
async function loadTableGraphIndex(ref,force=false){
  const prior=tableGraphIndexes.get(ref);if(prior?.loading||(!force&&prior?.loadedAt&&Date.now()-prior.loadedAt<15000))return;
  const state={...prior,loading:true,error:''};tableGraphIndexes.set(ref,state);
  try{const result=await api('/graphs?source_ref='+encodeURIComponent(ref));if(tableGraphIndexes.get(ref)!==state)return;state.graphs=result.graphs||[];state.loadedAt=Date.now();}
  catch(e){state.error='그래프 목록을 불러오지 못했습니다. '+e.message;}
  finally{state.loading=false;refreshGraphCollectionDOM(ref);}
}
function tableGraphHTML(t,ws){
  const ref=t.canonical_ref||ws.id+'.'+t.id;loadTableGraphIndex(ref);
  return graphCollectionHTML(ref)+(model.graphForm?graphFormHTML(model.graphSetupSource||t,null):'');
}
async function showTableGraphs(ref){
  if(!model.ready||model.busy)return;const [wid,tid]=ref.split('.');
  if(model.peekTable?.workspace.id===wid&&model.peekTable?.table.id===tid){model.peekTable.tab='graph';renderPanel();loadTableGraphIndex(ref,true);return;}
  await openTable(ref);if(model.peekTable){model.peekTable.tab='graph';renderPanel();}
  else {model.tab='graph';model.graphForm=null;renderPanel();}
  loadTableGraphIndex(ref,true);
}
async function newTableGraph(ref){
  if(!model.ready||model.busy)return;ref=ref||model.peekTable?.table?.canonical_ref||currentTable()?.canonical_ref||(currentTable()?model.current.id+'.'+currentTable().id:'');
  if(!ref)return;const [wid,tid]=ref.split('.');
  const ws=wid===model.current.id?model.current:model.cache.get(wid)||await api('/workspace/'+encodeURIComponent(wid));model.cache.set(wid,ws);
  const t=ws.tables.find(x=>x.id===tid);if(!t){toast('원본 테이블을 찾을 수 없습니다.');return;}
  model.peekTable=null;model.current.selected_graph_id=null;model.tab='graph';model.graphSetupSource=t;model.graphForm={...defaultGraphSpec(t),source_ref:ref};renderPanel();showResult();
}
async function showOrphanGraphs(){
  const d=$('orphan-graphs-dialog');d.showModal();$('orphan-graphs-body').innerHTML='<p>확인 중…</p>';
  try{const r=await api('/graphs?source_missing=true');$('orphan-graphs-body').innerHTML=r.graphs?.length?graphCardsHTML(r.graphs):'<p>원본이 없는 그래프가 없습니다.</p>';}
  catch(e){$('orphan-graphs-body').textContent=e.message;}
}
function chartSVG(c){return window.DataTalkVisuals.chartHTML(c);}
function graphFormHTML(t,g){return window.DataTalkVisuals.formHTML(t,g);}
function syncGraphForm(){window.DataTalkVisuals.mount();}
function renderGraphPanel(g){window.DataTalkVisuals.panel(g);$('panel-content').insertAdjacentHTML('afterbegin',graphCollectionHTML(g.source_ref,{allowNew:!g.source_missing}));loadTableGraphIndex(g.source_ref);renderLinkedSelection(g);}
function submitGraph(){return window.DataTalkVisuals.save();}
async function openGraph(ref){
  if(!model.ready||model.busy)return;const [wid,gid]=ref.split('.');model.busy={label:'그래프를 여는 중'};render();
  try{if(model.current?.id!==wid)apply(await api('/workspace/'+encodeURIComponent(wid)));const reply=await api('/graph/select',{workspace_id:wid,graph_id:gid,expected_revision:model.current.revision});apply(reply.workspace||reply);model.peekTable=null;model.tab='graph';model.graphForm=null;showResult();}catch(e){await fail(e);}finally{model.busy=null;render();}
}
async function loadHistory(){const t=currentTable(),ws=model.current;if(!t)return;model.tab='history';model.histories.set(ws.id+'.'+t.id,{loading:true});renderPanel();try{const r=await api('/table/history?workspace_id='+encodeURIComponent(ws.id)+'&table_id='+encodeURIComponent(t.id));model.histories.set(ws.id+'.'+t.id,r);}catch(e){model.histories.set(ws.id+'.'+t.id,{error:e.message});}renderPanel();}
function historyHTML(t){
  const history=model.histories.get(model.current.id+'.'+t.id);if(!history||history.loading)return '<p class="list-empty">이전 설정을 불러오는 중…</p>';if(history.error)return '<p class="inline-error">'+esc(history.error)+'</p>';
  return '<div class="history-panel"><p>SQL은 이전 조건으로 현재 데이터를 다시 조회합니다. 분석 결과는 보관된 값이 있을 때 복원합니다.</p>'+(history.entries?.length?history.entries.map(e=>'<section class="history-entry"><div><strong>버전 '+esc(e.version)+' · '+esc(e.title)+'</strong><small>'+esc(dateLabel(e.saved_at))+'</small></div><p>'+esc(e.message||'')+'</p>'+(e.sql?'<details><summary>SQL·조건 보기</summary><pre class="highlighted">'+sqlHTML(e.sql)+'</pre><pre>'+esc(JSON.stringify(e.params,null,2))+'</pre></details>':'')+'<button data-restore-history="'+esc(e.id)+'" '+(!e.can_restore||model.busy?'disabled':'')+'>'+(e.restore_mode==='requery'?'이 조건으로 조회 준비':'보관된 결과 복원')+'</button></section>').join(''):'<p class="list-empty">아직 이전 설정이 없어요.</p>')+'</div>';
}
async function restoreHistory(id){const ws=model.current,t=currentTable();if(!t||model.busy)return;model.busy={label:'이전 설정을 불러오는 중'};render();try{const reply=await api('/table/restore',{workspace_id:ws.id,table_id:t.id,history_id:id,expected_revision:ws.revision});apply(reply.workspace);model.tab='table';model.histories.delete(ws.id+'.'+t.id);toast(reply.restored?'보관된 결과를 복원했어요.':'대화창에서 이전 조건의 SQL을 확인하고 실행해 주세요.');}catch(e){await fail(e);}finally{model.busy=null;render();bottom();}}

let jobsPoll=null,recoveringJobs=false,jobRecoverySerial=0;
function recoveredJobsHTML(ws){
  const unknown=model.jobStatusUnknown?.has(ws.id),jobs=unresolvedJobs(ws.id);
  const status=unknown?'<div class="recovered-job" role="status"><strong>작업 상태 확인 필요</strong><p>기존 작업의 완료 여부를 확인한 뒤 새 조회를 진행할 수 있습니다. 자동으로 다시 실행하지 않습니다.</p><button data-job-refresh>작업 상태 다시 확인</button></div>':'';
  return status+jobs.map(j=>{const stopping=jobStopRequests.has(j.query_id),unconfirmed=j.state==='interrupted',disabled=stopping||(!unconfirmed&&j.cancel_requested);return '<div class="recovered-job" role="status" data-job-id="'+esc(j.query_id)+'" data-job-state="'+esc(j.state)+'"><strong>'+esc(j.kind==='export'?'전체 CSV 내보내기':j.kind==='graph'?'그래프 생성':'데이터 조회')+' · '+esc(unconfirmed?'실행 상태 확인 필요':j.cancel_requested?'DB 종료 확인 중':'진행 중')+'</strong><p>'+esc(j.message||(unconfirmed?'DB의 실제 종료 여부를 아직 확인하지 못했습니다. 자동 재실행하지 않습니다.':j.cancel_requested?'중단 요청은 전달했지만 DB 종료는 아직 확인 중입니다.':'기존 작업 상태를 확인하고 있어요. 완료되면 결과를 불러옵니다.'))+'</p><button data-job-cancel="'+esc(j.query_id)+'" '+(disabled?'disabled':'')+'>'+(stopping?'중단 요청 중…':unconfirmed?'DB 중단 요청':'작업 종료')+'</button><button data-job-refresh>상태 다시 확인</button></div>';}).join('');
}
async function recoverJobs(refreshWorkspace=false){
  clearTimeout(jobsPoll);const ws=model.current;if(!model.ready||!ws)return;if(refreshWorkspace===true){model.jobWorkspaceRefresh??=new Set();model.jobWorkspaceRefresh.add(ws.id);}if(recoveringJobs&&model.jobRecoveryWorkspaceId===ws.id)return;
  const serial=++jobRecoverySerial,epoch=model.connectionEpoch||0;recoveringJobs=true;model.jobRecoveryWorkspaceId=ws.id;model.jobStatusUnknown??=new Set();model.jobStatusUnknown.add(ws.id);render();
  const current=()=>serial===jobRecoverySerial&&epoch===(model.connectionEpoch||0)&&model.current?.id===ws.id;
  try{
    const response=await api('/jobs?workspace_id='+encodeURIComponent(ws.id));if(!current())return;
    model.jobs??=new Map();const previous=model.jobs.get(ws.id)||[],incoming=response.jobs||[],merged=new Map(incoming.map(j=>[j.query_id,j]));
    for(const old of previous){const next=merged.get(old.query_id);if(terminalJobStates.has(old.state)&&next&&!terminalJobStates.has(next.state))merged.set(old.query_id,old);else if(old.local_unconfirmed&&!next&&!terminalJobStates.has(old.state))merged.set(old.query_id,old);}
    const jobs=[...merged.values()];model.jobs.set(ws.id,jobs);model.jobStatusUnknown.delete(ws.id);for(const job of jobs)if(terminalJobStates.has(job.state))forgetPendingQuery(job.query_id);
    const latestExport=jobs.find(j=>j.kind==='export'&&j.state==='completed'&&j.result?.download_url);if(latestExport){model.recoveredExports??=new Map();model.recoveredExports.set(ws.id,latestExport.result);}
    const justFinished=jobs.filter(j=>previous.some(p=>p.query_id===j.query_id&&['running','cancelling','interrupted'].includes(p.state))&&terminalJobStates.has(j.state));
    for(const finished of justFinished)for(const request of apiRequests)if(request.query_id===finished.query_id&&request.path!=='/cancel'){request.stopReason='job-terminal';request.controller.abort();}
    if(model.jobWorkspaceRefresh?.has(ws.id)||justFinished.some(j=>j.state==='completed')){const fresh=await api('/workspace/'+encodeURIComponent(ws.id));if(!current())return;apply(fresh);model.jobWorkspaceRefresh?.delete(ws.id);}
    if(!current())return;const draft=model.current.analysis_setup;
    if(draft?.module&&model.current.analysis_run_id){const a=analysisState(draft,ws.id),generation=a.generation||0,rid=model.current.analysis_run_id;analysisUI=a;let run=response.analysis_runs?.find(r=>r.id===rid);if(!run&&!a.run){const reply=await api('/analysis/run/'+encodeURIComponent(rid));if(!current()||analysisUI!==a)return;run=reply.run;}if(run&&acceptAnalysisReply(a,{run},generation))a.config.parameters={...run.config?.parameters||draft.parameters};scheduleAnalysisPoll();}
    render();
  }catch(error){if(current()&&!quietConnectionError(error)){model.jobStatusUnknown.add(ws.id);toast('작업 상태를 확인하지 못했어요. 상태를 확인한 뒤 다시 진행해 주세요. '+error.message);render();}}
  finally{if(serial===jobRecoverySerial){recoveringJobs=false;model.jobRecoveryWorkspaceId=null;if(model.ready&&model.current?.id===ws.id&&(workspaceHasUnresolvedJob(ws.id)||model.jobWorkspaceRefresh?.has(ws.id)))jobsPoll=setTimeout(()=>recoverJobs(),unresolvedJobs(ws.id).some(j=>j.state==='running'||j.state==='cancelling')?1500:5000);}}
}
async function cancelRecoveredJob(id){
  if(jobStopRequests.has(id)||!model.ready)return;const wid=model.current?.id;if(!wid)return;const known=(model.jobs?.get(wid)||[]).find(j=>j.query_id===id);if(known&&terminalJobStates.has(known.state))return;
  jobStopRequests.add(id);const work=model.busy?.query_id===id?model.busy:null;if(work)work.cancelRequested=true;render();let refresh=false;
  try{
    const reply=await api('/cancel',{query_id:id});if(model.current?.id!==wid||!model.ready)return;
    let state=reply.cancelled===true?'cancelled':reply.recovery_state==='finished'&&terminalJobStates.has(reply.state)?reply.state:reply.state==='cancelling'?'cancelling':'interrupted';
    setLocalJob(wid,{query_id:id,kind:known?.kind||'query',state,cancel_requested:reply.cancel_requested===true,cancel_received:reply.cancel_received===true,local_unconfirmed:!terminalJobStates.has(state),message:reply.message||(terminalJobStates.has(state)?'서버 작업 종료 상태를 확인했습니다.':'중단 요청 후 DB의 실제 종료를 확인하고 있습니다.')});state=(model.jobs?.get(wid)||[]).find(j=>j.query_id===id)?.state||state;if(terminalJobStates.has(state))forgetPendingQuery(id);
    if(work){work.cancelRequested=state==='cancelling';work.label=terminalJobStates.has(state)?'서버 작업 종료 확인됨':reply.cancel_received?'중단 요청 전달됨 · DB 종료 확인 중':'DB 종료 여부 확인 필요';}
    if(terminalJobStates.has(state)){refresh=state==='completed';for(const request of apiRequests)if(request.query_id===id&&request.path!=='/cancel'){request.stopReason='job-terminal';request.controller.abort();}}
    toast(terminalJobStates.has(state)?state==='cancelled'?'DB 작업 종료를 확인했어요.':'서버 작업 상태를 확인했어요.':'중단 요청과 실제 DB 종료는 다릅니다. 작업 상태를 계속 확인합니다.');
  }catch(error){if(!quietConnectionError(error)&&model.ready){uncertainQuery(wid,id,known?.kind||'query','중단 여부를 확인하지 못했습니다. '+error.message+' DB 종료가 확인될 때까지 자동 재실행하지 않습니다.');if(work)work.cancelRequested=false;toast(error.message);}}
  finally{jobStopRequests.delete(id);if(model.ready&&model.current?.id===wid){render();await recoverJobs(refresh);}}
}
function recoveredExportHTML(ws){const r=model.recoveredExports?.get(ws.id);if(!r)return '';const u=new URL(r.download_url,location.origin);if(u.origin!==location.origin||!u.pathname.startsWith(apiBase+'/download/'))return '';return '<div class="recovered-job"><strong>CSV 준비 완료 · '+esc(r.row_count)+'행</strong><a href="'+esc(u.href)+'" download="'+esc(r.filename||'DataTalk.csv')+'">전체 CSV 다운로드</a></div>';}
function recommendationHTML(a){
  const rec=a.recommendation;if(a.recommendLoading)return '<p class="analysis-hint">컬럼과 자료형을 확인해 분석 기준을 제안하고 있어요.</p>';
  if(a.recommendError)return '<p class="analysis-hint">추천을 가져오지 못했어요. 입력 항목은 직접 선택할 수 있습니다. '+esc(a.recommendError)+'</p>';
  if(!rec)return '';
  const guides=rec.beginner_guidance||[],candidates=rec.candidates||{},warnings=rec.warnings||[],actions=rec.type_actions||[];
  return '<section class="analysis-recommendation"><strong>이 테이블에서 분석을 시작하는 방법</strong>'+guides.map(x=>'<p>'+esc(typeof x==='string'?x:x.message||x.text||JSON.stringify(x))+'</p>').join('')+Object.entries(candidates).map(([role,list])=>'<div class="recommend-candidates"><b>'+esc(({value_column:'비교할 값',group_column:'나눌 그룹',observation_columns:'관측 구분 기준',observation_id_columns:'관측 구분 기준',value:'비교할 값',group:'나눌 그룹',observation:'관측 구분 기준'})[role]||role)+'</b>'+list.slice(0,8).map(x=>'<span>'+esc(x.column||x.name)+' <small>'+esc(x.reason||'')+'</small></span>').join('')+'</div>').join('')+(rec.method_reason?'<p>'+esc(rec.method_reason)+'</p>':'')+warnings.map(x=>'<p class="analysis-hint">'+esc(typeof x==='string'?x:x.message||JSON.stringify(x))+'</p>').join('')+actions.map(x=>'<p class="analysis-hint">'+esc(typeof x==='string'?x:x.message||x.suggestion||JSON.stringify(x))+'</p>').join('')+(rec.expert_example?'<div class="expert-example"><strong>조건을 알고 있다면 이렇게 말해도 돼요</strong><p>'+esc(typeof rec.expert_example==='string'?rec.expert_example.text||rec.expert_example:rec.expert_example.text||JSON.stringify(rec.expert_example))+'</p></div>':'')+'<small>추천은 비어 있는 입력만 채웁니다. 직접 선택한 값은 유지합니다. 아래 조건을 확인한 뒤 실행하세요.</small></section>';
}
function blankParameter(value){return value===undefined||value===null||value===''||Array.isArray(value)&&!value.length;}
function saveAnalysisDraft(a,resetRun=false){
  const parameters=structuredClone(a.config.parameters);a.saving=(a.saving||0)+1;
  const write=async()=>{
    try{
      const r=await api('/analysis/draft',{workspace_id:a.workspace_id,draft_id:a.draft.id,config_revision:a.draft.config_revision||0,parameters,reset_run:resetRun});
      a.draft={...a.draft,parameters:r.parameters,config_revision:r.config_revision};a.saveError='';
      const ws=model.cache.get(a.workspace_id);if(ws?.analysis_setup?.id===a.draft.id){ws.analysis_setup=a.draft;if(resetRun)ws.analysis_run_id=r.analysis_run_id;}
      if(model.current?.id===a.workspace_id&&model.current.analysis_setup?.id===a.draft.id){model.current.analysis_setup=a.draft;if(resetRun)model.current.analysis_run_id=r.analysis_run_id;}
      return r;
    }catch(e){a.saveError=e.code==='ANALYSIS_DRAFT_CONFLICT'?'다른 창의 입력과 충돌했어요. 새로고침 후 입력 설정에서 최신값을 확인해 주세요.':e.message;throw e;}
    finally{a.saving--;if(analysisUI===a){const status=$('analysis-save-state');if(status)status.textContent=a.saveError|| (a.saving?'입력 저장 중…':'입력 저장됨');}}
  };
  a.saveQueue=(a.saveQueue||Promise.resolve()).catch(()=>{}).then(write);return a.saveQueue;
}
async function requestRecommendation(){
  const a=analysisUI;if(!a||a.recommendLoading||a.run)return;
  const edits={...a.fieldEdits};a.recommendAttempted=true;a.recommendLoading=true;a.recommendError='';renderAnalysis();
  try{
    const r=await api('/analysis/recommend',{workspace_id:a.workspace_id,draft_id:a.draft.id,parameters:a.config.parameters});
    a.recommendation=r.recommendation;a.recommendError=r.error?.message||(!r.supported?'이 API는 자동 추천을 제공하지 않습니다.':'');
    if(a.run||a.busy)return;
    let filled=0;
    for(const [key,value] of Object.entries(r.recommendation?.parameters||{})){
      if(blankParameter(a.config.parameters[key])&&!blankParameter(value)&&(a.fieldEdits?.[key]||0)===(edits[key]||0)){
        const binding=a.draft.module.dataset.bindings.find(b=>b.parameter===key);
        if(binding){const proposed=Array.isArray(value)?value:[value];const other=a.draft.module.dataset.distinct.filter(g=>g.includes(key)).flatMap(g=>g.filter(k=>k!==key).flatMap(k=>{const v=a.config.parameters[k];return Array.isArray(v)?v:v?[v]:[];}));if(proposed.some(n=>other.includes(n)))continue;}
        a.config.parameters[key]=value;filled++;
      }
    }
    if(filled){a.report=null;a.recommendFilled=filled;await saveAnalysisDraft(a);}
  }catch(e){a.recommendError=e.message;}
  finally{a.recommendLoading=false;if(analysisUI===a){renderAnalysis();renderChat();}}
}
function analysisHelpHTML(a){
  const sections=a.draft.module.ui.help_sections||[];if(!sections.length)return '';
  if(a.helpOpen===undefined&&a.draft.module.ui.layout==='compact')a.helpOpen=false;
  return '<details class="analysis-help" '+(a.helpOpen===false?'':'open')+'><summary>이 분석은 무엇이고, 어떻게 사용하나요?</summary>'+sections.map(s=>'<section><h3>'+esc(s.title)+'</h3><p>'+esc(s.text)+'</p>'+(s.columns?.length?'<div class="conversion-preview"><table><thead><tr>'+s.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+s.rows.map(r=>'<tr>'+r.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'')+'</section>').join('')+'</details>';
}
function analysisDiagnostics(a){
  const error=a.run?.error;if(!error&&!a.error&&!a.saveError)return '';
  if(a.draft.module.ui.layout==='compact')return compactAnalysisDiagnostics(a);
  return '<div class="inline-error" role="alert">'+esc(a.saveError||a.error||error?.message||'분석 상태를 확인하세요.')+
    (error?'<small>단계: '+esc(error.stage||a.run.error_stage||a.run.status)+' · 코드: '+esc(error.code||'UNKNOWN')+'</small>':'')+
    '<button class="secondary" data-api-action="diagnostics">진단 정보 복사</button></div>';
}
function analysisSummaryHTML(a){
  const p=a.config.parameters;if(!('value_column' in a.draft.module.parameters_schema.properties))return '';
  return '<p class="analysis-selection-summary"><strong>'+esc(p.value_column||'측정값 선택 필요')+'</strong>의 평균을 <strong>'+esc(p.group_column||'그룹 선택 필요')+'</strong>별로 비교합니다. 관측 ID: '+esc(p.observation_id_columns?.join(' + ')||'선택 필요')+'. 추천값과 관측 단위를 확인한 뒤 실행하세요.</p>';
}
async function openGraphSetup(setup){
  model.peekTable=null;
  const [wid,tid]=setup.source_ref.split('.');if(!model.cache.get(wid)?.tables?.some(t=>t.id===tid))model.cache.set(wid,await api('/workspace/'+encodeURIComponent(wid)));
  model.graphForm={source_ref:setup.source_ref,...setup.spec};model.tab='graph';model.graphSetupSource=model.cache.get(wid).tables.find(t=>t.id===tid);if(setup.graph_id)model.current.selected_graph_id=setup.graph_id;else model.current.selected_graph_id=null;renderPanel();showResult();
}


function renderCatalog() {
  const data=model.catalogue;
  if(!data){$('catalog-body').innerHTML='<p class="list-empty">테이블 목록을 불러오는 중...</p>';return;}
  const schemas=data.schemas||[],selected=model.schemaDraft,filter=$('catalog-search').value.trim().toLowerCase();
  const common=schemas.filter(s=>selected.has(s.name));
  const structure=table=>JSON.stringify(table.columns.map(c=>typeof c==='string'?[c,'']:[c.name,c.type||'']));
  const group=common.length?common[0].tables.filter(t=>common.every(s=>s.tables.some(x=>x.name===t.name &&
       structure(x)===structure(t)))):[];
  const visible=group.filter(t=>[t.name,t.description,
    t.columns.map(c=>typeof c==='string'?c:c.name).join(' ')].join(' ').toLowerCase().includes(filter));
  $('schema-choices').innerHTML=schemas.map(s=>'<label><input type="checkbox" data-schema="'+esc(s.name)+
    '" '+(selected.has(s.name)?'checked':'')+'> '+esc(s.name)+'</label>').join('')||'<span>조회 가능한 스키마가 없습니다.</span>';
  $('catalog-count').textContent=common.length?
    common.length+'개 스키마 · 공통 구조 테이블 '+group.length+'개':'스키마를 선택해 주세요';
  $('catalog-body').innerHTML=!common.length?'<p class="list-empty">먼저 스키마를 선택해 주세요.</p>':
    visible.length?visible.slice(0,150).map(t=>'<div class="catalog-table"><div><strong>'+esc(t.name)+'</strong>'+
      '<small>'+esc(t.description||'테이블 설명 없음')+'</small>'+
      '<small>컬럼 · '+esc(t.columns.map(c=>typeof c==='string'?c:c.name).join(', '))+'</small></div>'+
      '<button data-catalog-table="'+esc(t.name)+'">이 테이블로 질문하기 ↗</button></div>').join(''):
      '<p class="list-empty">선택한 스키마에 구조가 같은 테이블이 없거나 검색 결과가 없습니다.</p>';
}
function renderVisualizationReadiness(){const el=$('visualization-readiness');if(!el)return;const failed=model.visualizationReady===false;el.hidden=!failed;el.innerHTML=failed?'<strong>그래프 연결 설정이 필요합니다</strong><span>'+esc(model.visualizationChecks?.message||'시각화 모듈과 analysis_batches·pyarrow 연결을 확인해 주세요.')+'</span><small>DB 조회와 대화는 계속 사용할 수 있습니다.</small>':'';}
function render() {renderNav();renderChat();renderPanel();renderTools();renderVisualizationReadiness();}
function bottom() {requestAnimationFrame(()=>$('scroll').scrollTo({top:$('scroll').scrollHeight,behavior:'smooth'}));}
function showResult() {$('app').classList.add('mobile-open');}
async function fail(e) {
  if(e.code==='OPERATION_STOPPED'){toast(e.message);return;}
  if(quietConnectionError(e))return;
  if(e.status===401||['CSRF_INVALID','AUTH_REQUIRED','SESSION_EXPIRED'].includes(e.code)){expireAuthentication(e);return;}
  model.error=e.status===403?'이 작업에 필요한 권한이 없습니다. '+(e.message||''):e.message||String(e);
  if(e.status===409&&model.current){try{apply(await api('/workspace/'+encodeURIComponent(model.current.id)));}catch{}}
}
async function boot() {
  if(model.reconnecting){toast('연결 상태를 확인하고 있어요.');return;}
  if(model.busy&&!model.busy.query_id){toast('진행 중인 요청의 응답을 확인하고 있습니다. 완료 후 다시 연결해 주세요.');return;}
  if(tableTypesUI?.busy||tableTypesUI?.statusUnknown){toast('자료형 요청 상태를 확인하거나 요청을 중단한 뒤 다시 연결해 주세요.');return;}
  const previousWork=model.busy,old=model.current?.id;
  if(previousWork?.query_id&&old)uncertainQuery(old,previousWork.query_id,previousWork.label?.includes('CSV')?'export':previousWork.label?.includes('그래프')?'graph':'query','기존 요청의 응답 대기를 종료하고 서버 작업 상태를 다시 확인합니다. SQL은 재실행하지 않습니다.');
  resetApiTransport('refresh');model.busy=null;model.reconnecting=true;jobRecoverySerial++;recoveringJobs=false;clearTimeout(jobsPoll);stopCachePolling(true);
  const generation=++model.generation;
  model.ready=false;model.current=null;model.peekTable=null;model.apiConnectivity=null;model.summary=[];model.cache.clear();
  tableGraphIndexes.clear();model.error='';model.setup='';model.visualizationReady=null;model.visualizationChecks=null;renderVisualizationReadiness();$('connection-status').textContent='연결 확인 중';render();
  if(fileMode) {
    model.setup='연결 화면은 사내 서버의 /datatalk/에서 열어 주세요. 이 HTML은 V5.1 서버와 함께 사용하는 연결 화면입니다.';
    $('connection-status').textContent='사내 서버에서 열기';model.reconnecting=false;render();return;
  }
  try{
    const status=await api('/status');if(generation!==model.generation)return;
    if(status.contract!=='datatalk-chat-v2'||status.version!=='DATATALK-CONNECT-5.1')throw new Error('V5.1 PY와 HTML을 함께 설치해 주세요.');
    const uiBuild=document.querySelector('meta[name="datatalk-build"]')?.content;
    if(status.build_id!==uiBuild)throw new Error('PY와 HTML의 빌드가 달라요. V5.1 '+uiBuild+' 파일을 함께 설치하고 서버를 재시작해 주세요.');
    if(!status.ready)throw new Error(status.message||'기존 DB·LLM 연결을 확인해 주세요.');model.visualizationReady=status.visualization_ready!==false;model.visualizationChecks=status.visualization_checks||null;renderVisualizationReadiness();
    const list=await api('/workspaces');if(generation!==model.generation)return;
    model.summary=list.workspaces;
    let savedWorkspace=null;try{savedWorkspace=sessionStorage.getItem('datatalk.v2.active.workspace');}catch{}
    const allowed=new Set(model.summary.map(x=>x.id));
    const id=[old,savedWorkspace,list.active_workspace_id].find(x=>x&&allowed.has(x))||model.summary[0]?.id;
    apply(id?await api('/workspace/'+encodeURIComponent(id)):
             await api('/workspaces',{name:'새로운 데이터 대화'}));
    try{model.modules=(await api('/modules')).modules||[];}
    catch(e){model.error='분석 도구 목록: '+e.message;}
    if(generation!==model.generation)return;
    model.ready=true;refreshCacheStatus();$('connection-status').textContent=model.visualizationReady===false?'DB + LLM 연결 · 그래프 설정 필요':'DB + LLM 연결됨';
  }catch(e){if(generation!==model.generation)return;model.setup=e.message;
            $('connection-status').textContent=model.authRequired?'인증 필요':'연결 설정 필요';}
  finally{if(generation===model.generation||model.authRequired)model.reconnecting=false;}
  render();setSplit(model.split,false);bottom();if(model.ready)await recoverJobs();
}
async function newWorkspace() {
  if(!model.ready||model.busy)return;
  model.busy={label:'새 작업공간 생성 중'};render();
  try{apply(await api('/workspaces',{name:'새로운 데이터 대화'}));model.tab='table';$('app').classList.remove('mobile-open','full-result');}
  catch(e){await fail(e);}
  finally{model.busy=null;render();bottom();}
}
async function switchWorkspace(id) {
  if(!model.ready||model.busy)return;
  if(model.current?.id===id){model.peekTable=null;model.tab='table';model.expanded.add(id);render();return;}
  model.busy={label:'작업공간을 여는 중'};render();
  try{apply(await api('/workspace/'+encodeURIComponent(id)));model.tab='table';
      $('app').classList.remove('mobile-open','full-result');}
  catch(e){await fail(e);}
  finally{model.busy=null;render();bottom();await recoverJobs();}
}
async function expandWorkspace(id) {
  if(model.expanded.has(id)){model.expanded.delete(id);renderNav();return;}
  model.expanded.add(id);renderNav();
  if(!model.cache.has(id))try{model.cache.set(id,await api('/workspace/'+encodeURIComponent(id)));renderNav();}
  catch(e){model.expanded.delete(id);toast(e.message);renderNav();}
}
async function openTable(ref) {
  if(!model.ready||model.busy)return;
  const [wid,tid]=ref.split('.');
  model.busy={label:'테이블을 여는 중'};render();
  try{
    const ws=wid===model.current.id?model.current:await api('/workspace/'+encodeURIComponent(wid));
    if(!ws.tables.some(x=>x.id===tid))throw Error('이 테이블은 삭제되었거나 열 수 없습니다.');
    model.peekTable=null;apply(ws);
    if(ws.selected_table_id!==tid||ws.selected_graph_id){
      const reply=await api('/select',{workspace_id:wid,table_id:tid,expected_revision:ws.revision});
      apply(reply.workspace||reply);
    }
    model.current.selected_graph_id=null;model.graphForm=null;model.graphSetupSource=null;model.tab='table';showResult();
  }catch(e){await fail(e);}
  finally{model.busy=null;render();}
}
async function chooseModule(ref) {
  const pos=ref.lastIndexOf('@'),id=ref.slice(0,pos),version=ref.slice(pos+1);
  if(!model.current||model.busy)return;
  model.busy={label:'API 선택 중'};render();let chosen=false;
  try{apply(await api('/module/select',{workspace_id:model.current.id,module_id:id,version,expected_revision:model.current.revision}));model.toolOpen=false;chosen=true;}
  catch(e){await fail(e);}finally{model.busy=null;render();}
  if(chosen&&currentTable())await openAnalysis(model.current.id+'.'+currentTable().id);
  else if(chosen)toast('API를 선택했어요. 대상 테이블을 대화로 지정해 주세요.');
}

async function unpin() {
  if(!model.current||model.busy)return;
  model.busy={label:'분석 도구 선택 해제 중'};render();
  try{apply(await api('/module/select',{workspace_id:model.current.id,module_id:null,version:null,
       expected_revision:model.current.revision}));}
  catch(e){await fail(e);}
  finally{model.busy=null;render();}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-template42]');if(!b)return;const metro=b.dataset.template42==='FAB_METRO';$('input').value=b.dataset.template42+(metro?' 계측':' 공정')+' 데이터 추출\n1. 뽑을 제품 : EX) ej\n2. STEP_SEQ :\n3. 추출 기간 :\n'+(metro?'4. SUBITEM : AVG\n5. ':'4. ')+'추출 컬럼까지 선택하고 싶을 경우 아래 간편추출을 이용하면 편합니다.';$('input').focus();updateComposer();});
// Durable, authenticated workspace queues. Browser storage never contains queued questions.
const queue42=new Map();let queue42Loading=false,queue42Sending=false,stop42Busy=false,queue42Timer=null;
function analysis42Active(){const a=analysisUI;return !!a&&!!model.current&&a.workspace_id===model.current.id&&(a.busy||a.run&&!['completed','cancelled','failed','interrupted'].includes(a.run.status));}
function work42Active(){return !!queue42.get(model.current?.id)?.connectionUnknown||!!queue42.get(model.current?.id)?.active?.length||!!model.busy||workspaceHasUnresolvedJob()||analysis42Active()||!!tableTypesUI?.busy||[...apiRequests].some(r=>r.operation_id&&r.workspace_id===model.current?.id);}
function queue42Render(){
 const ws=model.current,q=queue42.get(ws?.id),el=$('queue42');if(!el)return;const key=JSON.stringify([ws?.id,q]);if(el.dataset.render42===key)return;el.dataset.render42=key;
 el.hidden=!q?.items?.length&&!q?.paused&&!q?.active?.length;
 el.innerHTML=q?'<div class="queue42-head"><strong>대기 '+q.items.length+'개'+(q.paused?' · 일시 정지':'')+'</strong>'+(q.paused?'<button data-queue42="resume">대기열 재개</button>':'<button data-queue42="pause">일시 정지</button>')+'</div>'+(q.reason?'<small>'+esc(q.reason)+'</small>':'')+(q.active?.length?'<p>서버 작업 '+q.active.length+'개 · '+esc(q.active.some(x=>x.status==='interrupted')?'상태 확인 필요 · ■ 중지로 후속 반영을 차단할 수 있어요.':'진행 중')+'</p>':'')+q.items.map((x,i)=>'<div class="queue42-item"><span>'+esc(i+1)+'. '+esc(x.message)+'</span><small>'+esc(x.context?.selected_table_id||'선택 테이블 없음')+(x.context?.selected_graph_id?' · '+esc(x.context.selected_graph_id):'')+' · '+esc(x.state==='queued'?'대기':x.state==='interrupted'?'상태 확인 필요':x.state==='failed'?'실패 · 내용 확인 필요':'처리 중')+'</small>'+(x.state==='queued'?'<button data-queue42-edit="'+esc(x.id)+'">수정</button><button data-queue42-remove="'+esc(x.id)+'">취소</button>':x.state==='failed'?'<button data-queue42-copy="'+esc(x.id)+'">입력창으로</button><button data-queue42-remove="'+esc(x.id)+'">취소</button>':'<button data-queue42-receipt="'+esc(x.id)+'">상태 확인</button>')+'</div>').join(''):'';
}
async function queue42Refresh(){
 if(queue42Loading||!model.ready||!model.current||window.DATATALK_OFFLINE_PREVIEW)return;
 const wid=model.current.id;queue42Loading=true;
 try{const previous=queue42.get(wid),q=await api('/queue',{workspace_id:wid,action:'list'});if(model.ready)queue42.set(wid,q);if(previous?.active?.length&&!q.active?.length&&model.current?.id===wid&&!model.busy){const fresh=await api('/workspace/'+encodeURIComponent(wid));if(model.current?.id===wid){apply(fresh);render();}}if(model.current?.id===wid)queue42Render();}
 catch(e){if(!quietConnectionError(e))queue42.set(wid,{items:queue42.get(wid)?.items||[],connectionUnknown:true,paused:true,reason:'대기열 연결을 확인하지 못했습니다. 다시 연결 후 재개하세요.'});}
 finally{queue42Loading=false;queue42Drain();}
}
async function queue42Action(action,extra={}){const wid=model.current?.id;if(!wid)return;const q=await api('/queue',{workspace_id:wid,action,...extra});queue42.set(wid,q);queue42Render();updateComposer();return q;}
async function queue42Drain(){
 const wid=model.current?.id,q=queue42.get(wid);if(!model.ready||queue42Sending||work42Active()||!q||q.paused||!q.items.length||q.items[0].state!=='queued')return;
 if(model.current.pending_question||model.current.pending_proposal){await queue42Action('pause',{reason:'현재 질문·실행 제안을 처리한 뒤 재개하세요.'}).catch(()=>{});return;}
 queue42Sending=true;try{await sendChat42(q.items[0].message,q.items[0]);}finally{queue42Sending=false;}
}
async function ask(raw){
 const message=String(raw||'').trim();if(!message||!model.ready||!model.current)return;
 if(message.length>12000){toast('질문은 12,000자 이내로 입력해 주세요.');return;}
 const q=queue42.get(model.current.id);
 if(work42Active()||q?.items?.length&&!q.paused){
   try{await queue42Action('add',{id:uuid(),message,selected_table_id:model.current.selected_table_id,selected_graph_id:model.current.selected_graph_id});$('input').value='';toast('대기열에 추가했어요.');updateComposer();queue42Drain();}catch(e){toast(e.message);}
   return;
 }
 await sendChat42(message);
}
async function sendChat42(message,entry=null){
 const ws=model.current;if(!ws||model.busy)return;const oid=entry?.id||uuid(),work={kind:'chat',label:'질문과 필요한 조건을 확인하고 있어요.',workspace_id:ws.id,operation_id:oid};
 model.toolOpen=false;model.error='';model.busy=work;if(!entry)$('input').value='';render();bottom();
 try{
   const result=await api('/chat',{workspace_id:ws.id,message,expected_revision:ws.revision,operation_id:oid,...(entry?{queue_id:entry.id}:{})});
   if(!model.ready||model.current?.id!==ws.id)return;
   if(!work.cancelRequested)dt6BeginReply(result.workspace,ws.messages.length);apply(result.workspace);if(!work.cancelRequested){if(result.analysis_setup)useAnalysisDraft(result.analysis_setup);if(result.graph_setup)await openGraphSetup(result.graph_setup);}
 }catch(e){
   if(!quietConnectionError(e)&&e.code!=='OPERATION_STOPPED')await fail(e);
   if(!entry&&e.code!=='OPERATION_STOPPED'&&!quietConnectionError(e)&&!$('input').value)$('input').value=message;
   await queue42Action('pause',{reason:e.code==='OPERATION_STOPPED'?'사용자가 중지했습니다.':'요청 상태를 확인한 뒤 대기열을 재개하세요.'}).catch(()=>{});
 }finally{if(model.busy===work)model.busy=null;render();bottom();if(!$('analysis-dialog').open)$('input').focus();await queue42Refresh();}
}
function updateStop42(){
 const active=model.ready&&work42Active();
 for(const dialog of document.querySelectorAll('dialog[open]')){
   if(!dialog.querySelector('[data-common-stop]')){const b=document.createElement('button');b.type='button';b.className='common-stop dialog-stop42';b.dataset.commonStop='';b.textContent='■ 중지';dialog.appendChild(b);}
 }
 for(const b of document.querySelectorAll('[data-common-stop]')){b.hidden=!active;b.disabled=stop42Busy;b.textContent=stop42Busy?'중지 요청 중…':'■ 중지';}
}
async function stopCurrent42(){
 if(stop42Busy||!model.current)return;dt6StopSpeaking();const wid=model.current.id;stop42Busy=true;if(model.busy)model.busy.cancelRequested=true;updateStop42();
 const steps=[queue42Action('pause',{reason:'사용자가 중지했습니다. 대기 메시지를 확인한 뒤 재개하세요.'})];
 try{
   const requests=[...apiRequests].filter(r=>r.workspace_id===wid),ids=new Set(requests.map(r=>r.operation_id).filter(Boolean));
   if(model.busy?.operation_id)ids.add(model.busy.operation_id);for(const r of queue42.get(wid)?.active||[])ids.add(r.id);
   if(analysisUI?.workspace_id===wid)steps.push(cancelAnalysis(analysisUI));
   if(tableTypesUI?.workspace_id===wid&&(tableTypesUI.busy||tableTypesUI.typeRequest))steps.push(cancelTypeRequest(tableTypesUI));
   for(const operation_id of ids)steps.push(api('/operations/cancel',{workspace_id:wid,operation_id}).then(r=>toast(r.message)));
   const queries=new Set([...requests.map(r=>r.query_id),model.busy?.query_id,...unresolvedJobs(wid).map(j=>j.query_id)].filter(Boolean));
   for(const id of queries)steps.push(cancelRecoveredJob(id));
   const outcomes=await Promise.allSettled(steps);const errors=outcomes.filter(x=>x.status==='rejected'&&x.reason?.code!=='OPERATION_NOT_FOUND');
   if(errors.length)toast('일부 중지 요청의 수신을 확인하지 못했습니다. 상태를 확인하고 다시 중지를 눌러 주세요.');
 }finally{stop42Busy=false;render();updateStop42();}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||b.disabled)return;
 if(b.hasAttribute('data-common-stop')){await stopCurrent42();return;}
 try{
  if(b.dataset.queue42){await queue42Action(b.dataset.queue42);queue42Drain();}
  if(b.dataset.queue42Copy){const item=queue42.get(model.current.id)?.items.find(x=>x.id===b.dataset.queue42Copy);if(item){$('input').value=item.message;await queue42Action('remove',{id:item.id});$('input').focus();updateComposer();}}
  if(b.dataset.queue42Remove)await queue42Action('remove',{id:b.dataset.queue42Remove});
  if(b.dataset.queue42Edit){const item=queue42.get(model.current.id)?.items.find(x=>x.id===b.dataset.queue42Edit);if(!item)return;const message=prompt('대기 메시지 수정',item.message);if(message?.trim())await queue42Action('edit',{id:item.id,message});}
  if(b.dataset.queue42Receipt){const r=await api('/operations/'+encodeURIComponent(b.dataset.queue42Receipt));toast('요청 상태: '+r.status);if(r.status==='completed')apply(await api('/workspace/'+encodeURIComponent(model.current.id)));await queue42Refresh();}
 }catch(error){toast(error.message);}
});
queue42Timer=setInterval(()=>{updateStop42();if(model.ready)queue42Refresh();},1800);

async function executeProposal(id) {
  const ws=model.current,p=ws?.pending_proposal;
  if(!ws||p?.id!==id||model.busy||!model.ready||workspaceHasUnresolvedJob(ws.id))return;
  const analysis=p.kind==='analysis',queryId=uuid();
  model.busy={label:analysis?'전체 데이터 확인 후 분석 API 실행 중':'승인한 SQL로 DB 조회 중',
              query_id:queryId,cancelable:!analysis};const work=model.busy;model.error='';render();bottom();
  try{const result=await api(analysis?'/analysis/execute':'/execute',
       {workspace_id:ws.id,proposal_id:id,query_id:queryId,expected_revision:ws.revision});
      apply(result.workspace);
      if(result.empty_result){$('app').classList.remove('mobile-open');toast('0행 결과는 저장하지 않았어요. 조건을 수정해 다시 요청해 주세요.');}
      else {model.peekTable=null;model.current.selected_graph_id=null;model.graphForm=null;model.graphSetupSource=null;model.tab='table';showResult();
        toast(analysis?'분석 결과가 새 테이블에 저장됐어요.':p.operation==='replace'?'테이블을 갱신했어요. API와 CSV에도 적용됩니다.':'조회 결과가 새 테이블에 저장됐어요.');}}
  catch(e){
    if(e.code==='SQL_TYPE_MISMATCH'){
      try{apply(await api('/workspace/'+encodeURIComponent(ws.id)));model.error='';$('app').classList.remove('mobile-open');toast('자료형 오류를 확인하고 수정 SQL을 다시 요청해 주세요.');}
      catch{await fail(e);}
    }else await fail(e);
  }
  finally{if(model.busy===work)model.busy=null;render();bottom();}
}
async function cancelQuery() {const work=model.busy;if(!work?.cancelable||work.cancelRequested)return;await cancelRecoveredJob(work.query_id);}
async function copyText(value) {
  try{await navigator.clipboard.writeText(value);toast('내용을 복사했어요.');}
  catch{const a=document.createElement('textarea');a.value=value;document.body.append(a);a.select();
        document.execCommand('copy');a.remove();toast('복사한 내용을 확인해 주세요.');}
}
async function exportTable() {
  const t=currentTable(),ws=model.current;if(!t||model.busy||!model.ready||workspaceHasUnresolvedJob(ws.id))return;
  model.busy={label:t.origin_type==='api'?'분석 결과 CSV 준비 중':'전체 조회 결과 CSV 생성 중',
              query_id:uuid(),cancelable:t.origin_type!=='api'};const work=model.busy;render();
  try{
    const r=await api('/export',{workspace_id:ws.id,table_id:t.id,query_id:model.busy.query_id});
    const url=new URL(r.download_url,location.origin);
    if(url.origin!==location.origin||!url.pathname.startsWith(apiBase+'/download/'))throw Error('다운로드 경로가 올바르지 않습니다.');
    const link=document.createElement('a');link.href=url.href;link.download=r.filename||'DataTalk.csv';
    document.body.append(link);link.click();link.remove();
    toast('CSV 준비 완료 · '+r.row_count.toLocaleString()+'행');
  }catch(e){await fail(e);}
  finally{if(model.busy===work)model.busy=null;render();}
}
async function openCatalog() {
  if(!model.ready||!model.current)return;
  catalogSequence++;
  const dialog=$('catalog-dialog');dialog.showModal();
  model.schemaDraft=new Set(model.current.selected_schemas||[]);
  $('catalog-search').value='';$('catalog-body').innerHTML='<p class="list-empty">테이블 목록을 불러오는 중...</p>';
  try{model.catalogue=await api('/catalogue?search=');renderCatalog();}
  catch(e){model.catalogue=null;$('catalog-body').innerHTML='<div class="inline-error">'+esc(e.message)+'</div>';}
}
async function saveSchemas() {
  if(!model.current||model.busy)return;
  const names=[...model.schemaDraft];
  try{apply(await api('/schema/select',{workspace_id:model.current.id,
       schemas:names,expected_revision:model.current.revision}));
      toast(names.length?names.length+'개 제품 선택됨':'제품 선택 해제됨');render();}
  catch(e){await fail(e);render();}
}
async function cataloguePrompt(name) {
  if(!model.schemaDraft.size){toast('스키마를 먼저 선택해 주세요.');return;}
  const prior=new Set(model.current?.selected_schemas||[]);
  if(prior.size!==model.schemaDraft.size||[...model.schemaDraft].some(x=>!prior.has(x)))await saveSchemas();
  if(!model.current||new Set(model.current.selected_schemas||[]).size!==model.schemaDraft.size||
     [...model.schemaDraft].some(x=>!model.current.selected_schemas.includes(x)))return;
  const sources=[...model.schemaDraft].map(s=>s+'.'+name);
  $('catalog-dialog').close();
  $('input').value=sources.length===1?
    sources[0]+'에서 필요한 데이터를 조회하고 싶어. 기간과 조건을 먼저 확인해줘.':
    sources.join(', ')+'의 동일한 테이블을 하나로 조회해줘. 중복 행은 유지하고 원본 스키마를 구분해줘. 기간과 조건을 먼저 확인해줘.';
  $('input').focus();updateComposer();
}
async function openRename(ref) {
  const [wid,tid]=ref.split('.');let ws=model.cache.get(wid);if(!ws||(tid.startsWith('g')&&!ws.graphs?.some(g=>g.id===tid))){try{ws=await api('/workspace/'+encodeURIComponent(wid));model.cache.set(wid,ws);}catch(e){toast(e.message);return;}}const t=(tid.startsWith('g')?ws?.graphs:ws?.tables)?.find(x=>x.id===tid);
  if(!t){toast('결과를 찾을 수 없습니다. 목록을 새로 열어 주세요.');return;}model.draftTarget=ref;
  $('rename-title').value=t.title;$('rename-ref').textContent=ref;$('rename-dialog').showModal();
}
async function confirmRename() {
  const ref=model.draftTarget;if(!ref)return;
  const [wid,tid]=ref.split('.');if(model.current?.id!==wid)await switchWorkspace(wid);
  try{const reply=await api(tid.startsWith('g')?'/graph/rename':'/table/rename',{workspace_id:wid,...(tid.startsWith('g')?{graph_id:tid}:{table_id:tid}),
       title:$('rename-title').value,expected_revision:model.current.revision});apply(reply.workspace||reply);
      $('rename-dialog').close();tableGraphIndexes.clear();toast(tid+' 이름을 바꿨어요.');render();}
  catch(e){toast(e.message);}
}
function openDelete(ref) {
  if(workspaceHasUnresolvedJob(ref.split('.')[0])){toast('작업 종료를 확인한 뒤 결과를 삭제해 주세요.');return;}
  $('delete-warning').textContent='';model.draftTarget=ref;$('delete-ref').textContent=ref;$('delete-dialog').showModal();
}
async function confirmDelete() {
  const ref=model.draftTarget;if(!ref)return;
  const [wid,tid]=ref.split('.');if(workspaceHasUnresolvedJob(wid)){$('delete-warning').textContent='작업 종료를 확인한 뒤 결과를 삭제해 주세요.';return;}if(model.current?.id!==wid)await switchWorkspace(wid);
  try{const reply=await api(tid.startsWith('g')?'/graph/delete':'/table/delete',{workspace_id:wid,...(tid.startsWith('g')?{graph_id:tid}:{table_id:tid}),expected_revision:model.current.revision});apply(reply.workspace||reply);
      $('delete-dialog').close();tableGraphIndexes.clear();model.graphForm=null;model.graphSetupSource=null;model.current.selected_graph_id=null;model.tab=tid.startsWith('g')?'graph':'table';toast(tid+' 결과를 삭제했어요.');render();}
  catch(e){$('delete-warning').textContent=e.message;}
}
// One declarative input form shared by all registered modules.
// One declarative input form shared by all registered modules.
let analysisUI=null,analysisPoll=null;
const analysisCache=new Map();
const analysisStateNames={preparing:'전체 데이터 검사 중',prepared:'전체 검사 완료 · 실행 가능',submitting:'API 제출 확인 중',queued:'API 대기 중',running:'API 실행 중',cancelling:'작업 종료 확인 중',completed:'처리 완료',failed:'입력 확인 필요',cancelled:'작업 종료됨',interrupted:'준비 중단'};
function analysisState(draft,wid){
  if(!analysisCache.has(draft.id))analysisCache.set(draft.id,{workspace_id:wid,draft,config:{parameters:{...draft.parameters},casts:Object.fromEntries(draft.columns.map(c=>[c.name,{target:'original',thousands:false,trim:false}]))},report:null,run:null,error:'',busy:false,filters:{},fieldEdits:{}});
  const a=analysisCache.get(draft.id);
  if(!a.saving&&(draft.config_revision||0)>(a.draft.config_revision||0)){a.draft=draft;a.config.parameters={...draft.parameters};}
  return a;
}
function useAnalysisDraft(draft,open=true){
  analysisUI=analysisState(draft,model.current.id);
  if(draft.module.ui.mode==='form'){
    renderAnalysis();if(open&&!$('analysis-dialog').open)$('analysis-dialog').showModal();
    if(!analysisUI.recommendAttempted&&!analysisUI.run&&!model.current.analysis_run_id)requestRecommendation();
  }else if($('analysis-dialog').open)$('analysis-dialog').close();
  renderChat();
}
function analysisBody(){const a=analysisUI;return {workspace_id:a.workspace_id,draft_id:a.draft.id,...(a.start_id?{start_id:a.start_id}:{}),config:{parameters:a.config.parameters}};}
function analysisSelected(a=analysisUI){
  const module=a.draft.module;if(module.dataset.projection==='all')return a.draft.columns.map(c=>c.name);
  return [...new Set(module.dataset.bindings.flatMap(b=>{const v=a.config.parameters[b.parameter];return typeof v==='string'?[v]:Array.isArray(v)?v:[]}).filter(Boolean))];
}
function displayValue(value){return value===null?'<span class="null">NULL</span>':esc(typeof value==='number'?dtNumber4(value):typeof value==='string'?'"'+value+'"':String(value));}
function reportHTML(report,scope){
  if(!report)return '';
  const names=Object.keys(report.columns),bad=report.failed_rows||report.required_null_rows;
  return '<div class="conversion-report '+(bad?'has-errors':'')+'"><div class="report-stats"><div><small>'+esc(scope==='sample'?'샘플 검사':scope==='progress'?'현재까지 검사':'전체 검사')+'</small><strong>'+report.rows_checked.toLocaleString()+'<em>행</em></strong></div><div><small>자료형 오류</small><strong>'+report.failed_rows.toLocaleString()+'<em>행</em></strong></div><div><small>NULL 포함</small><strong>'+report.null_rows.toLocaleString()+'<em>행</em></strong></div><div><small>허용되지 않는 NULL</small><strong>'+report.required_null_rows.toLocaleString()+'<em>행</em></strong></div></div><p class="analysis-hint">'+(scope==='sample'?'미리보기의 최대 200행입니다. 실행 전 전체 데이터도 검사합니다.':scope==='progress'?'전체 데이터 검사가 진행 중입니다.':'자료형 검사를 마쳤습니다. API 자체의 추가 검증은 실행 시 적용됩니다.')+'</p>'+
    (report.warnings||[]).map(w=>'<p class="conversion-warning">'+esc(w.message||w)+'</p>').join('')+
    names.filter(n=>report.columns[n].failed).map(n=>'<div class="cast-errors"><strong>'+esc(n)+' · '+report.columns[n].failed+'건</strong>'+report.columns[n].examples.map(e=>'<span>행 '+e.row+' · '+esc(e.value)+' <small>'+esc(({COLUMN_TYPE_MISMATCH:'API 입력 자료형과 다름',CAST_INVALID:'변환할 수 없는 값',INTEGER_REQUIRED:'정수가 아님',NUMBER_OUT_OF_RANGE:'숫자 범위 초과'})[e.reason]||e.reason)+'</small></span>').join('')+'</div>').join('')+
    (report.preview.length?'<details class="api-preview-details"><summary>검사 샘플 보기</summary><div class="conversion-preview"><table><thead><tr>'+names.map(n=>'<th>'+esc(n)+'</th>').join('')+'</tr></thead><tbody>'+report.preview.map(row=>'<tr>'+row.map(c=>'<td>'+displayValue(c.before)+' <span class="cast-arrow">→</span> '+displayValue(c.after)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>':'')+'</div>';
}
function fieldHTML(field,index,a,locked){
  const schema=a.draft.module.parameters_schema,spec=schema.properties[field.parameter],value=a.config.parameters[field.parameter],id='api-field-'+index,disabled=locked?'disabled':'',required=(schema.required||[]).includes(field.parameter);
  const label='<span class="api-field-label">'+esc(field.label)+(required?'<b aria-label="필수">*</b>':'')+'</span>';
  let control='';
  if(field.widget==='column'||field.widget==='columns'){
    const multi=field.widget==='columns',q=a.filters?.[index]||'';
    control='<div class="api-multiple"><div class="column-selection">'+esc(multi?(value||[]).join(', ')||'선택 없음':value||'선택 없음')+' <button type="button" data-clear-field="'+index+'" '+disabled+'>선택 해제</button></div><input id="'+id+'" type="search" data-column-filter="'+index+'" value="'+esc(q)+'" aria-label="'+esc(field.label)+' 컬럼 검색" placeholder="컬럼 이름으로 검색" '+disabled+'><div class="observation-choices">'+a.draft.columns.map((c,ci)=>({c,ci})).sort((x,y)=>field.parameter==='value_column'?Number(!['integer','number'].includes(columnKind(x.c.type)))-Number(!['integer','number'].includes(columnKind(y.c.type))):0).map(({c,ci})=>'<label data-column-option="'+ci+'" '+(!c.name.toLowerCase().includes(q.toLowerCase())?'hidden':'')+'><input type="'+(multi?'checkbox':'radio')+'" name="api-column-'+index+'" data-api-field="'+index+'" data-column="'+ci+'" '+((multi?Array.isArray(value)&&value.includes(c.name):value===c.name)?'checked':'')+' '+disabled+'><span>'+esc(c.name)+' <small>'+esc(({integer:'숫자',number:'숫자',string:'문자',date:'날짜',datetime:'날짜·시간'})[columnKind(c.type??c.oid)]||columnTypeLabel(c.type??c.oid))+'</small></span></label>').join('')+'</div></div>';
  }
  else if(field.widget==='select')control='<select id="'+id+'" data-api-field="'+index+'" '+disabled+'><option value="">선택</option>'+spec.enum.map((v,i)=>'<option value="'+i+'" '+(value===v?'selected':'')+'>'+esc(field.option_labels?.[String(v)]||v)+'</option>').join('')+'</select>';
  else if(field.widget==='checkbox')control='<label class="api-checkbox"><input id="'+id+'" type="checkbox" data-api-field="'+index+'" '+(value===true?'checked':'')+' '+disabled+'><span>'+esc(field.help||'사용')+'</span></label>';
  else control='<input id="'+id+'" type="'+(field.widget==='number'?'number':'text')+'" '+(field.widget==='number'?'step="'+(spec.type==='integer'?'1':'any')+'"':'maxlength="'+Math.min(spec.maxLength||4000,4000)+'"')+' data-api-field="'+index+'" value="'+esc(value??'')+'" '+disabled+'>';
  return '<div class="api-field '+(field.widget==='columns'?'wide':'')+'" data-field-wrap="'+index+'">'+(['column','columns'].includes(field.widget)?label:'<label for="'+id+'">'+label+'</label>')+control+(field.help&&field.widget!=='checkbox'?'<small>'+esc(field.help)+'</small>':'')+'</div>';
}
function runHTML(a){
  const run=a.run;if(!run)return a.cancelAfterPrepare?'<p class="analysis-hint" role="status">종료 요청을 받았어요. 준비 작업이 연결되는 즉시 중단합니다.</p>':'';
  const note=run.cancel_requested&&!['completed','failed','cancelled','interrupted'].includes(run.status)?run.cancel_error||'종료 요청을 전달했어요. DB·API의 실제 종료를 확인하고 있습니다.':'';
  return '<div class="analysis-run-state" role="status"><span class="run-dot '+(run.status==='completed'?'done':'')+'"></span><div><strong>'+esc(analysisStateNames[run.status]||run.status)+'</strong><small>'+esc(run.progress?((run.progress.input_rows||0).toLocaleString()+' / '+(run.progress.total_rows||0).toLocaleString()+'행 처리'):run.status==='completed'?(run.result_refs||[]).join(', '):'')+'</small></div></div>'+(note?'<p class="analysis-hint">'+esc(note)+'</p>':'');
}
function actionHTML(a){
  const r=a.run,busy=a.busy?'disabled':'',form=a.draft.module.ui.mode==='form';
  const ready=!r&&(!form||a.report&&!a.report.failed_rows&&!a.report.required_null_rows);
  return '<div class="api-actions">'+(!r&&form?'<button class="secondary" data-api-action="preview" '+busy+'>입력 확인</button>':'')+
    (r&&['prepared','completed','failed','cancelled','interrupted'].includes(r.status)?'<button class="secondary" data-api-action="edit" '+busy+'>'+(form?'입력 수정':'다시 준비')+'</button>':'')+
    (r&&!['completed','failed','cancelled','interrupted'].includes(r.status)||!r&&a.busyAction==='prepare'?'<button class="secondary stop-analysis" data-api-action="cancel" '+(a.cancelBusy||a.cancelAfterPrepare?'disabled':'')+'>'+(a.cancelBusy?'종료 요청 중':a.cancelAfterPrepare?'종료 요청됨':r?.cancel_requested?'작업 종료 재요청':'작업 종료')+'</button>':'')+
    (!r?'<button class="primary" data-api-action="prepare" '+(!ready||a.busy?'disabled':'')+'>전체 데이터 검사</button>': ['prepared','submitting'].includes(r.status)?'<button class="primary" data-api-action="submit" '+(a.busy||r.cancel_requested?'disabled':'')+'>'+(r.status==='submitting'?'제출 상태 확인':'API 실행')+'</button>':r.status==='completed'?'<button class="primary" data-api-action="result">결과 보기 ↗</button>':'')+'</div>';
}
function reviewValue(field,a){
  const v=a.config.parameters[field.parameter];
  if(v===undefined||v===null||v===''||Array.isArray(v)&&!v.length)return '<em>선택 필요</em>';
  if(Array.isArray(v))return esc(v.join(', '));
  if(field.widget==='checkbox')return v?'예':'아니요';
  return esc(field.option_labels?.[String(v)]??String(v));
}
function columnTypeLabel(raw){const oid={'16':'boolean','17':'bytea','20':'bigint','21':'smallint','23':'integer','25':'text','700':'real','701':'double precision','1042':'char','1043':'varchar','1082':'date','1083':'time','1114':'timestamp','1184':'timestamptz','1186':'interval','1266':'timetz','1700':'numeric','2950':'uuid','114':'json','3802':'jsonb'};const text=String(raw??'').trim();return oid[text]||(/^\d+$/.test(text)?'OID '+text+' · 자료형 확인 필요':text||'자료형 미확인');}
function columnKind(raw){
  const oid={'20':'bigint','21':'smallint','23':'integer','700':'real','701':'double precision','1700':'numeric','25':'text','1043':'varchar','1042':'char','1082':'date','1114':'timestamp','1184':'timestamptz','16':'boolean'};const t=oid[String(raw)]||String(raw||'').trim().toLowerCase();
  if(/^(smallint|integer|bigint|int2|int4|int8|serial|bigserial|u?int(8|16|32|64))$/.test(t))return 'integer';
  if(/^(numeric|decimal(?:128|256)?|real|double precision|float\d*|float64|number|money)(\(|$)/.test(t))return 'number';
  if(/^(text|string|varchar|character varying|character|char|uuid)(\(|$)/.test(t))return 'string';
  if(/^(boolean|bool)$/.test(t))return 'boolean';
  if(/^(date|date32|date64)(\b|\[|$)/.test(t))return 'date';
  if(/^(timestamp|timestamptz|datetime)/.test(t))return 'datetime';
  return null;
}
function typeWarnings(a){
  const found=new Map(),columns=new Map(a.draft.columns.map(c=>[c.name,c]));
  for(const binding of a.draft.module.dataset.bindings){
    const selected=a.config.parameters[binding.parameter];
    for(const name of typeof selected==='string'?[selected]:Array.isArray(selected)?selected:[]){
      const c=columns.get(name),kind=columnKind(c?.type);
      if(!c||!kind||binding.types.includes(kind)||kind==='integer'&&binding.types.includes('number'))continue;
      const requested=binding.types.includes('number')?'숫자':binding.types.includes('integer')?'정수':binding.types.includes('string')?'문자열':binding.types.join('/');
      found.set(name,{name,actual:columnTypeLabel(c.type??c.oid),requested,inferred:c.inferred});
    }
  }
  for(const [name,stat] of Object.entries(a.report?.columns||a.run?.report?.columns||{})){
    if(stat.failed&&!found.has(name))found.set(name,{name,actual:columns.get(name)?.type||'확인 필요',requested:'API 요구 자료형',inferred:true});
  }
  return [...found.values()];
}
function typeWarningHTML(a){
  const issues=typeWarnings(a);if(!issues.length)return '';
  return '<div class="api-type-warning" role="note"><strong>자료형을 확인해 주세요</strong><ul>'+issues.map(x=>
    '<li>'+esc(x.name)+' · 현재 '+esc(x.actual)+(x.inferred?' (샘플 추정)':'')+' → '+esc(x.requested)+' 필요</li>').join('')+'</ul>'+ 
    '<p>전체 분석 전에 <b>컬럼·자료형 → 변환 확인 → 변경 SQL 확인 → SQL 실행</b> 순서로 적용하세요. 원본 DB 구조는 바꾸지 않습니다.</p>'+ 
    '<button data-table-types="'+esc(a.draft.source_ref)+'">컬럼·자료형 열기 ↗</button></div>';
}
function compactObservationHTML(a){
  const p=a.config.parameters,ids=p.observation_id_columns||[];
  if(p.observation_mode==='rows')return '<p class="anova-unit">비교 단위 · 각 행'+(p.independent_rows_confirmed?' · 독립 대상 확인됨':' · 추가 옵션에서 확인 필요')+'</p>';
  if(ids.length)return '<p class="anova-unit">'+(p.observation_mode==='mean'?'대상별 평균':'대상 구분 후보 · 전체 데이터 검증 필요')+' · <strong>'+esc(ids.join(' + '))+'</strong></p>';
  if(a.recommendLoading||!p.value_column||!p.group_column)return '';
  return '<div class="anova-unit-question"><strong>각 행이 서로 다른 대상의 측정값인가요?</strong><p>같은 대상을 여러 번 측정했다면 대상 구분을 선택해 주세요.</p><button data-api-action="confirm_rows">네, 각 행이 다른 대상이에요</button> <button data-api-action="edit_unit">대상 구분 선택</button></div>';
}
function compactReady(a){
  const p=a.config.parameters;
  return !!p.value_column&&!!p.group_column&&p.value_column!==p.group_column&&
    (p.observation_mode==='rows'?p.independent_rows_confirmed===true:!!p.observation_id_columns?.length);
}
function compactActions(a){
  const r=a.run,disabled=a.busy||a.recommendLoading?'disabled':'';
  let buttons='';
  if(!r)buttons='<button class="secondary" data-api-action="cancel_setup">'+(a.busy?'준비 중지':'취소')+'</button><button class="primary" data-api-action="start" '+(!compactReady(a)||disabled?'disabled':'')+'>'+(a.busy?'준비 중…':'분석 시작')+'</button>';
  else if(r.status==='completed')buttons='<button class="secondary" data-api-action="edit" '+disabled+'>입력 수정</button><button class="primary" data-api-action="result">그룹별 결과 보기 ↗</button>';
  else if(['failed','cancelled','interrupted'].includes(r.status))buttons='<button class="secondary" data-api-action="edit" '+disabled+'>입력 수정</button>';
  else if(['prepared','submitting'].includes(r.status))buttons='<button class="primary" data-api-action="submit" '+(disabled||r.cancel_requested?'disabled':'')+'>'+(r.status==='submitting'?'제출 상태 확인':'분석 실행')+'</button>';
  if(r&&!['completed','failed','cancelled','interrupted'].includes(r.status)||!r&&a.busyAction==='prepare')buttons='<button class="secondary stop-analysis" data-api-action="cancel" '+(a.cancelBusy||a.cancelAfterPrepare?'disabled':'')+'>작업 종료</button>'+buttons;
  return '<div class="api-actions">'+buttons+'</div>';
}
function compactAnalysisDiagnostics(a){
  const error=a.run?.error,detail=error?.details||{},message=a.saveError||a.error||error?.message;
  if(!message)return '';
  const mean=error?.code==='REPEATED_OBSERVATION'&&detail.kind==='within_group'&&detail.cross_group_units===0;
  return '<div class="anova-resolution" role="alert"><strong>'+esc(message)+'</strong>'+
    (mean?'<p>'+Number(detail.valid_rows||0).toLocaleString()+'개 측정값 → '+Number(detail.unit_count||0).toLocaleString()+'개 대상. 각 대상의 평균을 하나의 표본으로 비교합니다.</p><button class="primary" data-api-action="resolve_mean" '+(a.busy?'disabled':'')+'>대상별 평균으로 분석</button>':'')+
    '<details><summary>진단 정보</summary><p>'+esc(error?.code||'INPUT_ERROR')+'</p><button data-api-action="diagnostics">진단 정보 복사</button></details></div>';
}
const compactCharts44=new Map(),compactInstances44=new Map();let compactSequence44=0;
function compactMeanChart(p,a=analysisUI){
 const mode=a?.chart42==='boxplot'?'boxplot':'mean_ci',chart=p.charts?.find(x=>x.type===mode),raw=chart?.data;
 if(!Array.isArray(raw)||!raw.length)return '';
 const rows=raw.slice(0,40).filter(r=>mode==='boxplot'?[r.whisker_low,r.q1,r.median,r.q3,r.whisker_high].every(Number.isFinite):[r.mean,r.ci_low,r.ci_high].every(Number.isFinite));if(!rows.length)return '';
 const id='anova-echart44-'+(++compactSequence44),label=chart.value_column||a?.config.parameters.value_column||'측정값';
 compactCharts44.set(id,{...chart,type:mode,data:rows.map((r,i)=>({...r,_index:i})),label,unit:chart.value_unit||'',scopeNote:p.unit_note||'원본 조회 조건의 전체 데이터 기준'});
 return '<div class="anova-chart42-tools"><button data-anova-chart42="mean_ci" aria-pressed="'+(mode==='mean_ci')+'">평균·신뢰구간</button>'+(p.charts?.some(c=>c.type==='boxplot')?'<button data-anova-chart42="boxplot" aria-pressed="'+(mode==='boxplot')+'">분포·상자그림</button>':'')+'</div><figure class="anova-chart"><figcaption>'+esc(chart.title||'그룹별 비교')+' · '+rows.length+' / '+esc(chart.total_groups??rows.length)+'개 그룹</figcaption><div id="'+id+'" class="anova-echart44" style="width:100%;height:'+Math.max(240,rows.length*42+110)+'px" role="img" aria-label="'+esc(label)+' 그룹별 '+(mode==='boxplot'?'분포':'평균과 신뢰구간')+'"></div><small>'+esc(chart.note||'구간 겹침만으로 그룹 간 유의성을 판단하지 않습니다.')+'</small>'+(chart.omitted_groups?'<p>'+esc(chart.omitted_groups)+'개 그룹은 전체 결과표에서 확인하세요.</p>':'')+'</figure>';
}
function mountCompactCharts44(){
 for(const [id,entry] of compactInstances44)if(!document.getElementById(id)){entry.resize.disconnect();entry.chart.dispose();compactInstances44.delete(id);compactCharts44.delete(id);}
 if(!window.echarts||!window.DataTalkVisuals?.e44Option)return;
 for(const el of document.querySelectorAll('.anova-echart44')){
  if(compactInstances44.has(el.id))continue;const c=compactCharts44.get(el.id);if(!c)continue;
  const options=DataTalkVisuals.e44Option({...c,x_column:'group',y_column:c.label,measures:[{column:c.label,axis:'left'}],options:{orientation:'horizontal',legend:false,zoom:false,statistics:false,show_mean:true,show_outliers:true}});
  options.brush=[];options.toolbox={feature:{restore:{},saveAsImage:{type:'png'}}};options.grid={left:90,right:25,top:30,bottom:55,containLabel:true};options.xAxis.nameLocation='middle';options.xAxis.nameGap=30;options.yAxis.name='그룹';
  const number=v=>Number.isFinite(v)?dtNumber4(v,true):'—';
  options.tooltip={trigger:'item',confine:true,formatter:q=>q.data?._point?DataTalkVisuals.anovaTooltip(q.data._point,c):''};
  const chart=echarts.init(el,null,{renderer:'svg'});chart.setOption(options);const resize=new ResizeObserver(()=>{if(!chart.isDisposed()&&(chart.getWidth()!==el.clientWidth||chart.getHeight()!==el.clientHeight))chart.resize();});resize.observe(el);compactInstances44.set(el.id,{chart,resize});
 }
}
let compactFrame44=0;new MutationObserver(()=>{if(!compactFrame44)compactFrame44=requestAnimationFrame(()=>{compactFrame44=0;mountCompactCharts44();});}).observe(document.documentElement,{childList:true,subtree:true});

function compactSummary42(a){
 const refs=a?.run?.result_refs||[],tables=model.cache.get(a.workspace_id)?.tables||model.current?.tables||[];
 const table=tables.find(t=>refs.includes(t.canonical_ref||a.workspace_id+'.'+t.id)&&(t.columns||[]).some(c=>(typeof c==='string'?c:c.name)==='std'));
 if(!table)return '<p class="analysis-hint">그룹별 n·평균·표준편차는 저장된 전체 결과표에서 확인할 수 있습니다.</p><button data-api-action="result">전체 결과표 열기 ↗</button>';
 const names=table.columns.map(c=>typeof c==='string'?c:c.name),cols=['group','n','mean','std'],rows=table.rows.slice(0,40),format=(v,name)=>v==null?'—':dtCell4(v,table.columns.find(q=>(typeof q==='string'?q:q.name)===name)||name);
 return '<h4>그룹별 요약</h4><table class="anova-summary42"><thead><tr><th>그룹</th><th>표본 수 n</th><th>평균</th><th>표준편차</th></tr></thead><tbody>'+rows.map(r=>'<tr>'+cols.map(c=>'<td>'+esc(format(Array.isArray(r)?r[names.indexOf(c)]:r[c],c))+'</td>').join('')+'</tr>').join('')+'</tbody></table><button data-api-action="result">전체 결과표 열기 ↗</button>';
}
function compactAnalysisResult(p){
 const a=analysisUI,run=a.run,ref=run.source_ref||a.draft.source_ref,version=run.source_version??a.draft.source_version,source=(model.cache.get(ref?.split('.')[0])?.tables||[]).find(t=>t.id===ref?.split('.')[1]),stale=!source||source.version!==version,params=run.config?.parameters||a.config.parameters;
 return '<section class="anova-result"><span class="analysis-kicker">분석 완료</span><h3>'+esc(p.headline||'분석 결과')+'</h3><p>'+esc(dtAnalysisText4(p.short_summary||p.summary||''))+'</p>'+(stale?'<p class="anova-stale42">원본이 변경되었거나 현재 원본을 확인할 수 없습니다. 생성 당시 결과입니다.</p>':'')+'<p class="anova-provenance42">'+esc(ref)+' v'+esc(version)+' · '+esc(params.method==='welch'?'Welch ANOVA':params.method||'ANOVA')+' · '+esc(params.observation_mode==='mean'?'대상별 평균':params.observation_mode==='rows'?'각 행':(params.observation_id_columns||[]).join(' + '))+'<br>'+esc(p.unit_note||'원본 조회 조건의 전체 데이터 기준')+'</p>'+compactMeanChart(p,a)+compactSummary42(a)+'<details><summary>원본 조건·결과 해석·주의사항</summary><p>'+esc(dtAnalysisText4(p.summary||''))+'</p><pre>'+esc(JSON.stringify({source_ref:ref,source_version:version,parameters:params,source_query:run.source_query||(!stale&&source?.sql)||'실행 당시 원본 SQL 기록 없음',source_parameters:run.source_parameters??(!stale?source?.params:undefined)},null,2))+'</pre><p>'+esc(dtAnalysisText4(p.descriptive_comparison||''))+'</p><ul>'+(p.limitations||[]).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></details></section>';
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-anova-chart42]');if(b&&analysisUI){analysisUI.chart42=b.dataset.anovaChart42;renderAnalysis();}});
function compactReport(a){
  const r=a.run?.report||a.report;if(!r)return '';
  if(r.failed_rows||r.required_null_rows)return reportHTML(r,a.run?'full':'sample');
  return '<details class="anova-check"><summary>입력 검사 · '+Number(r.rows_checked||0).toLocaleString()+'행</summary>'+reportHTML(r,a.run?.status==='preparing'?'progress':a.run?'full':'sample')+'</details>';
}
function compactAnalysisCard(a){
  const p=a.config.parameters;
  return '<section class="query-proposal module-card"><div class="module-card-head"><div><span class="analysis-kicker">'+esc(a.draft.source_ref)+'</span><strong>그룹 평균 비교</strong></div><button class="secondary" data-analysis-resume>설정·결과 열기 ↗</button></div><p><strong>'+esc(p.value_column||'측정값 선택')+'</strong> · '+esc(p.group_column||'비교 그룹 선택')+'</p>'+compactObservationHTML(a)+runHTML(a)+analysisDiagnostics(a)+compactActions(a)+'</section>';
}
function compactVisibleField(f,a){
  if(f.parameter==='independent_rows_confirmed')return a.config.parameters.observation_mode==='rows';
  if(f.parameter==='observation_id_columns')return a.config.parameters.observation_mode!=='rows';
  return true;
}
function renderCompactAnalysis(a){
  const module=a.draft.module,locked=a.busy||!!a.run;
  $('analysis-title').textContent=module.ui.title||module.name;
  $('analysis-subtitle').textContent=a.draft.source_ref+' · '+a.draft.title;
  const fields=advanced=>module.ui.fields.map((f,i)=>!!f.advanced===advanced&&compactVisibleField(f,a)?fieldHTML(f,i,a,locked):'').join('');
  const error=analysisDiagnostics(a),result=a.run?.status==='completed'&&a.run.presentation;
  $('analysis-body').innerHTML='<div class="anova-compact">'+(result?compactAnalysisResult(result):
    '<p class="api-lead">'+esc(module.ui.description)+'</p><div class="api-fields">'+fields(false)+'</div>'+compactObservationHTML(a)+
    (a.recommendLoading?'<p class="analysis-hint">컬럼 확인 중…</p>':'')+(a.recommendError?'<p class="analysis-hint">자동 추천을 불러오지 못했어요. 직접 선택할 수 있어요.</p>':'')+
    '<details class="api-advanced" '+(a.advancedOpen?'open':'')+'><summary>추가 옵션</summary><div class="api-fields">'+fields(true)+'</div></details>'+typeWarningHTML(a)+runHTML(a))+error+compactReport(a)+analysisHelpHTML(a)+'</div>';
  $('analysis-footer').innerHTML='<span><small id="analysis-save-state">'+esc(a.saveError||(a.saving?'입력 저장 중…':''))+'</small>전체 데이터로 분석</span>'+compactActions(a);
}
function analysisCard(ws){
  const draft=ws?.analysis_setup;if(!draft?.module)return '';
  const a=analysisState(draft,ws.id),form=draft.module.ui.mode==='form',unloaded=ws.analysis_run_id&&!a.run;
  if(draft.module.ui.layout==='compact'&&!unloaded)return compactAnalysisCard(a);
  const canEdit=form&&!unloaded&&!a.busy&&(!a.run||['prepared','completed','failed','cancelled','interrupted'].includes(a.run.status));
  const rows=[['대상 테이블',esc(draft.source_ref),''],['데이터 범위','원본 조회 조건의 전체 결과',''],
    ...(form?draft.module.ui.fields.map((field,i)=>[esc(field.label),reviewValue(field,a),'<button class="review-edit" data-analysis-edit-param="'+i+'" aria-label="'+esc(field.label)+' 수정" '+(canEdit?'':'disabled')+'>수정</button>']):[])];
  return '<section class="query-proposal module-card"><div class="module-card-head"><div><span class="analysis-kicker">실행 전 조건 확인 · '+esc(draft.source_ref)+'</span><strong>'+esc(draft.module.name)+'</strong><small>v'+esc(draft.module_version)+'</small></div>'+ 
    (form?'<button class="secondary" data-analysis-resume>입력 설정 ↗</button>':unloaded?'<button class="secondary" data-analysis-resume>상태 불러오기</button>':'')+'</div>'+ 
    '<div class="condition-list api-review-list">'+rows.map(([label,value,control])=>'<div><span>'+label+'</span><strong>'+value+'</strong>'+control+'</div>').join('')+'</div>'+ 
    (a.run?.status==='prepared'?'<p class="analysis-hint">조건을 수정하면 완료된 전체 검사를 취소합니다. 다시 검사한 뒤 실행해 주세요.</p>':'')+
    typeWarningHTML(a)+runHTML(a)+reportHTML(a.run?.report||a.report,a.run?.status==='preparing'?'progress':a.run?'full':'sample')+
    (a.error||a.run?.error?'<p class="inline-error" role="alert">'+esc(a.error||a.run.error.message)+'</p>':'')+
    (unloaded?'':actionHTML(a))+'</section>';
}
function renderAnalysis(){
  const a=analysisUI;if(!a||a.draft.module.ui.mode==='none')return;
  if(a.draft.module.ui.layout==='compact')return renderCompactAnalysis(a);
  const module=a.draft.module,locked=a.busy||a.run&&!['failed','cancelled','interrupted'].includes(a.run.status);
  $('analysis-title').textContent=module.ui.title||module.name+' 입력';
  $('analysis-subtitle').textContent=a.draft.source_ref+' · '+a.draft.title+' · API v'+module.version;
  const basic=module.ui.fields.map((f,i)=>!f.advanced?fieldHTML(f,i,a,locked):'').join(''),advanced=module.ui.fields.map((f,i)=>f.advanced?fieldHTML(f,i,a,locked):'').join('');
  $('analysis-body').innerHTML=analysisHelpHTML(a)+'<p class="api-lead">'+esc(module.ui.description||'필요한 입력을 선택해 주세요.')+'</p>'+(!a.run?'<button class="recommend-button" data-analysis-recommend '+(a.recommendLoading?'disabled':'')+'>이 테이블의 분석 기준 추천</button>':'')+recommendationHTML(a)+analysisSummaryHTML(a)+'<div class="api-fields">'+basic+'</div>'+(advanced?'<details class="api-advanced" '+(a.advancedOpen?'open':'')+'><summary>추가 옵션</summary><div class="api-fields">'+advanced+'</div></details>':'')+'<p class="analysis-hint">자료형이 맞지 않으면 <button class="api-help-link" data-table-types="'+esc(a.draft.source_ref)+'">테이블의 컬럼·자료형 ↗</button>에서 수정해 주세요.</p>'+
    typeWarningHTML(a)+reportHTML(a.run?.report||a.report,a.run?(a.run.status==='preparing'?'progress':'full'):'sample')+runHTML(a)+analysisDiagnostics(a);
  $('analysis-footer').innerHTML='<span><small id="analysis-save-state">'+esc(a.saveError||(a.saving?'입력 저장 중…':'입력 저장됨'))+'</small>'+(a.run&&!['completed','failed','cancelled','interrupted'].includes(a.run.status)?'창을 닫아도 실행돼요. 중단은 작업 종료':'원본 보존 · 전체 데이터 사용')+'</span>'+actionHTML(a);
  for(const [i,f] of module.ui.fields.entries()){
    const el=$('api-field-'+i),value=a.config.parameters[f.parameter];if(!el)continue;
    if(f.widget==='select')el.value=value===undefined?'':String(module.parameters_schema.properties[f.parameter].enum.indexOf(value));
    else if(f.widget==='checkbox')el.checked=value===true;
    else if(!['column','columns'].includes(f.widget))el.value=value??'';
  }
}
function readField(target){
  const a=analysisUI;if(!a)return;
  a.advancedOpen=$('analysis-body').querySelector('.api-advanced')?.open||false;
  a.helpOpen=$('analysis-body').querySelector('.analysis-help')?.open!==false;
  if(target.dataset.apiField!==undefined){
    const i=Number(target.dataset.apiField),f=a.draft.module.ui.fields[i],spec=a.draft.module.parameters_schema.properties[f.parameter];let v;
    if(f.widget==='columns'){const selected=new Set(a.config.parameters[f.parameter]||[]),name=a.draft.columns[Number(target.dataset.column)].name;if(target.checked)selected.add(name);else selected.delete(name);v=[...selected];}
    else if(f.widget==='column')v=a.draft.columns[Number(target.dataset.column)].name;
    else if(f.widget==='checkbox')v=target.checked;
    else if(f.widget==='select')v=target.value===''?undefined:spec.enum[Number(target.value)];
    else if(f.widget==='number')v=target.value===''?undefined:Number(target.value);
    else v=target.value;
    a.fieldEdits??={};a.fieldEdits[f.parameter]=(a.fieldEdits[f.parameter]||0)+1;
    if(v===undefined||v==='')delete a.config.parameters[f.parameter];else a.config.parameters[f.parameter]=v;
    if(f.parameter==='observation_mode'){
      a.config.parameters.independent_rows_confirmed=false;
      if(v==='rows')a.config.parameters.observation_id_columns=[];
    }
  }
  a.report=null;a.error='';saveAnalysisDraft(a).catch(()=>{});
}
async function openAnalysis(sourceRef){
  const selected=model.current?.selected_module;
  if(!selected){model.toolOpen=true;renderTools();$('tool-search').focus();return;}
  try{const reply=await api('/analysis/setup',{workspace_id:model.current.id,source_ref:sourceRef,module_id:selected.id,module_version:selected.version,expected_revision:model.current.revision});apply(reply.workspace);useAnalysisDraft(reply.analysis_setup);render();bottom();}
  catch(e){toast(e.message);}
}
async function resumeAnalysis(){
  const ws=model.current;if(!ws?.analysis_setup?.module)return;
  useAnalysisDraft(ws.analysis_setup);const a=analysisUI,generation=a.generation||0;
  if(ws.analysis_run_id&&!a.run){
    try{const reply=await api('/analysis/run/'+encodeURIComponent(ws.analysis_run_id));
      if(analysisUI!==a||model.current?.id!==ws.id||(a.generation||0)!==generation)return;
      if(acceptAnalysisReply(a,reply,generation)){a.config={parameters:{...reply.run.config.parameters},casts:{...a.config.casts,...reply.run.config.casts}};renderAnalysis();renderChat();scheduleAnalysisPoll();}}
    catch(e){if(analysisUI===a&&model.current?.id===ws.id){a.error=e.message;renderAnalysis();renderChat();}}
  }
}
async function editAnalysisParam(index){
  const draft=model.current?.analysis_setup,field=draft?.module?.ui?.fields?.[index];
  if(!field||draft.module.ui.mode!=='form')return;
  const a=analysisState(draft,model.current.id);
  if(a.busy||model.current.analysis_run_id&&!a.run)return;
  if(a.run){
    if(!['prepared','completed','failed','cancelled','interrupted'].includes(a.run.status))return;
    analysisUI=a;await analysisAction('edit');
    if(a.run||a.error)return;
  }
  a.advancedOpen=!!field.advanced;
  useAnalysisDraft(draft);
  const target=field.widget==='columns'?
    $('analysis-body').querySelector('[data-column-filter="'+index+'"]'):$('api-field-'+index);
  target?.focus();
}
// DATATALK_RESULT_BUTTON_FIX_2026_10_12_3
async function openAnalysisResult3(){
 const ws=model.current,draft=ws?.analysis_setup;
 if(!ws||!draft?.module){toast('분석 설정과 결과 상태를 먼저 불러와 주세요.');return;}
 const a=analysisState(draft,ws.id);analysisUI=a;
 if(a.resultOpening)return;
 const generation=a.generation||0,runId=ws.analysis_run_id||a.run?.id;
 const current=()=>model.current?.id===ws.id&&model.current.analysis_setup?.id===draft.id&&(a.generation||0)===generation&&(!model.current.analysis_run_id||model.current.analysis_run_id===runId);
 const selectRef=(run,workspace)=>{
  const refs=(run?.result_refs||[]).filter(x=>typeof x==='string');
  const candidates=refs.map(ref=>({ref,table:workspace.tables.find(t=>(t.canonical_ref||workspace.id+'.'+t.id)===ref)})).filter(x=>x.table);
  const summary=candidates.find(x=>['group','n','mean','std'].every(name=>x.table.columns.some(c=>(typeof c==='string'?c:c.name)===name)));
  return summary?.ref||candidates[0]?.ref;
 };
 a.resultOpening=true;a.error='';
 try{
  if(!model.ready)throw Error('연결 상태를 확인한 뒤 결과를 열어 주세요.');
  if(model.busy)throw Error('현재 화면 작업이 진행 중입니다. 작업이 끝난 뒤 결과를 열어 주세요.');
  let ref=a.run?.id===runId&&a.run?.status==='completed'?selectRef(a.run,model.current):null;
  if(!ref&&runId){
   const reply=await api('/analysis/run/'+encodeURIComponent(runId));
   if(!current()||reply.run?.id!==runId)return;
   if(a.run&&a.run.id!==runId)a.run=reply.run;else acceptAnalysisReply(a,reply,generation);
   if(reply.workspace)apply(reply.workspace);
   ref=a.run?.status==='completed'?selectRef(a.run,model.current):null;
   if(!ref&&a.run?.result_refs?.length){
    const fresh=await api('/workspace/'+encodeURIComponent(ws.id));if(!current())return;apply(fresh);ref=selectRef(a.run,model.current);
   }
  }
  if(!current())return;
  if(!ref)throw Error(a.run?.status==='completed'?'저장된 결과 테이블을 찾지 못했습니다. 결과 상태와 테이블 목록을 확인해 주세요.':'아직 분석이 완료되지 않았습니다.');
  if(model.busy)throw Error('현재 화면 작업이 진행 중입니다. 작업이 끝난 뒤 결과를 열어 주세요.');
  $('analysis-dialog').close();await openTable(ref);
 }catch(error){
  if(current()){a.error=error.message;renderAnalysis();renderChat();toast(error.message);}
 }finally{a.resultOpening=false;}
}
window.DataTalkResultButtonHotfix='DATATALK_RESULT_BUTTON_FIX_2026_10_12_3';

async function analysisAction(action){
  if(action==='result')return openAnalysisResult3();
  if(!analysisUI||analysisUI.draft.id!==model.current?.analysis_setup?.id)analysisUI=analysisState(model.current.analysis_setup,model.current.id);
  const a=analysisUI;if(action==='cancel_setup'){await cancelAnalysis(a);$('analysis-dialog').close();return;}if(action==='cancel')return cancelAnalysis(a);if(a.busy)return;
  if(action==='diagnostics'){await copyText(JSON.stringify({version:'5.1',build_id:'2026.10.13.5.1r3',run_id:a.run?.id,api_job_id:a.run?.api_job_id,status:a.run?.status,stage:a.run?.error_stage,code:a.run?.error?.code,source_ref:a.draft.source_ref,source_version:a.draft.source_version,module_id:a.draft.module_id,module_version:a.draft.module_version,submission_attempts:a.run?.submission_attempts},null,2));return;}
  if(action==='edit_unit'){
    const index=a.draft.module.ui.fields.findIndex(f=>f.parameter==='observation_id_columns');
    if(index>=0)await editAnalysisParam(index);return;
  }
  if(['start','prepare'].includes(action))a.start_id=uuid();
  a.busy=true;a.busyAction=action;a.error='';a.stopRequested=false;const generation=a.generation||0;const stopped=()=>a.stopRequested||(a.generation||0)!==generation;
  if(action==='submit'&&a.run?.status==='prepared')a.run={...a.run,status:'submitting'};
  renderAnalysis();renderChat();
  try{
    if(['preview','prepare','start','resolve_mean','confirm_rows'].includes(action)){await a.saveQueue;if(a.saveError)throw Error(a.saveError);if(stopped())return;}
    if(action==='confirm_rows'){
      if(a.run)throw Error('입력 수정 후 행 단위를 선택해 주세요.');
      a.config.parameters={...a.config.parameters,observation_mode:'rows',observation_id_columns:[],independent_rows_confirmed:true};
      for(const key of ['observation_mode','observation_id_columns','independent_rows_confirmed']){a.fieldEdits??={};a.fieldEdits[key]=(a.fieldEdits[key]||0)+1;}
      await saveAnalysisDraft(a);
    }else if(action==='start'){
      if(!compactReady(a))throw Error('측정값·비교 그룹과 비교 단위를 확인해 주세요.');
      const connectivity=await api('/analysis/connectivity');if(stopped())return;const connected=connectivity.modules?.find(m=>m.id===a.draft.module_id&&m.version===a.draft.module_version);if(!connected?.ready)throw Error(connected?.message||'ANOVA API와 worker 연결을 확인해 주세요. 운영자에게 API 연결 점검을 요청하세요.');
      const preview=await api('/analysis/preview',analysisBody());if(stopped())return;a.report=preview.report;
      if(a.report.failed_rows||a.report.required_null_rows)throw Error('입력 자료형과 빈 값을 확인해 주세요.');
      a.config.parameters={...preview.config.parameters};await saveAnalysisDraft(a);if(stopped())return;
      a.autoSubmit=true;a.busyAction='prepare';renderAnalysis();renderChat();
      const reply=await api('/analysis/prepare',analysisBody());a.run=reply.run;a.config.parameters={...reply.run.config.parameters};
      if(model.current?.id===a.workspace_id)model.current.analysis_run_id=a.run.id;
      if(a.cancelAfterPrepare||stopped()) {a.autoSubmit=false;a.cancelAfterPrepare=false;await cancelAnalysis(a);}else scheduleAnalysisPoll();
    }else if(action==='resolve_mean'){
      const reply=await api('/analysis/refine',{workspace_id:a.workspace_id,run_id:a.run.id,action:'unit_mean'});
      a.run=reply.run;if(stopped()){await cancelAnalysis(a);return;}a.generation=(a.generation||0)+1;a.config.parameters={...reply.run.config.parameters};
      if(reply.workspace){apply(reply.workspace);a.draft=reply.workspace.analysis_setup;}
      const submitted=await api('/analysis/submit',{workspace_id:a.workspace_id,run_id:a.run.id});
      acceptAnalysisReply(a,submitted,a.generation);scheduleAnalysisPoll();
    }else if(action==='preview'){const reply=await api('/analysis/preview',analysisBody());a.report=reply.report;}
    else if(action==='prepare'){const reply=await api('/analysis/prepare',analysisBody());a.run=reply.run;if(model.current?.id===a.workspace_id)model.current.analysis_run_id=a.run.id;if(a.cancelAfterPrepare||stopped()){a.cancelAfterPrepare=false;await cancelAnalysis(a);}else scheduleAnalysisPoll();}
    else if(action==='submit'){
      const reply=await api('/analysis/submit',{workspace_id:a.workspace_id,run_id:a.run.id});acceptAnalysisReply(a,reply,generation);scheduleAnalysisPoll();
    }else if(action==='edit'){
      a.autoSubmit=false;
      if(a.run.status==='prepared')await api('/analysis/run/cancel',{workspace_id:a.workspace_id,run_id:a.run.id});
      await saveAnalysisDraft(a,true);a.generation=(a.generation||0)+1;
      a.run=null;a.report=null;if(model.current?.id===a.workspace_id)model.current.analysis_run_id=null;
    }
  }catch(e){a.autoSubmit=false;if((a.generation||0)===generation||action==='resolve_mean')a.error=e.message;}finally{a.busy=false;a.busyAction=null;a.cancelAfterPrepare=false;renderAnalysis();renderChat();scheduleAnalysisPoll();}
}
function acceptAnalysisReply(a,reply,generation){
  if((a.generation||0)!==generation||a.run&&a.run.id!==reply.run.id)return false;
  const terminal=['completed','failed','cancelled','interrupted'];
  if(a.run&&terminal.includes(a.run.status)&&!terminal.includes(reply.run.status))return false;
  if(a.run?.cancel_requested&&!reply.run.cancel_requested&&!terminal.includes(reply.run.status))return false;
  a.run=reply.run;
  if(reply.workspace&&model.current?.id===reply.workspace.id)apply(reply.workspace);
  return true;
}
async function cancelAnalysis(a=analysisUI){
  if(!a||a.cancelBusy)return;
  a.autoSubmit=false;a.stopRequested=true;
  if(!a.run){a.cancelAfterPrepare=!!a.busy;a.generation=(a.generation||0)+1;a.error=a.busy?'중지 요청됨 · 후속 분석 실행을 차단합니다.':'';renderAnalysis();renderChat();if(a.start_id){try{const reply=await api('/analysis/run/cancel',{workspace_id:a.workspace_id,draft_id:a.draft.id,start_id:a.start_id});if(reply.run){a.run=reply.run;scheduleAnalysisPoll();}}catch(e){a.error='준비 중지의 수신 여부를 확인하지 못했습니다. 다시 ■ 중지를 눌러 주세요.';renderAnalysis();}}return;}
  if(['completed','failed','cancelled','interrupted'].includes(a.run.status))return;
  const generation=(a.generation||0)+1;a.generation=generation;a.cancelBusy=true;a.error='';
  a.run={...a.run,cancel_requested:true,status:'cancelling'};renderAnalysis();renderChat();
  try{const reply=await api('/analysis/run/cancel',{workspace_id:a.workspace_id,run_id:a.run.id});acceptAnalysisReply(a,reply,generation);}
  catch(e){a.error='종료 요청의 수신을 확인하지 못했어요. 작업 종료 재요청을 눌러 주세요. '+e.message;}
  finally{a.cancelBusy=false;renderAnalysis();renderChat();scheduleAnalysisPoll();}
}
function scheduleAnalysisPoll(){clearTimeout(analysisPoll);if(analysisUI?.run&&!analysisUI.run.retry_paused&&!analysisUI.run.cancel_retry_paused&&['preparing','submitting','queued','running','cancelling'].includes(analysisUI.run.status))analysisPoll=setTimeout(pollAnalysis,1000);}
async function pollAnalysis(){
  const a=analysisUI,rid=a?.run?.id,generation=a?.generation||0;if(!rid)return;
  try{const reply=await api('/analysis/run/'+encodeURIComponent(rid));
    if((a.generation||0)===generation&&a.run?.cancel_requested&&!reply.run.cancel_requested&&!['completed','failed','cancelled','interrupted'].includes(reply.run.status)){await cancelAnalysis(a);}
    else if(acceptAnalysisReply(a,reply,generation)){
      a.error='';if(analysisUI===a){render();if($('analysis-dialog').open)renderAnalysis();
        if(a.autoSubmit&&a.run.status==='prepared'&&!a.busy&&!a.run.cancel_requested){a.autoSubmit=false;await analysisAction('submit');}
      }
    }}
  catch(e){a.autoSubmit=false;a.error=e.message;if(analysisUI===a){renderAnalysis();renderChat();}}
  if(analysisUI===a)scheduleAnalysisPoll();
}
// v4.4: EDS forms. Input schemas/columns are authorized by the server.
const edsxDrafts=new Map(),edsxSelections=new Map();let edsxUI=null,edsxOptionSerial=0;
function edsxNewState(table){const today=quickDay(quickToday()),chip=table.startsWith('EDS_CHIP');return {table,workspace_id:model.current.id,schema:'',step_seq:'EDS_P',mode:chip?'bin':'measurement',group_by:'lot',meas_type:'MSR',subitem:'AVG',start_date:quickDayText(today-(chip?1:30)),end_date:quickDayText(today-(chip?1:0)),numbersText:'',lotsText:'',wafersText:'',binsText:'',dutsText:'',x_min:'',x_max:'',y_min:'',y_max:'',options:null,optionsKey:'',preview:null,error:'',busy:false,loading:false};}
function edsxParseNumbers(text){const values=[],seen=new Set(),errors=[];let duplicates=0;const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/);for(let i=0;i<lines.length;i++){if(!lines[i].trim())continue;for(const raw of lines[i].split(/[,\t]/)){const token=raw.trim();if(!token)continue;if(!/^\d{1,3}$/.test(token)||Number(token)>499){errors.push((i+1)+'행: “'+token+'” — 0~499 정수를 입력해 주세요.');continue;}const n=Number(token);if(seen.has(n)){duplicates++;continue;}seen.add(n);values.push(n);}}return {values,errors,duplicates};}
function edsxParseIDs(text){return [...new Set(String(text||'').replace(/^\uFEFF/,'').split(/[\r\n\t,]+/).map(x=>x.trim()).filter(Boolean))];}
function edsxIsMeasurement(a=edsxUI){return a?.table==='EDS_WF_MSR'||a?.mode==='measurement';}
function edsxMetadata(a=edsxUI){return a?.options?.eds_options||{};}
function edsxPayload(a=edsxUI){return {workspace_id:a.workspace_id,expected_revision:model.current?.revision,table:a.table,schemas:a.schema?[a.schema]:[],step_seq:a.step_seq,start_date:a.start_date,end_date:a.end_date,mode:a.table==='EDS_WF_MSR'?'measurement':a.mode,group_by:a.group_by,meas_type:a.meas_type,subitem:a.table==='EDS_WF_MSR'?a.subitem:undefined,measurement_numbers:edsxIsMeasurement(a)?edsxParseNumbers(a.numbersText).values:[],filters:{lot_ids:edsxParseIDs(a.lotsText),wafer_ids:edsxParseIDs(a.wafersText),bin_codes:a.table.startsWith('EDS_CHIP')?edsxParseIDs(a.binsText):[],dut_numbers:a.table.startsWith('EDS_CHIP')?edsxParseIDs(a.dutsText):[],...Object.fromEntries(['x_min','x_max','y_min','y_max'].map(k=>[k,a[k]===''?null:Number(a[k])]))}};}
function edsxInvalidate(){if(!edsxUI)return;edsxUI.preview=null;edsxUI.error='';$('edsx-preview').hidden=true;edsxRenderFooter();}
function edsxDateRender(){const a=edsxUI,today=quickDay(quickToday());for(const k of ['start','end']){const d=quickDay(a[k+'_date']);$('edsx-'+k+'-date').value=a[k+'_date'];$('edsx-'+k+'-offset').value=Number.isFinite(d)?d-today:'';}const s=quickDay(a.start_date),e=quickDay(a.end_date);$('edsx-period').textContent=Number.isFinite(s)&&Number.isFinite(e)&&s<=e?a.start_date+' ~ '+a.end_date+' · '+(e-s+1)+'일 · 종료일 포함':'올바른 시작일과 종료일을 입력해 주세요.';}
function edsxInputChoices(name,values,selected){return (values||[]).map(v=>'<label><input type="radio" name="'+name+'" value="'+esc(v)+'" '+(v===selected?'checked':'')+'> '+esc(v)+'</label>').join('')||'<span class="edsx-small">사용 가능한 항목을 확인해 주세요.</span>';}
function edsxRenderMetadata(){const a=edsxUI,m=edsxMetadata(a),schemas=a.options?.schemas||[];const names=schemas.map(s=>typeof s==='string'?s:s.name);$('edsx-schema').innerHTML=names.length?'<option value="">제품 선택</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join(''):'<option value="">조회 가능한 스키마가 없습니다</option>';$('edsx-schema').value=a.schema;$('edsx-meas-types').innerHTML=edsxInputChoices('edsx-meas',m.meas_types||[],a.meas_type);$('edsx-subitems').innerHTML=edsxInputChoices('edsx-subitem',m.subitems||[],a.subitem);for(const el of $('edsx-steps').querySelectorAll('input')){el.checked=el.value===a.step_seq;el.disabled=a.busy||(Array.isArray(m.steps)&&!m.steps.includes(el.value));}edsxRenderNumbers();edsxRenderFooter();}
function edsxRenderNumbers(){const a=edsxUI,p=edsxParseNumbers(a.numbersText),m=edsxMetadata(a),allowed=Array.isArray(m.measurement_numbers)?new Set(m.measurement_numbers.map(Number)):null;const unavailable=allowed?p.values.filter(n=>!allowed.has(n)):[];const errors=[...p.errors,...(unavailable.length?['현재 조건에서 사용할 수 없는 번호: '+unavailable.map(x=>String(x).padStart(3,'0')).join(', ')]:[])];$('edsx-number-error').textContent=errors.slice(0,5).join('\n')+(errors.length>5?'\n외 '+(errors.length-5)+'개 입력 오류':'');$('edsx-number-count').textContent=p.values.length+'개 선택'+(p.duplicates?' · 중복 '+p.duplicates+'개 제외':'');$('edsx-number-chips').innerHTML=p.values.map(n=>'<button data-edsx-remove="'+n+'" aria-label="측정 컬럼 '+n+' 선택 해제">'+String(n).padStart(3,'0')+'<span>×</span></button>').join('');const cols=p.values.map(n=>m.measurement_columns?.[String(n)]).filter(Boolean);$('edsx-columns-preview').innerHTML=cols.length?'<table aria-label="추출 컬럼 구성"><thead><tr><th>LOT · 웨이퍼 · 검사 정보</th>'+cols.map(n=>'<th>'+esc(n)+'</th>').join('')+'</tr></thead></table>':'';$('edsx-columns-preview').hidden=!cols.length;}
function edsxRenderMode(){const a=edsxUI,chip=a.table.startsWith('EDS_CHIP'),measurement=edsxIsMeasurement(a);$('edsx-title').textContent=chip?'EDS CHIP 데이터':'EDS Wafer 측정 데이터';$('edsx-workspace').textContent=a.table+' · '+model.current.id+' · '+model.current.name;for(const b of $('eds-extract-dialog').querySelectorAll('[data-edsx-table]'))b.setAttribute('aria-pressed',String(b.dataset.edsxTable===a.table));$('edsx-mode').hidden=!chip;for(const b of $('edsx-mode').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.edsxMode===(a.mode==='measurement'?'measurement':'bin')));$('edsx-bin-card').hidden=!chip||measurement;$('edsx-measurement-card').hidden=!measurement;$('edsx-subitem-box').hidden=chip;$('edsx-filter-card').hidden=!chip;$('edsx-group-box').hidden=a.mode!=='bin';$('edsx-raw-note').hidden=a.mode!=='raw';for(const b of $('edsx-bin-card').querySelectorAll('[data-edsx-view]')){b.setAttribute('aria-pressed',String(b.dataset.edsxView===a.mode));b.style.background=b.dataset.edsxView===a.mode?'var(--soft)':'#fff';}const targeted=chip&&a.mode!=='bin';$('edsx-target-title').textContent=targeted?'조회 대상 · LOT 또는 웨이퍼 필수':'조회 대상 · 선택';$('edsx-target-note').textContent=targeted?'아는 ID를 바로 붙여넣으세요. 대상을 모르면 기간으로 LOT를 찾을 수 있어요.':chip?'LOT·웨이퍼를 몰라도 기간만으로 BIN 분포를 볼 수 있어요.':'필요한 LOT·웨이퍼가 있을 때만 입력하세요.';$('edsx-find-lots').hidden=!targeted;$('edsx-bin-label').textContent=a.mode==='bin'?'표시할 BIN · 선택 · 비우면 전체':'추출할 칩의 BIN · 선택 · 비우면 전체';$('edsx-bin-help').textContent=a.mode==='bin'?'BIN을 선택해도 비율의 분모는 해당 집계 대상의 전체 BIN입니다.':'입력한 BIN에 해당하는 칩 검사 기록만 가져옵니다.';$('edsx-time-label').textContent=chip?'endtime':'tkout_time';$('edsx-group').value=a.group_by;edsxDateRender();edsxRenderFooter();}
function edsxSyncInputs(){const a=edsxUI;for(const [id,key] of [['numbers','numbersText'],['lots','lotsText'],['wafers','wafersText'],['bins','binsText'],['duts','dutsText'],['x-min','x_min'],['x-max','x_max'],['y-min','y_min'],['y-max','y_max']])$('edsx-'+id).value=a[key];}
function edsxRenderFooter(){const a=edsxUI;if(!a)return;const m=edsxMetadata(a),busy=!!a.busy;for(const el of $('eds-extract-dialog').querySelectorAll('input,textarea,select,button:not([data-common-stop])'))el.disabled=busy;for(const el of $('edsx-steps').querySelectorAll('input'))el.disabled=busy||(Array.isArray(m.steps)&&!m.steps.includes(el.value));$('edsx-preview-button').disabled=busy||a.loading||m.ready===false||!a.options;$('edsx-plan-button').disabled=busy||a.loading||!a.preview||window.DATATALK_OFFLINE_PREVIEW===true;$('edsx-number-all').disabled=busy||a.loading||!(m.measurement_numbers?.length);$('edsx-preview-button').textContent=a.busy==='preview'?'조건 확인 중…':'조건 확인';$('edsx-plan-button').textContent=window.DATATALK_OFFLINE_PREVIEW===true?'연결판에서 SQL 준비':a.busy==='plan'?'SQL 준비 중…':'SQL 준비 →';$('edsx-error').textContent=a.error||'';const lots=edsxParseIDs(a.lotsText),wafers=edsxParseIDs(a.wafersText);$('edsx-target-count').textContent=lots.length||wafers.length?'LOT '+lots.length+'개 · 웨이퍼 '+wafers.length+'개':'';$('edsx-summary').textContent=[a.schema||'제품 선택',a.step_seq,a.table.startsWith('EDS_CHIP')?(a.mode==='bin'?'BIN 분포':a.mode==='raw'?'칩 목록':a.meas_type+' 측정값'):a.meas_type+' · '+a.subitem,edsxIsMeasurement(a)?edsxParseNumbers(a.numbersText).values.length+'개 측정 컬럼':''].filter(Boolean).join(' · ');$('edsx-record-note').textContent=a.table.startsWith('EDS_CHIP')?'재검사 포함 · 검사 건수 기준 · NULL 유지':'선택한 SUBITEM의 검사 기록 · NULL 유지';$('edsx-readiness').dataset.blocked=String(m.ready===false);$('edsx-readiness').textContent=a.loading?'조회 가능한 조건과 컬럼을 확인하고 있어요.':m.message||'';}
async function openEDSExtract(table='EDS_CHIP_BIN',seed=null){if(!model.ready||!model.current||model.busy){toast('서버 연결과 작업공간을 확인한 뒤 다시 열어 주세요.');return;}const key=model.current.id+':'+table;if(!edsxDrafts.has(key))edsxDrafts.set(key,edsxNewState(table));edsxUI=edsxDrafts.get(key);const a=edsxUI;if(seed){for(const k of ['schema','step_seq','mode','group_by','meas_type','subitem','start_date','end_date','lotsText','wafersText','binsText','dutsText','x_min','x_max','y_min','y_max'])if(seed[k]!==undefined)a[k]=seed[k];}a.preview=null;a.error='';$('edsx-preview').hidden=true;$('quick-dialog').close();edsxSyncInputs();edsxRenderMode();edsxRenderMetadata();if(!$('eds-extract-dialog').open)$('eds-extract-dialog').showModal();await edsxLoadOptions(true);}
async function edsxLoadOptions(force=false){const a=edsxUI;if(!a)return;const key=JSON.stringify([a.table,a.schema,a.step_seq,a.meas_type,a.mode,a.group_by]);if(!force&&a.optionsKey===key)return;const serial=++edsxOptionSerial;a.loading=true;edsxRenderFooter();try{const r=await api('/quick-extract/options',{table:a.table,...(a.schema?{schemas:[a.schema]}:{}),step_seq:a.step_seq,meas_type:a.meas_type,mode:a.mode,group_by:a.group_by});if(edsxUI!==a||serial!==edsxOptionSerial)return;a.options=r;const names=(r.schemas||[]).map(s=>typeof s==='string'?s:s.name),m=edsxMetadata(a);if(!a.schema&&names.length){a.schema=names[0];a.loading=false;edsxRenderMetadata();await edsxLoadOptions(true);return;}if(a.schema&&!names.includes(a.schema))a.schema='';if(a.meas_type&&a.meas_type!=='ALL'&&Array.isArray(m.meas_types)&&!m.meas_types.includes(a.meas_type)){a.meas_type='';a.meas_types=[];}if(Array.isArray(m.subitems)&&m.subitems.length&&!m.subitems.includes(a.subitem))a.subitem=m.subitems.includes('AVG')?'AVG':m.subitems[0];a.optionsKey=key;a.error='';edsxRenderMetadata();}catch(e){if(edsxUI===a&&serial===edsxOptionSerial){a.error=e.message;a.options=null;a.optionsKey='';edsxRenderMetadata();}}finally{if(edsxUI===a&&serial===edsxOptionSerial){a.loading=false;edsxRenderFooter();}}}
function edsxLocalError(a){if(a.workspace_id!==model.current?.id)return '작업공간이 변경되었습니다. 입력창을 다시 열어 주세요.';if(!a.schema)return '뽑을 제품을 한 개 선택해 주세요.';const start=quickDay(a.start_date),end=quickDay(a.end_date);if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)return '올바른 조회 기간을 입력해 주세요.';const m=edsxMetadata(a);if(!a.options||m.ready===false)return m.message||'현재 조건의 조회 준비가 완료되지 않았습니다.';const lots=edsxParseIDs(a.lotsText),wafers=edsxParseIDs(a.wafersText);if(a.table.startsWith('EDS_CHIP')&&a.mode!=='bin'&&!lots.length&&!wafers.length)return '칩 목록·측정값은 LOT 또는 웨이퍼 전체 ID를 한 개 이상 입력해 주세요. 모르면 ‘기간에서 LOT 찾기’를 이용하세요.';if(edsxIsMeasurement(a)){if(!(m.meas_types||[]).includes(a.meas_type))return '조회 가능한 측정 종류를 선택해 주세요.';if(a.table==='EDS_WF_MSR'&&!(m.subitems||[]).includes(a.subitem))return 'SUBITEM을 한 개 선택해 주세요.';const p=edsxParseNumbers(a.numbersText);if(p.errors.length)return p.errors.slice(0,5).join('\n');if(!p.values.length)return '측정 컬럼 번호를 한 개 이상 입력해 주세요. 전체 컬럼이 필요하면 ‘전체 선택’을 누르세요.';if(Array.isArray(m.measurement_numbers)){const allowed=new Set(m.measurement_numbers.map(Number)),bad=p.values.filter(n=>!allowed.has(n));if(bad.length)return '현재 조건에서 사용할 수 없는 측정 컬럼 번호: '+bad.join(', ');}}for(const axis of ['x','y']){const lo=a[axis+'_min'],hi=a[axis+'_max'];if((lo!==''&&!Number.isFinite(Number(lo)))||(hi!==''&&!Number.isFinite(Number(hi))))return '올바른 좌표 값을 입력해 주세요.';if(lo!==''&&hi!==''&&Number(lo)>Number(hi))return axis.toUpperCase()+' 좌표의 최솟값은 최댓값보다 클 수 없습니다.';}return '';}
async function edsxPreview(){const a=edsxUI;if(!a||a.busy)return;await edsxLoadOptions();if(edsxUI!==a)return;const error=edsxLocalError(a);if(error){a.error=error;edsxRenderFooter();return;}a.busy='preview';a.error='';edsxRenderFooter();try{const r=await api('/quick-extract/preview',edsxPayload(a));if(edsxUI!==a)return;a.preview=r;const summary=typeof r.summary==='string'?r.summary:JSON.stringify(r.summary||{}),warning=(r.warnings||[]).map(w=>typeof w==='string'?w:w.message||JSON.stringify(w));const cols=(r.columns||[]).map(quickColumnName);$('edsx-preview').innerHTML='<strong>조회조건 확인 완료</strong><p>'+esc(summary)+'</p>'+warning.map(w=>'<p>'+esc(w)+'</p>').join('')+(cols.length?'<details><summary>결과 컬럼 '+cols.length+'개</summary><p>'+cols.map(esc).join(' · ')+'</p></details>':'')+'<p>'+(window.DATATALK_OFFLINE_PREVIEW===true?'오프라인 예시 조건입니다. DB 조회와 SQL 실행은 연결판에서 진행해 주세요.':'다음 단계에서 SQL을 확인한 뒤 조회를 실행합니다. 데이터 크기 제한에 도달하면 조회 범위를 줄여 다시 진행해 주세요.')+'</p>';$('edsx-preview').hidden=false;}catch(e){a.error=e.message;a.preview=null;$('edsx-preview').hidden=true;}finally{a.busy=false;if(edsxUI===a)edsxRenderFooter();}}
async function edsxPlan(){const a=edsxUI;if(!a?.preview||a.busy||model.busy||window.DATATALK_OFFLINE_PREVIEW===true)return;const error=edsxLocalError(a);if(error){a.error=error;edsxRenderFooter();return;}a.busy='plan';a.error='';model.busy={label:'EDS SQL 준비 중'};edsxRenderFooter();render();try{const r=await api('/quick-extract/plan',edsxPayload(a));if(r.workspace&&model.current?.id===a.workspace_id){apply(r.workspace);$('eds-extract-dialog').close();model.tab='table';bottom();toast(r.kind==='clarification'?'대화창에서 추가 조건을 확인해 주세요.':'대화창에서 SQL을 확인한 뒤 실행해 주세요.');}}catch(e){a.error=e.message;if(e.status===409&&model.current?.id===a.workspace_id){try{const ws=await api('/workspace/'+encodeURIComponent(a.workspace_id));if(model.current?.id===a.workspace_id)apply(ws);}catch{}}}finally{a.busy=false;model.busy=null;if(edsxUI===a)edsxRenderFooter();render();}}
$('edsx-close').addEventListener('click',()=>{if(!edsxUI?.busy)$('eds-extract-dialog').close();});$('eds-extract-dialog').addEventListener('cancel',e=>{if(edsxUI?.busy)e.preventDefault();});
$('eds-extract-dialog').addEventListener('click',e=>{const b=e.target.closest('button'),a=edsxUI;if(!b||b.disabled||!a||a.busy)return;if(b.dataset.edsxTable){openQuickExtract(b.dataset.edsxTable);return;}if(b.dataset.edsxMode||b.dataset.edsxView){a.mode=b.dataset.edsxMode||b.dataset.edsxView;edsxInvalidate();edsxRenderMode();edsxLoadOptions(true);return;}if(b.dataset.edsxRemove!==undefined){a.numbersText=a.numbersText.split(/\r?\n/).map(line=>line.split(/[,\t]/).filter(token=>!/^\d{1,3}$/.test(token.trim())||Number(token.trim())!==Number(b.dataset.edsxRemove)).join('\t')).filter(line=>line.trim()).join('\n');$('edsx-numbers').value=a.numbersText;edsxInvalidate();edsxRenderNumbers();return;}if(b.dataset.edsxPeriod){const today=quickDay(quickToday()),v=b.dataset.edsxPeriod;a.start_date=quickDayText(today-(v==='yesterday'?1:v==='week'?6:0));a.end_date=quickDayText(today-(v==='yesterday'?1:0));edsxInvalidate();edsxDateRender();}});
$('eds-extract-dialog').addEventListener('change',e=>{const t=e.target,a=edsxUI;if(!a||a.busy)return;if(t.id==='edsx-schema'){a.schema=t.value;edsxInvalidate();edsxLoadOptions(true);}if(t.name==='edsx-step'){a.step_seq=t.value;edsxInvalidate();edsxLoadOptions(true);}if(t.name==='edsx-meas'){a.meas_type=t.value;edsxInvalidate();edsxLoadOptions(true);}if(t.name==='edsx-subitem'){a.subitem=t.value;edsxInvalidate();}if(t.id==='edsx-group'){a.group_by=t.value;edsxInvalidate();edsxLoadOptions(true);}});
for(const [id,key] of [['numbers','numbersText'],['lots','lotsText'],['wafers','wafersText'],['bins','binsText'],['duts','dutsText'],['x-min','x_min'],['x-max','x_max'],['y-min','y_min'],['y-max','y_max']])$('edsx-'+id).addEventListener('input',()=>{if(!edsxUI)return;edsxUI[key]=$('edsx-'+id).value;edsxInvalidate();if(key==='numbersText')edsxRenderNumbers();});
for(const edge of ['start','end']){$('edsx-'+edge+'-date').addEventListener('change',()=>{edsxUI[edge+'_date']=$('edsx-'+edge+'-date').value;edsxInvalidate();edsxDateRender();});$('edsx-'+edge+'-offset').addEventListener('change',()=>{const raw=$('edsx-'+edge+'-offset').value,n=Number(raw);edsxUI[edge+'_date']=raw!==''&&Number.isInteger(n)?quickDayText(quickDay(quickToday())+n):'';edsxInvalidate();edsxDateRender();});}
$('edsx-number-all').addEventListener('click',()=>{edsxUI.numbersText=(edsxMetadata().measurement_numbers||[]).join('\n');$('edsx-numbers').value=edsxUI.numbersText;edsxInvalidate();edsxRenderNumbers();});$('edsx-number-clear').addEventListener('click',()=>{edsxUI.numbersText='';$('edsx-numbers').value='';edsxInvalidate();edsxRenderNumbers();$('edsx-numbers').focus();});
$('edsx-find-lots').addEventListener('click',()=>{edsxUI.mode='bin';edsxUI.group_by='lot';edsxInvalidate();edsxRenderMode();edsxLoadOptions(true);toast('입력한 기간과 조건으로 BIN 분포를 조회한 뒤 결과에서 LOT를 선택해 주세요.');});$('edsx-preview-button').addEventListener('click',edsxPreview);$('edsx-plan-button').addEventListener('click',edsxPlan);
// Chip summary selection operates only on persisted request metadata and actual result rows.
function edsxRequest(t){const q=t?.quick_extract||t?.quick_extract_request||t?.plan?.quick_extract_request;return q?.table?.startsWith('EDS_CHIP')&&q.mode==='bin'?q:null;}
function edsxRowValue(t,row,name){const i=(t.columns||[]).findIndex(c=>quickColumnName(c)===name);return i<0?null:Array.isArray(row)?row[i]:row[name];}
function edsxResultKey(t){return (t.canonical_ref||model.current?.id+'.'+t.id)+':'+String(t.version||0)+':'+String(t.updated_at||t.created_at||'');}
function edsxRowTarget(t,row){const q=edsxRequest(t);if(!q)return null;if(q.group_by==='wafer'){const root_id=edsxRowValue(t,row,'root_id');return root_id===null||root_id===undefined||String(root_id)===''?null:{wafer_id:String(root_id)};}if(q.group_by==='lot'){const lot=edsxRowValue(t,row,'lot_id');return lot===null||lot===undefined||String(lot)===''?null:{lot_id:String(lot)};}return null;}
function edsxSelection(t){const key=edsxResultKey(t);if(!edsxSelections.has(key))edsxSelections.set(key,new Set());return edsxSelections.get(key);}
function edsxTargetKey(t,row){const target=edsxRowTarget(t,row);return target?JSON.stringify(target):null;}
function edsxSelectionLabel(t){return (edsxRequest(t)?.group_by==='wafer'?'웨이퍼 ':'LOT ')+edsxTargetCount(t)+'개 선택';}
function edsxTargetCount(t){return new Set([...edsxSelection(t)].map(i=>edsxTargetKey(t,t.rows[i])).filter(Boolean)).size;}
function edsxSelectable(t){return !!edsxRequest(t)&&['lot','wafer'].includes(edsxRequest(t).group_by)&&(t.rows||[]).some(row=>edsxRowTarget(t,row));}
function edsxDrilldownHTML(t){const q=edsxRequest(t);if(!q)return '';const count=edsxTargetCount(t),selectable=edsxSelectable(t);return '<section class="edsx-drilldown"><strong>BIN 분포 · 재검사 포함 · 검사 건수 기준</strong><span>BIN 비율은 같은 대상의 전체 BIN 대비 비율입니다.</span>'+(q.group_by==='all'?'<p>대상을 선택하려면 LOT별 또는 웨이퍼별 분포로 조회해 주세요.</p>':selectable?'<p>표에서 관심 대상을 선택하세요. 기간과 조건이 이어지며, 표시한 BIN은 상세 조회의 칩 필터로 적용됩니다.</p>':'<p>LOT 또는 웨이퍼 전체 ID(root_id)가 없어 이 결과에서 상세 대상을 선택할 수 없습니다.</p>')+(t.truncated?'<p>표에는 일부 요약 행만 표시됩니다. 표시된 대상만 선택할 수 있습니다.</p>':'')+'<div class="edsx-drilldown-actions">'+(selectable?'<button data-edsx-select-page>표시된 대상 선택</button><button data-edsx-clear-selection>선택 해제</button><span data-edsx-selection-count>'+edsxSelectionLabel(t)+'</span><button data-edsx-drill="raw" '+(!count?'disabled':'')+'>선택 대상 칩 목록</button><button class="primary" data-edsx-drill="measurement" '+(!count?'disabled':'')+'>선택 대상 측정값 →</button>':'')+'<button data-edsx-refine>조건 수정</button></div></section>';}
function edsxRefreshSelection(){const t=model.peekTable?.table||currentTable();if(!t)return;const count=edsxTargetCount(t);for(const e of document.querySelectorAll('[data-edsx-selection-count]'))e.textContent=edsxSelectionLabel(t);for(const e of document.querySelectorAll('[data-edsx-drill]'))e.disabled=!count||!!model.busy;}
function edsxSeed(q){const f=q.filters||{},time=q.time||{};return {schema:q.schemas?.[0]||q.schema||'',step_seq:q.step_seq,start_date:q.start_date||time.start_date,end_date:q.end_date||time.end_date,group_by:q.group_by||'lot',lotsText:(f.lot_ids||[]).join('\n'),wafersText:(f.wafer_ids||[]).join('\n'),binsText:(f.bin_codes||[]).join(', '),dutsText:(f.dut_numbers||[]).join(', '),...Object.fromEntries(['x_min','x_max','y_min','y_max'].map(k=>[k,f[k]===null||f[k]===undefined?'':String(f[k])]))};}
document.addEventListener('change',e=>{const i=e.target.dataset.edsxResultRow;if(i===undefined)return;const t=model.peekTable?.table||currentTable();if(!t||!edsxRowTarget(t,t.rows[Number(i)]))return;const selected=edsxSelection(t),key=edsxTargetKey(t,t.rows[Number(i)]);t.rows.forEach((row,index)=>{if(edsxTargetKey(t,row)===key){if(e.target.checked)selected.add(index);else selected.delete(index);}});for(const input of document.querySelectorAll('[data-edsx-result-row]'))input.checked=selected.has(Number(input.dataset.edsxResultRow));edsxRefreshSelection();});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.edsxSelectPage===undefined&&b.dataset.edsxClearSelection===undefined&&b.dataset.edsxDrill===undefined&&b.dataset.edsxRefine===undefined)return;const t=model.peekTable?.table||currentTable(),q=edsxRequest(t);if(!q)return;const selected=edsxSelection(t);if(b.dataset.edsxSelectPage!==undefined||b.dataset.edsxClearSelection!==undefined){selected.clear();if(b.dataset.edsxSelectPage!==undefined)t.rows.forEach((r,i)=>{if(edsxRowTarget(t,r))selected.add(i);});for(const input of document.querySelectorAll('[data-edsx-result-row]'))input.checked=selected.has(Number(input.dataset.edsxResultRow));edsxRefreshSelection();return;}const seed=edsxSeed(q);if(b.dataset.edsxRefine!==undefined){seed.mode='bin';openEDSExtract('EDS_CHIP_BIN',seed);return;}const targets=[...selected].map(i=>edsxRowTarget(t,t.rows[i])).filter(Boolean);if(!targets.length)return;seed.mode=b.dataset.edsxDrill;if(q.group_by==='wafer'){seed.wafersText=[...new Set(targets.map(x=>x.wafer_id))].join('\n');seed.lotsText='';}else{seed.lotsText=[...new Set(targets.map(x=>x.lot_id))].join('\n');seed.wafersText='';}openEDSExtract(seed.mode==='measurement'?'EDS_CHIP_MSR':'EDS_CHIP_BIN',seed);});
window.DataTalkEDSForms={parseNumbers:edsxParseNumbers,parseIDs:edsxParseIDs,day:quickDay,dayText:quickDayText};

// Guided extraction has explicit structured inputs; only the server authorizes columns/SQL.
const quickTables={FAB_MAIN:{label:'공정 이력',fields:['step_seq'],note:'step_seq 앞 두 글자로 뽑을 제품을 자동 선택합니다. process_id는 입력하지 않습니다.'},FAB_METRO:{label:'계측 데이터',fields:['step_seq','item_id'],note:'한 행의 공정과 항목을 짝지어 조회합니다. 행 안에서는 AND, 여러 행은 OR · 정확한 값, % 패턴, * 전체를 사용할 수 있어요.'},EDS_WF_BIN:{label:'Wafer 수율 · BIN',fields:['step_seq','item_id','col_name'],note:'step_seq / item_id / col_name 세 열을 모두 입력하세요. 같은 공정과 출력 이름의 BIN은 동일한 검사 안에서 합산합니다.'}};
const quickLevels=['SITE','AVG','STD','MED','MIN','MAX','RANGE','VALUE(PC)'];
const quickDrafts=new Map();let quickUI=null,quickOptionsSequence=0,quickOptionsTimer=null;
function quickToday(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');}
function quickDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return NaN;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/86400000:NaN;}
function quickDayText(day){if(!Number.isInteger(day)||day<0||day>2932896)return '';return new Date(day*86400000).toISOString().slice(0,10);}
function quickNewState(table){const today=quickDay(quickToday());return {table,workspace_id:model.current.id,stepsText:'',rows:[Object.fromEntries(quickTables[table].fields.map(x=>[x,'']))],schemas:[],item_levels:['AVG'],start_date:quickDayText(today-29),end_date:quickDayText(today),null_policy:'propagate',criteria:'',columns:[],selected:new Set(),columnMode:'default',preference:null,options:null,optionsKey:null,loading:false,busy:false,error:'',preview:null,presets:[],page:0,focusRow:0};}
function quickAutoSchema(step){const m=String(step||'').trim().match(/^([A-Za-z]{2})/);return m?m[1].toLowerCase():null;}
function quickMainSteps(a=quickUI){let rows=a.stepsText.replace(/^\uFEFF/,'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(rows[0]?.toLowerCase()==='step_seq')rows.shift();return [...new Set(rows)];}
function quickActiveRows(a=quickUI){return a.rows.filter(r=>quickTables[a.table].fields.some(k=>String(r[k]||'').trim()));}
function quickRequestedSchemas(a=quickUI){if(a.table==='EDS_WF_BIN')return [...a.schemas].sort();if(a.table==='FAB_MAIN')return [...new Set(quickMainSteps(a).map(quickAutoSchema).filter(Boolean))].sort();return [...new Set(quickActiveRows(a).flatMap(r=>quickAutoSchema(r.step_seq)?[quickAutoSchema(r.step_seq)]:(r.schemas||[])))].sort();}
function quickOutputs(a=quickUI){if(a.table!=='EDS_WF_BIN')return [];const groups=new Map();for(const row of quickActiveRows(a)){const step_seq=String(row.step_seq||'').trim(),col_name=String(row.col_name||'').trim(),item=String(row.item_id||'').trim();if(!step_seq||!col_name||!item)continue;const key=JSON.stringify([step_seq,col_name]);if(!groups.has(key))groups.set(key,{step_seq,col_name,item_ids:[]});if(!groups.get(key).item_ids.includes(item))groups.get(key).item_ids.push(item);}return [...groups.values()];}
function quickPayload(a=quickUI){const body={workspace_id:a.workspace_id,expected_revision:model.current?.revision,table:a.table,start_date:a.start_date,end_date:a.end_date,columns:[...a.selected],criteria:a.criteria};if(a.table==='FAB_MAIN')body.steps=quickMainSteps(a);else body.rows=quickActiveRows(a).map(r=>Object.fromEntries(quickTables[a.table].fields.map(k=>[k,String(r[k]||'').trim()]).concat(a.table==='FAB_METRO'&&!quickAutoSchema(r.step_seq)?[['schemas',r.schemas||[]]]:[])));if(a.table==='FAB_METRO')body.item_levels=[...a.item_levels];if(a.table==='EDS_WF_BIN'){body.schemas=[...a.schemas];body.null_policy=a.null_policy;}return body;}
function quickColumnName(c){return typeof c==='string'?c:c.name;}
function quickSetColumns(a,columns){const rawItems=new Set(a.table==='EDS_WF_BIN'?quickActiveRows(a).map(r=>String(r.item_id||'').trim()).filter(Boolean):[]);const byName=new Map((columns||[]).filter(c=>!rawItems.has(quickColumnName(c))).map(c=>[quickColumnName(c),typeof c==='string'?{name:c}:c]));for(const o of quickOutputs(a))if(!byName.has(o.col_name))byName.set(o.col_name,{name:o.col_name,generated:true,type:'number'});a.columns=[...byName.values()];const available=new Set(a.columns.map(c=>c.name));if(a.columnMode==='default')a.selected=new Set(Array.isArray(a.preference?.columns)?a.preference.columns.filter(x=>available.has(x)):available);else if(a.columnMode==='all')a.selected=new Set(available);else a.selected=new Set([...a.selected].filter(x=>available.has(x)));}
function quickInvalidate(){if(!quickUI)return;quickUI.preview=null;quickUI.error='';$('quick-preview').hidden=true;quickRenderFooter();}
function quickRenderFooter(){const a=quickUI;if(!a)return;const busy=!!a.busy;for(const id of ['quick-preview-button','quick-save-columns','quick-column-reset','quick-preset-save','quick-preset-load','quick-preset-delete'])$(id).disabled=busy||a.loading;$('quick-plan-button').disabled=busy||a.loading||!a.preview;$('quick-plan-button').textContent=a.busy==='plan'?'SQL 준비 중…':'SQL 준비 →';$('quick-preview-button').textContent=a.busy==='preview'?'조건 확인 중…':'조건 확인';$('quick-error').textContent=a.error||'';for(const e of $('quick-dialog').querySelectorAll('input,textarea,select,[data-quick-table],#quick-add-row,#quick-paste-apply,[data-quick-delete]'))e.disabled=busy;}
async function openQuickExtract(table='FAB_MAIN'){
  if(['EDS_WF_MSR','EDS_CHIP_BIN','EDS_CHIP_MSR','EDS_CHIP'].includes(table))return openEDSExtract(table);
  $('eds-extract-dialog').close();
  if(!model.ready||!model.current||model.busy){toast('서버 연결과 작업공간을 확인한 뒤 다시 열어 주세요.');return;}
  const key=model.current.id+':'+table;if(!quickDrafts.has(key))quickDrafts.set(key,quickNewState(table));quickUI=quickDrafts.get(key);quickUI.preview=null;quickUI.error='';
  $('quick-workspace').textContent=model.current.id+' · '+model.current.name+' · '+quickTables[table].label;$('quick-title').textContent=table+' 간편추출';
  for(const b of $('quick-dialog').querySelectorAll('[data-quick-table]'))b.setAttribute('aria-pressed',String(b.dataset.quickTable===table));
  $('quick-condition-note').textContent=quickTables[table].note;$('quick-main-input').hidden=table!=='FAB_MAIN';$('quick-paired-input').hidden=table==='FAB_MAIN';$('quick-eds-schemas').hidden=table!=='EDS_WF_BIN';$('quick-presets').hidden=table!=='EDS_WF_BIN';$('quick-item-level').hidden=table!=='FAB_METRO';$('quick-steps').value=quickUI.stepsText;$('quick-null').value=quickUI.null_policy;$('quick-criteria').value=quickUI.criteria;$('quick-column-search').value='';$('quick-paste-panel').hidden=true;$('quick-paste-toggle').setAttribute('aria-expanded','false');$('quick-preview').hidden=true;$('quick-paste-label').textContent=quickTables[table].fields.join(' / ')+' · 엑셀의 '+quickTables[table].fields.length+'개 열';
  quickRenderDates();quickRenderConditions();quickRenderColumns();quickRenderFooter();if(!$('quick-dialog').open)$('quick-dialog').showModal();await quickLoadOptions(true);if(quickUI?.table==='EDS_WF_BIN')await quickLoadPresets();
}
async function quickLoadOptions(force=false){
  const a=quickUI;if(!a)return;clearTimeout(quickOptionsTimer);const schemas=quickRequestedSchemas(a),key=JSON.stringify([a.table,schemas]);if(!force&&a.optionsKey===key){quickSetColumns(a,a.options?.columns||[]);quickRenderColumns();return;}
  const seq=++quickOptionsSequence;a.loading=true;a.optionsKey=null;quickRenderColumns();quickRenderFooter();
  try{const r=await api('/quick-extract/options',{table:a.table,...(schemas.length?{schemas}:{})});if(quickUI!==a||seq!==quickOptionsSequence)return;a.options=r;a.optionsKey=key;a.preference=r.preference||null;quickSetColumns(a,r.columns||[]);quickRenderConditions();}
  catch(e){if(quickUI!==a||seq!==quickOptionsSequence)return;a.error=e.message;a.options=null;a.columns=[];a.selected=new Set();}
  finally{if(quickUI===a&&seq===quickOptionsSequence){a.loading=false;quickRenderColumns();quickRenderFooter();}}
}
function quickScheduleOptions(){clearTimeout(quickOptionsTimer);const a=quickUI;quickOptionsTimer=setTimeout(()=>{if(a===quickUI)quickLoadOptions();},300);}
function quickRenderDates(){const a=quickUI,today=quickDay(quickToday());$('quick-start-date').value=a.start_date;$('quick-end-date').value=a.end_date;const start=quickDay(a.start_date),end=quickDay(a.end_date);$('quick-start-offset').value=Number.isFinite(start)?start-today:'';$('quick-end-offset').value=Number.isFinite(end)?end-today:'';const valid=Number.isFinite(start)&&Number.isFinite(end)&&start<=end;$('quick-period').classList.toggle('invalid',!valid);$('quick-period').textContent=valid?a.start_date+' ~ '+a.end_date+' · '+(end-start+1)+'일 · 종료일 포함':'올바른 시작일과 종료일을 입력해 주세요. 시작일은 종료일보다 늦을 수 없습니다.';}
function quickSchemaHTML(selected,attr){const schemas=quickUI.options?.schemas||[];return schemas.length?schemas.map(s=>'<label><input type="checkbox" '+attr+'="'+esc(s.name)+'" '+(selected.includes(s.name)?'checked':'')+'> '+esc(s.name)+'</label>').join(''):'<span class="quick-section-note">조회 가능한 스키마를 확인하고 있어요.</span>';}
function quickRenderConditions(){const a=quickUI;if(!a)return;const active=document.activeElement,focus=active?.dataset?.quickCell?{field:active.dataset.quickCell,index:active.dataset.quickIndex,start:active.selectionStart,end:active.selectionEnd}:null;if(a.table==='FAB_MAIN'){const steps=quickMainSteps(a),schemas=quickRequestedSchemas(a);$('quick-main-schemas').textContent=steps.length?steps.length+'개 공정 · 자동 스키마 '+(schemas.join(', ')||'판단할 수 없음'):'공정을 입력하면 스키마를 자동으로 표시합니다.';return;}
  const fields=quickTables[a.table].fields,start=a.page*100,visible=a.rows.slice(start,start+100);if(!visible.length&&a.page){a.page=0;quickRenderConditions();return;}
  $('quick-row-count').textContent=quickActiveRows(a).length+'개 조건 · 최대 5,000행';$('quick-grid-head').innerHTML='<tr><th>#</th>'+fields.map(x=>'<th>'+esc(x)+'</th>').join('')+(a.table==='FAB_METRO'?'<th class="schema-cell">뽑을 제품</th>':'')+'<th></th></tr>';
  $('quick-grid-body').innerHTML=visible.map((row,pos)=>{const i=start+pos,auto=quickAutoSchema(row.step_seq);return '<tr data-quick-row="'+i+'"><td>'+(i+1)+'</td>'+fields.map((field,col)=>'<td><input data-quick-cell="'+field+'" data-quick-index="'+i+'" data-quick-col="'+col+'" aria-label="'+(i+1)+'행 '+field+'" value="'+esc(row[field])+'" spellcheck="false" placeholder="'+(field==='step_seq'?(a.table==='FAB_METRO'?'EJ057%':'EDS_M'):field==='item_id'?(a.table==='FAB_METRO'?'THK1%':'BIN0012'):'GoodBIN(B12)')+'"></td>').join('')+(a.table==='FAB_METRO'?'<td class="schema-cell">'+(auto?'<span class="schema-auto">'+esc(auto)+' · 자동</span>':'<div class="quick-schema-list" data-quick-schema-row="'+i+'">'+quickSchemaHTML(row.schemas||[],'data-quick-row-schema')+'</div>')+'</td>':'')+'<td><button data-quick-delete="'+i+'" aria-label="'+(i+1)+'행 삭제">×</button></td></tr>';}).join('');
  $('quick-grid-pager').innerHTML=a.rows.length>100?'<button data-quick-page="-1" '+(!a.page?'disabled':'')+'>이전</button><span>'+(start+1)+'–'+Math.min(start+100,a.rows.length)+' / '+a.rows.length+'행</span><button data-quick-page="1" '+(start+100>=a.rows.length?'disabled':'')+'>다음</button>':'';
  if(a.table==='FAB_METRO')$('quick-level-choices').innerHTML=quickLevels.map(x=>'<label><input type="checkbox" data-quick-level="'+esc(x)+'" '+(a.item_levels.includes(x)?'checked':'')+'> '+esc(x)+'</label>').join('');
  if(a.table==='EDS_WF_BIN'){$('quick-schema-choices').innerHTML=quickSchemaHTML(a.schemas,'data-quick-schema');quickRenderOutputs();}quickRenderMeaning();if(focus){const input=$('quick-grid-body').querySelector('[data-quick-index="'+focus.index+'"][data-quick-cell="'+focus.field+'"]');if(input){input.focus({preventScroll:true});input.setSelectionRange(focus.start,focus.end);}}
}
function quickMeaningPart(value,noun){const v=String(value||'').trim();if(!v)return noun+' 미입력';if(v==='*')return '모든 '+noun;if(v.endsWith('%')&&!v.slice(0,-1).includes('%'))return '“'+v.slice(0,-1)+'”로 시작하는 '+noun;if(v.includes('%'))return '“'+v+'” 패턴의 '+noun;return '“'+v+'” '+noun;}
function quickRenderMeaning(){const a=quickUI;if(!a||a.table==='FAB_MAIN')return;const r=a.rows[a.focusRow]||a.rows[0]||{};$('quick-meaning').textContent=a.table==='FAB_METRO'?'선택 행 해석 · '+quickMeaningPart(r.step_seq,'공정')+' AND '+quickMeaningPart(r.item_id,'항목')+' · 다른 행과 OR로 연결':'출력 이름은 괄호와 + 기호까지 그대로 보존합니다. 서로 다른 웨이퍼·검사·재검사 행을 자동 합산하지 않습니다.';}
function quickRenderOutputs(){const outputs=quickOutputs(),rows=quickActiveRows().length;$('quick-eds-output').innerHTML='<div class="quick-output-count">'+rows+'개 입력 항목 → '+outputs.length+'개 출력 정의</div>'+(outputs.length?'<div class="quick-grid-wrap"><table><thead><tr><th>step_seq</th><th>결과 컬럼</th><th>같은 검사 내 입력 항목</th></tr></thead><tbody>'+outputs.map(o=>'<tr><td>'+esc(o.step_seq)+'</td><td>'+esc(o.col_name)+'</td><td>'+o.item_ids.map(esc).join(' + ')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="quick-section-note">매핑을 입력하면 생성할 컬럼과 합산식을 표시합니다.</p>');}
function quickRenderColumns(){const a=quickUI;if(!a)return;const focusName=document.activeElement?.dataset?.quickColumn;const query=$('quick-column-search').value.trim().toLowerCase(),visible=a.columns.filter(c=>c.name.toLowerCase().includes(query));$('quick-personal').textContent=Array.isArray(a.preference?.columns)?(a.columnMode==='default'?'내 기본값 불러옴':'내 기본값에서 변경'):a.columnMode==='custom'?'이번 조회 선택':'기본 · 전체 선택';$('quick-column-count').textContent=a.selected.size+' / '+a.columns.length+'개 선택 · 최대 1,000개';$('quick-column-state').textContent=a.loading?'컬럼 정보 확인 중…':query?'검색 결과 '+visible.length+'개':'';$('quick-columns').innerHTML=a.loading?'<div class="empty">권한이 있는 실제 컬럼을 확인하고 있어요.</div>':visible.length?visible.map(c=>'<label title="'+esc(c.type||'')+'"><input type="checkbox" data-quick-column="'+esc(c.name)+'" '+(a.selected.has(c.name)?'checked':'')+'><span>'+esc(c.name)+(c.generated?' <small>· 생성</small>':'')+'</span></label>').join(''):'<div class="empty">'+(query?'검색 결과가 없습니다.':'사용 가능한 컬럼이 없습니다. 조회조건과 스키마를 확인해 주세요.')+'</div>';$('quick-column-note').textContent=(a.table==='EDS_WF_BIN'?'선택한 BIN 결과와 식별 컬럼만 표시합니다. ':'')+'다음에도 쓰려면 ‘내 기본값으로 저장’을 누르세요.';if(focusName!==undefined)[...$('quick-columns').querySelectorAll('[data-quick-column]')].find(e=>e.dataset.quickColumn===focusName)?.focus({preventScroll:true});}
// Excel TSV supports escaped quotes, CRLF, optional headers and cell-level matrix pasting.
function quickParseTSV(text){const rows=[];let row=[],cell='',quoted=false;const src=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<src.length;i++){const c=src[i];if(c==='"'&&(quoted||cell==='')){if(quoted&&src[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c==='\t'||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!=='\t'){rows.push(row);row=[];if(c==='\r'&&src[i+1]==='\n')i++;}}else cell+=c;}if(quoted)throw Error('엑셀 표의 따옴표가 닫히지 않았습니다. 셀 범위를 다시 복사해 주세요.');if(cell||row.length){row.push(cell);rows.push(row);}return rows.filter(r=>r.some(x=>x.trim()));}
function quickHeaderName(value){return String(value??'').replace(/^\uFEFF/,'').trim().toLowerCase();}
function quickPreparePaste(text,fields,startRow=0,startCol=0,replace=false){
  let rows=quickParseTSV(text);if(!rows.length)throw Error('붙여넣을 조건을 입력해 주세요.');
  const names=rows[0].map(quickHeaderName),known=['step_seq','item_id','col_name'];
  // A header maps the complete schema. A one-column cell paste stays positional.
  // Actual step values also stay data when a literal output alias is e.g. col_name.
  const firstIsStep=/^(?:EDS_|[a-z]{2}(?:\d|[%*])|[%*]$)/i.test(names[0]||'');
  const partialCell=startCol>0&&!replace&&rows[0].length<fields.length;
  const header=!partialCell&&(replace||rows[0].length>1||fields.length===1)&&!firstIsStep&&names.some(n=>known.includes(n));
  if(header){
    const duplicates=[...new Set(names.filter((n,i)=>names.indexOf(n)!==i))];
    if(duplicates.length)throw Error('중복된 헤더가 있습니다: '+duplicates.map(n=>n||'(빈 헤더)').join(', ')+'. 각 헤더를 한 번씩 입력하세요.');
    const unknown=names.map((n,i)=>fields.includes(n)?null:(i+1)+'열 '+(n||'(빈 헤더)')).filter(Boolean),missing=fields.filter(n=>!names.includes(n));
    if(unknown.length||missing.length)throw Error('헤더를 확인해 주세요. '+(unknown.length?'알 수 없는 헤더: '+unknown.join(', ')+'. ':'')+(missing.length?'필수 헤더 누락: '+missing.join(', ')+'. ':'')+'사용할 헤더: '+fields.join(' / '));
    rows=rows.slice(1);if(!rows.length)throw Error('헤더 아래에 조회조건을 입력해 주세요.');
    const bad=rows.findIndex(row=>row.length!==fields.length);
    if(bad>=0)throw Error('붙여넣은 표 '+(bad+2)+'행의 열 수가 헤더와 다릅니다. '+fields.length+'개 열을 함께 복사해 주세요.');
    const positions=fields.map(n=>names.indexOf(n));rows=rows.map(row=>positions.map(i=>row[i]));startCol=0;
  }
  if(rows.length+startRow>5000)throw Error('최대 5,000행까지 붙여넣을 수 있습니다.');
  if(rows.some(row=>row.length+startCol>fields.length||(replace&&row.length!==fields.length)))throw Error(fields.join(' / ')+' 순서로 '+fields.length+'개 열을 복사해 주세요.');
  return {rows:rows.map(row=>row.map(value=>value.trim())),startCol,header};
}
function quickPaste(text,startRow=0,startCol=0,replace=false){const a=quickUI,fields=quickTables[a.table].fields,prepared=quickPreparePaste(text,fields,startRow,startCol,replace),parsed=prepared.rows;startCol=prepared.startCol;if(replace)a.rows=[];for(let i=0;i<parsed.length;i++){const idx=startRow+i;if(!a.rows[idx])a.rows[idx]=Object.fromEntries(fields.map(f=>[f,'']));for(let j=0;j<parsed[i].length;j++)a.rows[idx][fields[startCol+j]]=parsed[i][j];if(quickAutoSchema(a.rows[idx].step_seq))delete a.rows[idx].schemas;}a.page=Math.floor(startRow/100);a.focusRow=startRow;quickInvalidate();quickSetColumns(a,a.options?.columns||[]);quickRenderConditions();quickRenderColumns();quickScheduleOptions();}
function quickLocalError(a){if(a.workspace_id!==model.current?.id)return '작업공간이 변경되었습니다. 간편추출을 다시 열어 주세요.';if(!Number.isFinite(quickDay(a.start_date))||!Number.isFinite(quickDay(a.end_date))||quickDay(a.start_date)>quickDay(a.end_date))return '올바른 조회 기간을 입력해 주세요.';if(a.table==='FAB_MAIN'){const steps=quickMainSteps(a);if(!steps.length)return 'step_seq를 한 개 이상 입력해 주세요.';if(steps.some(x=>/[\t,%*]/.test(x)||!quickAutoSchema(x)))return 'FAB_MAIN에는 정확한 step_seq를 한 줄에 하나씩 입력해 주세요.';}else{const rows=quickActiveRows(a);if(!rows.length)return '조회조건을 한 행 이상 입력해 주세요.';const bad=rows.findIndex(r=>quickTables[a.table].fields.some(f=>!String(r[f]||'').trim()));if(bad>=0)return '조회조건 '+(bad+1)+'행의 필수 값을 모두 입력해 주세요.';if(a.table==='FAB_METRO'&&rows.some(r=>!quickAutoSchema(r.step_seq)&&!r.schemas?.length))return '공정에서 스키마를 판단할 수 없는 행의 뽑을 제품을 선택해 주세요.';}if(a.table==='FAB_METRO'&&!a.item_levels.length)return 'item_level을 한 개 이상 선택해 주세요.';if(a.table==='EDS_WF_BIN'&&!a.schemas.length)return '뽑을 제품을 한 개 이상 선택해 주세요.';if(!a.selected.size)return '추출 컬럼을 한 개 이상 선택해 주세요.';if(a.selected.size>1000)return '최종 추출 컬럼은 1,000개 이하로 선택해 주세요.';return '';}
async function quickPreview(){const a=quickUI;if(!a||a.busy)return;await quickLoadOptions();if(quickUI!==a)return;const error=quickLocalError(a);if(error){a.error=error;quickRenderFooter();return;}a.busy='preview';a.error='';quickRenderFooter();try{const r=await api('/quick-extract/preview',quickPayload(a));if(quickUI!==a)return;a.preview=r;const mode=a.columnMode;quickSetColumns(a,r.columns||a.columns);a.columnMode=mode;if(r.selected_columns)a.selected=new Set(r.selected_columns);$('quick-preview').hidden=false;const summary=typeof r.summary==='string'?r.summary:JSON.stringify(r.summary||{});$('quick-preview').innerHTML='<strong>조회조건 확인 완료</strong><p>'+esc(summary)+'</p>'+(r.warnings||[]).map(w=>'<p>'+esc(typeof w==='string'?w:w.message||JSON.stringify(w))+'</p>').join('')+'';quickRenderColumns();}catch(e){a.error=e.message;a.preview=null;$('quick-preview').hidden=true;}finally{a.busy=false;if(quickUI===a)quickRenderFooter();}}
async function quickPlan(){const a=quickUI;if(!a?.preview||a.busy||model.busy)return;a.busy='plan';a.error='';model.busy={label:'간편추출 SQL 준비 중'};quickRenderFooter();render();try{const r=await api('/quick-extract/plan',quickPayload(a));if(r.workspace&&model.current?.id===a.workspace_id){apply(r.workspace);$('quick-dialog').close();model.tab='table';bottom();toast(r.kind==='clarification'?'대화창에서 추가 조건을 확인해 주세요. 입력한 조회조건은 유지됩니다.':'대화창에서 SQL을 확인한 뒤 Run으로 실행해 주세요.');}}catch(e){a.error=e.message;if(e.status===409&&model.current?.id===a.workspace_id){try{const ws=await api('/workspace/'+encodeURIComponent(a.workspace_id));if(model.current?.id===a.workspace_id)apply(ws);}catch{}}}finally{a.busy=false;model.busy=null;if(quickUI===a)quickRenderFooter();render();}}
async function quickSaveColumns(reset=false){const a=quickUI;if(!a||a.busy)return;if(!reset&&(!a.selected.size||a.selected.size>1000)){a.error='추출 컬럼을 1개 이상, 1,000개 이하로 선택해 주세요.';quickRenderFooter();return;}a.busy='preferences';a.error='';quickRenderFooter();try{const r=await api('/quick-extract/preferences',reset?{table:a.table,reset:true}:quickPayload(a));if(quickUI!==a)return;a.preference=r.preference||{columns:reset?null:[...a.selected]};a.columnMode='default';quickInvalidate();await quickLoadOptions(true);toast(reset?'개인 기본값을 초기화했어요. 다음 조회는 전체 컬럼을 선택합니다.':'이 테이블의 추출 컬럼을 내 기본값으로 저장했어요.');}catch(e){a.error=e.message;}finally{a.busy=false;if(quickUI===a){quickRenderColumns();quickRenderFooter();}}}
async function quickLoadPresets(){const a=quickUI;if(a?.table!=='EDS_WF_BIN')return;try{const r=await api('/quick-extract/presets',{table:a.table,action:'list'});if(quickUI!==a)return;a.presets=r.presets||[];quickRenderPresets();}catch(e){if(quickUI===a){a.error=e.message;quickRenderFooter();}}}
function quickRenderPresets(){const previous=$('quick-preset-list').value;$('quick-preset-list').innerHTML='<option value="">저장한 BIN 조합 선택</option>'+quickUI.presets.map(p=>'<option value="'+esc(p.name)+'">'+esc(p.name)+'</option>').join('');if(quickUI.presets.some(p=>p.name===previous))$('quick-preset-list').value=previous;}
async function quickPresetAction(action){const a=quickUI;if(a?.table!=='EDS_WF_BIN'||a.busy)return;const name=(action==='save'?$('quick-preset-name').value:$('quick-preset-list').value).trim();if(!name){a.error=action==='save'?'저장할 BIN 조합 이름을 입력해 주세요.':'BIN 조합을 선택해 주세요.';quickRenderFooter();return;}if(action==='load'){const p=a.presets.find(x=>x.name===name);if(!p)return;a.rows=JSON.parse(JSON.stringify(p.rows));a.schemas=[...(p.schemas||[])];a.null_policy=p.null_policy||'propagate';a.selected=new Set(p.columns||[]);a.columnMode=p.columns?'custom':'default';a.page=0;$('quick-null').value=a.null_policy;$('quick-preset-name').value=p.name;quickInvalidate();quickRenderConditions();await quickLoadOptions(true);toast('BIN 조합을 불러왔어요. 조회 기간은 현재 입력을 유지합니다.');return;}a.busy='preset';a.error='';quickRenderFooter();try{const r=await api('/quick-extract/presets',{table:a.table,action,name,...(action==='save'?{rows:quickPayload(a).rows,schemas:a.schemas,null_policy:a.null_policy,columns:[...a.selected]}:{})});if(quickUI!==a)return;a.presets=r.presets||[];quickRenderPresets();if(action==='save')$('quick-preset-list').value=name;toast(action==='save'?'BIN 조합을 저장했어요.':'BIN 조합을 삭제했어요.');}catch(e){a.error=e.message;}finally{a.busy=false;if(quickUI===a)quickRenderFooter();}}
$('quick-close').addEventListener('click',()=>{if(!quickUI?.busy)$('quick-dialog').close();});$('quick-dialog').addEventListener('cancel',e=>{if(quickUI?.busy)e.preventDefault();});
$('quick-dialog').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled||quickUI?.busy)return;if(b.dataset.quickTable)openQuickExtract(b.dataset.quickTable);if(b.dataset.quickDelete!==undefined){quickUI.rows.splice(Number(b.dataset.quickDelete),1);if(!quickUI.rows.length)quickUI.rows=[Object.fromEntries(quickTables[quickUI.table].fields.map(f=>[f,'']))];quickInvalidate();quickSetColumns(quickUI,quickUI.options?.columns||[]);quickRenderConditions();quickRenderColumns();quickScheduleOptions();}if(b.dataset.quickPage){quickUI.page+=Number(b.dataset.quickPage);quickRenderConditions();}});
$('quick-add-row').addEventListener('click',()=>{if(quickUI.rows.length>=5000){toast('조건은 최대 5,000행입니다.');return;}quickUI.rows.push(Object.fromEntries(quickTables[quickUI.table].fields.map(f=>[f,''])));quickUI.page=Math.floor((quickUI.rows.length-1)/100);quickRenderConditions();$('quick-grid-body').querySelector('tr:last-child input')?.focus();});
$('quick-grid-body').addEventListener('focusin',e=>{if(e.target.dataset.quickIndex!==undefined){quickUI.focusRow=Number(e.target.dataset.quickIndex);quickRenderMeaning();}});
$('quick-grid-body').addEventListener('input',e=>{const field=e.target.dataset.quickCell;if(!field)return;const a=quickUI,i=Number(e.target.dataset.quickIndex),old=quickAutoSchema(a.rows[i].step_seq);a.rows[i][field]=e.target.value;a.focusRow=i;if(field==='step_seq'&&quickAutoSchema(e.target.value))delete a.rows[i].schemas;quickInvalidate();quickRenderMeaning();$('quick-row-count').textContent=quickActiveRows().length+'개 조건 · 최대 5,000행';if(a.table==='EDS_WF_BIN'){quickRenderOutputs();quickSetColumns(a,a.options?.columns||[]);quickRenderColumns();}if(a.table==='FAB_METRO'&&field==='step_seq'){const cell=e.target.closest('tr').querySelector('.schema-cell'),auto=quickAutoSchema(e.target.value);cell.innerHTML=auto?'<span class="schema-auto">'+esc(auto)+' · 자동</span>':'<div class="quick-schema-list" data-quick-schema-row="'+i+'">'+quickSchemaHTML(a.rows[i].schemas||[],'data-quick-row-schema')+'</div>';}quickScheduleOptions();});
$('quick-grid-body').addEventListener('paste',e=>{if(e.target.dataset.quickCell===undefined)return;const text=e.clipboardData?.getData('text/plain')||'';if(!/[\t\r\n]/.test(text))return;e.preventDefault();try{quickPaste(text,Number(e.target.dataset.quickIndex),Number(e.target.dataset.quickCol));}catch(err){quickUI.error=err.message;quickRenderFooter();}});
$('quick-paste-toggle').addEventListener('click',()=>{const panel=$('quick-paste-panel');panel.hidden=!panel.hidden;$('quick-paste-toggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)$('quick-paste-text').focus();});$('quick-paste-apply').addEventListener('click',()=>{try{quickPaste($('quick-paste-text').value,0,0,true);$('quick-paste-panel').hidden=true;$('quick-paste-toggle').setAttribute('aria-expanded','false');}catch(e){quickUI.error=e.message;quickRenderFooter();}});
$('quick-steps').addEventListener('input',()=>{quickUI.stepsText=$('quick-steps').value;quickInvalidate();quickRenderConditions();quickScheduleOptions();});
$('quick-dialog').addEventListener('change',e=>{const t=e.target,a=quickUI;if(!a)return;if(t.dataset.quickColumn!==undefined){a.columnMode='custom';if(t.checked)a.selected.add(t.dataset.quickColumn);else a.selected.delete(t.dataset.quickColumn);quickInvalidate();quickRenderColumns();}if(t.dataset.quickSchema!==undefined){a.schemas=[...$('quick-schema-choices').querySelectorAll('input:checked')].map(x=>x.dataset.quickSchema);quickInvalidate();quickLoadOptions();}if(t.dataset.quickRowSchema!==undefined){const parent=t.closest('[data-quick-schema-row]'),i=Number(parent.dataset.quickSchemaRow);a.rows[i].schemas=[...parent.querySelectorAll('input:checked')].map(x=>x.dataset.quickRowSchema);quickInvalidate();quickLoadOptions();}if(t.dataset.quickLevel!==undefined){a.item_levels=[...$('quick-level-choices').querySelectorAll('input:checked')].map(x=>x.dataset.quickLevel);quickInvalidate();}});
for(const edge of ['start','end']){$('quick-'+edge+'-date').addEventListener('change',()=>{quickUI[edge+'_date']=$('quick-'+edge+'-date').value;quickInvalidate();quickRenderDates();});$('quick-'+edge+'-offset').addEventListener('change',()=>{const raw=$('quick-'+edge+'-offset').value,n=Number(raw);quickUI[edge+'_date']=raw!==''&&Number.isInteger(n)?quickDayText(quickDay(quickToday())+n):'';quickInvalidate();quickRenderDates();});}
$('quick-null').addEventListener('change',()=>{quickUI.null_policy=$('quick-null').value;quickInvalidate();});$('quick-criteria').addEventListener('input',()=>{quickUI.criteria=$('quick-criteria').value;quickInvalidate();});$('quick-column-search').addEventListener('input',quickRenderColumns);$('quick-column-all').addEventListener('click',()=>{quickUI.columnMode='all';quickUI.selected=new Set(quickUI.columns.map(c=>c.name));quickInvalidate();quickRenderColumns();});$('quick-column-none').addEventListener('click',()=>{quickUI.columnMode='custom';quickUI.selected.clear();quickInvalidate();quickRenderColumns();});$('quick-column-reset').addEventListener('click',()=>quickSaveColumns(true));$('quick-save-columns').addEventListener('click',()=>quickSaveColumns());$('quick-preview-button').addEventListener('click',quickPreview);$('quick-plan-button').addEventListener('click',quickPlan);for(const action of ['load','save','delete'])$('quick-preset-'+action).addEventListener('click',()=>quickPresetAction(action));
function updateFullscreenButton(){const active=!!document.fullscreenElement,b=$('main-fullscreen');b.setAttribute('aria-pressed',String(active));b.textContent=active?'⤡ 전체화면 해제':'⤢ 전체화면';b.title=active?'전체화면 해제 · Esc':'메인 화면을 전체화면으로 보기 · 브라우저 단축키 F11';}
$('main-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else throw Error('unsupported');}catch{toast('브라우저에서 전체화면을 허용하지 않았습니다. Edge에서는 F11 키로 전환할 수 있어요.');}updateFullscreenButton();});document.addEventListener('fullscreenchange',updateFullscreenButton);updateFullscreenButton();

const edsDrafts=new Map();let edsUI=null;
function openEDS(){
  if(!model.ready||!model.current||model.busy)return;
  const wid=model.current.id,saved=model.current.eds_setup||{};
  if(!edsDrafts.has(wid))edsDrafts.set(wid,{workspace_id:wid,text:saved.text||'',criteria:saved.criteria||'',null_policy:saved.null_policy||'propagate',preview:null});
  edsUI=edsDrafts.get(wid);$('eds-workspace').textContent=wid+' · '+model.current.name;
  $('eds-text').value=edsUI.text;$('eds-criteria').value=edsUI.criteria;$('eds-nulls').value=edsUI.null_policy;
  renderEDS();$('eds-dialog').showModal();$('eds-text').focus();
}
function updateEDS(){if(!edsUI)return;edsUI.text=$('eds-text').value;edsUI.criteria=$('eds-criteria').value;edsUI.null_policy=$('eds-nulls').value;edsUI.preview=null;edsUI.error='';renderEDS();}
function renderEDS(){
  const a=edsUI;if(!a)return;const preview=a.preview;
  $('eds-error').textContent=a.error||'';$('eds-check').disabled=!!a.busy||!a.text.trim();$('eds-plan').disabled=!!a.busy||!preview?.valid||!a.criteria.trim();
  for(const id of ['eds-text','eds-criteria','eds-nulls'])$(id).disabled=!!a.busy;
  $('eds-preview').innerHTML=preview?'<p><strong>'+preview.row_count+'개 항목 → '+preview.output_count+'개 결과 컬럼</strong></p>'+
    (preview.errors?.length?'<div class="inline-error">'+preview.errors.map(e=>'<p>엑셀 '+e.row+'행 · '+esc(e.message)+'</p>').join('')+(preview.error_count>preview.errors.length?'<p>오류 '+preview.error_count+'건 중 앞 '+preview.errors.length+'건을 표시합니다.</p>':'')+'</div>':'')+
    '<div class="eds-preview-table"><table><thead><tr><th>step_seq</th><th>결과 col_name</th><th>입력 항목 · 같은 검사에서 합산</th></tr></thead><tbody>'+preview.outputs.map(o=>'<tr><td>'+esc(o.step_seq)+'</td><td>'+esc(o.col_name)+'</td><td>'+o.item_ids.map(esc).join(' + ')+'</td></tr>').join('')+'</tbody></table></div><p class="analysis-hint">'+esc(preview.rules.nulls)+' · '+esc(preview.rules.grain)+'</p>':'<p class="analysis-hint">표 검사를 누르면 출력 컬럼과 합산식을 확인할 수 있습니다.</p>';
  $('eds-plan').textContent=a.busy==='plan'?'조회 조건과 SQL 준비 중…':'이 매핑으로 SQL 준비';
}
async function checkEDS(){
  const a=edsUI;if(!a||a.busy)return;a.busy='check';a.error='';renderEDS();
  try{a.preview=await api('/eds/preview',{text:a.text,null_policy:a.null_policy});}catch(e){a.error=e.message;}
  finally{a.busy=false;if(edsUI===a)renderEDS();}
}
async function planEDS(){
  const a=edsUI;if(!a?.preview?.valid||a.busy||a.workspace_id!==model.current?.id)return;
  a.busy='plan';a.error='';model.busy={label:'EDS 조회 조건 준비 중'};renderEDS();render();
  try{
    const r=await api('/eds/plan',{workspace_id:a.workspace_id,expected_revision:model.current.revision,text:a.text,criteria:a.criteria,null_policy:a.null_policy});
    if(model.current?.id===a.workspace_id){apply(r.workspace);$('eds-dialog').close();model.tab='table';render();bottom();
      toast(r.kind==='clarification'?'확인할 조건이 있어요. 대화창에서 이어서 답해 주세요. 종료하려면 EDS 취소라고 입력하세요.':'대화창에서 조회 SQL을 확인한 뒤 실행해 주세요.');}
  }catch(e){a.error=e.message;if(e.status===409&&model.current?.id===a.workspace_id){const fresh=await api('/workspace/'+encodeURIComponent(a.workspace_id));if(model.current?.id===a.workspace_id)apply(fresh);}}
  finally{a.busy=false;model.busy=null;if(edsUI===a)renderEDS();render();}
}
$('eds-open').addEventListener('click',()=>openQuickExtract());
$('eds-close').addEventListener('click',()=>$('eds-dialog').close());
$('eds-check').addEventListener('click',checkEDS);
$('eds-plan').addEventListener('click',planEDS);
for(const id of ['eds-text','eds-criteria'])$(id).addEventListener('input',updateEDS);
$('eds-nulls').addEventListener('change',updateEDS);

function apiAuthorPrompt(help){
  if(help.copy_prompt||help.authoring_prompt||help.prompt)return help.copy_prompt||help.authoring_prompt||help.prompt;
  return 'DataTalk 분석 API 제작 요청\n\n목적: [원하는 데이터 가공·분석 내용을 입력]\n입력 테이블: [컬럼과 자료형을 입력]\n\n아래 계약에 맞춰 실행 가능한 API 소스, 의존성, 실행 방법과 테스트를 만들어 주세요. 기존 API 계약을 임의로 바꾸지 마세요. 입력 선택이 필요하면 선언형 UI를 제공하고, 필요 없으면 ui.mode=none을 사용하세요. 원본 전체 데이터로 처리하며 미리보기를 전체 데이터로 오인하지 마세요. 자료형 변환은 DataTalk 테이블 기능에서 먼저 적용하도록 안내하세요. 장시간 작업은 상태 조회와 실제 취소를 지원하세요. 반환 그래프는 실행 코드·HTML이 아닌 숫자 데이터 계약을 사용하세요.\n\n'+(help.sections||[]).map(x=>'## '+x.title+'\n'+x.text).join('\n\n')+'\n\n'+(help.examples||[]).map(x=>'## '+x.title+'\n'+JSON.stringify(x.value,null,2)).join('\n\n');
}
function renderApiHelp(help,messageIndex){return '<section class="api-author-help"><div class="api-help-top"><h3>'+esc(help.title||'API 제작 지시문')+'</h3><button class="primary" data-copy-api-help="'+messageIndex+'">제작 지시문 전체 복사</button></div><p>아래 내용을 사내 AI에 붙여넣고, 만들고 싶은 분석 목적과 입력 컬럼을 채워 주세요.</p><pre class="api-author-prompt">'+esc(apiAuthorPrompt(help))+'</pre></section>';}
$('analysis-body').addEventListener('change',event=>{
  const target=event.target;if(target.dataset.columnFilter!==undefined)return;
  const scrolls=[...$('analysis-body').querySelectorAll('.observation-choices')].map(el=>el.scrollTop);
  const id=target.id,keys=['apiField','column'],selector=keys.filter(k=>target.dataset[k]!==undefined).map(k=>'[data-'+k.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+'="'+target.dataset[k]+'"]' ).join('');
  readField(target);renderAnalysis();renderChat();[...$('analysis-body').querySelectorAll('.observation-choices')].forEach((el,i)=>el.scrollTop=scrolls[i]||0);const next=id?$(id):selector?$('analysis-body').querySelector(selector):null;next?.focus();
});
$('analysis-body').addEventListener('input',event=>{const el=event.target;if(el.dataset.columnFilter===undefined)return;analysisUI.filters??={};analysisUI.filters[el.dataset.columnFilter]=el.value;const q=el.value.toLowerCase();for(const label of el.parentElement.querySelectorAll('[data-column-option]'))label.hidden=!analysisUI.draft.columns[Number(label.dataset.columnOption)].name.toLowerCase().includes(q);});
async function closeAnalysis42(){const a=analysisUI;if(a&&(!a.run||['preparing','prepared'].includes(a.run.status)||a.busyAction==='start'||a.busyAction==='prepare'||a.busyAction==='resolve_mean'))await cancelAnalysis(a);else if(a?.run&&!['completed','cancelled','failed','interrupted'].includes(a.run.status))toast('분석은 계속 진행합니다. 중단하려면 ■ 중지를 누르세요.');$('analysis-dialog').close();}
$('analysis-close').addEventListener('click',closeAnalysis42);
$('analysis-dialog').addEventListener('cancel',e=>{e.preventDefault();closeAnalysis42();});
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.clearField!==undefined){const a=analysisUI,f=a.draft.module.ui.fields[Number(b.dataset.clearField)];delete a.config.parameters[f.parameter];a.fieldEdits??={};a.fieldEdits[f.parameter]=(a.fieldEdits[f.parameter]||0)+1;a.report=null;saveAnalysisDraft(a).catch(()=>{});renderAnalysis();renderChat();}
  if(b.dataset.analysisRecommend!==undefined)requestRecommendation();
  if(b.dataset.jobCancel)cancelRecoveredJob(b.dataset.jobCancel);
  if(b.dataset.apiAction)analysisAction(b.dataset.apiAction);
  if(b.dataset.apiOpen!==undefined){model.toolOpen=true;renderTools();$('tool-search').focus();}
  if(b.dataset.analysisResume!==undefined)resumeAnalysis();
  if(b.dataset.analysisEditParam!==undefined)editAnalysisParam(Number(b.dataset.analysisEditParam));
  if(b.dataset.apiHelp!==undefined)ask('API 만드는 방법 알려줘');
  if(b.dataset.copyApiHelp!==undefined){const help=model.current.messages[Number(b.dataset.copyApiHelp)]?.api_help;if(help)copyText(apiAuthorPrompt(help));}
});

let tableTypesUI=null;
const typeStages={starting:'변환 SQL 요청을 등록하는 중',source_validation:'원본 테이블과 변경 설정을 확인하는 중',catalogue:'사용 가능한 DB 컬럼을 확인하는 중',llm:'사내 LLM이 변환 SQL을 작성하는 중',sql_validation:'생성된 SQL의 컬럼·자료형을 검증하는 중',publish:'실행 전 SQL 제안을 저장하는 중',completed:'변환 SQL 제안 준비 완료'};
const terminalTypeRequest=r=>!!r&&['completed','failed','cancelled','interrupted'].includes(r.status);
function clearTypeTimers(a){clearTimeout(a.pollTimer);clearInterval(a.tickTimer);a.pollTimer=null;a.tickTimer=null;}
async function typesApi(path,body,a,timeout=12000){const controller=new AbortController();if(a)a.transport=controller;let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout);try{return await api(path,body,{signal:controller.signal});}catch(e){if(timedOut){const error=new Error('서버 응답 시간이 초과되었습니다. 요청 상태를 다시 확인하거나 취소해 주세요.');error.code='UI_REQUEST_TIMEOUT';throw error;}throw e;}finally{clearTimeout(timer);if(a?.transport===controller)a.transport=null;}}
async function openTableTypes(ref){
  if(!ref)ref=currentTable()?.canonical_ref||(currentTable()?model.current.id+'.'+currentTable().id:null);if(!ref)return;
  if(tableTypesUI?.busy||tableTypesUI?.statusUnknown){toast('진행 중인 자료형 요청을 먼저 완료하거나 취소해 주세요.');return;}
  const [wid,tid]=ref.split('.');
  try{
    const info=await api('/table/columns?workspace_id='+encodeURIComponent(wid)+'&table_id='+encodeURIComponent(tid));
    tableTypesUI={...info,casts:Object.fromEntries(info.columns.map(c=>[c.name,{target:'original',trim:false,thousands:false,format:'iso',timezone:'UTC'}])),report:null,error:'',busy:false,search:''};
    if($('analysis-dialog').open)$('analysis-dialog').close();
    renderTableTypes();$('types-dialog').showModal();
  }catch(e){toast(e.message);}
}
function selectedTypeChanges(a=tableTypesUI){
  if(!a)return [];
  const sqlTypes={float64:'double precision',int64:'bigint',string:'text',date:'date',timestamp:'timestamp without time zone',timestamptz:'timestamp with time zone'};
  return a.columns.filter(c=>a.casts[c.name]?.target!=='original').map(c=>({column:c.name,current_type:columnTypeLabel(c.type??c.oid),current_oid:c.oid??(/^\d+$/.test(String(c.type))?Number(c.type):null),current_inferred:!!c.inferred,...a.casts[c.name],target_sql_type:sqlTypes[a.casts[c.name].target]||''}));
}
function typeChangeSummaryHTML(changes){
  if(!changes.length)return '';
  return '<section class="type-summary"><strong>변경할 컬럼과 목표 자료형</strong><div class="condition-list">'+changes.map(c=>'<div><span>'+esc(c.column)+'</span><strong>'+esc(columnTypeLabel(c.current_type))+(c.current_inferred?' (추정)':'')+' → '+esc(c.target_sql_type||c.target)+(c.format&&c.format!=='iso'?' · 입력 '+esc(c.format):'')+(c.target==='timestamptz'?' · '+esc(c.timezone||'UTC'):'')+(c.trim?' · 공백 제거':'')+(c.thousands?' · 쉼표 제거':'')+'</strong></div>').join('')+'</div><p class="analysis-hint">조회 결과만 변경합니다. DB 원본 컬럼과 데이터는 변경하지 않습니다.</p></section>';
}
function typeChangeRequest(changes=selectedTypeChanges()){
  const a=tableTypesUI;
  return a.source_ref+' 조회 결과에서 아래 컬럼의 자료형만 변경하는 SQL을 생성해 주세요. DB 원본은 변경하지 마세요.\n'+changes.map(c=>'- '+JSON.stringify(c.column)+': '+c.current_type+(c.current_inferred?' (샘플 추정)':'')+' → '+c.target_sql_type+'; 입력 형식='+c.format+'; 기준 시간대='+c.timezone+'; 공백 제거='+c.trim+'; 천 단위 쉼표 제거='+c.thousands).join('\n')+'\n변경하지 않는 컬럼과 기존 조회 조건·바인딩 값은 유지하고, 변환 불가능한 값은 임의로 버리거나 NULL로 바꾸지 말아 주세요.';
}
function tableTypesBody(){const a=tableTypesUI,changes=selectedTypeChanges(a);if(changes.some(c=>!c.target_sql_type))throw Error('목표 자료형을 다시 선택해 주세요.');return {workspace_id:a.workspace_id,table_id:a.table_id,source_version:a.source_version,expected_revision:a.revision,casts:Object.fromEntries(Object.entries(a.casts).filter(([n,r])=>r.target!=='original')),request_message:typeChangeRequest(changes)};}
function renderTableTypes(){
  const a=tableTypesUI;if(!a)return;const disabled=a.busy||a.statusUnknown?'disabled':'';
  $('types-title').textContent=a.source_ref+' · Column types';
  $('types-subtitle').textContent=a.title+' · '+a.columns.length+'개 컬럼';
  $('types-body').innerHTML='<p class="api-lead">변경한 자료형은 이 테이블과 이후 API 입력에 함께 적용됩니다.</p><input id="types-search" type="search" placeholder="컬럼 검색" aria-label="자료형 컬럼 검색" value="'+esc(a.search)+'"><div class="cast-list">'+a.columns.map((c,i)=>{const r=a.casts[c.name];return '<div class="cast-row" data-type-row="'+i+'" '+(!c.name.toLowerCase().includes(a.search.toLowerCase())?'hidden':'')+'><div class="cast-column"><strong>'+esc(c.name)+'</strong><small>'+esc(columnTypeLabel(c.type??c.oid))+(c.inferred?' · 샘플 추정':'')+'</small><span>'+esc((c.samples||[]).map(v=>String(v)).join(' / ')||'표시할 샘플 없음')+'</span></div><span class="cast-arrow">→</span><div class="cast-controls"><select data-table-cast="'+i+'" aria-label="'+esc(c.name)+' 변경 자료형" '+disabled+'>'+[['original','현재 자료형 유지'],['float64','숫자 · double precision'],['int64','정수 · bigint'],['string','문자열 · text'],['date','날짜 · date'],['timestamp','날짜·시간 · timestamp'],['timestamptz','시간대 포함 · timestamptz']].map(([v,label])=>'<option value="'+v+'" '+(r.target===v?'selected':'')+'>'+label+'</option>').join('')+'</select><div class="cast-options">'+(['float64','int64'].includes(r.target)?'<label><input type="checkbox" data-table-thousands="'+i+'" '+(r.thousands?'checked':'')+' '+disabled+'> 천 단위 쉼표 제거</label>':'')+(r.target==='date'?'<label>입력 형식 <select data-table-format="'+i+'" '+disabled+'><option value="iso" '+(r.format!=='yyyymmdd'?'selected':'')+'>YYYY-MM-DD</option><option value="yyyymmdd" '+(r.format==='yyyymmdd'?'selected':'')+'>YYYYMMDD</option></select></label>':'')+(['timestamp','timestamptz'].includes(r.target)?'<label>입력 형식 <select data-table-format="'+i+'" '+disabled+'>'+[['iso','ISO 날짜·시간'],['epoch_s','Unix epoch · 초'],['epoch_ms','Unix epoch · 밀리초']].map(([v,l])=>'<option value="'+v+'" '+(r.format===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>':'')+(r.target==='timestamptz'?'<label>시간대 없는 입력의 기준 <input data-table-timezone="'+i+'" aria-label="'+esc(c.name)+' 입력 시간대" value="'+esc(r.timezone||'UTC')+'" placeholder="UTC 또는 +09:00" '+disabled+'></label>':'')+(r.target!=='original'?'<label><input type="checkbox" data-table-trim="'+i+'" '+(r.trim?'checked':'')+' '+disabled+'> 앞뒤 공백 제거</label>':'')+'</div></div></div>';}).join('')+'</div>'+typeChangeSummaryHTML(selectedTypeChanges(a))+'<p class="analysis-hint">소수를 정수로 바꿀 때 소수 부분을 버리지 않습니다. N/A·단위 포함 값은 오류로 표시합니다. 날짜·시간은 ISO 또는 epoch의 초/밀리초 단위를 명시해 주세요. epoch는 UTC 기준입니다. 시간대가 있는 값은 시간대 포함을 선택하세요.</p>'+reportHTML(a.report,a.scope||'sample')+(a.error?'<p class="inline-error" role="alert">'+esc(a.error)+'</p>':'');
  for(const el of $('types-body').querySelectorAll('[data-table-cast]'))el.value=a.casts[a.columns[Number(el.dataset.tableCast)].name].target;
  renderTypeFooter();
}
function renderTypeFooter(){
 const a=tableTypesUI;if(!a)return;const changes=selectedTypeChanges(a),ready=changes.length&&a.report&&!a.report.failed_rows,r=a.typeRequest,active=r&&!terminalTypeRequest(r),elapsed=a.startedAt?Math.max(0,Math.floor((Date.now()-a.startedAt)/1000)):0;
 const stage=r?.stage||(a.action==='preview'?'preview':a.action==='apply'?'api_apply':'idle'),terminal=terminalTypeRequest(r),failed=terminal&&r.status!=='completed',timeout=String(r?.error?.code||'').includes('TIMEOUT'),status=a.statusUnknown?'unknown':r?.status||(a.busy?'running':a.error?'failed':'idle');
 const terminalLabels={completed:'변환 SQL 제안 준비 완료',failed:timeout?'SQL 생성 시간 초과':'SQL 생성 실패',cancelled:'SQL 생성 요청 중단됨',interrupted:'SQL 생성 요청 연결 중단'};
 const label=a.statusUnknown?'서버 상태 확인 필요':terminal?terminalLabels[r.status]:!a.busy&&a.error?(a.action==='preview'?'변환 확인 실패':'자료형 처리 상태 확인 필요'):r?(r.label||typeStages[r.stage]||'자료형 요청 상태 확인 중'):a.busy?(a.action==='preview'?'표에 표시된 행의 변환 가능 여부 확인 중':'저장된 분석 결과의 자료형을 적용하는 중'):(a.origin_type==='api'?'저장된 결과 전체에 적용':'SQL 생성과 검증 후, 대화창 Run으로 실행합니다');
 const limit=Number(r?.stage_timeout_seconds),error=!a.busy?String(a.error||r?.error?.message||''):'',retry=failed&&!a.statusUnknown&&a.origin_type!=='api';
 const detail=error?'<small class="type-progress-error" role="alert" title="'+esc(error)+'">'+esc(error.slice(0,220))+(error.length>220?'…':'')+'</small>':'';
 const guidance=a.statusUnknown?'<small>요청 상태 다시 확인 또는 요청 중단을 선택하세요. 자동 재실행하지 않습니다.</small>':retry?'<small>설정과 연결을 확인한 뒤 다시 SQL 생성으로 재시도할 수 있습니다. SQL은 실행되지 않았습니다.</small>':r&&a.busy?'<small>'+(Number.isFinite(limit)&&limit>0?'이 단계 제한 '+limit+'초 · ':'')+'닫으면 SQL 생성 요청을 중단합니다. 아직 SQL을 실행하지 않았습니다.</small>':'';
 $('types-footer').innerHTML='<div class="type-progress" role="status" data-type-stage="'+esc(r?.stage||stage)+'" data-type-status="'+esc(status)+'"><strong>'+esc(a.cancelPending?'중단을 요청하는 중':label)+(a.busy?' · '+elapsed+'초':'')+'</strong>'+detail+guidance+'</div><div class="api-actions">'+(a.statusUnknown?'<button class="secondary" data-type-action="status">요청 상태 다시 확인</button>':'')+(active||a.statusUnknown?'<button class="secondary" data-type-action="cancel" '+(a.cancelPending?'disabled':'')+'>'+(a.cancelPending?'중단 요청 중':'요청 중단')+'</button>':'')+'<button class="secondary" data-type-action="preview" '+(!changes.length||a.busy||a.statusUnknown?'disabled':'')+'>변환 확인</button><button class="primary" data-type-action="apply" '+(!ready||a.busy||a.statusUnknown?'disabled':'')+'>'+(a.origin_type==='api'?'테이블에 적용':retry?'다시 SQL 생성':'변환 SQL 생성')+'</button></div>';
}

function tickTypeRequest(a){if(tableTypesUI!==a)return;renderTypeFooter();const r=a.typeRequest,limit=Number(r?.stage_timeout_seconds);if(a.busy&&!a.cancelPending&&r&&!terminalTypeRequest(r)&&limit>0&&Date.now()-(a.stageStartedAt||a.startedAt)>(limit+15)*1000){a.error=(typeStages[r.stage]||'현재 단계')+'의 응답 제한을 넘겨 중단을 요청했습니다. 연결 상태를 확인한 후 다시 시도해 주세요.';cancelTypeRequest(a,true);}}
async function finishTypeReply(a,reply){
 if(tableTypesUI!==a)return;const previous=a.typeRequest?.stage;a.typeRequest=reply.request||a.typeRequest;if(previous!==a.typeRequest?.stage)a.stageStartedAt=Date.now();a.pollFailures=0;a.statusUnknown=false;
 if(a.cancelRequested&&!a.cancelPending&&!terminalTypeRequest(a.typeRequest)){await cancelTypeRequest(a);return;}
 const r=a.typeRequest;if(!terminalTypeRequest(r)){a.busy=true;renderTypeFooter();a.pollTimer=setTimeout(()=>pollTypeRequest(a),600);return;}
 clearTypeTimers(a);a.busy=false;a.cancelPending=false;
 if(r.status==='completed'&&a.cancelRequested){a.error='중단 요청 직전에 SQL 제안이 완료되었습니다. SQL을 실행하지 않았으며 테이블 자료형은 변경하지 않았습니다.';if($('types-dialog').open)renderTableTypes();return;}
 if(r.status==='completed'){
  if(reply.workspace){if(reply.workspace.id===model.current?.id)apply(reply.workspace);else model.cache.set(reply.workspace.id,reply.workspace);}
  if(reply.report){a.report=reply.report;a.scope=reply.scope;}
  $('types-dialog').close();render();bottom();toast(reply.applied?'자료형을 적용했어요.':'변환 SQL을 준비했어요. 대화창에서 SQL을 확인하고 Run으로 실행해 주세요.');
 }else{a.error=r.error?.message||(r.status==='cancelled'?'SQL 생성 요청을 중단했어요. 원본과 테이블 자료형은 변경하지 않았습니다.':'SQL 생성 요청이 중단되었습니다. 연결 상태를 확인한 후 다시 시도해 주세요.');if($('types-dialog').open)renderTableTypes();}
}
async function pollTypeRequest(a=tableTypesUI){if(!a?.typeRequest?.id||tableTypesUI!==a)return;clearTimeout(a.pollTimer);try{await finishTypeReply(a,await typesApi('/table/types/request/'+encodeURIComponent(a.typeRequest.id),undefined,null));}catch(e){if(tableTypesUI!==a)return;a.pollFailures=(a.pollFailures||0)+1;if(a.pollFailures<3&&a.busy){a.pollTimer=setTimeout(()=>pollTypeRequest(a),1000);return;}clearTypeTimers(a);a.busy=false;a.statusUnknown=true;a.error='요청 상태를 확인하지 못했습니다. '+e.message+' 자동 재실행하지 않습니다.';if($('types-dialog').open)renderTableTypes();}}
async function cancelTypeRequest(a=tableTypesUI,preserveError=false){if(!a?.typeRequest?.id||a.cancelPending||terminalTypeRequest(a.typeRequest))return;const previousError=a.error;a.cancelRequested=true;a.cancelPending=true;clearTimeout(a.pollTimer);renderTypeFooter();try{const reply=await typesApi('/table/types/cancel',{request_id:a.typeRequest.id},null);await finishTypeReply(a,reply);if(preserveError&&previousError)a.error=previousError;}catch(e){a.cancelPending=false;a.busy=false;a.statusUnknown=true;a.error='중단 여부를 확인하지 못했습니다. 요청 상태를 다시 확인해 주세요. '+e.message;clearTypeTimers(a);}finally{if(tableTypesUI===a&&$('types-dialog').open)renderTableTypes();}}
async function tableTypesAction(action){
 const a=tableTypesUI;if(!a)return;if(action==='cancel'){await cancelTypeRequest(a);return;}if(action==='status'){a.busy=true;a.error='';a.pollFailures=0;renderTableTypes();await pollTypeRequest(a);return;}if(a.busy||a.statusUnknown)return;
 a.busy=true;a.action=action;a.error='';a.startedAt=Date.now();a.stageStartedAt=a.startedAt;a.cancelRequested=false;a.cancelPending=false;a.pollFailures=0;a.typeRequest=null;renderTableTypes();
 if(action==='apply'&&a.origin_type!=='api'){
  const id=uuid().replace(/-/g,'');a.typeRequest={id,status:'running',stage:'starting',label:typeStages.starting,elapsed_seconds:0};a.tickTimer=setInterval(()=>tickTypeRequest(a),1000);renderTypeFooter();
  try{await finishTypeReply(a,await typesApi('/table/types/start',{...tableTypesBody(),request_id:id},a));}catch(e){a.busy=false;a.statusUnknown=!([400,401,403,404,409,422].includes(e.status));if(!a.statusUnknown)a.typeRequest={...a.typeRequest,status:'failed',error:{message:e.message}};a.error=a.statusUnknown?'SQL 생성 요청의 접수 상태를 확인하지 못했습니다. '+e.message+' 요청 상태 확인 또는 중단을 선택해 주세요.':e.message;clearTypeTimers(a);if(tableTypesUI===a&&$('types-dialog').open)renderTableTypes();}return;
 }
 try{const reply=await typesApi('/table/types/'+action,tableTypesBody(),a,30000);if(tableTypesUI!==a)return;if(action==='preview'){a.report=reply.report;a.scope=reply.scope;}else{if(reply.workspace.id===model.current?.id)apply(reply.workspace);else model.cache.set(reply.workspace.id,reply.workspace);if(analysisUI?.draft.source_ref===a.source_ref){analysisUI=null;clearTimeout(analysisPoll);}a.busy=false;$('types-dialog').close();render();bottom();toast(reply.applied?'자료형을 적용했어요. API 입력창을 열면 새 자료형이 표시됩니다.':'대화창에서 변경 SQL을 확인하고 실행해 주세요.');}}
 catch(e){a.error=e.code==='UI_REQUEST_TIMEOUT'&&action==='apply'?'응답 제한을 넘겼습니다. 적용 여부를 확인하려면 테이블을 다시 열어 주세요. 자동 재시도하지 않습니다.':e.message;}
 finally{a.busy=false;if(tableTypesUI===a&&$('types-dialog').open)renderTableTypes();}
}
function closeTableTypes(){const a=tableTypesUI;if(a?.typeRequest&&!terminalTypeRequest(a.typeRequest))cancelTypeRequest(a);else if(a?.busy&&a.action==='preview')a.transport?.abort();$('types-dialog').close();}

$('types-body').addEventListener('change',event=>{
  const el=event.target,a=tableTypesUI;if(!a||a.busy||a.statusUnknown)return;
  for(const [key,prop] of [['tableCast','target'],['tableThousands','thousands'],['tableTrim','trim'],['tableFormat','format'],['tableTimezone','timezone']])if(el.dataset[key]!==undefined){const r=a.casts[a.columns[Number(el.dataset[key])].name];r[prop]=['target','format','timezone'].includes(prop)?el.value:el.checked;if(prop==='target')r.format='iso';}
  a.report=null;a.error='';renderTableTypes();
});
$('types-body').addEventListener('input',event=>{if(event.target.id!=='types-search')return;tableTypesUI.search=event.target.value;for(const row of $('types-body').querySelectorAll('[data-type-row]'))row.hidden=!tableTypesUI.columns[Number(row.dataset.typeRow)].name.toLowerCase().includes(tableTypesUI.search.toLowerCase());});
$('types-close').addEventListener('click',closeTableTypes);
$('types-dialog').addEventListener('cancel',event=>{event.preventDefault();closeTableTypes();});
$('types-dialog').addEventListener('close',()=>{const a=tableTypesUI;if(a?.typeRequest&&!terminalTypeRequest(a.typeRequest)&&!a.cancelPending)cancelTypeRequest(a);});
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b||b.disabled)return;if(b.dataset.tableTypes!==undefined)openTableTypes(b.dataset.tableTypes||undefined);if(b.dataset.typeAction)tableTypesAction(b.dataset.typeAction);});

document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.matches('[data-question-option],[data-question-confirm],[data-question-clear]')){questionAction(b);return;}
  if(b.dataset.deleteWorkspace){openDeleteWorkspace(b.dataset.deleteWorkspace);return;}
  if(b.dataset.workspace){switchWorkspace(b.dataset.workspace);return;}
  if(b.dataset.expand){expandWorkspace(b.dataset.expand);return;}
  if(b.dataset.openGraph){b.closest('dialog')?.close();openGraph(b.dataset.openGraph);return;}
  if(b.dataset.graphsToggle){const id=b.dataset.graphsToggle;if(model.graphCollapsed.has(id))model.graphCollapsed.delete(id);else model.graphCollapsed.add(id);renderNav();return;}
  if(b.dataset.currentTableGraphs!==undefined){const ref=model.peekTable?(model.peekTable.workspace.id+'.'+model.peekTable.table.id):currentGraph()?.source_ref||model.graphForm?.source_ref||(currentTable()?model.current.id+'.'+currentTable().id:'');if(ref)showTableGraphs(ref).catch(e=>toast(e.message));else toast('먼저 테이블을 선택해 주세요.');return;}
  if(b.dataset.tableGraphs){showTableGraphs(b.dataset.tableGraphs).catch(e=>toast(e.message));return;}
  if(b.dataset.graphNew!==undefined){newTableGraph(b.dataset.graphNew).catch(e=>toast(e.message));return;}
  if(b.dataset.graphIndexRetry){loadTableGraphIndex(b.dataset.graphIndexRetry,true);return;}
  if(b.dataset.orphanGraphs!==undefined){showOrphanGraphs();return;}
  if(b.dataset.peekTab){if(model.peekTable){model.peekTable.tab=b.dataset.peekTab;renderPanel();}return;}
  if(b.dataset.graphEdit!==undefined){const g=currentGraph();openGraphSetup({source_ref:g.source_ref,graph_id:g.id,spec:g.spec}).catch(e=>toast(e.message));return;}
  if(b.dataset.graphFormClose!==undefined){model.graphForm=null;model.tab='table';renderPanel();return;}
  if(b.dataset.history!==undefined){loadHistory();return;}
  if(b.dataset.restoreHistory){restoreHistory(b.dataset.restoreHistory);return;}
  if(b.dataset.openTable){openTable(b.dataset.openTable);return;}
  if(b.dataset.rename){openRename(b.dataset.rename);return;}
  if(b.dataset.delete){openDelete(b.dataset.delete);return;}
  if(b.dataset.module){chooseModule(b.dataset.module);return;}
  if(b.dataset.unpin!==undefined){unpin();return;}
  if(b.dataset.tab){model.tab=b.dataset.tab;renderPanel();return;}
  if(b.dataset.execute){executeProposal(b.dataset.execute);return;}
  if(b.dataset.retryEmpty!==undefined){$('input').value='방금 0행이 나온 조회의 조건을 수정해서 다시 추출해줘. 변경할 조건: ';$('input').focus();updateComposer();return;}
  if(b.dataset.retryType!==undefined){$('input').value='방금 SQL의 자료형 오류를 확인해서 명시적 변환 SQL을 새로 제안해줘. 바꾸려는 컬럼과 목표 자료형: ';$('input').focus();updateComposer();return;}
  if(b.dataset.copyProposal){const p=model.current?.pending_proposal;if(p?.id===b.dataset.copyProposal)copyText(p.physical_sql||p.sql);return;}
  if(b.dataset.copySql!==undefined){if(currentTable()?.sql)copyText(currentTable().sql);return;}
  if(b.dataset.export!==undefined){exportTable();return;}
  if(b.dataset.prompt){$('input').value=b.dataset.prompt;$('input').focus();updateComposer();return;}
  if(b.dataset.cancel!==undefined){cancelQuery();return;}
  if(b.dataset.jobRefresh!==undefined){recoverJobs();return;}
  if(b.dataset.boot!==undefined){boot();return;}
  if(b.dataset.cacheRefresh!==undefined){refreshCacheStatus();return;}
  if(b.dataset.catalogTable){cataloguePrompt(b.dataset.catalogTable);return;}
});


$('form').addEventListener('submit',e=>{e.preventDefault();if(canSend())ask($('input').value);});
$('input').addEventListener('input',updateComposer);
$('input').addEventListener('blur',()=>{model.composing=false;updateComposer();});
$('send').addEventListener('pointerdown',()=>{model.composing=false;updateComposer();});
$('input').addEventListener('compositionstart',()=>{model.composing=true;updateComposer();});
$('input').addEventListener('compositionend',()=>{model.composing=false;updateComposer();});
$('input').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!model.composing&&e.keyCode!==229){e.preventDefault();if(canSend())ask($('input').value);}
});
$('tool-toggle').addEventListener('click',()=>{
  model.toolOpen=!model.toolOpen;renderTools();if(model.toolOpen)$('tool-search').focus();
});
$('tool-search').addEventListener('input',renderTools);
$('tool-search').addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();const first=$('tool-list').querySelector('.tool-row[data-module]:not(:disabled)');
    if(first)chooseModule(first.dataset.module);}
});
document.addEventListener('pointerdown',e=>{
  if(model.toolOpen&&!e.target.closest('#tool-popover,#tool-toggle')){
    model.toolOpen=false;renderTools();
  }
});
let catalogSequence=0;
$('catalog-search').addEventListener('input',()=>{
  const q=$('catalog-search').value,seq=++catalogSequence;
  renderCatalog();
  setTimeout(async()=>{
    if(seq!==catalogSequence||!$('catalog-dialog').open)return;
    try{const result=await api('/catalogue?search='+encodeURIComponent(q));
      if(seq!==catalogSequence)return;model.catalogue=result;renderCatalog();}
    catch(e){if(seq===catalogSequence)$('catalog-body').innerHTML='<div class="inline-error">'+esc(e.message)+'</div>';}
  },220);
});
$('schema-choices').addEventListener('change',e=>{
  const name=e.target.dataset.schema;if(!name)return;
  if(e.target.checked)model.schemaDraft.add(name);else model.schemaDraft.delete(name);
  renderCatalog();
});
$('catalog-open').addEventListener('click',openCatalog);
$('catalog-close').addEventListener('click',()=>$('catalog-dialog').close());
$('schema-save').addEventListener('click',saveSchemas);
$('rename-form').addEventListener('submit',e=>{e.preventDefault();confirmRename();});
$('delete-confirm').addEventListener('click',confirmDelete);
$('delete-dialog').addEventListener('close',()=>$('delete-warning').textContent='');
$('new-workspace').addEventListener('click',newWorkspace);
$('reconnect').addEventListener('click',boot);
$('show-result').addEventListener('click',showResult);
$('show-chat').addEventListener('click',()=>$('app').classList.remove('mobile-open','full-result'));
$('panel-expand').addEventListener('click',()=>$('app').classList.toggle('full-result'));
const divider=$('chat-divider');
function setSplit(value,persist=true) {
  model.split=Math.max(.25,Math.min(.75,value));
  const app=$('app'),side=document.querySelector('aside').getBoundingClientRect().width;
  const width=app.clientWidth-side-10;
  app.style.setProperty('--chat-width',Math.max(280,Math.min(width-280,width*model.split))+'px');
  divider.setAttribute('aria-valuenow',String(Math.round(model.split*100)));
  if(persist)try{localStorage.setItem('datatalk.v2.chat.width',String(model.split));}catch{}
}
divider.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;event.preventDefault();divider.setPointerCapture(event.pointerId);
  document.body.classList.add('resizing');
  const move=e=>{const app=$('app'),side=document.querySelector('aside').getBoundingClientRect().width;
    setSplit((e.clientX-app.getBoundingClientRect().left-side)/(app.clientWidth-side-10));};
  const done=()=>{document.body.classList.remove('resizing');divider.removeEventListener('pointermove',move);
    for(const name of ['pointerup','pointercancel','lostpointercapture'])divider.removeEventListener(name,done);};
  divider.addEventListener('pointermove',move);
  for(const name of ['pointerup','pointercancel','lostpointercapture'])divider.addEventListener(name,done);
});
divider.addEventListener('keydown',e=>{
  if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){
    e.preventDefault();setSplit(e.key==='Home'?.5:model.split+(e.key==='ArrowLeft'?-.03:.03));
  }
});
divider.addEventListener('dblclick',()=>setSplit(.5));
window.addEventListener('resize',()=>setSplit(model.split,false));
setSplit(model.split,false);

function safeSourceLabel(ref,t={}){
  const raw=String(ref||'');
  const known=(t.source_labels||[]);
  const label=Array.isArray(known)?known.find(x=>typeof x==='object'&&(x.id===raw||x.source_id===raw||x.ref===raw)):null;
  if(label?.label||label?.name)return String(label.label||label.name).replace(/pg:[A-Za-z0-9_-]+/g,'DB source');
  if(known&&typeof known==='object'&&!Array.isArray(known)&&known[raw])return String(known[raw]).replace(/pg:[A-Za-z0-9_-]+/g,'DB source');
  if(!raw.startsWith('pg:'))return raw||'DB source';
  try{
    const encoded=raw.slice(3);if(encoded.length>4096||!/^[A-Za-z0-9_-]+$/.test(encoded))return 'DB source';
    const bytes=Uint8Array.from(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4)),x=>x.charCodeAt(0));
    const parts=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!Array.isArray(parts)||parts.length<2||parts.some(x=>typeof x!=='string'||x.length>200||/[\x00-\x1f]/.test(x)))return 'DB source';
    // Identifiers came from an already authorized table; expose no opaque transport ID.
    return parts.slice(-2).filter(Boolean).join('.').replace(/pg:[A-Za-z0-9_-]+/g,'DB source')||'DB source';
  }catch{return 'DB source';}
}
function friendlySourceText(value,t={}){return String(value||'').replace(/pg:[A-Za-z0-9_-]+/g,ref=>safeSourceLabel(ref,t));}
function displayRef(ref,wid){return String(ref).startsWith(wid+'.')?String(ref).slice(wid.length+1):String(ref);}
function lineageHTML(t,ws){
  const refs=[...new Set([...(t.source_refs||[]),...(t.source_ref?[t.source_ref]:[]),...(t.analysis?.source_ref?[t.analysis.source_ref]:[])])].filter(x=>/^w\d+\.t\d+$/.test(x));
  if(!refs.length){const sources=[...new Set((t.source_ids||[]).map(x=>safeSourceLabel(x,t)))];return sources.length?'<div class="dtv-lineage"><strong>'+esc(t.id)+'</strong><span>←</span><span>'+sources.map(esc).join(', ')+'</span><small>DB 원본 · 추출 조건은 SQL에서 확인해 주세요.</small></div>':'';}
  const snapshots=t.source_snapshots||[];
  const raw=t.join_expression_full||t.join_expression||'';
  const symbolic=/^[\sw\dt.@()]+$/.test(raw)&&raw.includes('@')?raw:refs.join('@');
  const expression=symbolic.replace(/w\d+\.t\d+/g,ref=>displayRef(ref,ws.id));
  return '<div class="dtv-lineage"><strong>'+esc(t.id)+(t.version>1?' v'+esc(t.version):'')+'</strong><span>←</span><strong>'+esc(expression)+'</strong><div class="lineage-sources">'+refs.map(ref=>{const snap=snapshots.find(x=>x.ref===ref||(x.workspace_id+'.'+x.table_id)===ref);return '<button data-open-table="'+esc(ref)+'" title="원본 현재 결과 보기">'+esc(displayRef(ref,ws.id))+(snap?' v'+esc(snap.version):'')+' ↗</button>';}).join('')+'</div><small>'+esc(friendlySourceText(t.transformation?.description||'원본 관계',t))+' · 원본을 열면 현재 버전이 표시됩니다.</small></div>';
}
function cacheBudgetHTML(){const c=model.cacheStatus;if(!c)return '<small>서버 디스크 캐시 사용량 확인 중…</small>';const bytes=v=>{const n=Math.max(0,Number(v)||0),units=['B','KiB','MiB','GiB','TiB'],i=n?Math.min(4,Math.floor(Math.log(n)/Math.log(1024))):0;return (n/1024**i).toLocaleString('en-US',{maximumFractionDigits:i?2:0})+' '+units[i];},gib=v=>(Number(v||0)/1073741824).toLocaleString('en-US',{maximumFractionDigits:2});return '<small class="cache-budget" data-cache-budget="server" title="사용 '+esc(Number(c.used_bytes||0).toLocaleString())+' bytes / 한도 '+esc(Number(c.max_bytes||0).toLocaleString())+' bytes">서버 디스크 캐시 '+esc(bytes(c.used_bytes))+' / '+esc(gib(c.max_bytes))+' GiB · 서버 전체 공유 예산'+(model.cacheStatusError||!model.cacheStatusAt||Date.now()-model.cacheStatusAt>15000?' · 마지막 확인값':'')+(c.enabled===false?' · 비활성':'')+(c.reserved_bytes?' · 준비 중 예약 '+esc(bytes(c.reserved_bytes)):'')+(c.over_budget_bytes?' · 사용 중 원본 보호로 '+esc(bytes(c.over_budget_bytes))+' 일시 초과':'')+'</small>';}

function cacheCanonicalRef(t,ref){return t.canonical_ref||ref||((model.current?.id||'')+'.'+t.id);}
function tableCacheState(t,ref){
 const c=model.cacheStatus,fresh=!!c&&!model.cacheStatusError&&model.cacheStatusAt>0&&Date.now()-model.cacheStatusAt<=15000;
 if(t.origin_type==='api')return {state:'saved',label:'API 결과 저장됨',detail:'API가 반환한 전체 결과를 테이블에 저장했습니다. DB 원본 캐시와 구분됩니다.'};
 if(!fresh)return {state:'unknown',label:'상태 확인 필요',detail:model.cacheStatusError?'캐시 상태 조회에 실패했습니다. 저장 여부를 확인하려면 상태를 다시 확인해 주세요.':'최신 캐시 상태를 확인하고 있습니다. 아직 저장 여부를 단정할 수 없습니다.'};
 if(c.enabled===false)return {state:'disabled',label:'캐시 사용 중지',detail:'서버의 디스크 캐시가 비활성화되어 있습니다. 전체 원본을 읽어 그래프를 계산할 수 있지만 새 캐시를 저장하지 않습니다.'};
 const canonical=cacheCanonicalRef(t,ref),version=t.version;
 if(version===undefined||version===null)return {state:'unknown',label:'상태 확인 필요',detail:'현재 테이블 버전을 확인할 수 없어 캐시 저장 여부를 판정하지 않았습니다.'};
 const matches=(Array.isArray(c.entries)?c.entries:[]).filter(e=>e.source_ref===canonical&&String(e.source_version)===String(version));
 const complete=matches.find(e=>e.state==='complete'),filling=matches.find(e=>e.state==='filling');
 if(complete)return {state:'complete',label:'전체 캐시 있음',entry:complete,detail:'현재 버전의 전체 원본이 서버 디스크에 저장되어 있습니다. 재사용 시 접근 권한과 원본 조건을 다시 확인합니다.'+(filling?' 추가 원본도 저장 중입니다.':'')};
 if(filling)return {state:'filling',label:'전체 원본 저장 중',entry:filling,detail:'DB에서 전체 원본을 읽어 서버 디스크에 저장하는 중입니다. 그래프 계산과는 별도 단계입니다.'};
 if(c.entries_complete!==true||!Array.isArray(c.entries))return {state:'unknown',label:'상태 확인 필요',detail:'캐시 목록이 일부만 제공되어 이 테이블의 저장 여부를 확인할 수 없습니다.'};
 const outcome=model.cacheOutcomes.get(JSON.stringify([canonical,String(version)]));
 return {state:'absent',label:'캐시 없음',detail:'현재 버전의 전체 원본 캐시가 없습니다. Graph를 열면 전체 원본을 읽어 계산하고, 캐시 예산이 허용하면 저장합니다.',note:outcome?.note||'',failed:outcome?.failed===true};
}
function cacheBadgeHTML(t,ref){const canonical=cacheCanonicalRef(t,ref),c=tableCacheState(t,canonical);return '<span class="cache-badge" data-cache-badge data-cache-ref="'+esc(canonical)+'" data-cache-version="'+esc(t.version??'')+'" data-cache-state="'+c.state+'" title="'+esc(c.detail)+'">'+esc(c.label)+'</span>';}
function cacheInfoContents(t,ref){
 const c=tableCacheState(t,ref),entry=c.entry;
 const rows=c.state==='complete'?' · '+Number(entry.row_count||0).toLocaleString()+'행':c.state==='saved'?' · '+Number(t.row_count??t.rows?.length??0).toLocaleString()+'행':'';
 return '<div class="cache-info-heading"><strong>'+cacheBadgeHTML(t,ref)+esc(rows)+'</strong><button type="button" data-cache-refresh title="캐시 메타데이터만 확인합니다. DB 원본을 조회하거나 저장하지 않습니다.">상태 새로고침</button></div><span>'+esc(c.detail)+'</span>'+(c.note?'<span class="cache-attempt-note" data-cache-attempt="'+(c.failed?'failed':'bypass')+'"'+(c.failed?' role="alert"':'')+'>'+esc(c.note)+'</span>':'')+'<small class="cache-policy">'+(c.state==='saved'?'API 결과: 반환된 전체 결과를 테이블에 저장 · DB 원본 캐시와 별도':'테이블 조회: 미리보기 · 첫 Graph/분석 API 실행: 전체 원본 저장 시도 · 전체 읽기가 끝나면 저장 완료')+'</small>'+(entry?.cached_at?'<small>캐시 저장: '+esc(dateLabel(entry.cached_at))+' · 원본 추출: '+esc(dateLabel(entry.source_extracted_at))+'</small>':'')+'<small>아래 표: 표시용 '+esc(Number(t.rows?.length||0).toLocaleString())+'행'+(model.cacheStatusAt?' · 상태 확인: '+esc(new Date(model.cacheStatusAt).toLocaleTimeString('ko-KR',{hour12:false})): '')+'</small>'+cacheBudgetHTML();
}
function cacheInfoHTML(t,ref){const canonical=cacheCanonicalRef(t,ref),c=tableCacheState(t,canonical);return '<div class="cache-info" data-cache-info-ref="'+esc(canonical)+'" data-cache-state="'+c.state+'">'+cacheInfoContents(t,canonical)+'</div>';}
function cachedTableByRef(ref){
 const peek=model.peekTable;if(peek&&cacheCanonicalRef(peek.table,peek.workspace.id+'.'+peek.table.id)===ref)return peek.table;
 const workspaces=[model.current,...model.cache.values()].filter(Boolean);
 for(const ws of workspaces){const t=(ws.tables||[]).find(t=>cacheCanonicalRef(t,ws.id+'.'+t.id)===ref);if(t)return t;}
 return null;
}
function updateCacheStatusDOM(){
 // Only status elements change: preserve the table, graph, axis editor and selection DOM.
 document.querySelectorAll('[data-cache-info-ref]').forEach(node=>{const t=cachedTableByRef(node.dataset.cacheInfoRef);if(!t)return;node.dataset.cacheState=tableCacheState(t,node.dataset.cacheInfoRef).state;node.innerHTML=cacheInfoContents(t,node.dataset.cacheInfoRef);});
 document.querySelectorAll('[data-cache-badge]').forEach(node=>{const t=cachedTableByRef(node.dataset.cacheRef);if(!t)return;const c=tableCacheState(t,node.dataset.cacheRef);node.dataset.cacheState=c.state;node.dataset.cacheVersion=t.version??'';node.textContent=c.label;node.title=c.detail;});
}
function stopCachePolling(reset=false){
 clearTimeout(model.cachePollTimer);model.cachePollTimer=null;model.cacheRequestSerial++;model.cacheRequest?.controller.abort();model.cacheRequest=null;model.cacheRefreshQueued=false;
 if(reset){model.cacheStatus=null;model.cacheStatusAt=0;model.cacheStatusError=false;model.cacheOutcomes.clear();}
}
function scheduleCacheStatus(){clearTimeout(model.cachePollTimer);model.cachePollTimer=null;if(model.ready&&!document.hidden)model.cachePollTimer=setTimeout(refreshCacheStatus,5000);}
async function refreshCacheStatus(){
 if(!model.ready||document.hidden)return;
 if(model.cacheRequest){model.cacheRefreshQueued=true;return model.cacheRequest.promise;}
 clearTimeout(model.cachePollTimer);model.cachePollTimer=null;
 const generation=model.generation,serial=++model.cacheRequestSerial,controller=new AbortController();
 const request={controller,promise:null};model.cacheRequest=request;
 const timeout=setTimeout(()=>controller.abort(),8000);
 request.promise=(async()=>{
  try{const status=await api('/cache',undefined,{signal:controller.signal});if(generation!==model.generation||serial!==model.cacheRequestSerial||!model.ready)return;model.cacheStatus=status;model.cacheStatusAt=Date.now();model.cacheStatusError=false;updateCacheStatusDOM();}
  catch(e){if(generation!==model.generation||serial!==model.cacheRequestSerial||!model.ready)return;model.cacheStatusError=true;updateCacheStatusDOM();}
  finally{clearTimeout(timeout);if(model.cacheRequest===request){model.cacheRequest=null;const queued=model.cacheRefreshQueued;model.cacheRefreshQueued=false;if(queued&&model.ready&&!document.hidden)refreshCacheStatus();else scheduleCacheStatus();}}
 })();return request.promise;
}
function recordGraphDataOutcome(outcome){
 if(!outcome?.source_ref||outcome.source_version===undefined)return;
 const key=JSON.stringify([outcome.source_ref,String(outcome.source_version)]),error=outcome.error,provenance=outcome.provenance;
 if(error){
  const sourceErrors=['ANALYSIS_STREAM_NOT_CONNECTED','ANALYSIS_STREAM_INVALID','ANALYSIS_BATCH_INVALID','ANALYSIS_STREAM_TYPE_MISMATCH','ANALYSIS_STREAM_VALUE_INVALID','ANALYSIS_STREAM_METADATA_INVALID','ANALYSIS_STREAM_METADATA_MISMATCH','ANALYSIS_STREAM_METADATA_MISSING','ANALYSIS_DECIMAL_SCHEMA_REQUIRED','ANALYSIS_DECIMAL_SCHEMA_INVALID','ANALYSIS_TIME_ENCODING_INVALID','ANALYSIS_SCHEMA_MISMATCH','ANALYSIS_SCHEMA_CHANGED','RESULT_COLUMN_METADATA_INVALID','RESULT_COLUMN_METADATA_CONFLICT','CACHE_QUERY_MISMATCH','CACHE_SCHEMA_MISMATCH','CACHE_INCOMPLETE','CACHE_WAIT_TIMEOUT'];
  if(sourceErrors.includes(error.code))model.cacheOutcomes.set(key,{failed:true,note:'저장 안 됨 · 전체 원본 확보 실패: '+String(error.message||error.code)+'. 원인을 해결한 뒤 Graph에서 다시 계산해 주세요.'});
  refreshCacheStatus();
 }else if(provenance?.cache==='bypass'){
  const reason=provenance.reason==='disabled'?'서버 캐시 사용 중지':provenance.reason==='empty_result'?'전체 조회 결과가 0행':'캐시 예산 또는 사용 중인 원본 보호';
  model.cacheOutcomes.set(key,{failed:false,note:'마지막 전체 조회는 '+reason+'로 캐시를 보관하지 않았습니다. 그래프는 전체 원본으로 계산했습니다.'});
 }else if(provenance)model.cacheOutcomes.delete(key);
 while(model.cacheOutcomes.size>100)model.cacheOutcomes.delete(model.cacheOutcomes.keys().next().value);
 updateCacheStatusDOM();
}
function acceptCacheBudgetStatus(status){
 // Render responses carry budgets but omit entries. They must never erase or refresh the metadata snapshot.
 if(status&&typeof status==='object'){const {entries,entries_total,entries_complete,...budget}=status;model.cacheStatus={...(model.cacheStatus||{}),...budget};}
 updateCacheStatusDOM();refreshCacheStatus();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCachePolling();else{updateCacheStatusDOM();refreshCacheStatus();}});
window.addEventListener('pagehide',()=>stopCachePolling());

function renderPeekTable(){
  const {workspace:ws,table:t}=model.peekTable,ref=ws.id+'.'+t.id;
  $('panel-title').textContent='Preview · '+ref;$('panel-sub').textContent=t.title;
  $('panel-content').innerHTML='<section class="foreign-preview"><strong>현재 대화는 '+esc(model.current.id)+' · 열어 본 테이블은 '+esc(ref)+'</strong><p>이 테이블을 현재 대화에서 사용할 때는 '+esc(ref)+'처럼 작업공간을 함께 지정해 주세요.</p><div><button data-peek-use>Use in current chat</button><button data-workspace="'+esc(ws.id)+'">Switch to '+esc(ws.id)+'</button><button data-peek-close>Close preview</button></div></section>'+lineageHTML(t,ws)+cacheInfoHTML(t,ref)+'<section class="result"><div class="result-head"><strong>'+esc(t.title)+'</strong><span>'+esc(t.rows?.length||0)+' rows shown</span></div>'+'<div class="tabs"><button class="tab '+(model.peekTable.tab!=='graph'?'active':'')+'" data-peek-tab="table">Table</button><button class="tab '+(model.peekTable.tab==='graph'?'active':'')+'" data-table-graphs="'+esc(ref)+'">Graph</button></div>'+(model.peekTable.tab==='graph'?(loadTableGraphIndex(ref),graphCollectionHTML(ref)):tableHTML(t))+'</section><p class="pane-note">추출: '+esc(dateLabel(t.extracted_at||t.updated_at||t.created_at))+'</p>';
}
function defaultGraphSpec(t){return window.DataTalkVisuals.defaultSpec(t);}

const connectionStates={ready:'Connected',auth_missing:'Token missing',auth_rejected:'Authentication failed',offline:'API offline',worker_offline:'Worker offline',storage_unavailable:'Storage unavailable',manifest_mismatch:'Version mismatch',health_unknown:'Not verified',config_invalid:'Configuration invalid'};
function moduleConnection(module){return model.apiConnectivity?.modules?.find(x=>x.id===module.id&&x.version===module.version);}
function renderTools(){
  $('tool-popover').hidden=!model.toolOpen;if(!model.toolOpen)return;
  const q=($('tool-search').value||'').trim().toLowerCase(),found=model.modules.filter(x=>[x.name,x.id,x.command,x.owner,x.description].join(' ').toLowerCase().includes(q));
  $('tool-list').innerHTML=found.length?found.map(x=>{const c=moduleConnection(x),available=x.available&&(!c||c.ready||c.status==='health_unknown');return '<div class="tool-entry"><button type="button" class="tool-row" '+(available?'data-module="'+esc(x.id+'@'+x.version)+'"':'data-api-connections')+'><span class="tool-mark">◇</span><span><strong>'+esc(x.name)+'</strong><small>'+esc(x.description)+'</small><small>'+esc(x.owner||'')+' · v'+esc(x.version)+'</small><span class="connection-badge '+(c?.ready?'ready':'')+'">'+esc(c?connectionStates[c.status]||'Not verified':x.available?'Registered · Not verified':'Configuration required')+'</span></span></button></div>';}).join(''):'<p class="list-empty">'+(q?'검색 결과가 없어요.':'등록된 분석 API가 없습니다. Connection status에서 설정 안내를 확인해 주세요.')+'</p>';
}
async function checkApiConnections(){
  if(model.checkingApi)return;model.checkingApi=true;renderApiConnections();
  try{model.apiConnectivity=await api('/analysis/connectivity');model.apiConnectionError='';model.modules=(await api('/modules')).modules||model.modules;}
  catch(e){model.apiConnectionError=e.message;}
  finally{model.checkingApi=false;renderApiConnections();renderTools();}
}
function renderApiConnections(){
  const d=model.apiConnectivity,el=$('api-connections-body');
  $('api-connections-dialog').querySelector('[data-api-recheck]').disabled=!!model.checkingApi;
  $('api-connections-checked').textContent=model.checkingApi?'연결을 확인하고 있어요…':d?.checked_at?'확인: '+dateLabel(d.checked_at):'Recheck로 연결을 확인해 주세요.';
  const guidance='<section class="connection-guide"><strong>사내 운영자 연결 순서</strong><ol><li>전달된 Python에서 <code>--setup-anova --work-dir &lt;app&gt;</code>를 실행해 API 모듈과 설정을 만듭니다.</li><li>생성된 안내에 따라 API 서버와 분석 작업자를 모두 시작합니다.</li><li>DataTalk을 재시작하고 Recheck를 누릅니다.</li></ol><p>주소·토큰·공유 데이터 경로는 서버 설정에서 관리합니다. 브라우저에 토큰을 붙여넣지 않습니다.</p></section>';
  el.innerHTML=(model.apiConnectionError?'<p class="inline-error" role="alert">'+esc(model.apiConnectionError)+'</p>':'')+(d?'<p class="api-lead">Registered '+esc(d.registered_count)+' · Connected '+esc(d.ready_count)+'<br>'+esc(d.registration?.message||'등록과 실제 연결 상태는 다를 수 있습니다.')+'</p>'+d.modules.map(m=>'<section class="connection-module"><strong>'+esc(m.name)+' <small>v'+esc(m.version)+'</small></strong><span class="connection-badge '+(m.ready?'ready':'')+'">'+esc(connectionStates[m.status]||m.status)+'</span><p>'+esc(m.message||'')+'</p><div class="condition-list">'+Object.entries(m.checks||{}).map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+esc(v)+'</strong></div>').join('')+'</div>'+((m.active_workers??null)!==null?'<p>Active workers: '+esc(m.active_workers)+'</p>':'')+'</section>').join(''):model.checkingApi?'<p role="status">API·인증·작업자를 확인하고 있어요.</p>':'')+guidance;
}
async function openApiConnections(){model.toolOpen=false;renderTools();if(!$('api-connections-dialog').open)$('api-connections-dialog').showModal();await checkApiConnections();}
function boardStorageKey(){return 'datatalk.v2.5.graph-board:'+location.pathname+':'+model.current.id;}
function boardLayout(){let saved={};try{saved=JSON.parse(localStorage.getItem(boardStorageKey())||'{}');}catch{}return saved&&typeof saved==='object'?saved:{};}
function saveBoardLayout(){const cards=[...$('panel-content').querySelectorAll('.board-card')],saved={};for(const el of cards)saved[el.dataset.graphId]={x:parseFloat(el.style.left)||0,y:parseFloat(el.style.top)||0,width:el.offsetWidth,height:el.offsetHeight};try{localStorage.setItem(boardStorageKey(),JSON.stringify(saved));}catch{} }
function updateBoardExtent(){const stage=$('graph-board-stage');if(!stage)return;const cards=[...stage.querySelectorAll('.board-card')];stage.style.height=Math.max(500,...cards.map(c=>c.offsetTop+c.offsetHeight+30))+'px';stage.style.minWidth=Math.max(450,...cards.map(c=>c.offsetLeft+c.offsetWidth+30))+'px';}
function renderGraphBoard(){
  const ws=model.current,graphs=ws?.graphs||[],layout=boardLayout();$('panel-title').textContent=(ws?.id||'')+' · Graph board';$('panel-sub').textContent='각 차트의 원본 테이블과 배치를 독립적으로 관리합니다.';
  $('panel-content').innerHTML='<div class="board-toolbar"><span>제목 손잡이로 이동 · 오른쪽 아래로 크기 조절 · Open으로 축과 옵션 수정</span><button data-board-reset>Reset layout</button></div>'+(graphs.length?'<div class="board-scroll"><div id="graph-board-stage">'+graphs.map((g,i)=>{const z=layout[g.id]||{},n=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):fallback));const width=n(z.width,560,340,2000),height=n(z.height,410,260,1600),x=n(z.x,0,0,8000),y=n(z.y,i*430,0,20000);return '<section class="board-card" data-graph-id="'+esc(g.id)+'" style="left:'+x+'px;top:'+y+'px;width:'+width+'px;height:'+height+'px"><header><button class="board-move" data-board-move tabindex="0" aria-label="'+esc(g.id)+' 이동: 드래그 또는 방향키">⠿</button><strong>'+esc(g.id)+' · '+esc(g.title)+'</strong><button data-open-graph="'+esc(ws.id+'.'+g.id)+'">Open ↗</button></header><p class="board-source">Source '+esc(g.source_ref)+' · '+esc(g.spec?.chart_type||g.chart?.type||'')+(g.stale?' · 원본 변경됨 · Open에서 갱신':'')+'</p><div class="board-preview" aria-label="'+esc(g.title)+' 미리보기">'+(g.chart?(window.DataTalkVisuals.previewHTML?window.DataTalkVisuals.previewHTML(g):window.DataTalkVisuals.chartHTML(g.chart)):'<p>저장된 차트 데이터가 없습니다.</p>')+'</div><button class="board-resize" data-board-resize aria-label="'+esc(g.id)+' 크기 조절: 드래그 또는 방향키">◢</button></section>';}).join('')+'</div></div>':'<div class="empty-panel"><h2>저장된 그래프가 없어요</h2><p>테이블의 Graph에서 그래프를 만들면 여기에 함께 표시됩니다.</p></div>')+'<p class="pane-note">배치는 이 브라우저에 저장됩니다. 그래프 데이터와 설정은 각 g 번호에 저장됩니다.</p>';
  updateBoardExtent();
}
async function openGraphBoard(wid){if(!model.ready||model.busy)return;try{if(wid&&wid!==model.current.id)apply(await api('/workspace/'+encodeURIComponent(wid)));model.peekTable=null;model.graphForm=null;model.tab='board';renderPanel();showResult();}catch(e){toast(e.message);}}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.apiConnections!==undefined)openApiConnections();
  if(b.dataset.apiConnectionsClose!==undefined)$('api-connections-dialog').close();
  if(b.dataset.apiRecheck!==undefined)checkApiConnections();
  if(b.dataset.peekClose!==undefined){model.peekTable=null;render();}
  if(b.dataset.peekUse!==undefined&&model.peekTable){const ref=model.peekTable.workspace.id+'.'+model.peekTable.table.id;$('input').value=ref+'에서 ';$('input').focus();updateComposer();toast('현재 작업공간에서 이어서 요청해 주세요.');}
  if(b.dataset.graphBoard!==undefined)openGraphBoard(b.dataset.graphBoard);
  if(b.dataset.boardReset!==undefined){try{localStorage.removeItem(boardStorageKey());}catch{}renderGraphBoard();}
});
document.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-board-move],[data-board-resize]');if(!handle||event.button!==0)return;
  event.preventDefault();handle.setPointerCapture(event.pointerId);const card=handle.closest('.board-card'),resize=handle.hasAttribute('data-board-resize'),start={x:event.clientX,y:event.clientY,left:card.offsetLeft,top:card.offsetTop,width:card.offsetWidth,height:card.offsetHeight};
  const move=e=>{const dx=e.clientX-start.x,dy=e.clientY-start.y;if(resize){card.style.width=Math.max(340,Math.min(2000,start.width+dx))+'px';card.style.height=Math.max(260,Math.min(1600,start.height+dy))+'px';}else{card.style.left=Math.max(0,Math.min(8000,start.left+dx))+'px';card.style.top=Math.max(0,Math.min(20000,start.top+dy))+'px';}updateBoardExtent();};
  const done=()=>{saveBoardLayout();handle.removeEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,done);};
  handle.addEventListener('pointermove',move);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,done);
});
document.addEventListener('keydown',event=>{const handle=event.target.closest('[data-board-move],[data-board-resize]');if(!handle||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const card=handle.closest('.board-card'),resize=handle.hasAttribute('data-board-resize'),horizontal=['ArrowLeft','ArrowRight'].includes(event.key),sign=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1,step=event.shiftKey?40:10,key=resize?(horizontal?'width':'height'):(horizontal?'left':'top'),old=resize?(horizontal?card.offsetWidth:card.offsetHeight):(horizontal?card.offsetLeft:card.offsetTop),min=resize?(horizontal?340:260):0;card.style[key]=Math.max(min,old+sign*step)+'px';updateBoardExtent();saveBoardLayout();});

let workspaceDeleteTarget=null;
async function openDeleteWorkspace(wid){
  if(workspaceHasUnresolvedJob(wid)){toast('작업 상태를 확인하거나 DB 중단을 완료한 뒤 삭제해 주세요.');return;}
  if(model.busy){toast('진행 중인 작업을 완료하거나 종료한 뒤 삭제해 주세요.');return;}
  try{const ws=await api('/workspace/'+encodeURIComponent(wid));workspaceDeleteTarget=ws;
    $('workspace-delete-ref').textContent=wid+' · '+ws.name;
    $('workspace-delete-count').textContent='테이블 '+ws.tables.length+'개, 그래프 '+(ws.graphs||[]).length+'개와 대화 기록을 삭제합니다. 원본 DB 데이터는 유지됩니다.';
    $('workspace-delete-error').textContent='';$('workspace-delete-dialog').showModal();
  }catch(e){toast(e.message);}
}
async function confirmDeleteWorkspace(){
  const ws=workspaceDeleteTarget;if(!ws||model.busy)return;if(workspaceHasUnresolvedJob(ws.id)){toast('작업 종료를 확인한 뒤 삭제해 주세요.');return;}const btn=$('workspace-delete-confirm');btn.disabled=true;
  try{const reply=await api('/workspace/delete',{workspace_id:ws.id,expected_revision:ws.revision});
    questionSelections.delete(ws.id);model.cache.delete(ws.id);model.expanded.delete(ws.id);model.graphCollapsed.delete(ws.id);model.summary=reply.workspaces;
    if(model.current?.id===ws.id){clearTimeout(analysisPoll);clearTimeout(jobsPoll);analysisUI=null;model.current=null;model.graphForm=null;model.graphSetupSource=null;model.tab='table';try{sessionStorage.removeItem('datatalk.v2.active.workspace');}catch{}
      if(reply.active_workspace_id)apply(await api('/workspace/'+encodeURIComponent(reply.active_workspace_id)));
      else apply(await api('/workspaces',{name:'새로운 데이터 대화'}));
    }
    $('workspace-delete-dialog').close();toast(ws.id+'을 삭제했어요.');render();
  }catch(e){$('workspace-delete-error').textContent=e.message;}finally{btn.disabled=false;}
}
$('workspace-delete-confirm').addEventListener('click',confirmDeleteWorkspace);
// A bounded selection preview; the original SQL table and approved queries stay intact.
function clearLinkedSelection(){
  linkedSelectionSequence++;linkedSelection=null;
  if(linkedSelectionRequest){linkedSelectionRequest.controller.abort();api('/cancel',{query_id:linkedSelectionRequest.query_id}).catch(()=>{});linkedSelectionRequest=null;}
  $('dtv-linked-rows')?.remove();
}
function renderLinkedSelection(g=currentGraph()){
  if(!g)return;
  if(linkedSelection&&[g.canonical_ref,g.version,g.source_ref,g.source_version].join(':')!==[linkedSelection.graph_ref,linkedSelection.graph_version,linkedSelection.source_ref,linkedSelection.source_version].join(':'))clearLinkedSelection();
  let root=$('dtv-linked-rows');if(!root){root=document.createElement('section');root.id='dtv-linked-rows';root.className='dtv';$('panel-content').append(root);}
  const state=linkedSelection;
  root.innerHTML='<h4>마킹된 원본 행</h4>'+(state?.error?'<p role="alert">'+esc(state.error)+'</p>':state?.loading?'<p role="status">선택 항목과 원본 행을 대조하고 있습니다.</p>':state?.result?'<p data-linked-count="'+state.result.count+'">'+esc(state.result.scope==='preview'?'미리보기 범위':'전체 원본 범위')+'에서 '+state.result.count.toLocaleString()+'행 선택 · 최대 '+state.result.preview_limit+'행 표시'+(state.sampled?' · 클릭은 표본 점, 숫자 영역 드래그는 전체 원본 범위 선택':'')+'</p>'+(state.result.artifact_id?'<div><button data-selection44-copy>선택 전체 복사 (TSV)</button><button data-selection44-csv>선택 전체 CSV</button><button data-selection44-table>새 테이블로 만들기</button></div>':'')+'<div class="dtv-linked-table">'+tableHTML(state.result)+'</div>':'<p>차트 항목을 선택하면 같은 원본·필터·확보 시점의 행을 표시합니다.</p>');
}
document.addEventListener('DataTalk:marking',async event=>{
  const d=event.detail,g=currentGraph();if(d?.origin!=='DataTalkVisuals'||!g||d.graph_ref!==g.canonical_ref)return;
  clearLinkedSelection();
  if(!d.selected?.length){renderLinkedSelection(g);return;}
  const sequence=linkedSelectionSequence;
  linkedSelection={graph_ref:g.canonical_ref,graph_version:g.version,source_ref:d.source_ref,source_version:d.source_version,loading:true,sampled:d.scope==='displayed_sample'};
  if(!d.mapping_complete||!d.snapshot_id){linkedSelection={...linkedSelection,loading:false,error:'이 저장 차트에는 원본 행 연결 정보가 없습니다. 차트를 다시 계산해 주세요.'};renderLinkedSelection(g);return;}
  const request=linkedSelectionRequest={controller:new AbortController(),query_id:uuid()};renderLinkedSelection(g);
  try{
    const result=await api('/graph/selection',{workspace_id:model.current.id,source_ref:d.source_ref,source_version:d.source_version,snapshot_id:d.snapshot_id,scope:d.chart_scope==='preview'?'preview':'full',filters:d.filters||[],marking:d.selected.map(x=>x.selection),query_id:request.query_id},{signal:request.controller.signal});
    if(sequence!==linkedSelectionSequence||request.controller.signal.aborted)return;
    linkedSelection={...linkedSelection,loading:false,result};acceptCacheBudgetStatus(result.cache_status);
  }catch(e){if(sequence!==linkedSelectionSequence||request.controller.signal.aborted)return;linkedSelection={...linkedSelection,loading:false,error:e.message};}
  finally{if(linkedSelectionRequest===request){linkedSelectionRequest=null;renderLinkedSelection();}}
});
// 4.4 form and conversation enhancements. Existing queue/API paths are retained.
const policy44={"contract": "datatalk.conversation.v4.4", "version": "4.4", "timezone": "Asia/Seoul", "table_guides": {"FAB_MAIN": {"description": "공정 진행·설비·챔버 이력 원본", "recommended_filters": ["step_seq"], "questions": ["공정/STEP 선택 또는 전체 공정 확인"], "examples": ["ej 제품 최근 30일 공정 이력 원본을 뽑아줘. 공정 선택지를 먼저 보여줘.", "현재 테이블에서 설비별 검사 건수를 계산해줘.", "현재 조건은 유지하고 설비 컬럼을 추가해줘."]}, "FAB_METRO": {"description": "공정 계측값·측정항목·원본 측정 수준", "recommended_filters": ["step_seq", "item_id"], "questions": ["공정/STEP", "실제 측정항목 선택 또는 ALL 확인"], "examples": ["ej 제품의 최근 30일 공정 계측 데이터를 뽑고 싶어. 공정과 측정항목 선택지를 보여줘.", "현재 계측 테이블의 필터 적용 데이터로 설비별 평균을 계산해줘.", "기존 조회조건은 유지하고 측정 수준을 SITE로 바꿔줘."]}, "EDS_WF_BIN": {"description": "wafer 단위 BIN 원본값·검사 및 재검사 이력", "recommended_filters": [], "questions": ["EDS_P / EDS_M", "BIN 번호 또는 전체 BIN 확인"], "examples": ["ej 제품 최근 30일 EDS_P에서 BIN 7번과 8번 원본값을 뽑아줘.", "ej 제품 최근 30일 EDS_P와 EDS_M의 전체 BIN 원본값을 뽑아줘.", "기존 조회조건은 유지하고 최신 검사만 뽑아줘."]}, "EDS_WF_MSR": {"description": "wafer 검사 단위의 측정값 · 유형·번호를 각각 컬럼으로 연결", "recommended_filters": [], "questions": ["EDS_P / EDS_M", "등록된 측정유형 목록·복수·ALL", "측정번호 또는 유형 안의 ALL"], "examples": ["ej 제품 최근 30일 EDS_P의 FBT 5번과 IVC 20번 wafer 단위 원본 측정값을 뽑아줘.", "ej 제품 최근 30일 EDS_P의 HSR과 IML 전체 번호를 AVG 항목으로 뽑아줘.", "ej 제품 최근 30일 EDS_P와 EDS_M의 등록된 전체 유형·전체 번호를 뽑아줘.", "기존 조건은 유지하고 SUBITEM을 STD로 바꿔줘."]}, "EDS_CHIP_BIN": {"description": "CHIP 검사 단위 BIN 원본 · 명시한 경우 BIN 건수·비율 집계", "recommended_filters": ["lot_ids", "wafer_ids"], "questions": ["EDS_P / EDS_M", "BIN 번호 또는 ALL", "LOT·wafer 없는 전체 대상 확인"], "examples": ["ej 제품 최근 30일 EDS_P의 전체 LOT에서 BIN 7번과 8번 CHIP 원본 데이터를 뽑아줘.", "ej 제품 최근 30일 EDS_P에서 LOT별 BIN 7번과 8번 분포를 계산해줘.", "기존 조회조건은 유지하고 BIN 제한을 해제해 전체 BIN을 뽑아줘."]}, "EDS_CHIP_MSR": {"description": "CHIP 검사 단위 측정값 · 유형별 측정번호를 컬럼으로 연결 · SUBITEM 없음", "recommended_filters": ["lot_ids", "wafer_ids"], "questions": ["EDS_P / EDS_M", "등록된 측정유형·복수·ALL", "측정번호 또는 ALL", "LOT·wafer 없는 전체 대상 확인"], "examples": ["ej 제품 최근 30일 EDS_P의 전체 LOT에서 FBT 5번과 IVC 20번 CHIP 측정값을 뽑아줘.", "ej 제품 최근 30일 EDS_M의 전체 CHIP 대상으로 HSR 전체 번호를 뽑아줘.", "현재 CHIP 테이블에서 FBT와 IVC 두 측정값이 모두 있는 행만 남겨줘."]}}, "planner_rules": {"goal": "사용자의 자연어·간편추출·실제 스키마를 연결해 정확한 데이터를 추출한다. SQL을 모르는 사용자가 SQL을 직접 수정하게 하지 않는다.", "source_first": "대상이 모호하면 권한이 있는 실제 스키마와 여섯 논리 테이블 설명, 완성된 자연어 예시부터 안내하고 선택받는다. 현재 선택 테이블/명확한 맥락이 있으면 재질문하지 않는다. EDS임은 명확하고 CHIP/WF만 빠지면 WF 기본을 알린다. BIN/MSR 의미까지 불명확하면 질문한다.", "slots": "간편추출의 실제 선택값과 이전 confirmed_fields를 재사용한다. 변경한 필드만 바꾼다. 중요 범위 조건이 빠지면 누락 항목과 조회행 증가 가능성을 알리고 네/아니오를 받는다. GROUP BY 항목의 특정 값은 요구하지 않는다.", "eds_step": "EDS STEP 미지정이면 EDS_P / EDS_M / 둘 다를 묻는다. 임의 기본 P 금지. 명시한 복수 STEP·유형을 허용하고 출처를 구분한다.", "measurement_type": "현재 테이블·스키마·STEP의 간편추출 등록 유형 전체를 선택지로 제공한다. 하나/복수/ALL을 허용한다. ALL은 등록 목록을 동적으로 참조한다. STEP별로 다른 유형을 임의 합치지 않는다.", "measurement_number": "선택한 유형 안에서 유효한 번호 몇 개와 자연어 예시를 먼저 제공한다. 전체 목록 요청 시 전체를 제공한다. 유형별 번호/ALL을 구분한다. 번호 미지정이면 해당 유형 ALL인지 확인한다. 등록되지 않은 0~499 전체를 생성하지 않는다. 섞어 뽑아도 각 유형·번호는 컬럼으로 붙인다.", "physical_grain": "wafer별/LOT별/CHIP별이라는 말만으로 GROUP BY 또는 DISTINCT를 추가하지 않는다. 원본 검사 grain과 재검사를 유지한다. 원본 AVG 항목 선택은 AVG 집계 함수가 아니다. 집계 의도가 명확하면 요청한 grain만 사용한다.", "defaults": "새 DB 조회에서 날짜가 없으면 한국시간 오늘 포함 30일(오늘-29일~오늘)을 적용하고 실제 기간을 알린다. 기존 조회 편집에는 날짜를 재설정하지 않는다. WF SUBITEM과 FAB_METRO item_level은 원본 AVG 기본+실제 다른 선택지 안내. 기본 출력 컬럼+요청 측정 컬럼; 불필요한 컬럼을 빼거나 추가할 수 있다고 안내.", "consent": "누락된 범위 조건은 한 번에 묶어 확인한다. 네/예/응/진행은 정확한 대기 조건에 연결한다. 아니오는 실행 없이 조건 선택으로 돌아간다. 이미 명시한 ALL/전체 또는 확인된 값은 재질문하지 않는다. 확인 후 LIMIT/표본/기간축소/LOT수/wafer수 제한을 임의로 추가하지 않는다. 미리보기만 제한한다. 실제 인프라 실패는 실패로 보고하며 전체 완료로 꾸미지 않는다.", "retests_nulls": "기본은 모든 검사 이력과 재검사. 최신만 요청하면 검증된 대상키·검사시간·동점 처리 기준으로 최신 조회한다. 다른 STEP은 구분한다. 일부 측정값 없어도 기본은 행+NULL 유지; 0 대체 금지. 모두 값 있는 행만 요청하면 그때 필터.", "followup": "후속 집계/분석은 현재 선택 테이블의 현재 필터를 통과한 전체 행 기준이다. 미리보기 1000행으로 통계를 계산하지 않는다. 현재 source/version/filter를 정확히 전달한다. 기존처럼 집계 결과는 새 tN. DB 재조회는 명시한 경우. API 결과에 SQL 재조회가 연결되지 않았으면 가능한 API/서버 테이블 처리로 안내하고 불가능한 SQL을 꾸미지 않는다.", "graphs": "추출 후 그래프·ANOVA를 자동 추천/실행하지 않는다. 사용자 요청 시 차트 종류, X/Y 중 빠진 것만 실제 선택지로 질문한다. Bar/Line 수치 집계 기본 평균+대안 안내. 원본 AVG 항목과 그래프 집계 평균을 구분한다. Scatter 기본은 원본 관측값. 마킹은 원본 기여 행으로 연결한다.", "zero_rows": "0행이면 현재 조건·확인된 원인·미확인을 구분한다. 실제 데이터 있는 후보가 확인됐으면 복붙해서 수정할 수 있는 완성 자연어 문장과 물리 SQL을 제공한다. 확인하지 않은 후보를 데이터 있음으로 주장하지 않는다. 변경 실행은 사용자 요청 뒤.", "sql_errors": "실제 SQL 오류의 문법/검증된 컬럼 매핑은 원래 조건과 의미를 유지해 제한된 자동 수정·재시도한다. 의미/범위 변경은 질문한다. 수정 실패는 쉬운 설명과 실제 최종 SQL/오류 근거. 권한/접속 오류를 SQL 문법 오류로 처리하지 않는다.", "output": "데모에서는 실제 물리 relation/column과 값이 들어간 DB 직접 실행 SQL을 제공한다. 실제 실행은 바인딩 유지; 표시만 안전하게 literal화. 가상 테이블명/미해결 파라미터를 실행 SQL로 제공하지 않는다. 실제 DB/Gemma 검증 여부를 명시한다.", "adapter_contract": "새 DB kind=query는 extraction_intent를 반드시 제공한다: table,schemas,step_seqs,time,measurement_types,measurement_numbers(유형별),subitem,item_levels,filters,explicit_all_fields,bin_all_explicit,purpose(raw/aggregate),group_by,retests,null_policy,projection. 불명확하면 clarification. Adapter.validate는 SQL 파싱·바인딩·실제 권한 메타데이터로 independently 재구성한 intent와 policy44.intent가 일치한 뒤 conversation_policy_verified=SHA256(canonical JSON intent)를 반환한다. 현재 테이블 filters가 있으면 SQL에 실제 적용한 뒤 data_scope_verified를 반환한다. 단순 digest echo 금지. SQL 오류 자동 교정은 데이터 의미를 보존하는 prepare/repair_sql 어댑터에 연결한다."}, "defaults": {"date_days": 30, "eds_unit": "WF", "wf_subitem": "AVG", "metro_item_level": "AVG", "retests": "all", "nulls": "preserve", "projection": "quick_defaults_plus_requested", "bar_line_aggregation": "mean", "source_scope": "filtered_full"}, "example_status": "안내 문장 예시입니다. 사내 검증된 번호·항목·기간으로 갱신해야 하며 실데이터 성공 사례로 표시하지 않습니다."};
function help44(table,container){
 const guide=policy44.table_guides[table];if(!guide||!container)return;
 container.innerHTML='<details open><summary>'+esc(table)+' · 사용 안내와 질문 예시</summary><p>'+esc(guide.description)+'</p><p>'+esc(guide.questions.join(' · '))+'</p><p>날짜 미지정 시 오늘 포함 최근 30일 · 원본 AVG 기본 · 재검사 전체 · 기본 컬럼 사용. 원하는 컬럼을 빼거나 추가할 수 있습니다.</p><p>“wafer별”은 원본 행 단위이며, 평균·건수 등을 요청했을 때 집계합니다.</p>'+guide.examples.map((q,i)=>'<button type="button" data-example44="'+esc(table)+':'+i+'">'+esc(q)+'</button>').join('')+'<small>안내 예시입니다. 실제 공정·번호와 데이터 존재 여부는 사내 검증 후 갱신합니다.</small></details>';
}
const edsxNewState42=edsxNewState;
edsxNewState=function(table){const a=edsxNewState42(table),today=quickDay(quickToday());return {...a,step_seq:'',step_seqs:[],mode:table==='EDS_CHIP_BIN'?'raw':'measurement',meas_type:'',meas_types:[],numberSelections:{},start_date:quickDayText(today-29),end_date:quickDayText(today),selected_columns:null};};
const edsxPayload42=edsxPayload;
edsxPayload=function(a=edsxUI){const b=edsxPayload42(a);b.step_seqs=a.step_seqs?.length?a.step_seqs:a.step_seq?[a.step_seq]:[];b.step_seq=b.step_seqs[0]||'';
 b.mode=a.table==='EDS_CHIP_BIN'?a.mode:'measurement';
 const types=a.meas_types?.length?a.meas_types:a.meas_type?[a.meas_type]:[];
 b.measurements=types.map(t=>{const text=a.numberSelections?.[t]??a.numbersText;return {meas_type:t,numbers:String(text).trim().toUpperCase()==='ALL'?'ALL':edsxParseNumbers(text).values};});
 if(a.selected_columns)b.columns=a.selected_columns;b.subitem=a.table==='EDS_WF_MSR'?a.subitem:undefined;return b;};
const edsxRenderMetadata42=edsxRenderMetadata;
edsxRenderMetadata=function(){edsxRenderMetadata42();const a=edsxUI;if(!a)return;const m=edsxMetadata(),catalog=m.registered_types_by_step||{},steps=a.step_seqs?.length?a.step_seqs:[a.step_seq||'EDS_P'];
 const lists=steps.map(s=>Object.keys(catalog[s]||{})),types=lists.length?lists[0].filter(t=>lists.every(list=>list.includes(t))):m.meas_types||[];
 $('edsx-meas-types').innerHTML=[...types,'ALL'].map(t=>'<label><input type="checkbox" name="edsx-meas44" value="'+esc(t)+'" '+((a.meas_types||[]).includes(t)?'checked':'')+'> '+esc(t)+'</label>').join('');
 for(const el of $('edsx-steps').querySelectorAll('input'))el.checked=(a.step_seqs||[]).includes(el.value);
 renderTyped44();help44(a.table,$('edsx-help44'));};
function renderTyped44(){const a=edsxUI;if(!a)return;const types=a.meas_types||[];let el=$('edsx-typed44');if(!el){el=document.createElement('div');el.id='edsx-typed44';$('edsx-numbers').after(el);}
 el.innerHTML=types.length>1?types.map(t=>'<label>'+esc(t)+' 측정번호 (쉼표·줄바꿈·ALL)<textarea data-typed44="'+esc(t)+'">'+esc(a.numberSelections?.[t]??'')+'</textarea></label>').join(''):'';
 $('edsx-numbers').hidden=types.length>1;$('edsx-numbers').placeholder='예: 5, 12 또는 ALL · 비우면 전체 번호 확인';
}
const edsxRenderMode42=edsxRenderMode;
edsxRenderMode=function(){edsxRenderMode42();const a=edsxUI;$('edsx-mode').hidden=true;$('edsx-target-title').textContent='조회 대상 · 선택';$('edsx-target-note').textContent='LOT·wafer를 지정하지 않으면 전체 대상 조회 여부를 확인합니다.';$('edsx-find-lots').hidden=true;
 $('edsx-bin-card').hidden=a.table!=='EDS_CHIP_BIN';$('edsx-measurement-card').hidden=a.table==='EDS_CHIP_BIN';help44(a.table,$('edsx-help44'));};
edsxLocalError=function(a){if(a.workspace_id!==model.current?.id)return '작업공간이 변경되었습니다.';if(!a.schema)return '제품 스키마를 선택해 주세요.';if(!(a.step_seqs?.length||a.step_seq))return 'EDS_P 또는 EDS_M을 선택하세요. 복수 선택 가능합니다.';
 if(!Number.isFinite(quickDay(a.start_date))||!Number.isFinite(quickDay(a.end_date))||quickDay(a.start_date)>quickDay(a.end_date))return '조회 기간을 확인하세요.';
 if(edsxIsMeasurement(a)&&!(a.meas_types?.length||a.meas_type))return '측정유형을 하나 이상 또는 ALL로 선택하세요.';
 for(const spec of edsxPayload(a).measurements||[])if(spec.numbers!=='ALL'){const text=a.numberSelections?.[spec.meas_type]??a.numbersText,p=edsxParseNumbers(text);if(p.errors.length)return p.errors[0];}
 return '';};
$('eds-extract-dialog').addEventListener('change',event=>{const a=edsxUI,t=event.target;if(!a)return;
 if(t.name==='edsx-step'){a.step_seqs=[...$('edsx-steps').querySelectorAll('input:checked')].map(e=>e.value);a.step_seq=a.step_seqs[0]||'';a.selected_columns=null;edsxInvalidate();edsxLoadOptions(true);}
 if(t.name==='edsx-meas44'){a.meas_types=[...$('edsx-meas-types').querySelectorAll('input:checked')].map(e=>e.value);if(t.value==='ALL'&&t.checked)a.meas_types=['ALL'];else a.meas_types=a.meas_types.filter(x=>x!=='ALL');a.meas_type=a.meas_types[0]||'';a.selected_columns=null;edsxInvalidate();edsxLoadOptions(true);}
});
$('eds-extract-dialog').addEventListener('input',event=>{if(event.target.dataset.typed44){edsxUI.numberSelections[event.target.dataset.typed44]=event.target.value;edsxInvalidate();}});
$('edsx-number-all').addEventListener('click',()=>{edsxUI.numbersText='ALL';for(const t of edsxUI.meas_types||[])edsxUI.numberSelections[t]='ALL';$('edsx-numbers').value='ALL';edsxInvalidate();renderTyped44();});
const quickRenderConditions42=quickRenderConditions;
quickRenderConditions=function(...args){quickRenderConditions42(...args);help44(quickUI?.table,$('quick-help44'));};
document.addEventListener('click',event=>{const b=event.target.closest('[data-example44]');if(!b)return;const [t,i]=b.dataset.example44.split(':'),text=policy44.table_guides[t].examples[Number(i)];const input=$('message')||$('input')||document.querySelector('#chat-form textarea,form textarea');if(input){input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}$('quick-dialog').close();$('eds-extract-dialog').close();toast('예시를 입력창에 넣었습니다. 조건을 수정한 뒤 전송하세요.');});
// Always capture the current full-data filter context at submission, including queueing.
const api42=api;
api=async function(path,body,options){if((path==='/chat'||path==='/analysis/prepare'||path==='/analysis/setup'||path==='/queue'&&body?.action==='add')&&body)body={...body,active_filters:body.active_filters??(window.DataTalkVisuals?.activeFilters?.(currentTable())||[])};return api42(path,body,options);};
// Physical SQL replaces the parameterized display; execution still uses bindings.
const originalProposalHTML44=typeof proposalHTML==='function'?proposalHTML:null;
document.addEventListener('click',async event=>{const b=event.target.closest('[data-copy-physical44]');if(!b)return;const p=model.current?.pending_proposal;if(p?.physical_sql){await navigator.clipboard.writeText(p.physical_sql);toast('DB에 직접 실행할 SQL을 복사했습니다.');}});


 document.addEventListener('click',async event=>{
  const b=event.target.closest('[data-selection44-copy],[data-selection44-csv],[data-selection44-table]');if(!b||!linkedSelection?.result?.artifact_id)return;
  const result=linkedSelection.result,id=result.artifact_id,base=apiBase+'/selection44/file/'+id;
  b.disabled=true;
  try{
   if(b.hasAttribute('data-selection44-csv')){const a=document.createElement('a');a.href=base+'?format=csv';a.download='selection.csv';a.click();}
   else if(b.hasAttribute('data-selection44-copy')){const response=await Promise.reject(new Error('가상 데이터 시연에서는 이 전송을 사용하지 않습니다.'));if(!response.ok)throw Error('선택 원본을 읽지 못했습니다.');await navigator.clipboard.writeText(await response.text());toast(result.count+'행을 복사했습니다.');}
   else {const r=await api('/selection44/table',{workspace_id:model.current.id,expected_revision:model.current.revision,artifact_id:id});apply(r.workspace);model.tab='table';showResult();toast('선택한 전체 원본으로 새 테이블을 만들었습니다.');}
  }catch(error){toast(error.message+' · 전체 CSV 다운로드도 사용할 수 있습니다.');}finally{b.disabled=false;}
 });
 
/* DataTalk 5.1: bounded metadata requests and visible, recoverable form state.
 * Inline this after the existing connected UI. No DB/LLM/permission bypass.
 */
(() => {
  'use strict';
  const TIMEOUT = 20000;
  const stateOf = kind => kind === 'eds' ? edsxUI : quickUI;
  const prefix = kind => kind === 'eds' ? 'edsx' : 'quick';
  const originalFooters = {quick: quickRenderFooter, eds: edsxRenderFooter};
  const originalErrors = {quick: quickLocalError, eds: edsxLocalError};
  const active = {quick: null, eds: null};
  const context = (kind, a) => JSON.stringify(kind === 'quick'
    ? [a.workspace_id, a.table, quickRequestedSchemas(a)]
    : [a.workspace_id, a.table, a.schema, a.step_seq, a.meas_type, a.subitem, a.mode, a.group_by,
       a.step_seqs || [], a.meas_types || []]);
  function panel(kind) {
    const id = prefix(kind) + '-status51';
    let node = $(id);
    if (!node) {
      node = document.createElement('div'); node.id = id;
      node.className = 'quick-status51'; node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      const message = document.createElement('span'); message.dataset.message51 = '';
      const retry = document.createElement('button'); retry.type = 'button';
      retry.dataset.retry51 = kind; retry.textContent = '다시 시도';
      node.append(message, retry); $(prefix(kind) + '-error').before(node);
    }
    return node;
  }
  function unavailable(kind, a) {
    if (a.optionsError51) return a.optionsError51;
    if (!a.options) return '조회 조건·컬럼 정보를 불러오지 못했습니다. 다시 시도해 주세요.';
    if (kind === 'eds') {
      const m = edsxMetadata(a);
      if (m.ready === false) return m.message || '선택한 제품·STEP·측정유형의 조회 준비가 완료되지 않았습니다. 조건을 바꾸거나 다시 시도해 주세요.';
    }
    if (a.options.ready === false) return a.options.message || '서버의 조회 준비가 완료되지 않았습니다. 다시 시도하거나 담당자에게 연결 상태를 확인해 주세요.';
    return '';
  }
  function validate(kind, a) {
    if (a.workspace_id !== model.current?.id) return '작업공간이 변경되었습니다. 간편추출을 다시 열어 주세요.';
    return unavailable(kind, a) || originalErrors[kind](a) || (kind === 'eds' ? window.DataTalkMSR51?.validate(a) || '' : '');
  }
  function footer(kind) {
    const a = stateOf(kind); if (!a) return;
    originalFooters[kind]();
    const p = prefix(kind), node = panel(kind), busy = !!a.busy;
    // Missing fields/readiness may be explained by clicking; only in-flight work blocks.
    $(p + '-preview-button').disabled = busy || !!a.loading;
    const why = a.loading ? '조회 조건·컬럼 정보를 불러오는 중입니다. 20초 안에 응답이 없으면 재시도할 수 있습니다.'
      : busy ? (a.busy === 'preview' ? '입력한 조건을 확인하고 있습니다.' : '요청을 처리하고 있습니다.')
      : a.error || unavailable(kind, a) || (a.preview
        ? '조건 확인 완료 · SQL 준비를 누르세요.'
        : '조건을 입력한 뒤 ‘조건 확인’을 누르세요. 빠진 항목이 있으면 위치를 안내합니다.');
    node.querySelector('[data-message51]').textContent = why;
    const retry = node.querySelector('[data-retry51]');
    retry.hidden = busy || !!a.loading || !unavailable(kind, a);
    retry.disabled = busy || !!a.loading;
    $(p + '-preview-button').title = why;
    $(p + '-preview-button').setAttribute('aria-describedby', node.id);
    const offline = kind === 'eds' && window.DATATALK_OFFLINE_PREVIEW === true;
    $(p + '-plan-button').disabled = busy || !!a.loading || !a.preview || !!unavailable(kind, a) || offline;
    $(p + '-plan-button').title = offline ? '오프라인 예시에서는 SQL을 준비할 수 없습니다.'
      : !a.preview ? '먼저 조건 확인을 완료해 주세요.' : why;
    if (kind === 'eds') {
      $('edsx-readiness').textContent = why;
      // ALL is an explicit request, not a fabricated enumeration of catalogue numbers.
      $('edsx-number-all').disabled = busy || !!a.loading || !!unavailable(kind, a) || !edsxIsMeasurement(a);
      $('edsx-number-all').title = $('edsx-number-all').disabled ? why : '현재 유형의 전체 번호를 요청합니다. 서버에서 유효 범위를 검증합니다.';
      window.DataTalkMSR51?.afterFooter(a);
    }
  }
  function stopRequest(kind, reason) {
    const job = active[kind]; if (!job) return;
    active[kind] = null; job.a.loading = false;
    job.controller.abort(new DOMException(reason, 'AbortError'));
  }
  async function load(kind, force = false) {
    const a = stateOf(kind); if (!a) return false;
    if (kind === 'quick') clearTimeout(quickOptionsTimer);
    const key = context(kind, a), old = active[kind];
    if (old?.a === a && old.key === key) return old.promise;
    if (old) stopRequest(kind, '조건이 변경되어 이전 응답을 사용하지 않습니다.');
    if (!force && a.optionsKey51 === key && a.options && !a.optionsError51) {
      a.loading = false;
      if (kind === 'quick') {quickSetColumns(a, a.options.columns || []); quickRenderColumns();}
      footer(kind); return !unavailable(kind, a);
    }
    const controller = new AbortController();
    const job = {a, key, controller, promise: null}; active[kind] = job;
    a.loading = true; a.optionsError51 = ''; a.preview = null;
    $(prefix(kind) + '-preview').hidden = true; footer(kind);
    job.promise = (async () => {
      let timer, rejectAbort;
      const aborted = new Promise((_, reject) => {
        rejectAbort = () => reject(controller.signal.reason || new DOMException('Aborted', 'AbortError'));
        controller.signal.addEventListener('abort', rejectAbort, {once: true});
      });
      try {
        timer = setTimeout(() => controller.abort(new Error('OPTIONS_TIMEOUT51')), TIMEOUT);
        const schemas = kind === 'quick' ? quickRequestedSchemas(a) : (a.schema ? [a.schema] : []);
        const body = {table: a.table, ...(schemas.length ? {schemas} : {})};
        if (kind === 'eds') Object.assign(body, {step_seq:a.step_seq, step_seqs:a.step_seqs, meas_type:a.meas_type, meas_types:a.meas_types, subitem:a.subitem, mode:a.mode, group_by:a.group_by});
        const r = await Promise.race([api('/quick-extract/options', body, {signal:controller.signal}), aborted]);
        if (active[kind] !== job || stateOf(kind) !== a || context(kind, a) !== key) return false;
        if (!r || !Array.isArray(r.schemas) || (kind === 'quick' && !Array.isArray(r.columns)))
          throw new Error('OPTIONS_FORMAT51');
        if (kind === 'eds' && (!r.eds_options || typeof r.eds_options.ready !== 'boolean'))
          throw new Error('OPTIONS_FORMAT51');
        a.options = r; a.error = ''; a.optionsKey51 = key; a.optionsKey = null;
        if (kind === 'quick') {
          a.preference = r.preference || null; quickSetColumns(a, r.columns); quickRenderConditions(); quickRenderColumns();
        } else {
          const names = r.schemas.map(s => typeof s === 'string' ? s : s.name), m = edsxMetadata(a);
          if (!a.schema && names.length) {
            a.schema = names[0]; a.loading = false; active[kind] = null;
            edsxRenderMetadata(); return await load(kind, true);
          }
          if (a.schema && !names.includes(a.schema)) {a.schema = ''; a.optionsKey51 = null;}
          if (a.meas_type && a.meas_type !== 'ALL' && Array.isArray(m.meas_types) && !m.meas_types.includes(a.meas_type)) {
            a.meas_type = ''; a.meas_types = []; a.optionsKey51 = null;
          }
          if (Array.isArray(m.subitems) && m.subitems.length && !m.subitems.includes(a.subitem))
            a.subitem = m.subitems.includes('AVG') ? 'AVG' : m.subitems[0];
          edsxRenderMetadata();
        }
        return !unavailable(kind, a);
      } catch (error) {
        if (active[kind] !== job || stateOf(kind) !== a) return false;
        a.options = null; a.optionsKey51 = null;
        a.optionsError51 = error.message === 'OPTIONS_TIMEOUT51'
          ? '조건·컬럼 정보 응답이 20초를 초과했습니다. 입력은 유지했습니다. 다시 시도해 주세요. 서버 작업 종료 여부는 별도 확인이 필요합니다.'
          : error.status === 401 || error.status === 403 || model.authRequired
            ? '로그인 또는 접근 권한을 확인해 주세요. 다시 로그인한 뒤 재시도하세요.'
            : error.message === 'OPTIONS_FORMAT51'
              ? '서버의 조건·컬럼 응답 형식이 맞지 않습니다. 담당자에게 간편추출 연결 규격 확인을 요청해 주세요.'
              : '조건·컬럼 정보를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
        a.error = a.optionsError51;
        if (/^[A-Z][A-Z0-9_]{1,79}$/.test(error.code || '')) a.error = a.optionsError51 += ' · 오류 코드: ' + error.code;
        return false;
      } finally {
        clearTimeout(timer); controller.signal.removeEventListener('abort', rejectAbort);
        if (active[kind] === job) {
          active[kind] = null; a.loading = false;
          if (stateOf(kind) === a) {if (kind === 'quick') quickRenderColumns(); footer(kind);}
        }
      }
    })();
    return job.promise;
  }
  function focusInvalid(kind, a, error) {
    const p = prefix(kind); let el;
    if (/기간|시작일|종료일/.test(error)) el = $(p + '-start-date');
    else if (kind === 'quick') {
      if (/컬럼/.test(error)) el = $('quick-columns').querySelector('input');
      else if (a.table === 'FAB_MAIN') el = $('quick-steps');
      else if (/item_level/.test(error)) el = $('quick-level-choices').querySelector('input');
      else {
        const fields = quickTables[a.table].fields;
        let index = a.rows.findIndex(row => fields.some(f => String(row[f] || '').trim()) && fields.some(f => !String(row[f] || '').trim()));
        if (index < 0) index = 0;
        a.page = Math.floor(index / 100); quickRenderConditions();
        const field = fields.find(f => !String(a.rows[index]?.[f] || '').trim()) || fields[0];
        el = [...$('quick-grid-body').querySelectorAll('[data-quick-cell]')].find(e => Number(e.dataset.quickIndex) === index && e.dataset.quickCell === field);
        if (/제품/.test(error)) el = (a.table === 'EDS_WF_BIN' ? $('quick-schema-choices') : $('quick-grid-body')).querySelector('input[type=checkbox]') || el;
      }
    } else if (/제품|스키마/.test(error)) el = $('edsx-schema');
    else if (/STEP|EDS_P|EDS_M/.test(error)) el = $('edsx-steps').querySelector('input');
    else if (/측정유형/.test(error)) el = $('edsx-meas-types').querySelector('input');
    else if (/번호|숫자|컬럼/.test(error)) el = $('edsx-typed44')?.querySelector('textarea') || $('edsx-numbers');
    if (el) {el.setAttribute('aria-invalid', 'true'); el.focus(); el.scrollIntoView({block:'nearest'});}
  }
  async function preview(kind) {
    const a = stateOf(kind); if (!a || a.busy || a.loading || a.previewPending51) return;
    a.previewPending51 = true;
    try {
      await load(kind);
      if (stateOf(kind) !== a || !$(kind === 'eds' ? 'eds-extract-dialog' : 'quick-dialog').open) return;
      const error = validate(kind, a);
      if (error) {a.error = error; footer(kind); if (!unavailable(kind, a)) focusInvalid(kind, a, error); return;}
      a.busy = 'preview'; a.error = ''; footer(kind);
      // Only metadata gets a short timeout. Keep actual server validation semantics.
      const r = await api('/quick-extract/preview', kind === 'quick' ? quickPayload(a) : edsxPayload(a));
      if (stateOf(kind) !== a) return;
      a.preview = r;
      if (kind === 'eds' && r.msr_catalog_token) a.previewCatalogToken51 = r.msr_catalog_token;
      if (kind === 'quick') {
        const mode = a.columnMode; quickSetColumns(a, r.columns || a.columns); a.columnMode = mode;
        if (r.selected_columns) a.selected = new Set(r.selected_columns);
        quickRenderColumns();
      }
      const box = $(prefix(kind) + '-preview'); box.hidden = false;
      box.innerHTML = '<strong>조회조건 확인 완료</strong><p>' + esc(typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary || {})) + '</p>'
        + (r.warnings || []).map(w => '<p>' + esc(typeof w === 'string' ? w : w.message || JSON.stringify(w)) + '</p>').join('');
      if (kind === 'eds' && r.columns?.length) box.innerHTML += '<details><summary>결과 컬럼 '+r.columns.length+'개</summary><p>'+r.columns.map(c=>esc(quickColumnName(c))).join(' · ')+'</p></details>';
    } catch (error) {
      if (stateOf(kind) === a) {a.error = error.message || '조건 확인에 실패했습니다. 다시 시도해 주세요.'; a.preview = null;}
    } finally {
      a.previewPending51 = false; if (a.busy === 'preview') a.busy = false;
      if (stateOf(kind) === a) footer(kind);
    }
  }
  quickLoadOptions = force => load('quick', force);
  edsxLoadOptions = force => load('eds', force);
  quickRenderFooter = () => footer('quick');
  edsxRenderFooter = () => footer('eds');
  quickLocalError = a => validate('quick', a);
  edsxLocalError = a => validate('eds', a);
  // Old single-select and new multi-select listeners used to handle the same STEP
  // change. A fast options reply could redraw the checkbox between listeners and
  // erase the new selection. Snapshot once, before either legacy listener runs.
  $('eds-extract-dialog').addEventListener('change', e => {
    const a = edsxUI, t = e.target;
    if (!a || !['edsx-step','edsx-meas44','edsx-subitem'].includes(t.name)) return;
    e.stopImmediatePropagation(); if (a.busy) return;
    if (t.name === 'edsx-step') {
      a.step_seqs = [...$('edsx-steps').querySelectorAll('input:checked')].map(x => x.value);
      a.step_seq = a.step_seqs[0] || '';
    } else if (t.name === 'edsx-meas44') {
      a.meas_types = [...$('edsx-meas-types').querySelectorAll('input:checked')].map(x => x.value);
      a.meas_types = t.value === 'ALL' && t.checked ? ['ALL'] : a.meas_types.filter(x => x !== 'ALL');
      a.meas_type = a.meas_types[0] || '';
    } else a.subitem = t.value;
    a.selected_columns = null; edsxInvalidate();
    if (a.step_seq) void load('eds', true);
    else {stopRequest('eds', 'STEP 선택 해제'); footer('eds');}
  }, true);
  // Capture replaces previously bound listeners, so a click cannot submit twice.
  document.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button) return;
    const kind = button.dataset.retry51 || (button.id === 'quick-preview-button' ? 'quick' : button.id === 'edsx-preview-button' ? 'eds' : null);
    if (!kind) return;
    e.preventDefault(); e.stopImmediatePropagation(); if (button.disabled) return;
    if (button.dataset.retry51) void load(kind, true); else void preview(kind);
  }, true);
  for (const [kind, id] of [['quick','quick-dialog'],['eds','eds-extract-dialog']]) {
    $(id).addEventListener('close', () => {stopRequest(kind, '입력창을 닫았습니다.'); const a = stateOf(kind); if (a) a.optionsKey51 = null;});
    $(id).addEventListener('input', e => e.target.removeAttribute('aria-invalid'));
  }
  window.DataTalkQuickExtract51 = {version:'5.1',metadataTimeoutMs:TIMEOUT};
})();
/* DataTalk 5.1r2: one validated MSR catalogue for typed input and checkboxes. */
(() => {
  'use strict';
  const original = {payload:edsxPayload, footer:edsxRenderFooter, metadata:edsxRenderMetadata,
    error:edsxLocalError, numbers:edsxRenderNumbers, typed:renderTyped44};
  function parse(text) {
    let s=String(text??'').normalize('NFKC').trim().toLowerCase(),values=[],errors=[];
    const fail=m=>({values:[],errors:[m],duplicates:0,all:false});
    if(s.length>12000)return fail('번호 입력이 너무 깁니다.');
    if(!s)return {values,errors,duplicates:0,all:false};
    s=s.replace(/\s*(?:선택해줘|선택해\s*줘|뽑아줘|뽑아\s*줘|추출해줘|추출해\s*줘|보여줘|보여\s*줘|선택|추출|조회|주세요|줘)\s*[.!]?$/,'').trim();
    if(/^(?:all|전체|모두)(?:\s*(?:번호|측정값|측정|컬럼|항목))?$/.test(s))return {values,errors,duplicates:0,all:true};
    s=s.replace(/(?:msr\s*_\s*|측정\s*(?:컬럼\s*)?번호\s*:?\s*|번호\s*:?\s*)/g,'')
      .replace(/(\d)\s*번/g,'$1').replace(/(\d)\s*부터\s*(\d+)\s*까지/g,'$1-$2')
      .replace(/\s*(?:,|;|\n|\t|및|하고|와|과|랑|이랑)\s*/g,' ')
      .replace(/(\d)\s*(?:~|-|–|—)\s*(\d)/g,'$1-$2').replace(/\s*(?:만|을|를)$/,'').trim();
    if(!s)return fail('예: 1, 3, 7 또는 1부터 5까지');
    for(const token of s.split(/\s+/)){
      const m=/^(\d{1,3})(?:-(\d{1,3}))?$/.exec(token);
      if(!m)return fail('번호만 입력해 주세요. 예: 1, 3, 7 / msr_001 / 1부터 5까지. 제외·조건 문장은 자동 추측하지 않습니다.');
      const lo=Number(m[1]),hi=m[2]?Number(m[2]):lo;
      if(lo>hi||hi>499)return fail('측정 번호는 0~499이며 범위는 작은 번호부터 입력하세요.');
      for(let n=lo;n<=hi;n++)values.push(n);
    }
    const unique=[...new Set(values)];return {values:unique,errors,duplicates:values.length-unique.length,all:false};
  }
  const catalogue=a=>edsxMetadata(a).msr_catalog;
  const groupTypes=a=>[...new Set((catalogue(a)?.groups||[]).map(g=>g.scope.meas_type))];
  const textFor=(a,t)=>a.numberSelections?.[t]??a.numbersText??'';
  function members(a,t){
    const groups=(catalogue(a)?.groups||[]).filter(g=>g.scope.meas_type===t);
    const union=new Map();for(const g of groups)for(const i of g.items)if(!union.has(i.number))union.set(i.number,i);
    return [...union.values()].map(i=>({...i,common:groups.every(g=>g.items.some(x=>x.number===i.number))}));
  }
  function inputError(a,t){
    const p=parse(textFor(a,t));if(p.errors.length)return p.errors[0];
    if(p.all)return '';
    const allowed=new Set(members(a,t).filter(i=>i.common).map(i=>i.number)),missing=p.values.filter(n=>!allowed.has(n));
    if(missing.length)return '현재 선택 조건에 공통으로 등록되지 않은 번호: '+missing.map(n=>'msr_'+String(n).padStart(3,'0')).join(', ');
    return '';
  }
  function setText(a,t,value){
    a.numberSelections??={};a.numberSelections[t]=value;
    if(groupTypes(a).length===1){a.numbersText=value;$('edsx-numbers').value=value;}
    a.previewCatalogToken51=null;a.selected_columns=null;edsxInvalidate();render();
  }
  function render(){
    const a=edsxUI;if(!a)return;
    let host=$('msr-picker51');
    if(!host){host=document.createElement('div');host.id='msr-picker51';$('edsx-number-chips').after(host);}
    const cat=catalogue(a),types=groupTypes(a),active=edsxIsMeasurement(a)&&a.table!=='EDS_CHIP_BIN';
    host.hidden=!active;
    if(!active)return;
    $('edsx-number-chips').hidden=true;$('edsx-columns-preview').hidden=true;
    $('edsx-columns-preview').closest('details').hidden=true;
    const hint=$('edsx-numbers').previousElementSibling;if(hint?.tagName==='P')hint.textContent='숫자·범위로 입력하거나 아래 목록에서 선택하세요.';
    $('edsx-typed44')?.setAttribute('hidden','');
    $('edsx-numbers').hidden=types.length!==1;
    if(types.length===1){
      a.numbersText=textFor(a,types[0]);
      if(document.activeElement!==$('edsx-numbers'))$('edsx-numbers').value=a.numbersText;
    }
    $('edsx-numbers').placeholder='예: 1, 3, 7 / msr_001 / 1부터 5까지';
    $('edsx-number-all').textContent='ALL · 등록 항목 전체';
    if(!cat||cat.status!=='ready'){
      host.dataset.layout='';host.innerHTML='<p class="edsx-small">'+esc(a.loading?'등록된 측정 항목을 불러오는 중입니다.':cat?.status==='empty'?'등록된 측정 항목이 0개입니다.':cat?.status==='pending'?'제품·STEP·측정 유형을 선택하면 목록이 표시됩니다.':'유효 MSR 매핑을 연결하면 체크박스 목록이 표시됩니다.')+'</p>';
      $('edsx-number-count').textContent='목록 확인 필요';return;
    }
    const key=JSON.stringify(types);
    if(host.dataset.layout!==key){
      host.dataset.layout=key;host.replaceChildren();
      for(const t of types){
        const card=document.createElement('section');card.className='msr-card51';card.dataset.msrType=t;
        card.innerHTML='<div class="msr-top51"><strong>'+esc(t)+'</strong><span data-msr-count></span></div>'
          +(types.length>1?'<textarea data-msr-text aria-label="'+esc(t)+' 측정 번호" placeholder="예: 1, 3, 7 / 1부터 5까지"></textarea>':'')
          +'<div class="msr-tools51"><input data-msr-filter type="search" aria-label="'+esc(t)+' 측정 항목 검색" placeholder="번호·이름·설명 검색"><button type="button" data-msr-action="filtered">검색 결과 선택</button><button type="button" data-msr-action="clear">해제</button></div>'
          +'<div class="msr-list51" role="group" aria-label="'+esc(t)+' 측정 컬럼 목록"></div><div class="msr-feedback51" aria-live="polite"></div>';
        host.append(card);
      }
    }
    let total=0,allCount=0;
    for(const card of host.children){
      const t=card.dataset.msrType,p=parse(textFor(a,t)),items=members(a,t),selected=new Set(p.all?items.map(i=>i.number):p.values);
      const text=card.querySelector('[data-msr-text]');if(text&&document.activeElement!==text)text.value=textFor(a,t);
      const q=card.querySelector('[data-msr-filter]').value.trim().toLowerCase();
      const shown=items.filter(i=>!q||(i.label+' '+i.column+' '+i.description+' '+i.number).toLowerCase().includes(q));
      const count=p.all?items.length:p.values.length;total+=count;if(p.all)allCount++;
      card.querySelector('[data-msr-count]').textContent=(p.all?'ALL · ':'')+count+'개 선택 / 등록 '+items.length+'개';
      const list=card.querySelector('.msr-list51'),scroll=list.scrollTop,focused=list.contains(document.activeElement)?document.activeElement.dataset.msrNumber:null;
      list.innerHTML=shown.map(i=>'<label title="'+esc((i.description||i.column)+(i.common?'':' · 선택 STEP 간 공통 항목이 아닙니다. STEP을 좁히거나 ALL을 사용하세요.'))+'"><input type="checkbox" data-msr-number="'+i.number+'" '+(selected.has(i.number)?'checked':'')+' '+(!i.common||a.loading||a.busy?'disabled':'')+'><span>'+esc(i.label)+'</span></label>').join('')||'<span class="edsx-small">검색 결과가 없습니다.</span>';
      list.scrollTop=scroll;if(focused!==null)list.querySelector('[data-msr-number="'+focused+'"]')?.focus({preventScroll:true});
      card.querySelector('.msr-feedback51').textContent=inputError(a,t)||(p.all?'ALL은 검색어와 관계없이 등록된 항목 전체입니다.':p.duplicates?'중복 '+p.duplicates+'개를 한 번만 선택합니다.':'');
      card.querySelector('[data-msr-action="filtered"]').disabled=!!a.busy||!!a.loading||!shown.some(i=>i.common)||!!inputError(a,t);
    }
    $('edsx-number-count').textContent=total+'개 선택'+(allCount?' · ALL 적용':'');
    $('edsx-summary').textContent=[a.schema,(a.step_seqs||[a.step_seq]).join('·'),types.join('·'),a.table==='EDS_WF_MSR'?a.subitem:'',total+'개 측정 컬럼'+(allCount?' · ALL':'')].filter(Boolean).join(' · ');
    $('edsx-number-error').textContent='';
  }
  edsxParseNumbers=parse;window.DataTalkEDSForms.parseNumbers=parse;
  renderTyped44=function(){original.typed();render();};
  edsxRenderNumbers=()=>render();
  edsxRenderMetadata=function(){original.metadata();$('edsx-help44')?.querySelector('details')?.removeAttribute('open');render();};
  function afterFooter(a){
    if(!a)return;
    const cat=catalogue(a),ready=cat?.status==='ready';
    $('edsx-number-all').disabled=!!a.busy||!!a.loading||!ready;
    $('edsx-number-all').title=ready?'선택 조건에 등록된 유효 항목 전체. 검색 필터와 무관합니다.':'유효 MSR 목록을 먼저 확인하세요.';
    if(edsxIsMeasurement(a)&&!ready)$('edsx-plan-button').disabled=true;
    render();
    // Legacy footer enables every field; reapply catalogue-specific restrictions.
    if(a.busy||a.loading)for(const el of $('msr-picker51')?.querySelectorAll('input,textarea,button')||[])el.disabled=true;
  }
  edsxRenderFooter=()=>original.footer();
  function mappingError(a){
    if(!edsxIsMeasurement(a))return '';
    if(catalogue(a)?.status!=='ready')return '유효 MSR 목록을 먼저 불러와 주세요. 매핑 연결 상태를 확인하세요.';
    for(const t of groupTypes(a)){const e=inputError(a,t);if(e)return e;const p=parse(textFor(a,t));if(!p.all&&!p.values.length)return t+' 측정 번호를 선택하거나 ALL을 눌러 주세요.';}
    return '';
  }
  edsxLocalError=a=>original.error(a)||mappingError(a);
  edsxPayload=function(a=edsxUI){
    const b=original.payload(a),cat=catalogue(a);
    if(edsxIsMeasurement(a)&&cat?.status==='ready'){
      b.measurements=groupTypes(a).map(t=>{const p=parse(textFor(a,t));return {meas_type:t,numbers:p.all?'ALL':p.values};});
      b.msr_catalog_token=a.preview?.msr_catalog_token||cat.token;
    }
    return b;
  };
  const dialog=$('eds-extract-dialog');
  dialog.addEventListener('input',e=>{
    const a=edsxUI,t=e.target,card=t.closest('[data-msr-type]');if(!a)return;
    if(t.matches('[data-msr-filter]')){e.stopImmediatePropagation();render();return;}
    if(t.id==='edsx-numbers'||t.matches('[data-msr-text]')){
      e.stopImmediatePropagation();if(a.busy)return;
      const typ=card?.dataset.msrType||groupTypes(a)[0];if(typ)setText(a,typ,t.value);
    }
  },true);
  dialog.addEventListener('change',e=>{
    const t=e.target;if(!t.matches('[data-msr-number]'))return;
    e.stopImmediatePropagation();const a=edsxUI;if(!a||a.busy||a.loading)return;
    const typ=t.closest('[data-msr-type]').dataset.msrType,p=parse(textFor(a,typ));
    if(p.errors.length){edsxUI.error=p.errors[0];edsxRenderFooter();return;}
    if(p.all&&members(a,typ).some(i=>!i.common)){
      a.error='STEP별 등록 번호가 다릅니다. STEP을 한 개 선택하거나 해제 후 공통 번호를 선택해 주세요.';edsxRenderFooter();return;
    }
    const values=new Set(p.all?members(a,typ).filter(i=>i.common).map(i=>i.number):p.values);
    t.checked?values.add(Number(t.dataset.msrNumber)):values.delete(Number(t.dataset.msrNumber));
    setText(a,typ,[...values].sort((a,b)=>a-b).join(', '));
  },true);
  dialog.addEventListener('click',e=>{
    const button=e.target.closest('button'),a=edsxUI;if(!button||!a)return;
    if(!button.dataset.msrAction&&!['edsx-number-all','edsx-number-clear'].includes(button.id))return;
    e.preventDefault();e.stopImmediatePropagation();if(button.disabled||a.busy||a.loading)return;
    if(button.id==='edsx-number-all'||button.id==='edsx-number-clear'){
      for(const t of groupTypes(a))setText(a,t,button.id==='edsx-number-all'?'ALL':'');
      return;
    }
    const card=button.closest('[data-msr-type]'),typ=card.dataset.msrType;
    if(button.dataset.msrAction==='clear'){setText(a,typ,'');return;}
    const p=parse(textFor(a,typ));if(p.all)return;
    const values=new Set(p.values);for(const check of card.querySelectorAll('[data-msr-number]:not(:disabled)'))values.add(Number(check.dataset.msrNumber));
    setText(a,typ,[...values].sort((a,b)=>a-b).join(', '));
  },true);
  const style=document.createElement('style');style.textContent=`
  .msr-card51{border:1px solid #d9e1ef;border-radius:9px;padding:8px;margin-top:7px;min-width:0}
  .msr-top51,.msr-tools51{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.msr-top51{justify-content:space-between;font-size:13px;margin-bottom:6px}
  .msr-tools51 input{flex:1;min-width:110px}.msr-tools51 button{font-size:12px;padding:6px 8px}
  #eds-extract-dialog .msr-card51 textarea{height:48px;min-height:44px;margin-bottom:6px}
  .msr-list51{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:4px;max-height:144px;overflow:auto;margin-top:7px}
  .msr-list51 label{display:flex;align-items:center;gap:6px;padding:5px;background:#f6f8fc;border-radius:5px;font:13px var(--mono);cursor:pointer}
  .msr-list51 input{width:16px;height:16px;flex:none}.msr-list51 label:has(input:disabled){opacity:.6;cursor:default}
  .msr-feedback51{font-size:12px;color:var(--muted);margin-top:5px;overflow-wrap:anywhere}
  #edsx-help44 details:not([open]){margin-bottom:5px}`;
  document.head.append(style);
  window.DataTalkMSR51={parse,render,validate:mappingError,afterFooter,version:'5.1r2'};
})();

DataTalkVisuals.init({model,$,api,uuid,apply,render,fail,toast,showResult,dateLabel,openTableTypes,setCacheStatus:acceptCacheBudgetStatus,onGraphDataOutcome:recordGraphDataOutcome,onGraphFiltersChanged:clearLinkedSelection});

// Offline fixture adapter for presentation only. Production rendering and UI styling are retained.
window.DATATALK_OFFLINE_PREVIEW=true;clearInterval(queue42Timer);
window.DemoUI=(()=>{
 const nativeOption=DataTalkVisuals.e44Option;DataTalkVisuals.e44Option=c=>{const o=nativeOption(c);if(c.y_column==='yield_pct'&&o.xAxis.type==='value'){o.xAxis.min=90;o.xAxis.max=100;}return o;};
 let fixture=null,scene=-1,ws=null,tableList=[],graph=null,typingText='';
 const clone=x=>JSON.parse(JSON.stringify(x));
 const prompt='V9제품 MAIN STEP 09번 진행 설비별 수율 데이터를 조회해주고 설비별 차이가 나는지 ANOVA로 분석해줘';
 const reply='FAB 150일 수율 100일치를 조회해서 조인해줘';
 const ack='네, FAB 150일치와 수율 100일치를 조회해 조인한 뒤, 설비별 수율을 ANOVA로 분석하겠습니다.';
 const col=(name,type='text')=>({name,type});
 function baseTable(id,title,columns,rows,extra={}){return {id,canonical_ref:'w1.'+id,workspace_id:'w1',title,version:1,rows,columns,truncated:false,origin_type:'sql',created_at:'2026-10-13T04:00:00Z',extracted_at:'2026-10-13T04:00:00Z',updated_at:'2026-10-13T04:00:00Z',source_ids:['DEMO'],source_refs:[],params:{product:'V9',step:'09'},sql:'-- 시연용 가상 데이터\nSELECT * FROM demo_data;',...extra};}
 function initialize(data){
  fixture=clone(data);
  const fab=data.fab,yields=data.yields,joined=data.rows;
  tableList=[
   baseTable('t1','V9 MAIN STEP 09 · FAB 150일',[col('lot_id'),col('wafer_id'),col('process_id'),col('step_seq'),col('eqp_id'),col('fab_date','date')],fab.map(r=>[r.lot,r.wafer,r.product,r.step,r.equipment,r.fabDate]),{params:{product:'V9',step:'09',fab_days:150}}),
   baseTable('t2','V9 · 수율 100일',[col('lot_id'),col('wafer_id'),col('yield_date','date'),col('yield_pct','double precision')],yields.map(r=>[r.lot,r.wafer,r.yieldDate,r.yieldPct]),{params:{product:'V9',yield_days:100}}),
   baseTable('t3','V9 MAIN STEP 09 · 설비별 수율',[col('lot_id'),col('wafer_id'),col('eqp_id'),col('yield_pct','double precision'),col('fab_date','date'),col('yield_date','date')],joined.map(r=>[r.lot,r.wafer,r.equipment,r.yieldPct,r.fabDate,r.yieldDate]),{source_refs:['w1.t1','w1.t2'],join_expression:'t1@t2',transformation:{description:'FAB 이력과 수율 · LOT_ID + WAFER_ID 결합'},params:{product:'V9',step:'09',fab_days:150,yield_days:100}}),
   baseTable('t4','ANOVA · 설비별 수율 그룹 요약',[col('group'),col('n','integer'),col('mean','double precision'),col('std','double precision'),col('ci_low','double precision'),col('ci_high','double precision')],data.groups.map(g=>[g.eq,g.n,g.mean,Math.sqrt(g.variance),g.lo,g.hi]),{origin_type:'api',source_ref:'w1.t3',source_refs:['w1.t3'],analysis:{source_ref:'w1.t3',parameters:{value_column:'yield_pct',group_column:'eqp_id'},data_quality:{input_rows:120,used_rows:120,excluded_rows:0}}})
  ];
  queue42.clear();model.ready=true;model.setup='';model.error='';model.visualizationReady=true;model.split=.46;
  model.cacheStatus={enabled:false,used_bytes:0,max_bytes:0};model.cacheStatusAt=Date.now();
  $('connection-status').textContent='가상 데이터 시연';
  setSplit(.46,false);
  set(0);return {ready:true};
 }
 function chartSpec(type='boxplot'){
  const q=(a,x)=>{const i=(a.length-1)*x,k=Math.floor(i);return a[k]+(a[Math.min(k+1,a.length-1)]-a[k])*(i-k);};
  return {type,scope:'full',input_rows:120,used_rows:120,excluded_rows:0,source_input_rows:120,analysis_scope:'full',x_column:'eqp_id',y_column:'yield_pct',value_column:'yield_pct',value_unit:'%',x_type:'text',y_type:'number',measures:[{column:'yield_pct',axis:'left',aggregation:'mean'}],options:{legend:false,orientation:'vertical',show_mean:true,show_outliers:true,zoom:false,statistics:false,decimals:4,y_min:90,y_max:100},data:fixture.groups.map((g,i)=>({group:g.eq,x:g.eq,mean:g.mean,y:g.mean,n:g.n,std:Math.sqrt(g.variance),ci_low:g.lo,ci_high:g.hi,q1:q(g.v,.25),median:q(g.v,.5),q3:q(g.v,.75),whisker_low:g.v[0],whisker_high:g.v.at(-1),outliers:[],_index:i}))};
 }
 function analysisDraft(){
  const props={value_column:{type:'string'},group_column:{type:'string'},observation_mode:{type:'string',enum:['rows','mean']},independent_rows_confirmed:{type:'boolean'},observation_id_columns:{type:'array'},method:{type:'string',enum:['anova','welch']},alpha:{type:'number'}};
  const module={id:'ye_anova',version:'2.0.0',name:'그룹 평균 비교',dataset:{projection:'selected',bindings:[{parameter:'value_column',types:['number']},{parameter:'group_column',types:['string']}]},parameters_schema:{properties:props,required:['value_column','group_column']},ui:{mode:'form',layout:'compact',title:'그룹 평균 비교 · ANOVA',description:'측정값과 비교 그룹을 선택하면 그룹 간 평균 차이를 분석합니다.',fields:[{parameter:'value_column',label:'측정값',widget:'column'},{parameter:'group_column',label:'비교 그룹',widget:'column'},{parameter:'observation_mode',label:'비교 단위',widget:'select',advanced:true,option_labels:{rows:'각 행',mean:'대상별 평균'}},{parameter:'independent_rows_confirmed',label:'독립 대상 확인',widget:'checkbox',advanced:true,help:'각 행은 서로 다른 대상의 관측값입니다.'},{parameter:'method',label:'분석 방법',widget:'select',advanced:true},{parameter:'alpha',label:'유의수준',widget:'number',advanced:true}]}};
  return {id:'demo-anova',module,module_id:module.id,module_version:module.version,source_ref:'w1.t3',source_version:1,title:tableList[2].title,columns:tableList[2].columns,parameters:{value_column:'yield_pct',group_column:'eqp_id',observation_mode:'rows',independent_rows_confirmed:true,observation_id_columns:[],method:'anova',alpha:.05}};
 }
 function analysisReady(completed=false){
  const draft=analysisDraft();ws.analysis_setup=draft;model.modules=[draft.module];analysisUI=analysisState(draft,'w1');analysisUI.recommendAttempted=true;analysisUI.recommendLoading=false;analysisUI.filters={};analysisUI.busy=false;analysisUI.chart42='mean_ci';
  analysisUI.run=completed?{id:'demo-run',status:'completed',source_ref:'w1.t3',source_version:1,result_refs:['w1.t4'],config:{parameters:draft.parameters},presentation:{headline:'설비 그룹 간 평균 수율 차이가 나타납니다',short_summary:'F = '+fixture.F.toFixed(4)+' · p < 0.001 · 유의수준 0.05',summary:'시연용 가상 데이터의 일원배치 ANOVA 결과입니다.',unit_note:'가상 데이터 전체 120행 · 설비별 40행',limitations:['설비가 차이의 원인임을 뜻하지 않습니다.','개별 설비 조합 간 차이는 후속 비교가 필요합니다.'],charts:[{...chartSpec('mean_ci'),title:'설비별 평균 · 95% 신뢰구간',total_groups:3},{...chartSpec('boxplot'),title:'설비별 수율 분포',total_groups:3}]}}:null;
  analysisCache.set(draft.id,analysisUI);
 }
 function set(n){
  if(!fixture)return;scene=n;typingText='';for(const d of document.querySelectorAll('dialog[open]'))d.close();
  DataTalkVisuals.deactivate();model.peekTable=null;model.graphForm=null;model.graphSetupSource=null;model.busy=null;model.tab='table';model.error='';analysisUI=null;analysisCache.clear();tableGraphIndexes.clear();
  ws={id:'w1',name:'V9 설비별 수율',revision:1,selected_schemas:['demo'],tables:[],graphs:[],messages:[],selected_table_id:null,selected_graph_id:null,pending_question:null,pending_proposal:null};
  if(n>=2)ws.messages.push({role:'user',content:prompt});
  if(n===2||n===3)ws.pending_question={id:'period',question:'며칠치를 분석해드릴까요?',options:[]};
  if(n>=4)ws.messages.push({role:'assistant',content:'며칠치를 분석해드릴까요?'},{role:'user',content:reply},{role:'assistant',content:ack});
  if(n>=6){ws.tables=tableList.slice(0,n===6?1:n===7?2:n>=11?4:3).map(clone);ws.selected_table_id=n===6?'t1':n===7?'t2':n===13?'t4':'t3';ws.messages.push({role:'assistant',content:n===6?'FAB 150일치 이력을 조회했습니다.':n===7?'수율 100일치 데이터를 조회했습니다.':'FAB 이력과 수율을 조인했습니다. 설비별 수율을 확인할 수 있습니다.',table_id:ws.selected_table_id});}
  if(n===9||n===10)ws.messages.push({role:'assistant',content:n===9?'요청하신 설비별 차이 분석을 이어서 진행합니다.\n비교 그룹은 설비(eqp_id), 측정값은 수율(yield_pct)로 자동 연결했습니다.':'조인 결과 120행으로 ANOVA를 실행하고 있습니다.\n같은 데이터의 그래프와 분석 결과를 함께 준비합니다.'});
  if(n===13)ws.messages.push({role:'assistant',content:'ANOVA 분석을 마쳤습니다.\n가상 데이터에서 설비 그룹 간 평균 수율 차이가 나타납니다 (p < 0.001).\n설비가 차이의 원인이라는 뜻은 아닙니다. 그룹별 요약을 t4에 준비했습니다.',table_id:'t4'});
  if(n>=11&&n<=12)analysisReady(true);
  apply(ws);render();$('input').value='';updateComposer();
  if(n===1)typingText=prompt;if(n===3)typingText=reply;
  if(n===5){model.busy={label:'FAB 150일 · 수율 100일 · 가상 테이블 조회 및 결합',cancelable:false};renderChat();}
  if(n===8.5){
   const spec={source_ref:'w1.t3',chart_type:'boxplot',x:'eqp_id',x_columns:['eqp_id'],y:'yield_pct',measures:[{column:'yield_pct',axis:'left',aggregation:'mean'}],filters:[],options:{legend:false,show_mean:true,zoom:false}};
   graph={id:'g1',canonical_ref:'w1.g1',workspace_id:'w1',source_ref:'w1.t3',source_version:1,title:'설비별 수율 분포',spec,chart:chartSpec(),version:1,origin_type:'sql'};ws.graphs=[graph];ws.selected_graph_id='g1';render();
  }
  if(n===10){model.busy={label:'요청한 설비별 수율 ANOVA 분석 중',cancelable:false};renderChat();}
  if(n>=11&&n<=12){renderChat();renderAnalysis();$('analysis-dialog').showModal();
   if(n===12){analysisUI.chart42='boxplot';renderAnalysis();}
  }
  if(n===13){$('panel-content').scrollTop=0;}
  for(const el of document.querySelectorAll('td')){if(/^-?\d+\.\d{5,}$/.test(el.textContent.trim()))el.textContent=Number(el.textContent).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:4});}
  const sc=$('scroll');sc.scrollTop=sc.scrollHeight;
  requestAnimationFrame(()=>{sc.scrollTop=sc.scrollHeight;DataTalkVisuals.mount?.();mountCompactCharts44();});
  return {scene:n};
 }
 function type(count){$('input').value=typingText.slice(0,count);updateComposer();}
 function rect(selector){const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}
 function focusRect(kind){
  let r=null;
  if(kind==='full')return {x:0,y:0,width:1600,height:900};
  if(kind==='composer')r=rect('#form');
  if(kind==='question')r=rect('.question-reminder');
  if(kind==='message'){const el=[...document.querySelectorAll('#conversation .assistant')].at(-1);if(el){el.scrollIntoView({block:'center'});const q=el.getBoundingClientRect();r={x:q.x-8,y:q.y-15,width:q.width+16,height:Math.max(q.height+55,235)};}}
  if(kind==='progress'){const el=document.querySelector('.operation-bar');if(el){el.scrollIntoView({block:'center'});const q=el.getBoundingClientRect();r={x:q.x-8,y:q.y-155,width:q.width+16,height:240};}}
  if(kind==='conditions'){const el=document.querySelector('.binding-values');if(el){$('scroll').scrollTop=Math.max(0,el.offsetTop-90);r=rect('.binding-values');}}
  if(kind==='execute'){const el=document.querySelector('[data-execute]');if(el){el.scrollIntoView({block:'center'});r=rect('.query-proposal .confirm-actions');}}
  if(kind==='table'){const p=rect('.result-pane'),tabs=rect('#panel-content .tabs');if(p)r={x:p.x+10,y:tabs?tabs.y-43:p.y+60,width:p.width-20,height:330};}
  if(kind==='lineage'){r=rect('.dtv-lineage');if(r)r={...r,height:270};}
  if(kind==='graph'){const el=document.querySelector('.dtv-stage');if(el){el.scrollIntoView({block:'center'});r=rect('.dtv-stage');r={x:r.x,y:r.y-48,width:r.width,height:r.height+56};}}
  if(kind==='settings'){const d=$('analysis-dialog');d.scrollTop=0;r=rect('#analysis-dialog');if(r)r={...r,height:Math.min(r.height,575)};}
  if(kind==='analysis-action'){const d=$('analysis-dialog');d.scrollTop=d.scrollHeight;r=rect('#analysis-footer');if(r)r={x:r.x,y:r.y-100,width:r.width,height:r.height+100};}
  if(kind==='result'){const d=$('analysis-dialog');d.scrollTop=0;$('analysis-body').scrollTop=0;r=rect('.anova-result');if(r)r={x:r.x,y:Math.max(0,r.y),width:r.width,height:315};}
  if(kind==='boxplot'){const d=$('analysis-dialog'),chart=d.querySelector('.anova-chart');if(chart){chart.scrollIntoView({block:'center'});r=rect('.anova-chart');}}
  return r||{x:225,y:75,width:700,height:700};
 }
 function highlight(selector){for(const el of document.querySelectorAll('.demo-highlight'))el.classList.remove('demo-highlight');if(selector)document.querySelector(selector)?.classList.add('demo-highlight');}
 async function api(path,body){
  if(path==='/queue')return {items:[],active:[],paused:false};
  if(path.startsWith('/graphs')||path.includes('/graphs'))return {graphs:ws.graphs};
  if(path.startsWith('/workspace/'))return clone(ws);
  if(path==='/table/select'){ws.selected_table_id=body.table_id;ws.selected_graph_id=null;return {workspace:clone(ws)};}
  if(path==='/graph/render')return {chart:chartSpec(),render_id:'demo-chart'};
  if(path==='/cache/status')return {enabled:false,used_bytes:0,max_bytes:0};
  return {};
 }
 // The presentation clock is the only driver. UI buttons are genuine source components;
 // no click may escape to a production service.
 document.addEventListener('click',e=>{const b=e.target.closest('button,a');if(!b)return;e.preventDefault();e.stopImmediatePropagation();
  if(b.dataset.anovaChart42){analysisUI.chart42=b.dataset.anovaChart42;renderAnalysis();return;}
  if(b.dataset.apiAction==='result'){set(13);return;}
  if(b.dataset.openTable){const id=b.dataset.openTable.split('.').at(-1);set(id==='t1'?6:id==='t2'?7:id==='t4'?13:8);return;}
  if(b.dataset.tab==='table'){model.tab='table';renderPanel();return;}
  if(b.dataset.tab==='sql'){model.tab='sql';renderPanel();return;}
  if(b.dataset.export!==undefined){parent.postMessage({type:'datatalk-demo-export',kind:scene===13?'anova':'rows'},'*');return;}
  if(b.id==='panel-expand'){document.querySelector('#app').classList.toggle('panel-expanded');return;}
 },true);
 return {initialize,set,type,rect,focusRect,highlight,api,getScene:()=>scene,getState:()=>({scene,rows:ws?.tables?.map(t=>({id:t.id,n:t.rows.length})),analysis:analysisUI?.run?.status}),prompt,reply};
})();
