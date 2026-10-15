
/* DataTalk visualization UI, contract datatalk.visuals.v2. */
(function(){'use strict';
const TYPES=['bar','line','scatter','combination','boxplot','crosstable'];
const LABELS={bar:'Bar Chart',line:'Line Chart',scatter:'Scatter Plot',combination:'Combination',boxplot:'Box Plot',crosstable:'Cross Table',mean_ci:'Mean & CI'};
const AGGS={sum:'Sum',mean:'Avg',count:'Count',distinct:'UniqueCount',min:'Min',max:'Max',median:'Median',stddev:'StdDev',stderr:'StdErr',variance:'Var',cumulative_sum:'Cumulative Sum',count_rows:'Count()',q1:'Q1',q3:'Q3',none:'(None)'};
const AGG_MENU=[['sum','Sum'],['mean','Avg (Average)'],['count','Count'],['distinct','UniqueCount'],['min','Min'],['max','Max'],['median','Median'],['stddev','StdDev (Standard Deviation)'],['stderr','StdErr (Standard Error)'],['variance','Var (Variance)'],['cumulative_sum','Cumulative Sum']];
const PALETTES={spotfire:['#ff725e','#6485fb','#66ae76','#b58ac8','#dcad52','#61afb3','#bb8c73','#899bad'],cool:['#297eae','#69b7bd','#665aaa','#98b8d4','#468a73'],warm:['#c66551','#dfa350','#a78d61','#d78994','#a45967'],mono:['#447aa5','#6490b2','#85a7c3','#a2bed2']};
const DEFAULT={orientation:'vertical',layout:'grouped',sort:'category',reverse:false,x_mode:'auto',log_y:false,log_right:false,log_x:false,y_min:null,y_max:null,x_min:null,x_max:null,right_min:null,right_max:null,grid:false,legend:true,labels:false,decimals:4,bar_width:.72,line_width:2,markers:true,step:false,break_empty:true,opacity:1,jitter:0,marker_size:4,palette:'spotfire',show_mean:true,show_outliers:true,statistics:true,box_whiskers:'tukey',sort_measure:0,cross_sort_axis:'rows',cross_measure_axis:'columns',cross_measure_position:6,cross_sort_prefix:[],totals_mode:'source',totals:true,subtotals:true,heat:false,empty:'blank',zoom:true,y_mode:'auto',reverse_y:false,reference_lines:[],trellis_columns:2,error_bars:'none',color_map:{},legend_position:'right',legend_max_values:50,legend_title:true,legend_selector:true,trellis_scale:'shared',line_normalized:false,error_bars_x:'none',error_end_caps:true,error_include_range:true,error_color:'#465461',cross_row_height:28,cross_column_width:110,cross_align:'right',cross_header_color:'#f4f5f6',cross_total_color:'#eef3f7',totals_rows:true,totals_columns:true,subtotals_rows:true,subtotals_columns:true,segment_sort:false,segment_reverse:false,series_types:{},marker_shape:'automatic',rotation_direction:'clockwise',rotation_aggregation:'mean',cross_sort_mode:'hierarchy',subtotal_rows_levels:null,subtotal_columns_levels:null,subtotal_position:'after',cross_styles:[]};
let H=null,view=null,popup=null,propTab='Data',tip=null,brush=null;const marks=new Map(),zooms=new Map(),collapsed=new Map();
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>JSON.parse(JSON.stringify(v));
const num=v=>typeof v==='number'&&Number.isFinite(v);
const key=v=>JSON.stringify(v);
const kind=t=>{t=String(t||'').toLowerCase();if(['20','21','23','700','701','1700'].includes(t)||/^(?:int\d*|integer|bigint|smallint|real|double|float\d*|numeric|decimal|number)\b/.test(t))return 'number';if(['1083','1266'].includes(t)||/^(?:time(?:tz)?(?:\b|\()|time32|time64)/.test(t))return 'time';if(['1082','1114','1184'].includes(t)||/^(date|timestamp)/.test(t))return 'datetime';return (t==='16'||/^(bool|boolean)$/.test(t))?'boolean':'string';};
function icon(t){const a={bar:'M4 21V11h4v10m4 0V4h4v17m4 0V8h4v13',line:'M3 18l6-8 6 4 7-10M3 22h22',scatter:'M3 3v20h22M8 16h.1M11 7h.1M16 12h.1M21 5h.1M19 19h.1',combination:'M4 23V11h4v12m4 0V7h4v16m4 0V14h4v9M4 7l10 7L24 3',boxplot:'M8 2v5m-3 0h6v13H5V7m0 7h6m-3 6v5M5 2h6M5 25h6m10-22v6m-3 0h6v11h-6V9m0 6h6m-3 5v5',crosstable:'M3 4h23v22H3V4m0 6h23M9 4v22m8-16v16M3 18h23'};return '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="'+(a[t]||a.line)+'" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';}

function defaultSpec(source,chartType=null){
 const cols=tableCols(source),numeric=cols.filter(c=>kind(c.type)==='number'),metrics=numeric.filter(c=>!/(?:^|_)(?:id|key|seq|index|code|bin_no|wafer_no)(?:_|$)/i.test(c.name)&&c.role!=='identity'),value=metrics[0]||numeric[0],time=cols.find(c=>c.type==='date')||cols.find(c=>['datetime','time'].includes(kind(c.type))),category=cols.find(c=>kind(c.type)==='string'&&/equipment|chamber|category|gender|장비|챔버/i.test(c.name))||cols.find(c=>kind(c.type)==='string'),first=cols[0];
 const chart_type=chartType||(time&&value?'line':category?'bar':numeric.length>1?'scatter':'bar');let x;
 if(chart_type==='scatter')x=time||numeric.find(c=>c.name!==value?.name)||category||first;
 else if(['line','combination'].includes(chart_type))x=time||category||numeric.find(c=>c.name!==value?.name)||first;
 else x=category||time||cols.find(c=>c.name!==value?.name)||first;
 const numericMeasure={column:value?.name||null,aggregation:value?'mean':'count_rows',type:chart_type==='line'?'line':'bar',axis:'left'};
 let measures=[numericMeasure];
 if(chart_type==='scatter'){const y=value||cols.find(c=>c.name!==x?.name)||first;measures=[{column:y?.name||null,x:x?.name||null,aggregation:'none',x_aggregation:'none',type:'line',axis:'left'}];}
 if(chart_type==='boxplot')measures=[{column:value?.name||null,aggregation:'none',type:'line',axis:'left'}];
 if(chart_type==='combination'&&value){const other=metrics.find(c=>c.name!==value.name)||numeric.find(c=>c.name!==value.name)||value;measures.push({column:other.name,aggregation:'mean',type:'line',axis:'right'});}
 return {source_ref:refOf(source),chart_type,scope:'full',x:x?.name||null,x_columns:x?[x.name]:[],measures,rows:chart_type==='crosstable'&&x?[x.name]:[],columns:[],options:clone(DEFAULT),auto_note:'컬럼 자료형에 맞춰 축을 선택했어요. 전체 데이터를 자동으로 계산하며, 축을 바꾸면 차트가 다시 그려집니다.'};
}
function normalize(spec={},source){
 const f=applyHierarchies(clone(spec)),cols=tableCols(source),numeric=cols.filter(c=>kind(c.type)==='number'),metrics=numeric.filter(c=>!/(?:^|_)(?:id|key|seq|index|bin_code|code)(?:_|$)/i.test(c.name)&&c.role!=='identity'),n=metrics[0]||numeric[0],time=cols.find(c=>c.type==='date')||cols.find(c=>['datetime','time'].includes(kind(c.type))),cat=cols.find(c=>kind(c.type)==='string'&&/equipment|chamber|category|gender|장비|챔버/i.test(c.name))||cols.find(c=>kind(c.type)==='string'),first=cols[0];
 f.filters=Array.isArray(f.filters)?f.filters:[];f.chart_type=f.chart_type||(time&&n?'line':'bar');f.scope=f.scope||'full';f.options={...clone(DEFAULT),...f.options};
 const autoX=['scatter','line','combination'].includes(f.chart_type)?(time||cat||numeric.find(c=>c.name!==n?.name)||first):(cat||time||first);
 f.x_columns=f.chart_type==='boxplot'&&Array.isArray(spec.x_columns)&&!spec.x_columns.length?[]:f.x_columns?.length?f.x_columns:f.x?[f.x]:autoX?[autoX.name]:[];f.x=f.x_columns[0]||null;
 f.measures=f.measures?.length?f.measures:f.ys?.length?f.ys.map(c=>({column:c,aggregation:f.aggregation||'mean',type:'bar',axis:'left'})):[{column:f.y||n?.name||null,aggregation:f.aggregation||(n?'mean':'count_rows'),type:'bar',axis:'left'}];
 f.scatter_mode=f.scatter_mode==='aggregate'?'aggregate':'rows';f.marker_by=Array.isArray(f.marker_by)?f.marker_by:[];
 f.rows=Array.isArray(f.rows)?f.rows:f.chart_type==='crosstable'?[f.x].filter(Boolean):[];f.columns=f.columns||[];if(f.chart_type==='crosstable'){f.x=f.rows[0]||f.columns[0]||null;f.x_columns=f.rows.length?[...f.rows]:[...f.columns];}
 if(['scatter','boxplot'].includes(f.chart_type))f.measures.forEach(m=>{m.aggregation=f.chart_type==='scatter'&&f.scatter_mode==='aggregate'?(m.aggregation&&m.aggregation!=='none'?m.aggregation:'mean'):'none';if(f.chart_type==='scatter')m.x_aggregation=f.scatter_mode==='aggregate'?(m.x_aggregation&&m.x_aggregation!=='none'?m.x_aggregation:'mean'):'none';if(!m.column)m.column=n?.name||(f.chart_type==='scatter'?cols.find(c=>c.name!==f.x)?.name||f.x:null);if(f.chart_type==='scatter')m.x=m.x||f.x;});
 f.y=f.measures[0]?.column;f.aggregation=f.measures[0]?.aggregation;if(source)f.source_ref=f.source_ref||source.canonical_ref;
 f.options.cross_measure_position=Math.min(f.options.cross_measure_position,(f[f.options.cross_measure_axis]||[]).length);f.auto_note=spec.auto_note||(!spec.x&&!spec.x_columns?'컬럼 자료형으로 초기 축을 추천했어요. 축 이름을 눌러 바로 변경할 수 있어요.':'');return f;
}
function sourceFor(ref){const [w,t]=String(ref||'').split('.');return H?.model.cache.get(w)?.tables.find(x=>x.id===t);}
function refOf(t){return t?.canonical_ref||(H?.model.current?.id+'.'+t?.id);}
function tableCols(t){return (t?.columns||[]).map(c=>typeof c==='string'?{name:c,type:'unknown'}:c);}
function typeLabel(t){return ({16:'boolean',20:'bigint',21:'smallint',23:'integer',25:'text',700:'real',701:'double precision',1043:'varchar',1082:'date',1083:'time',1266:'timetz',1114:'timestamp',1184:'timestamptz',1700:'numeric'})[String(t)]||String(t||'unknown');}
function resetAutoLabel(m){if(!m)return;const a=m.aggregation||'mean',legacy=(a==='mean'?'Avg':a.charAt(0).toUpperCase()+a.slice(1))+'('+m.column+')';if(m.label===label({...m,label:null})||m.label===legacy)delete m.label;}
function label(m){return m?.label||(m?.aggregation==='count_rows'?'Count()':(m?.aggregation==='none'?(m?.column||'값 선택'):(AGGS[m?.aggregation]||'Avg')+'('+(m?.column||'값 선택')+')'));}
function activeForm(t,g){if(!H.model.graphForm)H.model.graphForm=normalize(g?.spec||{},t);const f=normalize(H.model.graphForm,t);H.model.graphForm=f;return f;}
function color(series,index,opts){return /^#[0-9a-f]{6}$/i.test(opts.color_map?.[series])?opts.color_map[series]:(PALETTES[opts.palette]||PALETTES.spotfire)[index%(PALETTES[opts.palette]||PALETTES.spotfire).length];}
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

function fmt(v,o={}){if(v==null)return '—';if(!num(v))return String(v);const d=Math.max(0,Math.min(4,o.decimals??4));if(v!==0&&Math.abs(v)<.0001)return v.toExponential(d).replace(/(\.\d*?[1-9])0+e/,'$1e').replace(/\.0+e/,'e');fmt._formats??={};fmt._formats[d]??=new Intl.NumberFormat('en-US',{maximumFractionDigits:d,minimumFractionDigits:0});return fmt._formats[d].format(Object.is(v,-0)?0:v);}
function seriesOf(p,c){const m=c.measures?.[p.measure||0];return c.type==='boxplot'?(c.measures?.length>1?(m.column+(p.color_group!=null?' · '+p.color_group:'')):String(p.color_group??'Distribution')):c.measures?.length>1?label(m)+(p.group!=null?' · '+p.group:''):String(p.group??label(m));}
function seriesType(p,c,o=c.options){return o?.series_types?.[seriesOf(p,c)]||c.measures?.[p.measure||0]?.type||'bar';}
function lineKey(p,c){return '@line:'+key([p.measure||0,Object.prototype.hasOwnProperty.call(p,'line_group')?p.line_group:p.group??null,p.group??null]);}
function seriesMatches(p,c,s){return s.startsWith('@line:')?lineKey(p,c)===s:seriesOf(p,c)===s;}
function allSeries(c){return [...new Set(c.data.map(p=>seriesOf(p,c)))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:false}));}
function measured(c){return c.data.map((p,i)=>({...p,_index:i}));}
function extent(v,includeZero=false){v=v.filter(num);let a=v.length?Math.min(...v):0,b=v.length?Math.max(...v):1;if(includeZero){a=Math.min(0,a);b=Math.max(0,b);}if(a===b){const d=Math.abs(a)*.1||1;a-=d;b+=d;}return [a,b];}
function positiveExtent(values){const v=values.filter(x=>num(x)&&x>0);if(!v.length)return [1,10];const a=Math.min(...v),b=Math.max(...v);return a===b?[a/Math.sqrt(10),b*Math.sqrt(10)]:[a,b];}
function scale(domain,lo,hi,log=false){const fn=x=>log?Math.log10(x):x;const a=fn(domain[0]),b=fn(domain[1]);return x=>lo+(fn(x)-a)/(b-a)*(hi-lo);}
function ticks(domain,log=false){if(log){const out=[];for(let i=Math.ceil(Math.log10(domain[0]));i<=Math.floor(Math.log10(domain[1]));i++)out.push(10**i);return out.length?out:domain;}const span=domain[1]-domain[0],rough=span/5,power=10**Math.floor(Math.log10(rough)),ratio=rough/power,step=power*(ratio<=1?1:ratio<=2.5?2.5:ratio<=5?5:10);const out=[];for(let v=Math.ceil(domain[0]/step)*step;v<=domain[1]+step*1e-6&&out.length<12;v+=step)out.push(Math.abs(v)<step*1e-8?0:v);return out;}
function niceMagnitude(value){if(!value)return 0;const power=10**Math.floor(Math.log10(Math.abs(value))),mantissa=Math.abs(value)/power;return (value<0?-1:1)*power*([1,1.25,2,2.5,4,5,8,10].find(v=>v>=mantissa-1e-10)||10);}
function timeValue(value){if(num(value))return value;const m=/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(?:([zZ])|([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/.exec(String(value).trim());if(!m)return NaN;const h=Number(m[1]),minute=Number(m[2]),second=Number(m[3]||0),fraction=Number('0.'+(m[4]||'0'));if(h>24||minute>59||second>59||h===24&&(minute||second||fraction))return NaN;let n=h*3600000+minute*60000+second*1000+fraction*1000;if(m[6]){if(Number(m[7])>15||Number(m[8]||0)>59||Number(m[9]||0)>59)return NaN;n-=(m[6]==='-'?-1:1)*(Number(m[7])*3600+Number(m[8]||0)*60+Number(m[9]||0))*1000;}return n===86400000?86400000:((n%86400000)+86400000)%86400000;}

function clockTicks(domain){const span=domain[1]-domain[0],steps=[.001,.01,.1,1,10,100,250,500,1000,5000,15000,30000,60000,300000,900000,1800000,3600000,10800000,21600000,43200000,86400000],step=steps.find(v=>v>=span/6)||86400000,out=[];for(let v=Math.ceil(domain[0]/step)*step;v<=domain[1]&&out.length<14;v+=step)out.push(v);return out.length?out:domain;}
function timeLabel(value){if(Math.abs(value-86400000)<.0000001)return '24:00:00';const n=((Math.round(value*1000)/1000%86400000)+86400000)%86400000,h=Math.floor(n/3600000),m=Math.floor(n%3600000/60000),s=Math.floor(n%60000/1000),fraction=Math.round((n%1000)*1000);return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')+(fraction?'.'+String(fraction).padStart(6,'0').replace(/0+$/,''):'');}
function isTimeUTC(type){if(kind(type)==='datetime'&&!['date','1082'].includes(String(type).toLowerCase()))return true;return ['1266','timetz'].includes(String(type).toLowerCase())||/time.*with(?:out)? time zone/i.test(String(type))&&!/without/i.test(String(type));}
function categoryCompare(a,b){if(Array.isArray(a)&&Array.isArray(b)){for(let i=0;i<Math.min(a.length,b.length);i++){const n=categoryCompare(a[i],b[i]);if(n)return n;}return a.length-b.length;}if(a===b)return 0;if(a===null)return -1;if(b===null)return 1;if(typeof a==='number'&&typeof b==='number')return a-b;return String(a)<String(b)?-1:String(a)>String(b)?1:0;}
function xValue(v,c){if(v===null||v===undefined)return NaN;if(kind(c.x_type)==='time')return timeValue(v);if(kind(c.x_type)==='datetime'){const raw=String(v);return Date.parse(/^\d{4}-\d\d-\d\d[ T]\d/.test(raw)&&!/(?:Z|[+-]\d\d:\d\d)$/.test(raw)?raw+'Z':raw);}return Number(v);}

function timeTicks(domain){const span=domain[1]-domain[0],out=[];if(span>86400000*60){const step=span>86400000*730?12:span>86400000*240?3:1;const d=new Date(domain[0]);d.setUTCDate(1);d.setUTCHours(0,0,0,0);while(+d<domain[0])d.setUTCMonth(d.getUTCMonth()+step);while(+d<=domain[1]&&out.length<14){out.push(+d);d.setUTCMonth(d.getUTCMonth()+step);}}else{const steps=[1000,5000,15000,30000,60000,300000,900000,1800000,3600000,10800000,21600000,43200000,86400000,172800000,604800000,1209600000];const step=steps.find(s=>s>=span/6)||1209600000;for(let v=Math.ceil(domain[0]/step)*step;v<=domain[1]&&out.length<14;v+=step)out.push(v);}return out.length?out:domain;}
function xLabel(v,c,span=0){if(kind(c.x_type)==='time'&&num(v))return timeLabel(v);if(kind(c.x_type)==='datetime'&&num(v)){const d=new Date(v);return String(c.x_type).toLowerCase()==='date'||span>=86400000*2?d.toISOString().slice(span>86400000*365?0:5,10):new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}return String(v??'∅');}
function seriesColor(c,name,index,o){const p=c.data.find(p=>seriesOf(p,c)===name);return c._series_colors?.[name]||o.color_map?.[name]||c.measures?.[p?.measure||0]?.color||color(name,index,o);}

function tooltip(p,c){const o={...DEFAULT,...c.options};if(c.type==='boxplot')return p.group+'\nN: '+fmt(p.n)+'\nMean: '+fmt(p.mean,o)+'\nMedian: '+fmt(p.median,o)+'\nQ1 / Q3: '+fmt(p.q1,o)+' / '+fmt(p.q3,o)+'\nOutliers: '+fmt(p.outlier_count??'—')+(p.mild_outlier_count!=null?'\nMild / Extreme: '+fmt(p.mild_outlier_count)+' / '+fmt(p.extreme_outlier_count):'');if(c.type==='crosstable')return (p.r||[]).join(' / ')+' · '+(p.c||[]).join(' / ')+'\n'+label(c.measures?.[p.measure])+' = '+fmt(p.y,o)+'\nN: '+fmt(p.n);if(c.type==='mean_ci')return p.group+'\nMean: '+fmt(p.mean,o)+'\nCI: '+fmt(p.ci_low,o)+' – '+fmt(p.ci_high,o);return (num(p.x)?fmt(p.x):String(p.x))+'\n'+seriesOf(p,c)+': '+fmt(p.raw_y??p.y,o)+(Object.prototype.hasOwnProperty.call(p,'raw_y')?'\nNormalized: '+fmt(p.y,o)+'%':'')+'\nN: '+fmt(p.n??1)+(p.calculation_error?'\n'+p.calculation_error:'')+(c.line_column?'\nLine by '+c.line_column+': '+String(p.line_group??'∅'):'')+(c.scatter_mode==='aggregate'?'\nMarker by: '+(p.marker_values||[]).join(' / '):'')+(p.size!=null?'\nSize: '+fmt(p.size,o):'')+(p.rotation!=null?'\nRotation: '+fmt(p.rotation,o)+'°':'');}
function markAttrs(p,c){return ' data-v-point="'+p._index+'" tabindex="0" role="button" aria-label="'+E(tooltip(p,c).replace(/\n/g,' · '))+'"';}
function markerShape(o,p,shapes){return o.marker_shape==='automatic'?shapes.indexOf(String(p.shape??''))%4:['circle','square','triangle','diamond','arrow'].indexOf(o.marker_shape);}
function dot(shape,x,y,r,attr,fill,rotation=0){
 const transform=' transform="rotate('+rotation+' '+x+' '+y+')" data-v-rotation="'+rotation+'"';attr+=transform;
 if(shape===4)return '<path d="M'+(x-r*.38)+','+(y+r*1.2)+'v'+(-r*1.2)+'h'+(-r*.65)+'l'+r*1.03+','+(-r*1.5)+' '+r*1.03+','+r*1.5+'h'+(-r*.65)+'v'+r*1.2+'Z" fill="'+fill+'" '+attr+'/>';
if(shape===1)return '<rect x="'+(x-r)+'" y="'+(y-r)+'" width="'+2*r+'" height="'+2*r+'" fill="'+fill+'" '+attr+'/>';if(shape===2)return '<path d="M'+x+','+(y-r*1.3)+'l'+r*1.3+','+r*2.6+'h'+(-r*2.6)+'Z" fill="'+fill+'" '+attr+'/>';if(shape===3)return '<path d="M'+x+','+(y-r*1.3)+'l'+r*1.3+','+r*1.3+' '+(-r*1.3)+','+r*1.3+' '+(-r*1.3)+','+(-r*1.3)+'Z" fill="'+fill+'" '+attr+'/>';return '<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'" '+attr+'/>';}

function statistics(c){if(c.type!=='boxplot'||c.options?.statistics===false)return '';return '<div class="dtv-stat-scroll"><table class="dtv-stat"><thead><tr>'+['Category','Count','Mean','StdDev','Min','Q1','Median','Q3','Max','Outliers'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+c.data.map(p=>'<tr>'+[p.group,p.n,p.mean,p.sd,p.min,p.q1,p.median,p.q3,p.max,p.outlier_count].map(v=>'<td>'+E(fmt(v,c.options))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function crossHTML(c){
 const o={...DEFAULT,...c.options},d=measured(c),rn=c.rows?.length||0,cn=c.columns?.length||0,index=new Map(d.map(p=>[key([p.r,p.c,p.measure]),p]));
 let rs=[...new Set(d.map(p=>key(p.r)))].map(JSON.parse),cs=[...new Set(d.map(p=>key(p.c)))].map(JSON.parse);
 const visible=(x,n,axis)=>x.length===n||(x.length===0?o.totals&&o['totals_'+axis]:o.subtotals&&o['subtotals_'+axis]&&(o['subtotal_'+axis+'_levels']==null||o['subtotal_'+axis+'_levels'].includes(x.length))),compareValues=(a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a??'').localeCompare(String(b??''),undefined,{numeric:false});
 const score=(prefix,axis)=>{const p=index.get(key([axis==='rows'?prefix:o.cross_sort_prefix||[],axis==='columns'?prefix:o.cross_sort_prefix||[],Number(o.sort_measure||0)]));if(num(p?.y))return p.y;if(c.rollups_complete||o.totals_mode==='source')return null;const leaves=d.filter(q=>q.rl===rn&&q.cl===cn&&(q.measure||0)===Number(o.sort_measure||0)&&prefix.every((v,i)=>key(v)===key((axis==='rows'?q.r:q.c)[i]))).map(q=>q.y).filter(num);return leaves.length?leaves.reduce((a,b)=>a+b,0):null;};
 const cmp=axis=>(a,b)=>{if(!a.length)return b.length?1:0;if(!b.length)return -1;for(let i=0;i<Math.min(a.length,b.length);i++)if(key(a[i])!==key(b[i])){if(o.sort!=='category'&&o.cross_sort_axis===axis&&i===(axis==='rows'?rn:cn)-1){const av=score(a.slice(0,i+1),axis),bv=score(b.slice(0,i+1),axis);if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;const diff=(av??0)-(bv??0);if(diff)return diff*(o.sort==='value_desc'?-1:1);}return compareValues(a[i],b[i]);}return (b.length-a.length)*(o.subtotal_position==='before'?-1:1);};
 const globalRows=o.cross_sort_mode==='global'&&o.cross_sort_axis==='rows'&&o.sort!=='category';
 const globalCmp=(a,b)=>{if(!a.length)return 1;if(!b.length)return -1;const av=score(a,'rows'),bv=score(b,'rows');if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;return ((av??0)-(bv??0))*(o.sort==='value_desc'?-1:1)||cmp('rows')(a,b);};
 rs=rs.filter(r=>globalRows?r.length===rn||r.length===0&&o.totals&&o.totals_rows:visible(r,rn,'rows')).sort(globalRows?globalCmp:cmp('rows'));cs=cs.filter(col=>visible(col,cn,'columns')).sort(cmp('columns'));
 const fold=collapsed.get(view?.id)||new Set();rs=rs.filter(r=>![...fold].some(k=>{const a=JSON.parse(k);return r.length>a.length&&a.every((v,i)=>key(v)===key(r[i]));}));
 const measureAxis=o.cross_measure_axis||'columns',measurePos=Math.min(o.cross_measure_position??6,(c[measureAxis]||[]).length);
 // Only presentation expands the virtual measure dimension. Aggregate keys stay r/c/measure.
 function entries(values,axis,n){const withMeasures=measureAxis===axis,list=[];for(const dims of values)for(let mi=0;mi<(withMeasures?c.measures.length:1);mi++){
  const tokens=Array.from({length:withMeasures?n:Math.max(1,n)},(_,i)=>i<dims.length?String(dims[i]??'∅'):i===dims.length?(dims.length?'Subtotal':'Grand Total'):'');
  const tokenKeys=Array.from({length:withMeasures?n:Math.max(1,n)},(_,i)=>i<dims.length?key(['value',dims[i]]):key(['total',dims.length,i]));
  if(withMeasures){tokens.splice(measurePos,0,label(c.measures[mi]));tokenKeys.splice(measurePos,0,key(['measure',mi]));}
  list.push({dims,mi,tokens,tokenKeys});
 }
 if(withMeasures&&!(globalRows&&axis==='rows'))list.sort((a,b)=>{if(measurePos===0)return a.mi-b.mi||cmp(axis)(a.dims,b.dims);const ap=a.dims.slice(0,measurePos),bp=b.dims.slice(0,measurePos),prefix=cmp(axis)(ap,bp);return prefix||a.mi-b.mi||cmp(axis)(a.dims,b.dims);});return list;}
 const rowEntries=entries(rs,'rows',rn),colEntries=entries(cs,'columns',cn),rowDepth=rowEntries[0]?.tokens.length||1,colDepth=colEntries[0]?.tokens.length||1,ext=extent(d.filter(p=>p.rl===rn&&p.cl===cn).map(p=>p.y));
 const names=axis=>{const list=(c[axis]||[]).length?[...c[axis]]:measureAxis===axis?[]:[''];if(measureAxis===axis)list.splice(measurePos,0,'(Column Names)');return list;},rowNames=names('rows'),colNames=names('columns'),prefixKey=(entry,level)=>key(entry.tokenKeys.slice(0,level+1));
 const f=view?.f,editable=f&&view?.g?.origin_type!=='api';let out=editable?'<div class="dtv-cross-frame">'+axisZone(f,'columns','Horizontal / X')+axisZone(f,'rows','Vertical / Y')+'<div class="dtv-cross-body">':'';
 out+='<div class="dtv-cross-caption"><span>Totals: '+(o.totals_mode==='display_cells'?'Sum of cell values':'Source aggregation')+'</span><span>Column Names: '+(measureAxis==='rows'?'Vertical':'Horizontal')+' · Alt+click header: mark hierarchy</span></div><div class="dtv-cross-wrap"><table class="dtv-cross" style="--cross-row:'+o.cross_row_height+'px;--cross-col:'+o.cross_column_width+'px;--cross-align:'+o.cross_align+';--cross-head:'+o.cross_header_color+';--cross-total:'+o.cross_total_color+'"><thead>';
 for(let level=0;level<colDepth;level++){
  out+='<tr data-v-header-level="'+level+'">';if(level===0)for(let ri=0;ri<rowDepth;ri++)out+='<th class="dtv-rowhead" rowspan="'+colDepth+'" data-v-row-dimension="'+E(rowNames[ri]||'')+'">'+E(rowNames[ri]||'Rows')+'</th>';
  for(let i=0;i<colEntries.length;){const entry=colEntries[i],pk=prefixKey(entry,level);let j=i+1;while(j<colEntries.length&&prefixKey(colEntries[j],level)===pk)j++;
   const isMeasure=measureAxis==='columns'&&level===measurePos,caption=entry.tokens[level],prefix=entry.dims.slice(0,Math.min(entry.dims.length,level-(measureAxis==='columns'&&level>=measurePos?1:0)+1));out+='<th colspan="'+(j-i)+'" data-v-col-prefix="'+E(key(prefix))+'" '+(measureAxis==='columns'&&level>=measurePos?'data-v-cross-measure="'+entry.mi+'" ':'')+'data-v-column-dimension="'+E(colNames[level]||'')+'" style="top:'+(level*34)+'px;'+crossStyle(c,'column_header',null,prefix,measureAxis==='columns'?entry.mi:null)+'">'+(isMeasure?'<button data-v-cross-sort="'+entry.mi+'" title="Sort by '+E(caption)+'">'+E(caption)+' ↕</button>':E(caption))+'</th>';i=j;
  }out+='</tr>';
 }
 out+='</thead><tbody>';
 for(let ri=0;ri<rowEntries.length;ri++){const row=rowEntries[ri],r=row.dims;out+='<tr class="'+(!r.length&&rn?'dtv-total':r.length<rn?'dtv-subtotal':'')+'">';
  for(let level=0;level<rowDepth;level++){const pk=prefixKey(row,level);if(!globalRows&&ri&&prefixKey(rowEntries[ri-1],level)===pk)continue;let end=ri+1;while(!globalRows&&end<rowEntries.length&&prefixKey(rowEntries[end],level)===pk)end++;const isMeasure=measureAxis==='rows'&&level===measurePos,caption=row.tokens[level],realLevel=level-(measureAxis==='rows'&&level>=measurePos?1:0),prefix=r.slice(0,realLevel+1);out+='<td class="dtv-rowhead" rowspan="'+(end-ri)+'" data-v-row-prefix="'+E(key(prefix))+'" '+(measureAxis==='rows'&&level>=measurePos?'data-v-cross-measure="'+row.mi+'" ':'')+'data-v-row-level="'+level+'" style="'+crossStyle(c,'row_header',prefix,null,measureAxis==='rows'?row.mi:null)+'">'+(isMeasure?'<button data-v-cross-sort="'+row.mi+'">'+E(caption)+' ↕</button>':(r.length&&r.length<rn&&realLevel===r.length?'<button data-v-fold="'+E(key(r))+'">'+(fold.has(key(r))?'▸':'▾')+'</button>':'')+E(caption))+'</td>';}
  for(const column of colEntries){const mi=measureAxis==='rows'?row.mi:column.mi,p=index.get(key([r,column.dims,mi])),v=p?.y,alpha=num(v)?Math.max(.05,Math.min(.4,.05+.35*(v-ext[0])/(ext[1]-ext[0]))):0,heat=' style="'+(o.heat&&num(v)?'background:rgba(90,143,190,'+alpha+');':'')+crossStyle(c,'cell',r,column.dims,mi)+'"';out+='<td'+heat+(p?markAttrs(p,c):'')+'>'+E(v==null?(o.empty==='zero'?'0':'—'):fmt(v,o))+'</td>';}
  out+='</tr>';
 }
 out+='</tbody></table></div>';return out+(editable?'</div>'+axisZone(f,'values','Cell values')+'</div>':'');
}

function chartFallbackHTML(c){
 if(!c?.data?.length)return '<div class="dtv-empty" data-v-empty="'+E(c?.empty_reason||'no_data')+'"><p>'+E(c?.empty_reason==='filtered_out'?'필터 조건에 맞는 행이 없습니다. Filters에서 조건을 바꾸거나 초기화하세요.':c?.empty_reason==='no_valid_values'?'선택한 축에 표시할 유효한 값이 없습니다.':'표시할 그래프 데이터가 없습니다.')+'</p></div>';if(c.type==='crosstable')return crossHTML(c);
 return '<div class="dtv-auto-message" role="alert"><p>그래프는 Apache ECharts로만 그립니다. 차트를 다시 계산하거나 연결 HTML을 서버에서 다시 열어 주세요.</p></div>';
}
const COLUMN_NAMES='__dt_column_names__';
function axisDimensions(f,axis){const a=[...(f[axis==='x'?'x_columns':axis]||[])];if(f.chart_type==='crosstable'&&f.options.cross_measure_axis===axis)a.splice(Math.min(f.options.cross_measure_position,a.length),0,COLUMN_NAMES);return a;}
function setAxisDimensions(f,axis,items){if(f.axis_hierarchies)delete f.axis_hierarchies[axis];if(f.chart_type==='crosstable')f.options.cross_sort_prefix=[];const slot=axis==='x'?'x_columns':axis,position=items.indexOf(COLUMN_NAMES);f[slot]=items.filter(n=>n!==COLUMN_NAMES);if(position>=0){f.options.cross_measure_axis=axis;f.options.cross_measure_position=position;}else if(f.chart_type==='crosstable'&&f.options.cross_measure_axis===axis){f.options.cross_measure_axis='columns';f.options.cross_measure_position=f.columns.length;}if(axis==='x')f.x=f.x_columns[0];if(f.chart_type==='crosstable'){f.x=f.rows[0]||f.columns[0]||null;f.x_columns=f.rows.length?[...f.rows]:[...f.columns];}}
function dimTitle(n){return n===COLUMN_NAMES?'(Column Names)':n;}

function aggregationPicker(metric,index){
 const items=AGG_MENU.filter(([a])=>a!=='cumulative_sum'||['bar','line','combination'].includes(view.f.chart_type));
 const item=(a,n)=>'<button role="menuitemradio" aria-checked="'+(metric.aggregation===a)+'" data-v-agg-choice="'+a+'"><span class="dtv-check">'+(metric.aggregation===a?'✓':'')+'</span>'+E(n)+'</button>';
 return '<div class="dtv-aggregation"><button class="dtv-aggregation-select" data-v-agg-toggle aria-haspopup="menu" aria-expanded="false"><span>'+E(AGGS[metric.aggregation])+'</span><i>▾</i></button><div class="dtv-aggregation-menu" role="menu" hidden>'+items.map(([a,n])=>item(a,n)).join('')+'<button data-v-agg-more aria-expanded="false">More <span class="dtv-sub-arrow">▸</span></button><div class="dtv-aggregation-more" hidden>'+[['count_rows','Count() (all rows)'],['q1','Q1 (First Quartile)'],['q3','Q3 (Third Quartile)']].map(([a,n])=>item(a,n)).join('')+'</div></div></div>';
}
async function setAggregation(value){
 if(!popup)return;const f=ensureDraft(),target=popup.dataset.target,i=Number(target.slice(1)),pending=popup._pendingMetric,m=pending||f.measures[i];if(!m)return;
 const r=popup.getBoundingClientRect(),mode=popup.dataset.mode,ix=popup.dataset.index;
 resetAutoLabel(m);m.aggregation=value;if(value!=='mean')f.options.error_bars='none';
 if(value==='cumulative_sum'){f.options.sort='category';}
 if(value==='count_rows')m.column=null;else if(!['count','distinct'].includes(value)&&kind(tableCols(view.source).find(c=>c.name===m.column)?.type)!=='number')m.column=null;
 if(pending&&value==='count_rows'){f.measures.push({...pending});finishAxisChange();return;}
 if(!pending)H.render();
 await pickAxis(target,{getBoundingClientRect:()=>({...r,bottom:r.top-6})},mode,ix);
}
const TIME_UNITS=[['year','Year'],['quarter','Quarter'],['month','Month'],['week','ISO Week'],['day','Day'],['hour','Hour']];
let featureEditor=null,domainSequence=0,markRequest=null;
const filterDomains=new Map(),exactMarks=new Map();
function editor(){const source=key([refOf(view?.source),view?.source?.version]);if(featureEditor?.source!==source)featureEditor={source,column:tableCols(view.source)[0]?.name,mode:'values',query:'',min:'',max:'',values:'',include_empty:false,columns:[],paths:[],axis:'x',styleTarget:'cell'};return featureEditor;}
function filterId(q){return q.mode==='hierarchy'?'h:'+key(q.columns):'c:'+q.column;}
function filterLabel(q){if(q.mode==='range')return String(q.min??'−∞')+' ≤ value ≤ '+String(q.max??'+∞')+(q.include_empty?' · (Empty)':'');if(q.mode==='text')return q.query+(q.include_empty?' · (Empty)':'');if(q.mode==='hierarchy')return q.paths.map(p=>p.map(v=>v??'(Empty)').join(' → ')).join(', ');return q.values.map(v=>v??'(Empty)').join(', ');}
function filterDomainKey(){const ed=editor(),q=ed.mode==='hierarchy'?{mode:'hierarchy',columns:ed.columns}:{column:ed.column};return stableJSON([ed.source,ed.mode,ed.columns,ed.column,(view.f.filters||[]).filter(x=>filterId(x)!==filterId(q))]);}
function currentDomain(){return filterDomains.get(filterDomainKey());}
function selectedPath(path,paths){return paths.some(p=>p.length<=path.length&&p.every((v,i)=>key(v)===key(path[i])));}
function treeHTML(domain){const ed=editor(),all=domain?.paths||[],search=ed.treeSearch?.toLocaleLowerCase()||'';function children(parent){return all.filter(p=>p.length===parent.length+1&&parent.every((v,i)=>key(v)===key(p[i])));}function node(p){const kids=children(p),title=p.at(-1)??'(Empty)',match=!search||p.some(v=>String(v??'').toLocaleLowerCase().startsWith(search))||all.some(q=>selectedPath(q,[p])&&q.some(v=>String(v??'').toLocaleLowerCase().startsWith(search)));if(!match)return '';const label='<label><input type="checkbox" data-v-tree-path="'+E(key(p))+'" '+(selectedPath(p,ed.paths)?'checked':'')+'>'+E(title)+'</label>';return kids.length?'<details open><summary>'+label+'</summary><div>'+kids.map(node).join('')+'</div></details>':'<div class="dtv-tree-leaf">'+label+'</div>';}return '<div class="dtv-filter-tree">'+children([]).map(node).join('')+'</div>';}
function filterContents(){
 const ed=editor(),cols=tableCols(view.source),type=kind(cols.find(c=>c.name===ed.column)?.type),domain=currentDomain();
 let s='<p class="dtv-help">필터는 전체 원본 행에 적용됩니다. 같은 테이블·버전의 차트에 공유합니다.</p>'+(view.f.filters||[]).map((q,i)=>'<div class="dtv-filter-row"><button data-v-filter-edit="'+i+'">'+E(q.column||q.columns.join(' → '))+'</button><span>'+E(filterLabel(q))+'</span><button data-v-filter-remove="'+i+'">×</button></div>').join('');
 s+='<label class="dtv-prop">Filter type<select id="dtv-filter-mode">'+[['values','Checkbox / list values'],['range','Range'],['text','Text'],['hierarchy','Hierarchy']].map(([v,t])=>'<option value="'+v+'" '+(ed.mode===v?'selected':'')+'>'+t+'</option>').join('')+'</select></label>';
 if(ed.mode!=='hierarchy')s+='<label class="dtv-prop">Column<select id="dtv-filter-column">'+cols.map(c=>'<option '+(c.name===ed.column?'selected':'')+'>'+E(c.name)+'</option>').join('')+'</select></label>';
 if(ed.mode==='values')s+='<label class="dtv-prop">Values (one per line)<textarea id="dtv-filter-values" rows="4">'+E(ed.values)+'</textarea></label><button data-v-filter-domain>Load values from full data</button>'+(domain?.values?'<input id="dtv-domain-search" placeholder="Search values" value="'+E(ed.valueSearch||'')+'"><div class="dtv-value-list">'+domain.values.filter(v=>String(v??'').toLocaleLowerCase().includes((ed.valueSearch||'').toLocaleLowerCase())).slice(0,1000).map(v=>'<label><input type="checkbox" data-v-domain-value="'+E(key(v))+'" '+((v===null?ed.include_empty:ed.values.split(/\r?\n/).includes(v===''?'""':String(v)))?'checked':'')+'>'+E(v===null?'(Empty)':v===''?'(Empty string)':v)+'</label>').join('')+'</div><small>전체 '+domain.values.length+'개 값 · 검색 결과는 한 번에 최대 1,000개 표시</small>':'');
 if(ed.mode==='range')s+='<div class="dtv-range-inputs"><label>Minimum<input id="dtv-filter-min" type="'+(type==='number'?'number':String(cols.find(c=>c.name===ed.column)?.type).toLowerCase()==='date'?'date':'datetime-local')+'" step="any" value="'+E(ed.min)+'"></label><label>Maximum<input id="dtv-filter-max" type="'+(type==='number'?'number':String(cols.find(c=>c.name===ed.column)?.type).toLowerCase()==='date'?'date':'datetime-local')+'" step="any" value="'+E(ed.max)+'"></label></div>'+(type==='number'?'<button data-v-filter-domain>Load full range</button>':'<p class="dtv-help">시작·종료 시각은 UTC+09:00 기준이며 양끝을 포함합니다.</p>')+(domain?.range?'<div class="dtv-filter-ranges">'+['min','max'].map(n=>'<label>'+n+'<input type="range" data-v-filter-range="'+n+'" min="'+domain.range[0]+'" max="'+domain.range[1]+'" step="any" value="'+(ed[n]!==''?Number(ed[n]):domain.range[n==='min'?0:1])+'"></label>').join('')+'</div>':'');
 if(ed.mode==='text')s+='<label class="dtv-prop">Search text<input id="dtv-filter-query" value="'+E(ed.query)+'" placeholder="MEQP01 OR MEQP02"></label><p class="dtv-help">대소문자를 구분하지 않습니다. 공백은 AND, OR은 둘 중 하나, *는 와일드카드, "구문"은 정확한 문자열 검색입니다. 일반 단어는 앞부분부터 일치합니다.</p>';
 if(ed.mode==='hierarchy')s+='<p>계층 순서: '+E(ed.columns.join(' → ')||'컬럼을 순서대로 선택하세요')+'</p><div class="dtv-hierarchy-columns">'+cols.map(c=>'<label><input type="checkbox" data-v-hierarchy-column="'+E(c.name)+'" '+(ed.columns.includes(c.name)?'checked':'')+'>'+E(c.name)+'</label>').join('')+'</div><button data-v-filter-domain '+(!ed.columns.length?'disabled':'')+'>Load hierarchy from full data</button><input id="dtv-tree-search" placeholder="Search hierarchy" value="'+E(ed.treeSearch||'')+'">'+treeHTML(domain);
 if(ed.mode!=='hierarchy')s+='<label class="dtv-prop"><input id="dtv-filter-null" type="checkbox" '+(ed.include_empty?'checked':'')+'>Include (Empty)</label>';
 return s+'<p class="dtv-help" id="dtv-filter-domain-status">'+E(domain?.message||'')+'</p><button data-v-filter-apply>Apply filter</button><button data-v-filter-clear>Reset all filters</button>';
}
async function loadFilterDomain(){
 const ed=editor(),domainKey=filterDomainKey(),generation=++domainSequence,col=tableCols(view.source).find(c=>c.name===ed.column),filter={mode:ed.mode,column:ed.column,columns:ed.columns};
 const f={source_ref:refOf(view.source),source_version:view.source.version,workspace_id:H.model.current.id,query_id:H.uuid(),scope:'full',filters:(view.f.filters||[]).filter(q=>filterId(q)!==filterId(filter)),chart_type:'crosstable',rows:ed.mode==='hierarchy'?ed.columns:[ed.column],columns:[],measures:[{aggregation:'count_rows'}]};
 if(ed.mode==='range'){if(kind(col?.type)!=='number'){H.toast('숫자 컬럼을 선택하세요. 날짜 범위는 달력으로 입력합니다.');return;}Object.assign(f,{chart_type:'bar',x_columns:[],measures:[{column:ed.column,aggregation:'min'},{column:ed.column,aggregation:'max'}]});}
 filterDomains.set(domainKey,{message:'전체 원본의 값 목록을 계산 중…'});renderProperties();
 try{const r=await H.api('/graph/render',f);if(generation!==domainSequence||!view||filterDomainKey()!==domainKey)return;const c=r.chart,entry={message:'전체 원본 '+fmt(c.source_input_rows??c.input_rows)+'행에서 계산했습니다.'};if(ed.mode==='range')entry.range=c.data.map(p=>p.y).filter(num);else if(ed.mode==='hierarchy')entry.paths=c.data.filter(p=>p.r?.length&&p.cl===0).map(p=>p.r);else entry.values=c.data.filter(p=>p.rl===1&&p.cl===0).map(p=>p.r[0]);filterDomains.set(domainKey,entry);}
 catch(e){filterDomains.set(domainKey,{message:'목록을 만들 수 없습니다: '+e.message+' 값이 많으면 텍스트 또는 범위 필터를 사용하세요.'});}
 if(view&&filterDomainKey()===domainKey&&document.getElementById('dtv-properties')?.open)renderProperties();
}
function applyFilterEditor(){
 const ed=editor(),type=kind(tableCols(view.source).find(c=>c.name===ed.column)?.type);let q;
 const convert=v=>{if(type==='string'&&v==='""')return '';if(type==='number'){const n=Number(v);if(!Number.isFinite(n))throw Error('숫자를 입력하세요.');return n;}if(type==='boolean'){if(!['true','false'].includes(v.trim().toLowerCase()))throw Error('Boolean 값은 true 또는 false를 입력하세요.');return v.trim().toLowerCase()==='true';}return v;};
 try{
  if(ed.mode==='values'){const values=ed.values.split(/\r?\n/).filter(v=>['number','boolean'].includes(type)?v.trim()!=='':v!=='').map(convert);if(ed.include_empty)values.push(null);q={column:ed.column,values};}
  if(ed.mode==='text'){if(type!=='string')throw Error('Text 필터는 문자열 컬럼을 선택하세요.');q={column:ed.column,mode:'text',query:ed.query,include_empty:ed.include_empty};}
  if(ed.mode==='range'){if(!['number','datetime'].includes(type))throw Error('Range 필터는 숫자 또는 날짜·시간 컬럼을 선택하세요.');const bound=v=>v===''?null:type==='number'?convert(v):v.includes('T')?v+'+09:00':v;q={column:ed.column,mode:'range',min:bound(ed.min),max:bound(ed.max),include_empty:ed.include_empty};if(q.min!=null&&q.max!=null&&(type==='number'?q.min>q.max:Date.parse(q.min)>Date.parse(q.max)))throw Error('Minimum은 Maximum보다 클 수 없습니다.');}
  if(ed.mode==='hierarchy'){if(!ed.columns.length)throw Error('계층 컬럼을 선택하세요.');q={mode:'hierarchy',columns:clone(ed.columns),paths:clone(ed.paths)};}
  commitFilters([...(view.f.filters||[]).filter(x=>filterId(x)!==filterId(q)),q]);
 }catch(e){H.toast(e.message);}
}
function hierarchyControls(){
 const f=view.f,axes=f.chart_type==='crosstable'?['rows','columns']:f.chart_type==='scatter'?[]:['x'];let s='<h4>Hierarchy</h4>';
 for(const axis of axes){const cols=axis==='x'?f.x_columns:f[axis],h=f.axis_hierarchies?.[axis];s+='<div class="dtv-measure"><b>'+E(axis.toUpperCase())+'</b>'+(h?'<label>'+E(h.name)+' · '+h.depth+' / '+h.columns.length+'<input type="range" min="1" max="'+h.columns.length+'" value="'+h.depth+'" data-v-hierarchy-depth="'+axis+'"></label><button data-v-hierarchy-remove="'+axis+'">Ungroup hierarchy</button>':'<input id="dtv-hierarchy-name-'+axis+'" placeholder="Hierarchy name"><button data-v-hierarchy-create="'+axis+'" '+(cols.length<2?'disabled':'')+'>Create from axis columns</button>');
 const saved=[...H.model.cache.values()].flatMap(w=>w.graphs||[]).filter(g=>g.source_ref===refOf(view.source)&&g.source_version===view.source.version).flatMap(g=>Object.values(g.spec?.axis_hierarchies||{}));if(saved.length)s+='<label>Reuse saved hierarchy<select data-v-hierarchy-reuse="'+axis+'"><option value="">Select…</option>'+saved.map(h=>'<option value="'+E(key(h))+'">'+E(h.name+' · '+h.columns.join(' → '))+'</option>').join('')+'</select></label>';
 s+='</div>';}
 const dates=[...new Set(axes.flatMap(a=>a==='x'?f.x_columns:f[a]))].filter(n=>kind(tableCols(view.source).find(c=>c.name===n)?.type)==='datetime');
 for(const name of dates){const t=f.time_transforms?.[name];s+='<div class="dtv-measure"><b>'+E(name)+'</b><label>Time hierarchy<select data-v-time-unit="'+E(name)+'"><option value="">Raw values</option>'+TIME_UNITS.map(([u,l])=>'<option value="'+u+'" '+(t?.unit===u?'selected':'')+'>'+l+'</option>').join('')+'</select></label><label>Time zone<select data-v-time-zone="'+E(name)+'"><option value="540" '+(t?.offset_minutes!==0?'selected':'')+'>UTC+09:00</option><option value="0" '+(t?.offset_minutes===0?'selected':'')+'>UTC</option></select></label>'+(t?'<input aria-label="Time hierarchy depth" type="range" min="0" max="5" value="'+TIME_UNITS.findIndex(([u])=>u===t.unit)+'" data-v-time-depth="'+E(name)+'">':'')+'</div>';}
 return s;
}
function applyHierarchies(f){for(const [axis,h] of Object.entries(f.axis_hierarchies||{})){f[axis==='x'?'x_columns':axis]=h.columns.slice(0,h.depth);if(axis==='x')f.x=f.x_columns[0];}return f;}
function crossStyle(c,target,row,column,measure){const styles=c.options?.cross_styles||[],rn=c.rows?.length||0,cn=c.columns?.length||0;let out={};for(const q of styles){const total=target==='cell'&&(rn&&row?.length===0||cn&&column?.length===0),sub=target==='cell'&&!total&&(row?.length<rn||column?.length<cn);if(q.target!==target&&!(q.target==='grand_total'&&total)&&!(q.target==='subtotal'&&sub))continue;if(q.row&&key(q.row)!==key(row)||q.column&&key(q.column)!==key(column)||q.measure!=null&&q.measure!==measure)continue;out={...out,...q};}return ['color','background','bold','italic','align','font_size'].filter(k=>out[k]!==undefined).map(k=>({'color':'color:'+out.color,'background':'background:'+out.background,'bold':'font-weight:'+(out.bold?'700':'400'),'italic':'font-style:'+(out.italic?'italic':'normal'),'align':'text-align:'+out.align,'font_size':'font-size:'+out.font_size+'px'})[k]).join(';');}
function crossStyleControls(){const ed=editor(),c=view.displayChart||view.g?.chart,d=c?.data||[],t=ed.styleTarget;let s='<h4>Individual formatting</h4><label>Target<select id="dtv-style-target">'+[['cell','Cell'],['row_header','Row header'],['column_header','Column header'],['subtotal','Subtotal values'],['grand_total','Grand total values']].map(([v,l])=>'<option value="'+v+'" '+(t===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';let entries=[];if(t==='cell')entries=d.filter(p=>p.rl===(c.rows?.length||0)&&p.cl===(c.columns?.length||0)).map(p=>({selector:{row:p.r,column:p.c,measure:p.measure},name:[p.r.join(' / '),p.c.join(' / '),label(c.measures[p.measure])].filter(Boolean).join(' · ')}));if(t==='row_header'||t==='column_header'){const k=t==='row_header'?'r':'c';entries=[...new Map(d.map(p=>[key(p[k]),p[k]])).values()].map(p=>({selector:{[k==='r'?'row':'column']:p},name:p.join(' / ')||'Grand Total'}));}if(entries.length)s+='<label>Value<select id="dtv-style-value">'+entries.slice(0,1000).map(e=>'<option value="'+E(key(e.selector))+'">'+E(e.name)+'</option>').join('')+'</select></label>';s+='<label>Text<input id="dtv-style-color" type="color" value="#333e49"></label><label>Background<input id="dtv-style-bg" type="color" value="#ffffff"></label><label><input type="checkbox" id="dtv-style-bold">Bold</label><label><input type="checkbox" id="dtv-style-italic">Italic</label><label>Size<input id="dtv-style-size" type="number" min="9" max="24" value="12"></label><label>Alignment<select id="dtv-style-align"><option>right</option><option>left</option><option>center</option></select></label><button data-v-style-apply>Apply formatting</button><button data-v-style-clear>Clear individual formatting</button><p>'+((view.f.options.cross_styles||[]).length)+' saved rules</p>';return s;}
function subtotalControls(){const f=view.f;return propControl('subtotal_position','Subtotal position','select',[['before','Before values'],['after','After values']])+['rows','columns'].map(axis=>'<fieldset><legend>'+axis+' subtotal levels</legend>'+f[axis].slice(0,-1).map((n,i)=>'<label><input type="checkbox" data-v-subtotal-level="'+axis+':'+(i+1)+'" '+(f.options['subtotal_'+axis+'_levels']==null||f.options['subtotal_'+axis+'_levels'].includes(i+1)?'checked':'')+'>'+E(n)+'</label>').join('')+'</fieldset>').join('');}
function resolveRelatedMarking(shared,c){
 if(!view?.g||!H?.api||!TYPES.includes(c.type)||!view.displayChart)return;const id=vStateId(),requestKey=stableJSON([id,shared.descriptors]);
 if(exactMarks.has(requestKey)){marks.set(id,new Set(exactMarks.get(requestKey)));return;}
 if(markRequest?.key===requestKey)return;if(markRequest){markRequest.controller.abort();H.api('/cancel',{query_id:markRequest.query_id}).catch(()=>{});}
 if(!shared.descriptors.length){marks.set(id,new Set());exactMarks.set(requestKey,[]);return;}
 const controller=new AbortController(),query_id=H.uuid(),request=markRequest={key:requestKey,id,controller,query_id};
 const body={...clone(view.f),source_ref:refOf(view.source),source_version:view.source.version,workspace_id:H.model.current.id,scope:c.scope==='preview'?'preview':'full',marking:shared.descriptors,query_id};
 H.api('/graph/render',body,{signal:controller.signal}).then(r=>{if(markRequest!==request||controller.signal.aborted)return;markRequest=null;if(vStateId()!==id||r.chart.snapshot_id!==c.snapshot_id)return;const matched=r.chart.data.flatMap((p,i)=>p.marked_rows>0?[i]:[]);exactMarks.set(requestKey,matched);if(exactMarks.size>32)exactMarks.delete(exactMarks.keys().next().value);marks.set(id,new Set(matched));updateMarking();}).catch(e=>{if(markRequest===request)markRequest=null;if(!controller.signal.aborted)H.toast('마킹 연결을 확인하지 못했습니다: '+e.message);});
}
function featureClick(b){
 const ed=view?editor():null;
 if(b.dataset.vFilterDomain!==undefined){loadFilterDomain();return true;}
 if(b.dataset.vFilterApply!==undefined){applyFilterEditor();return true;}
 if(b.dataset.vFilterEdit!==undefined){const q=view.f.filters[Number(b.dataset.vFilterEdit)],bound=v=>typeof v==='string'&&v.includes('T')?new Date(Date.parse(v)+9*3600000).toISOString().slice(0,19):v??'';Object.assign(ed,{mode:q.mode||'values',column:q.column||ed.column,columns:q.columns||[],paths:q.paths||[],query:q.query||'',min:bound(q.min),max:bound(q.max),values:(q.values||[]).filter(v=>v!==null).map(v=>v===''?'""':v).join('\n'),include_empty:q.include_empty||(q.values||[]).includes(null)});renderProperties();return true;}
 if(b.dataset.vHierarchyCreate!==undefined){const axis=b.dataset.vHierarchyCreate,f=ensureDraft(),columns=f[axis==='x'?'x_columns':axis];f.axis_hierarchies={...f.axis_hierarchies,[axis]:{name:document.getElementById('dtv-hierarchy-name-'+axis)?.value||columns.join(' → '),columns:[...columns],depth:columns.length}};H.render();renderProperties();return true;}
 if(b.dataset.vHierarchyRemove!==undefined){const f=ensureDraft();delete f.axis_hierarchies[b.dataset.vHierarchyRemove];H.render();renderProperties();return true;}
 if(b.dataset.vStyleApply!==undefined){const f=ensureDraft(),value=document.getElementById('dtv-style-value'),q={target:ed.styleTarget,...(value?JSON.parse(value.value):{}),color:document.getElementById('dtv-style-color').value,background:document.getElementById('dtv-style-bg').value,bold:document.getElementById('dtv-style-bold').checked,italic:document.getElementById('dtv-style-italic').checked,font_size:Number(document.getElementById('dtv-style-size').value),align:document.getElementById('dtv-style-align').value};if(!Number.isInteger(q.font_size)||q.font_size<9||q.font_size>24){H.toast('글자 크기는 9~24 사이 정수입니다.');return true;}const id=s=>key([s.target,s.row,s.column,s.measure]);const rules=[...(f.options.cross_styles||[]).filter(s=>id(s)!==id(q)),q];if(rules.length>100){H.toast('개별 서식은 최대 100개입니다.');return true;}f.options.cross_styles=rules;H.render();renderProperties();return true;}
 if(b.dataset.vStyleClear!==undefined){ensureDraft().options.cross_styles=[];H.render();renderProperties();return true;}
 return false;
}
function featureInput(el){if(!view)return;const ed=editor(),ids={'dtv-filter-values':'values','dtv-filter-query':'query','dtv-filter-min':'min','dtv-filter-max':'max'};if(ids[el.id])ed[ids[el.id]]=el.value;if(el.dataset.vFilterRange){ed[el.dataset.vFilterRange]=el.value;document.getElementById('dtv-filter-'+el.dataset.vFilterRange).value=el.value;}if(el.id==='dtv-tree-search'||el.id==='dtv-domain-search'){const field=el.id==='dtv-tree-search'?'treeSearch':'valueSearch',id=el.id,start=el.selectionStart;ed[field]=el.value;renderProperties();const next=document.getElementById(id);next?.focus();next?.setSelectionRange(start,start);}}
function featureChange(el){
 if(!view)return false;const ed=editor();
 if(el.id==='dtv-filter-column'||el.id==='dtv-filter-mode'){ed[el.id==='dtv-filter-column'?'column':'mode']=el.value;ed.min=ed.max='';ed.valueSearch='';renderProperties();return true;}
 if(el.id==='dtv-filter-null'){ed.include_empty=el.checked;return true;}
 if(el.dataset.vDomainValue!==undefined){const v=JSON.parse(el.dataset.vDomainValue);if(v===null)ed.include_empty=el.checked;else{const values=new Set(ed.values.split(/\r?\n/).filter(Boolean));el.checked?values.add(v===''?'""':String(v)):values.delete(v===''?'""':String(v));ed.values=[...values].join('\n');}renderProperties();return true;}
 if(el.dataset.vHierarchyColumn!==undefined){if(el.checked&&ed.columns.length>=6){el.checked=false;H.toast('계층은 최대 6개 컬럼입니다.');return true;}ed.columns=el.checked?[...ed.columns,el.dataset.vHierarchyColumn]:ed.columns.filter(n=>n!==el.dataset.vHierarchyColumn);ed.paths=[];renderProperties();return true;}
 if(el.dataset.vTreePath!==undefined){const p=JSON.parse(el.dataset.vTreePath);if(el.checked)ed.paths=[...ed.paths.filter(q=>!selectedPath(q,[p])),p];else{const leaves=(currentDomain()?.paths||[]).filter(q=>q.length===ed.columns.length);ed.paths=leaves.filter(q=>selectedPath(q,ed.paths)&&!selectedPath(q,[p]));}if(ed.paths.length>200){ed.paths=[];H.toast('선택 경로는 최대 200개입니다. 상위 범주를 선택하세요.');}renderProperties();return true;}
 if(el.dataset.vHierarchyDepth!==undefined||el.dataset.vHierarchyReuse!==undefined){const f=ensureDraft(),axis=el.dataset.vHierarchyDepth||el.dataset.vHierarchyReuse;if(el.dataset.vHierarchyDepth!==undefined)f.axis_hierarchies[axis].depth=Number(el.value);else if(el.value)f.axis_hierarchies={...f.axis_hierarchies,[axis]:JSON.parse(el.value)};applyHierarchies(f);H.render();renderProperties();return true;}
 if(el.dataset.vTimeUnit!==undefined||el.dataset.vTimeDepth!==undefined||el.dataset.vTimeZone!==undefined){const f=ensureDraft(),n=el.dataset.vTimeUnit||el.dataset.vTimeDepth||el.dataset.vTimeZone;f.time_transforms={...f.time_transforms};if(el.dataset.vTimeUnit!==undefined&&!el.value)delete f.time_transforms[n];else{const old=f.time_transforms[n]||{unit:'day',offset_minutes:540};f.time_transforms[n]={unit:el.dataset.vTimeDepth!==undefined?TIME_UNITS[Number(el.value)][0]:el.dataset.vTimeUnit!==undefined?el.value:old.unit,offset_minutes:el.dataset.vTimeZone!==undefined?Number(el.value):old.offset_minutes};f.options.x_mode='categorical';}H.render();renderProperties();return true;}
 if(el.dataset.vSubtotalLevel!==undefined){const [axis,n]=el.dataset.vSubtotalLevel.split(':'),f=ensureDraft(),field='subtotal_'+axis+'_levels',levels=f.options[field]??f[axis].slice(0,-1).map((_,i)=>i+1);f.options[field]=el.checked?[...new Set([...levels,Number(n)])]:levels.filter(i=>i!==Number(n));H.render();return true;}
 if(el.id==='dtv-style-target'){ed.styleTarget=el.value;renderProperties();return true;}
 return false;
}

function scatterErrorControls(){
 const f=view.f,aggregate=f.scatter_mode==='aggregate',choices=aggregate?[['none','(None)'],['sd','StdDev'],['se','StdErr']]:[['none','(None)'],['columns','Column values']];
 let s=propControl('error_bars','Vertical error bars','select',choices)+propControl('error_bars_x','Horizontal error bars','select',choices)+propControl('error_end_caps','Show end caps')+propControl('error_include_range','Include error bars in axis range')+propControl('error_color','Custom error color','color');
 if(!aggregate){const cols=tableCols(view.source).filter(c=>kind(c.type)==='number');s+=f.measures.map((m,i)=>'<div class="dtv-measure"><b>XY pair '+(i+1)+'</b>'+[['error_upper_column','Upper Y error'],['error_lower_column','Lower Y error'],['x_error_upper_column','Upper X error'],['x_error_lower_column','Lower X error']].map(([field,title])=>'<label class="dtv-prop">'+title+'<select data-v-m="'+i+':'+field+'"><option value="">(None)</option>'+cols.map(c=>'<option value="'+E(c.name)+'" '+(m[field]===c.name?'selected':'')+'>'+E(c.name)+'</option>').join('')+'</select></label>').join('')+'</div>').join('');}
 return s+'<p class="dtv-help">오차는 좌표에서 더하거나 빼는 상대적인 길이입니다. 원본 모드는 오차 컬럼의 값을, 평균 집계 모드는 StdDev/StdErr를 사용합니다.</p>';
}
const sharedFilters=new Map();
function filterKey(){return key([refOf(view.source),view.source?.version]);}
function commitFilters(filters){
 const f=ensureDraft();f.filters=clone(filters);sharedFilters.set(filterKey(),clone(filters));
 H.onGraphFiltersChanged?.({source_ref:refOf(view.source),source_version:view.source?.version,filters:clone(filters)});
 H.render();renderProperties();
}
function axisDepthControls(f,axis){const h=f.axis_hierarchies?.[axis],names=f[axis==='x'?'x_columns':axis]||[];return (h?'<label class="dtv-depth-control">'+E(h.name)+' · '+h.depth+' / '+h.columns.length+'<input aria-label="Hierarchy depth" type="range" min="1" max="'+h.columns.length+'" value="'+h.depth+'" data-v-hierarchy-depth="'+axis+'"></label>':'')+names.filter(n=>f.time_transforms?.[n]).map(n=>'<label class="dtv-depth-control">'+E(n+' · '+f.time_transforms[n].unit)+'<input aria-label="Time hierarchy depth" type="range" min="0" max="5" value="'+TIME_UNITS.findIndex(([u])=>u===f.time_transforms[n].unit)+'" data-v-time-depth="'+E(n)+'"></label>').join('');}
function axisZone(f,axis,title){const metric=['left','right','values'].includes(axis),items=metric?f.measures.map((m,i)=>({m,i})).filter(({m})=>axis==='values'||(m.axis||'left')===axis):axisDimensions(f,axis).map((n,i)=>({n,i}));return '<div class="dtv-axis-zone" data-axis-zone="'+axis+'"><span class="dtv-axis-label">'+title+'</span><div class="dtv-axis-items">'+items.map(({m,n,i})=>'<span class="dtv-axis-item"><button data-v-axis="'+(m?'m'+i:axis)+'" '+(!m?'data-v-axis-index="'+i+'" draggable="true" data-v-dim-drag="'+axis+':'+i+'"':'')+' title="'+E(m?label(m):dimTitle(n))+'">'+E(m?label(m):dimTitle(n))+' ▾</button><button class="dtv-axis-remove" '+(m?'data-v-remove-measure="'+i+'"':'data-v-remove-dim="'+(axis==='x'?'x_columns':axis)+':'+i+'"')+' '+(m&&f.measures.length===1||n===COLUMN_NAMES?'disabled':'')+' aria-label="Remove '+E(m?label(m):dimTitle(n))+'">×</button></span>').join('')+'<button class="dtv-axis-add" data-v-axis-add="'+axis+'" aria-label="Add '+title+' column" '+(items.length>=(metric?12:f.chart_type==='crosstable'&&f.options.cross_measure_axis===axis?7:6)?'disabled':'')+'>＋</button></div>'+(!metric?axisDepthControls(f,axis):'')+'</div>';}
function axisFrame(c,plots){const f=view?.f;if(!f||view?.g?.origin_type==='api')return '<div class="dtv-chart">'+plots+'</div>';const horizontal=['bar','boxplot'].includes(c.type)&&c.options?.orientation==='horizontal',right=f.measures.some(m=>m.axis==='right');return '<div class="dtv-axis-frame dtv-compact-axes '+(right?'has-right ':'')+(horizontal?'horizontal':'')+'">'+(horizontal?axisZone(f,'x','Category'):axisZone(f,'left','Y'))+'<div class="dtv-chart">'+plots+'</div>'+(right?axisZone(f,'right',horizontal?'Top value':'Right Y'):'')+'<div class="dtv-axis-bottom">'+(horizontal?axisZone(f,'left','Value'):axisZone(f,'x','X'))+'</div></div>';}
function configHTML(f){return '<div class="dtv-config"><button class="dtv-pill" data-v-properties="Data">⚙ Properties…</button></div>';}
let autoRender=null,autoSequence=0;
function stableJSON(value){return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
function calculationKey(f){const measures=(f.measures||[]).map(m=>({column:m.column||null,aggregation:m.aggregation,x:m.x||null,x_aggregation:m.x_aggregation||null,error_upper_column:m.error_upper_column||null,error_lower_column:m.error_lower_column||null,x_error_upper_column:m.x_error_upper_column||null,x_error_lower_column:m.x_error_lower_column||null,type:f.chart_type==='combination'?m.type:null}));return stableJSON({chart_type:f.chart_type,scope:f.scope||'full',x_columns:f.x_columns,measures,rows:f.rows,columns:f.columns,group:f.group||null,line_by:Object.prototype.hasOwnProperty.call(f,'line_by')?f.line_by:f.group||null,facet:f.facet||null,size:f.size||null,shape:f.shape||null,rotation:f.rotation||null,rotation_aggregation:f.rotation?f.options.rotation_aggregation:null,series_types:f.chart_type==='combination'?f.options.series_types:null,series_labels:f.chart_type==='combination'&&Object.keys(f.options.series_types||{}).length?f.measures.map(m=>label(m)):null,scatter_mode:f.scatter_mode||'rows',marker_by:f.marker_by||[],filters:f.filters||[],time_transforms:f.time_transforms||{},axis_hierarchies:f.axis_hierarchies||{},cumulative_order:f.measures?.some(m=>m.aggregation==='cumulative_sum')?{sort:f.options.sort,reverse:f.options.reverse}:null,totals_mode:f.chart_type==='crosstable'?f.options?.totals_mode:null,box_whiskers:f.chart_type==='boxplot'?f.options?.box_whiskers:null,validated_options:Object.fromEntries(['layout','x_mode','y_mode','orientation','log_x','log_y','log_right','x_min','x_max','y_min','y_max','right_min','right_max','error_bars','error_bars_x'].map(k=>[k,f.options?.[k]])),measure_axes:(f.measures||[]).map(m=>m.axis||'left')});}
function invalidDraft(f,source){const cols=tableCols(source),types=Object.fromEntries(cols.map(c=>[c.name,kind(c.type)]));if(!cols.length)return '사용할 컬럼이 없습니다. 테이블을 먼저 선택해 주세요.';if(f.chart_type==='boxplot'&&!cols.some(c=>kind(c.type)==='number'))return 'Box Plot에는 숫자형 값이 필요합니다. Column types에서 자료형을 바꾸거나 다른 차트를 선택해 주세요.';if(f.chart_type!=='boxplot'&&!f.x_columns?.length||f.x_columns.some(n=>!Object.prototype.hasOwnProperty.call(types,n)))return 'X축에 사용할 컬럼을 선택해 주세요.';if(['bar','line','combination'].includes(f.chart_type)&&f.options.x_mode==='continuous'&&(f.x_columns.length!==1||!['number','datetime','time'].includes(types[f.x])||f.options.orientation==='horizontal'))return 'Continuous X는 세로 차트의 숫자·날짜·시간 컬럼 하나에 사용할 수 있습니다. 여러 범주는 Categorical로 변경해 주세요.';if(!f.measures?.length)return '표시할 값 또는 XY 좌표 쌍을 선택해 주세요.';for(const m of f.measures){if(m.aggregation!=='count_rows'&&!Object.prototype.hasOwnProperty.call(types,m.column))return '값 컬럼을 선택해 주세요.';if(f.chart_type==='scatter'){if(!Object.prototype.hasOwnProperty.call(types,m.x||f.x))return 'XY 좌표 쌍의 X 컬럼을 선택해 주세요.';if(f.scatter_mode==='aggregate'&&(types[m.x||f.x]!=='number'||types[m.column]!=='number'))return '집계 Scatter에는 숫자형 X와 Y가 필요합니다. 좌표를 바꾸거나 Individual rows를 선택해 주세요.';}else if(!['count_rows','count','distinct'].includes(m.aggregation)&&types[m.column]!=='number')return '이 집계에는 숫자형 값이 필요합니다. Count()를 선택하거나 컬럼 자료형을 바꿔 주세요.';}if(f.chart_type==='scatter')for(const [axis,option] of [['y','error_bars'],['x','error_bars_x']]){const mode=f.options[option]||'none';if(mode==='none')continue;for(const m of f.measures){if(types[axis==='x'?(m.x||f.x):m.column]!=='number')return '오차 막대의 좌표 축에는 숫자형 컬럼이 필요합니다.';const pre=axis==='x'?'x_':'';if(mode==='columns'&&(f.scatter_mode==='aggregate'||!m[pre+'error_upper_column']&&!m[pre+'error_lower_column']))return '원본 Scatter에서 상한 또는 하한 오차 컬럼을 선택해 주세요.';if(mode!=='columns'&&(f.scatter_mode!=='aggregate'||m[axis==='x'?'x_aggregation':'aggregation']!=='mean'))return 'StdDev·StdErr 오차는 평균 집계 Scatter에서 사용할 수 있습니다.';}}return '';}
function stopAutoWork(state=autoRender){if(!state)return;clearTimeout(state.timer);state.timer=null;if(state.request){const request=state.request;state.request=null;request.controller.abort();Promise.resolve(H.api('/cancel',{query_id:request.query_id})).catch(()=>{});}}
function deactivate(){if(markRequest){markRequest.controller.abort();H.api('/cancel',{query_id:markRequest.query_id}).catch(()=>{});markRequest=null;}stopAutoWork();autoRender=null;autoSequence++;view=null;closePopup();hideTip();const dialog=document.getElementById('dtv-properties');if(dialog?.open)dialog.close();}
function draftContext(source,g){return key([H.model.current?.id||'',g?.canonical_ref||'new',refOf(source),source?.version||0]);}
function currentAuto(state){return autoRender===state&&H.model.current?.id===state.workspace_id&&view&&draftContext(view.source,view.g)===state.context&&calculationKey(view.f)===state.key;}
function displayedDraft(state,f){if(state?.status!=='ready'||!state.chart)return null;const c=clone(state.chart);c.options={...DEFAULT,...c.options,...f.options};c.measures=(c.measures||[]).map((m,i)=>({...m,...Object.fromEntries(['type','axis','label','color'].filter(k=>f.measures[i]?.[k]!==undefined).map(k=>[k,f.measures[i][k]]))}));return c;}
function ensureAutoRender(source,g,f){
 const context=draftContext(source,g),wanted=calculationKey(f);let state=autoRender;
 if(!state||state.context!==context){stopAutoWork(state);state=autoRender={context,workspace_id:H.model.current?.id,key:null,status:'idle',generation:++autoSequence,chart:null,error:'',source};}
 state.form=clone(f);state.source=source;
 const presentationData=state.key===wanted?state.chart?.data:null,presentationInvalid=f.options.layout==='percent'&&presentationData?.some(p=>num(p.y)&&p.y<0&&(f.chart_type==='bar'||f.chart_type==='combination'&&seriesType(p,{...state.chart,measures:f.measures},f.options)!=='line'))?'100% 누적에는 음수 집계값을 사용할 수 없습니다. Side-by-side 또는 Stacked를 선택하세요.':'';
 const invalid=invalidDraft(f,source)||presentationInvalid;if(invalid){stopAutoWork(state);state.key=wanted;state.status='invalid';state.error=invalid;return state;}
 if(state.key===wanted&&state.status==='invalid'){state.status=state.chart?'ready':'idle';state.error='';if(!state.chart)state.key=null;}
 if(state.key===wanted)return state;
 stopAutoWork(state);state.key=wanted;state.generation=++autoSequence;state.error='';state.chart=null;state.render_id=null;
 if(g?.chart&&(f.chart_type!=='crosstable'||g.chart.rollups_complete)&&!g.stale&&g.source_version===source?.version&&wanted===calculationKey(normalize(g.spec||{},source))){state.status='ready';state.chart=clone(g.chart);state.cacheStatus=source?.full_data_cache?.state==='complete'?'hit':'saved';return state;}
 state.status='loading';state.cacheStatus=source?.origin_type==='api'?'saved':source?.full_data_cache?.state==='complete'?'hit':'miss';const generation=state.generation,delay=state.lastType===f.chart_type?220:0;state.lastType=f.chart_type;
 state.timer=setTimeout(()=>runAutoRender(state,generation),delay);return state;
}
async function runAutoRender(state,generation){
 state.timer=null;if(!currentAuto(state)||state.generation!==generation)return;
 const controller=new AbortController(),query_id=H.uuid(),request={controller,query_id};state.request=request;
 const body={...clone(state.form),scope:state.form.scope||'full',workspace_id:state.workspace_id,source_ref:refOf(state.source),source_version:state.source?.version,query_id};delete body.auto_note;delete body.ys;
 try{const result=await H.api('/graph/render',body,{signal:controller.signal});if(!currentAuto(state)||state.generation!==generation||state.request!==request)return;state.request=null;state.chart=result.chart;state.render_id=result.render_id||null;state.status='ready';state.cacheStatus=result.chart?.data_provenance?.cache||state.cacheStatus;state.provenance=result.chart?.data_provenance||null;H.onGraphDataOutcome?.({source_ref:body.source_ref,source_version:body.source_version,provenance:state.provenance});if(result.cache_status&&typeof result.cache_status==='object')H.setCacheStatus?.(result.cache_status);state.cacheInfo=result.full_data_cache||result.chart?.full_data_cache||null;if(state.cacheInfo&&state.source)state.source.full_data_cache=clone(state.cacheInfo);H.render();syncAutoControls();}
 catch(error){if(controller.signal.aborted||!currentAuto(state)||state.generation!==generation)return;state.request=null;state.status='error';state.error=error.message||'전체 데이터 차트를 계산하지 못했습니다.';H.onGraphDataOutcome?.({source_ref:body.source_ref,source_version:body.source_version,error:{code:error.code,message:state.error}});H.render();syncAutoControls();}
}
function syncAutoControls(){document.querySelectorAll('[data-v-save]').forEach(b=>b.disabled=!!H.model.busy||autoRender?.status!=='ready');}
function retryAutoRender(){if(!autoRender||!view)return;stopAutoWork();autoRender.key=null;H.render();}
function autoStatusHTML(state,c){if(state.status==='loading')return '<div class="dtv-data-strip dtv-auto-status" role="status" data-v-render-status="loading" data-v-cache-state="'+E(state.cacheStatus)+'"><b>'+(state.source?.origin_type==='api'?'저장된 전체 결과로 차트를 계산 중':'전체 데이터로 그래프 계산 중')+'</b><span>설정 변경은 자동 반영됩니다. 캐시가 없으면 전체 원본을 먼저 확보합니다.</span></div>';
 if(state.status==='invalid'||state.status==='error')return '<div class="dtv-auto-message" role="'+(state.status==='error'?'alert':'status')+'" data-v-render-status="'+state.status+'"><strong>'+E(state.error)+'</strong><div>'+(state.status==='error'?'<button data-v-retry>다시 계산</button>':'')+'<button data-v-types>Column types 열기</button></div></div>';
 if(!c)return '';const cache=state.cacheStatus==='hit'?'전체 캐시 재사용':state.cacheStatus==='filled'?'전체 캐시 확보 완료':state.cacheStatus==='bypass'?'캐시 미보관 · 전체 원본으로 계산':state.cacheStatus==='saved'?'저장된 전체 결과':'전체 데이터 준비 완료';return '<div class="dtv-data-strip dtv-auto-status" data-v-render-status="ready" data-v-cache-state="'+E(state.cacheStatus)+'"><b>'+E(c.scope==='preview'?'명시적으로 선택한 미리보기':(state.cacheStatus==='hit'||state.cacheStatus==='filled'?'캐시 원본 ':'전체 원본 ')+fmt(c.source_input_rows??c.input_rows)+'행'+(c.scope==='bounded_sample'?' · 표본 표시':' · 차트'))+'</b><span>입력 '+E(fmt(c.input_rows))+' · 사용 '+E(fmt(c.used_rows))+' · 제외 '+E(fmt(c.excluded_rows||0))+' · '+cache+'</span>'+(state.cacheStatus==='bypass'?'<small>캐시 예산 또는 설정에 따라 원본을 보관하지 않았습니다. 현재 계산 결과는 저장할 수 있으며, 다른 계산에는 원본을 다시 준비할 수 있습니다.</small>':'')+'</div>';
}
function automaticStage(state,c){return (!c&&view?.f?(view.f.chart_type==='crosstable'?axisZone(view.f,'columns','Horizontal')+axisZone(view.f,'rows','Vertical')+axisZone(view.f,'values','Cell values'):axisZone(view.f,'x','X')+axisZone(view.f,'left','Y')):'')+autoStatusHTML(state,c)+(c?'<div class="dtv-stage">'+chartHTML(c)+'</div>':state.status==='loading'?'<div class="dtv-auto-loading" aria-hidden="true"><i></i><span>전체 데이터 차트를 준비하고 있어요</span></div>':'');}
function formHTML(source,g){const f=activeForm(source,g),sf=sharedFilters.get(key([refOf(source),source?.version]));if(sf)f.filters=clone(sf);view={id:g?.canonical_ref||'draft',source,g,f};const state=ensureAutoRender(source,g,f),c=displayedDraft(state,f);view.displayChart=c;return '<section class="dtv" id="dtv-root" tabindex="0"><header class="dtv-head"><div><h3>'+(g?E(g.id)+' · Visualization properties':'Visualization')+'</h3><small>'+E(f.source_ref||refOf(source))+' · '+E(source?.title)+'</small></div></header><div class="dtv-kind-list">'+TYPES.map(k=>'<button class="dtv-kind '+(f.chart_type===k?'active':'')+'" data-v-kind="'+k+'">'+icon(k)+LABELS[k]+'</button>').join('')+'</div>'+configHTML(f)+(f.auto_note?'<p class="dtv-note">'+E(f.auto_note)+'</p>':'')+automaticStage(state,c)+(c&&c.type!=='crosstable'&&c.options?.zoom!==false?zoomControlsHTML():'')+'<div class="dtv-savebar"><small>차트는 자동으로 그려집니다. 저장하면 이 테이블의 Graph 탭에 추가됩니다.</small><button data-v-cancel>Close</button><button class="primary" data-v-save '+(H.model.busy||state.status!=='ready'?'disabled':'')+'>Save graph</button></div></section>';}

function panel(g){const source=H.model.graphSetupSource||sourceFor(H.model.graphForm?.source_ref||g.source_ref);const scoped=sharedFilters.get(key([refOf(source),source?.version]));if(scoped&&stableJSON(scoped)!==stableJSON(g.spec?.filters||[])&&!H.model.graphForm)H.model.graphForm={...g.spec,filters:clone(scoped)};let draft=H.model.graphForm?activeForm(source,g):null;let f=draft||normalize(g.spec||{},source);const sf=sharedFilters.get(key([refOf(source),source?.version]));if(sf&&stableJSON(sf)!==stableJSON(f.filters||[])){H.model.graphForm={...f,filters:clone(sf)};f=activeForm(source,g);draft=f;}view={id:g.canonical_ref,source,g,f};let c=clone(g.chart);const draftState=draft?ensureAutoRender(source,g,draft):null,draftChart=draft?displayedDraft(draftState,draft):null;if(draftChart)c=draftChart;c.options={...DEFAULT,...c.options,...(draft?.options||{})};if(draft&&c.measures?.length===draft.measures.length)c.measures=c.measures.map((m,i)=>({...m,...Object.fromEntries(['type','axis','label','color'].filter(k=>draft.measures[i][k]!==undefined).map(k=>[k,draft.measures[i][k]]))}));const api=g.origin_type==='api';view.displayChart=draft&&!draftChart?null:c;const xname=f.chart_type==='crosstable'?(f.rows||[]).join(' / '):(f.x_columns||[c.x_column||f.x||'X']).join(' → ');
const horizontalAxes=['bar','boxplot'].includes(c.type)&&c.options.orientation==='horizontal',categoryPick='<button '+(!api?'data-v-axis="x"':'disabled')+'>'+E(xname)+' ▾</button>',measurePick=(c.measures||[]).length?(c.measures||[]).map((m,i)=>'<button '+(!api?'data-v-axis="m'+i+'"':'disabled')+'>'+E(label(m))+' ▾</button>').join(''):'<span>'+E(c.y_column||c.value_column||'Value')+'</span>';
H.$('panel-title').textContent=g.canonical_ref;H.$('panel-sub').textContent=g.title;
H.$('panel-content').innerHTML='<section class="dtv" id="dtv-root" tabindex="0"><header class="dtv-head"><div><h3>'+E(g.title)+'</h3><small>'+E(LABELS[c.type]||c.type)+' · '+E(g.source_ref)+' v'+E(g.source_version)+'</small></div><div class="dtv-tools">'+(!api?'<button data-v-properties="Data">⚙ Properties</button>':'')+'<button data-v-clear>Clear marking</button><button data-v-reset>Reset zoom</button><button data-v-export="'+(c.type==='crosstable'?'csv':'svg')+'">Export '+(c.type==='crosstable'?'CSV':'SVG')+'</button></div></header><div class="dtv-data-strip"><b>'+E(c.scope==='preview'?'미리보기':c.scope==='bounded_sample'?'전체 조회 · 표본 표시':'전체 데이터')+'</b><span>입력 '+E(fmt(c.input_rows??c.rows_used_for_test))+' · 사용 '+E(fmt(c.used_rows??c.rows_used_for_test))+' · 제외 '+E(fmt(c.excluded_rows??0))+'</span><button data-open-table="'+E(g.source_ref)+'">Data table ↗</button></div>'+(g.stale?'<div class="graph-stale">원본 테이블이 변경되었거나 삭제되었습니다. 생성 당시 결과를 표시합니다.</div>':'')+(draft?'<div class="dtv-data-strip dtv-unsaved">설정 변경 중 · 전체 데이터 차트는 자동 반영됩니다. Save changes로 저장된 그래프를 갱신합니다.</div>':'')+(draft?automaticStage(draftState,draftChart):'<div class="dtv-stage">'+chartHTML(c)+'</div>')+(c.type!=='crosstable'&&c.options?.zoom!==false?zoomControlsHTML():'')+'<footer class="dtv-status"><span id="dtv-marking-status">클릭 · Ctrl+클릭 · 드래그로 표시 항목 선택</span><span>'+E(g.id)+'</span></footer><p class="dtv-note">'+E(c.note||'')+'</p>'+(draft?'<div class="dtv-savebar"><small>전체 데이터 차트는 자동 반영 · 저장된 그래프는 Save changes로 갱신</small><button data-v-cancel>취소</button><button class="primary" data-v-save '+(H.model.busy||draftState?.status!=='ready'?'disabled':'')+'>Save changes</button></div>':'')+'</section><p class="pane-note">원본 추출 '+E(H.dateLabel(g.source_extracted_at))+'<br>그래프 생성 '+E(H.dateLabel(g.created_at))+' · 갱신 '+E(H.dateLabel(g.updated_at||g.created_at))+'</p>';
mount();}
function ensureDraft(){if(!view)return null;const f=activeForm(view.source,view.g);view.f=f;return f;}
let axisPickSerial42=0,axisFollow42=0;
function closePopup(){axisPickSerial42++;cancelAnimationFrame(axisFollow42);popup?.remove();popup=null;}
function followAxis42(target,original,viewID){
 const el=popup;if(!el)return;
 const selector='[data-v-axis="'+CSS.escape(target)+'"]';
 const place=()=>{
  if(popup!==el||view?.id!==viewID||!document.getElementById('dtv-root')){if(popup===el)closePopup();return;}
  const propertyDialog=document.getElementById('dtv-properties'),scope=propertyDialog?.open?propertyDialog:document.getElementById('dtv-root');
  const anchor=(original?.isConnected&&scope.contains(original)?original:null)||scope.querySelector('svg '+selector)||scope.querySelector(selector)||scope.querySelector('[data-v-axis-add="'+CSS.escape(target.replace(/^addm_/,''))+'"]');
  if(!anchor){closePopup();return;}
  const r=anchor.getBoundingClientRect(),vv=window.visualViewport,ox=vv?.offsetLeft||0,oy=vv?.offsetTop||0,w=vv?.width||innerWidth,h=vv?.height||innerHeight;
  if(!r.width&&!r.height){closePopup();return;}
  el.style.maxHeight=Math.max(100,h-16)+'px';el.style.maxWidth=Math.max(180,w-16)+'px';
  const vertical=/^(m\d+|addm_|left|right|rows)/.test(target)&&!/^mx/.test(target);
  let left=vertical?r.right+8:r.left,top=vertical?r.top+r.height/2-el.offsetHeight/2:r.bottom+6;
  if(left+el.offsetWidth>ox+w-8&&vertical&&r.left-el.offsetWidth-8>=ox+8)left=r.left-el.offsetWidth-8;
  if(!vertical&&top+el.offsetHeight>oy+h-8&&r.top-el.offsetHeight-6>=oy+8)top=r.top-el.offsetHeight-6;
  left=Math.max(ox+8,Math.min(left,ox+w-el.offsetWidth-8));top=Math.max(oy+8,Math.min(top,oy+h-el.offsetHeight-8));
  el.style.left=left+'px';el.style.top=top+'px';el.dataset.axisAttached='true';
  axisFollow42=requestAnimationFrame(place);
 };place();
}
async function loadSource(){if(view?.source)return true;try{const ref=view?.g?.source_ref||view?.f?.source_ref;if(!ref)return false;const wid=ref.split(".")[0];H.model.cache.set(wid,await H.api("/workspace/"+encodeURIComponent(wid)));view.source=sourceFor(ref);if(!view.source)throw Error("원본 테이블이 삭제되어 설정을 수정할 수 없습니다.");return true;}catch(e){H.toast(e.message);return false;}}
async function pickAxis(target,anchor,mode='replace',itemIndex=null){
 const serial=++axisPickSerial42,viewID=view?.id;
 if(view?.g?.origin_type==='api'||!await loadSource()||serial!==axisPickSerial42||viewID!==view?.id)return;const f=ensureDraft();if(!f)return;const oldPending=popup?._pendingMetric,oldTarget=popup?.dataset.target;closePopup();
 const adding=/^addm_/.test(target),idx=/^m\d+$/.test(target)?Number(target.slice(1)):adding?f.measures.length:null,pairIdx=/^mx\d+$/.test(target)?Number(target.slice(2)):null;
 const metric=adding?(oldTarget===target&&oldPending?oldPending:{column:null,aggregation:['scatter','boxplot'].includes(f.chart_type)?(f.chart_type==='scatter'&&f.scatter_mode==='aggregate'?'mean':'none'):'mean',type:f.chart_type==='combination'&&target==='addm_right'?'line':f.chart_type==='combination'?'bar':f.chart_type,axis:target==='addm_right'?'right':'left',...(f.chart_type==='scatter'?{x:f.x,x_aggregation:f.scatter_mode==='aggregate'?'mean':'none'}:{})}):idx!==null?f.measures[idx]:null;
 const numeric=['size','rotation'].includes(target)||f.chart_type==='scatter'&&f.scatter_mode==='aggregate'&&(metric||pairIdx!==null||target==='x')||metric&&f.chart_type!=='scatter'&&!['count','distinct','count_rows'].includes(metric.aggregation),multiple=['rows','columns','x','marker_by'].includes(target),arr=target==='x'?'x_columns':target,selected=multiple?axisDimensions(f,target):[metric?metric.column:pairIdx!==null?f.measures[pairIdx].x:f[target]];
 popup=document.createElement('div');popup.className='dtv-popup dtv';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','축 컬럼 선택');popup.dataset.target=target;popup.dataset.mode=mode;popup.dataset.index=itemIndex??anchor?.dataset?.vAxisIndex??0;if(adding)popup._pendingMetric=metric;
 const cols=tableCols(view.source),reorder=multiple?'<div class="dtv-picker-order">'+selected.map((n,i)=>'<div><span>'+E(dimTitle(n))+'</span><button data-v-move-dim="'+arr+':'+i+':-1" '+(!i?'disabled':'')+' aria-label="Move up">↑</button><button data-v-move-dim="'+arr+':'+i+':1" '+(i===selected.length-1?'disabled':'')+' aria-label="Move down">↓</button><button data-v-remove-dim="'+arr+':'+i+'" '+(n===COLUMN_NAMES?'disabled title="Column Names는 한 축에 유지됩니다. 다른 축의 +로 이동할 수 있어요."':'')+' aria-label="Remove column">×</button></div>').join('')+'</div>':'';
 const virtual=f.chart_type==='crosstable'&&['rows','columns'].includes(target)?[{name:COLUMN_NAMES,type:'virtual'}]:[];
 popup.innerHTML='<h4 class="dtv-popup-title" data-popup-drag>'+E(multiple?(target==='x'?'X-axis columns':target==='rows'?'Vertical axis':target==='columns'?'Horizontal axis':'Marker by'):pairIdx!==null?'Series X':metric?'Y / Cell values':target)+'<button data-v-picker-done aria-label="Close">×</button></h4>'+reorder+'<input type="search" data-v-search placeholder="컬럼 이름·타입 검색" aria-label="컬럼 이름·타입 검색"><p class="dtv-help">'+(adding||mode==='add'?'＋ 새 항목 추가 · ':multiple?'현재 항목 교체 · 추가는 축의 ＋ 사용 · ':'')+(numeric?'숫자형만 가능 · 문자열 숫자는 먼저 자료형을 변경하세요.':metric&&f.chart_type==='scatter'?'숫자·날짜·문자열 좌표를 지원합니다.':metric?'Count·UniqueCount는 문자열도 가능합니다.':'선택한 순서가 계층 순서입니다.')+(virtual.length?' (Column Names)는 Cell values 항목의 이름을 이 축에 표시합니다.':'')+'</p>'+(metric&&!['scatter','boxplot'].includes(f.chart_type)?aggregationPicker(metric,idx):'')+'<div class="dtv-popup-list">'+(['group','facet','size','shape','rotation','line_by'].includes(target)||target==='x'&&f.chart_type==='boxplot'?'<button data-v-col="" data-search="none">(None)</button>':'')+virtual.concat(cols).map(c=>{const ok=(!numeric||kind(c.type)==='number')&&!/(?:json|bytea|array|\[\])/.test(c.type||'');return '<button data-v-col="'+E(c.name)+'" data-search="'+E((dimTitle(c.name)+' '+typeLabel(c.type)).toLowerCase())+'" '+(!ok?'disabled title="지원 자료형으로 변환이 필요합니다."':'')+'>'+E((selected.includes(c.name)?'✓ ':'')+dimTitle(c.name))+'<small>'+E(typeLabel(c.type))+'</small></button>';}).join('')+'</div>'+(metric?'<label class="dtv-picker-display">Display name<input data-v-picker-label value="'+E(metric.label||'')+'" placeholder="'+E(label(metric))+'"></label>':'')+'<div class="dtv-tools"><button data-v-picker-done>Done</button><button data-v-types>컬럼·자료형 변경</button></div>';
 (document.getElementById('dtv-properties')?.open?document.getElementById('dtv-properties'):document.body).append(popup);followAxis42(target,anchor,viewID);popup?.querySelector('input[type=search]')?.focus();
}
function pickSeriesType(name,anchor){
 if(view?.g?.origin_type==='api')return;closePopup();popup=document.createElement('div');popup.className='dtv dtv-popup';popup.dataset.series=name;popup.setAttribute('role','menu');popup.innerHTML='<h4 class="dtv-popup-title" data-popup-drag>'+E(name)+'<button data-v-picker-done aria-label="Close">×</button></h4><div class="dtv-popup-list"><button data-v-series-kind="bar">Display as bars</button><button data-v-series-kind="line">Display as lines</button></div>';document.body.append(popup);window.DataTalkDialogs?.makeDraggable(popup,'[data-popup-drag]');window.DataTalkDialogs?.place(popup,anchor.getBoundingClientRect());
}
function finishAxisChange(){clearInvalidLogs(view.f,view.source,true);closePopup();H.render();if(document.getElementById('dtv-properties')?.open)renderProperties();}
function chooseColumn(b){const target=popup?.dataset.target;if(!target)return;const f=ensureDraft(),v=b.dataset.vCol||null,mode=popup.dataset.mode,index=Number(popup.dataset.index||0);
 if(/^addm_/.test(target)){if(f.measures.length>=12){H.toast('측정값·좌표 쌍은 최대 12개입니다.');return;}const m={...popup._pendingMetric,column:v};delete m.label;f.measures.push(m);}
 else if(/^mx\d+$/.test(target)){f.measures[Number(target.slice(2))].x=v;f.x_columns=[...new Set(f.measures.map(m=>m.x))];f.x=f.x_columns[0];}
 else if(/^m\d+$/.test(target)){const m=f.measures[Number(target.slice(1))];resetAutoLabel(m);m.column=v;}
 else if(target==='x'&&f.chart_type==='boxplot'&&v===null){f.x_columns=[];f.x=null;}
 else if(['rows','columns','x','marker_by'].includes(target)){
  const items=axisDimensions(f,target),old=items[index];if(v!==COLUMN_NAMES&&items.includes(v)&&!(mode!=='add'&&old===v)){H.toast('이미 선택된 컬럼입니다. 순서는 위쪽 화살표로 바꿀 수 있어요.');return;}
  if(v===COLUMN_NAMES){if(items.includes(v)){finishAxisChange();return;}if(mode==='add')items.push(v);else items.splice(index,1,v);}
  else if(mode==='add'){const virtual=items.indexOf(COLUMN_NAMES);if(virtual===items.length-1&&virtual>=0)items.splice(virtual,0,v);else items.push(v);}else if(items.length)items.splice(index,1,v);else items.push(v);
  if(items.filter(n=>n!==COLUMN_NAMES).length>6){H.toast('축의 실제 컬럼은 최대 6개입니다.');return;}
  setAxisDimensions(f,target,items);
  if(target==='x'&&f.chart_type==='scatter'){if(mode==='add'){if(f.measures.length>=12){setAxisDimensions(f,target,items.filter(n=>n!==v));H.toast('XY 쌍은 최대 12개입니다.');return;}f.measures.push({...clone(f.measures[0]),x:v});}else f.measures.forEach(m=>{if(m.x===old)m.x=v;});}
 }else f[target]=v;
 finishAxisChange();
}
function propControl(name,labelText,type='checkbox',choices=null){const o=view.f.options;const v=o[name];return '<label class="dtv-prop"><span>'+labelText+'</span>'+(choices?'<select data-v-opt="'+name+'">'+choices.map(([x,l])=>'<option value="'+x+'" '+(String(v)===String(x)?'selected':'')+'>'+l+'</option>').join('')+'</select>':type==='checkbox'?'<input type="checkbox" data-v-opt="'+name+'" '+(v?'checked':'')+'>':'<input type="'+type+'" data-v-opt="'+name+'" value="'+E(v??'')+'" '+(type==='number'?'step="any"':'')+'>')+'</label>';}
function logIssue(f,name,source){const k=f.chart_type,types=Object.fromEntries(tableCols(source).map(c=>[c.name,kind(c.type)]));if(name==='log_x'){if(k!=='scatter')return '로그 X축은 Scatter에서 사용할 수 있습니다.';if(f.measures.some(m=>types[m.x||f.x]!=='number'))return '로그 X축에는 모든 XY 쌍의 X가 숫자형이어야 합니다.';}if(name==='log_y'){if(f.options.layout!=='grouped'||k==='bar'||k==='combination'&&f.measures.some(m=>m.axis!=='right'&&m.type!=='line'))return '막대·누적 계열의 값 축은 선형축을 사용합니다.';if(k==='scatter'&&f.measures.some(m=>types[m.column]!=='number'))return '로그 Y축에는 모든 XY 쌍의 Y가 숫자형이어야 합니다.';}if(name==='log_right'&&(!['line','combination'].includes(k)||f.options.layout!=='grouped'||!f.measures.some(m=>m.axis==='right')||k==='combination'&&f.measures.some(m=>m.axis==='right'&&m.type!=='line')))return '오른쪽 로그 축에는 양수 Line 계열만 배치할 수 있습니다.';return '';}
function clearInvalidLogs(f,source,announce=false){const cleared=['log_x','log_y','log_right'].filter(name=>f.options[name]&&logIssue(f,name,source));cleared.forEach(name=>f.options[name]=false);if(cleared.length&&announce)H.toast('자료형·계열 변경에 따라 사용할 수 없는 로그 축을 해제했어요.');return cleared;}
function logControl(name,text){const f=view.f,reason=logIssue(f,name,view.source);return propControl(name,text).replace('<input ',reason&&!f.options[name]?'<input disabled title="'+E(reason)+'" ':'<input ')+(reason?'<p class="dtv-help dtv-control-reason">'+E(reason)+'</p>':'');}

function measureControls(){const f=view.f,aggOptions=value=>['mean','sum','min','max','median'].map(a=>'<option value="'+a+'" '+(value===a?'selected':'')+'>'+AGGS[a]+'</option>').join('');return f.measures.map((m,i)=>'<div class="dtv-measure"><header><b>'+(f.chart_type==='scatter'?'XY pair ':'Measure ')+(i+1)+'</b><span><button data-v-move-measure="'+i+':-1" '+(!i?'disabled':'')+'>↑</button><button data-v-move-measure="'+i+':1" '+(i===f.measures.length-1?'disabled':'')+'>↓</button>'+(f.measures.length>1?'<button data-v-remove-measure="'+i+'">×</button>':'')+'</span></header>'+(f.chart_type==='scatter'?'<button class="dtv-column-chip" data-v-axis="mx'+i+'">X: '+E(m.x||f.x)+' ▾</button>':'')+'<button class="dtv-column-chip" data-v-axis="m'+i+'">Y: '+E(label(m))+' ▾</button>'+(f.chart_type==='scatter'&&f.scatter_mode==='aggregate'?'<label class="dtv-prop">X aggregation<select data-v-m="'+i+':x_aggregation">'+aggOptions(m.x_aggregation)+'</select></label><label class="dtv-prop">Y aggregation<select data-v-m="'+i+':aggregation">'+aggOptions(m.aggregation)+'</select></label>':'')+(f.chart_type==='combination'?'<label class="dtv-prop">Series type<select data-v-m="'+i+':type"><option value="bar" '+(m.type!=='line'?'selected':'')+'>Bar</option><option value="line" '+(m.type==='line'?'selected':'')+'>Line</option></select></label>':'')+(['bar','line','combination'].includes(f.chart_type)?'<label class="dtv-prop">Scale<select data-v-m="'+i+':axis"><option value="left" '+(m.axis!=='right'?'selected':'')+'>Left</option><option value="right" '+(m.axis==='right'?'selected':'')+'>Right</option></select></label>':'')+'<label class="dtv-prop">Display name<input data-v-m="'+i+':label" value="'+E(m.label||'')+'" placeholder="'+E(label(m))+'"></label><label class="dtv-prop">Color<input type="color" data-v-m="'+i+':color" value="'+E(m.color||PALETTES.spotfire[i%8])+'"></label></div>').join('')+(f.measures.length<12?'<button class="dtv-column-chip" data-v-add-measure>＋ Add '+(f.chart_type==='scatter'?'XY pair':'measure')+'</button>':'')+(f.chart_type==='scatter'?'<button class="dtv-column-chip" data-v-all-pairs>All combinations</button><p class="dtv-help">각 행에 X와 Y가 명시됩니다. 여러 좌표 쌍은 서로 다른 패널로 표시하므로 시간·문자열·숫자 스케일이 섞이지 않습니다. All combinations는 선택한 X × 서로 다른 Y의 조합을 만듭니다(최대 12쌍).</p>':'');}
function propertyContents(tab){const shownTab=tab;if(tab==='Colors')tab='Colors / Legend';if(tab==='Labels'||tab==='Formatting')tab='Labels / Formatting';if(tab==='Lines & Curves'||tab==='Error Bars')tab='Lines / Error Bars';const f=view.f,k=f.chart_type,o=f.options;let s='<h3>'+E(shownTab)+'</h3>';
if(tab==='Data'){const tables=[...H.model.cache.values()].flatMap(w=>w.tables.map(t=>({...t,canonical_ref:refOf(t)})));s+='<label class="dtv-prop">Data table<select data-v-source>'+tables.map(t=>'<option value="'+E(t.canonical_ref)+'" '+(t.canonical_ref===f.source_ref?'selected':'')+'>'+E(t.canonical_ref+' · '+t.title)+'</option>').join('')+'</select></label><label class="dtv-prop">Data scope<select data-v-scope><option value="full" '+(f.scope!=='preview'?'selected':'')+'>Full data · 전체 데이터</option><option value="preview" '+(f.scope==='preview'?'selected':'')+'>Preview · 미리보기</option></select></label><label class="dtv-prop">Visualization<select data-v-chart-type>'+TYPES.map(t=>'<option value="'+t+'" '+(t===k?'selected':'')+'>'+LABELS[t]+'</option>').join('')+'</select></label><p class="dtv-help">차트별로 사용할 테이블을 지정합니다. 조회 조건은 대화로 변경할 수 있어요.</p>';}
else if(tab==='Filters')s+=filterContents();
else if(tab==='Rotation')s+='<button class="dtv-column-chip" data-v-axis="rotation">Rotation by: '+E(f.rotation||'(None)')+' ▾</button>'+propControl('rotation_direction','Direction','select',[['clockwise','Clockwise'],['counterclockwise','Counterclockwise']])+(f.scatter_mode==='aggregate'?propControl('rotation_aggregation','Aggregated value','select',['mean','sum','min','max','median'].map(a=>[a,AGGS[a]])):'')+'<p class="dtv-help">각도는 도 단위이며 360으로 나눈 나머지로 회전합니다.</p>';
else if(tab==='Legend')s+=propControl('legend','Show legend')+propControl('legend_position','Position','select',[['left','Left'],['right','Right']])+propControl('legend_max_values','Maximum values per item','number')+propControl('legend_title','Show title')+propControl('legend_selector','Show axis selector');
else if(tab==='Style')s+=propControl('cross_row_height','Row height','number')+propControl('cross_column_width','Column width','number')+propControl('cross_align','Horizontal alignment','select',[['left','Left'],['center','Center'],['right','Right']])+propControl('cross_header_color','Header background','color')+propControl('cross_total_color','Total background','color')+crossStyleControls();
else if(tab==='Axes'){if(k==='crosstable')s+=axisZone(f,'rows','Vertical')+axisZone(f,'columns','Horizontal');else s+='<button class="dtv-column-chip" data-v-axis="x">X: '+E(f.x_columns.join(' → ')||'선택')+' ▾</button>'+propControl('x_mode','X scale','select',[['auto','Automatic'],['categorical','Categorical'],['continuous','Continuous']])+(k==='scatter'?propControl('y_mode','Y scale','select',[['auto','Automatic'],['categorical','Categorical'],['continuous','Continuous']]):'')+propControl('reverse','Reverse X order')+propControl('reverse_y','Reverse Y order')+(k==='scatter'?logControl('log_x','Logarithmic X'):'')+logControl('log_y',['bar','line','combination'].includes(k)?'Left Y logarithmic':'Y logarithmic')+(['line','combination'].includes(k)&&f.measures.some(m=>m.axis==='right')?logControl('log_right','Right Y logarithmic'):'')+['x_min','x_max','y_min','y_max',...(['bar','line','combination'].includes(k)?['right_min','right_max']:[])].map(n=>propControl(n,n.replace('_',' ').toUpperCase(),'number')).join('')+(k==='line'?propControl('line_normalized','Normalize each line to 0–100%'):'')+propControl('grid','Show gridlines')+propControl('zoom','Show zoom sliders');s+=hierarchyControls();}
else if(tab==='Measures / Series'){if(['line','combination'].includes(k))s+='<button class="dtv-column-chip" data-v-axis="line_by">Line by: '+E((Object.prototype.hasOwnProperty.call(f,'line_by')?f.line_by:f.group)||'(None)')+' ▾</button><p class="dtv-help">Line by와 Color by의 조합마다 별도 선을 연결합니다. 같은 색으로 여러 선을 표시할 수 있어요.</p>';if(k==='scatter')s+='<label class="dtv-prop">Marker mode<select data-v-scatter-mode><option value="rows" '+(f.scatter_mode!=='aggregate'?'selected':'')+'>Individual rows</option><option value="aggregate" '+(f.scatter_mode==='aggregate'?'selected':'')+'>Aggregate markers</option></select></label>'+(f.scatter_mode==='aggregate'?'<button class="dtv-column-chip" data-v-axis="marker_by">Marker by: '+E(f.marker_by.join(' / ')||'(All rows)')+' ▾</button><p class="dtv-help">숫자형 X·Y를 그룹별로 집계합니다. Marker by·Color·Shape·Trellis 조합이 마커를 나눕니다. 날짜·문자열 좌표는 Individual rows에서 사용할 수 있습니다.</p>':'');s+=measureControls()+'<p class="dtv-help">평균·합계·Box 관측값은 숫자형이 필요해요. Count·UniqueCount는 문자열도 가능합니다. Scatter는 숫자·날짜·문자열 좌표 쌍을 지원합니다.</p>';} 
else if(tab==='Appearance'){if(['bar','boxplot'].includes(k))s+=propControl('orientation','Orientation','select',[['vertical','Vertical'],['horizontal','Horizontal']]);if(['bar','combination'].includes(k))s+=propControl('layout','Layout','select',[['grouped','Side-by-side'],['stacked','Stacked'],['percent','100% stacked']])+propControl('bar_width','Bar width','number')+(o.layout!=='grouped'?propControl('segment_sort','Sort bar segments by value')+propControl('segment_reverse','Reverse bar segment order'):'')+(o.layout==='percent'?'<p class="dtv-help">100% 누적은 음수가 없는 집계값에 사용합니다. 음수는 Side-by-side 또는 Stacked로 비교하세요.</p>':'');if(['line','combination'].includes(k))s+=propControl('line_width','Line width','number')+propControl('step','Draw as step lines')+propControl('break_empty','Break lines on empty values')+propControl('markers','Show line markers');if(k==='scatter')s+=propControl('marker_shape','Fixed shape','select',[['automatic','Automatic (Shape by)'],['circle','Circle'],['square','Square'],['triangle','Triangle'],['diamond','Diamond'],['arrow','Arrow']])+propControl('jitter','Jittering (px)','number')+propControl('marker_size','Marker size','number')+'<button class="dtv-column-chip" data-v-axis="size">Size by: '+E(f.size||'(None)')+'</button><button class="dtv-column-chip" data-v-axis="shape">Shape by: '+E(f.shape||'(None)')+'</button>';s+=propControl('opacity','Opacity (0.1–1)','number')+(k!=='scatter'?propControl('sort','Sort by','select',[['category','Category'],['value_asc','Value ascending'],['value_desc','Value descending']])+(f.measures.length>1&&k!=='boxplot'?propControl('sort_measure','Sort measure','select',f.measures.map((m,i)=>[i,label(m)])):''):'');}
else if(tab==='Colors / Legend'){s+='<button class="dtv-column-chip" data-v-axis="group">Color by: '+E(f.group||'(None)')+' ▾</button>'+propControl('palette','Color scheme','select',Object.keys(PALETTES).map(x=>[x,x]))+propControl('legend','Show legend');if(view.displayChart){const cc=view.displayChart;s+=allSeries(cc).slice(0,50).map((name,i)=>'<label class="dtv-prop"><span>'+E(name)+'</span><input type="color" data-v-series-color="'+E(name)+'" value="'+color(name,i,o)+'"></label>').join('');}}
else if(tab==='Labels / Formatting')s+=(k!=='crosstable'?propControl('labels','Show value labels'):'')+propControl('decimals','Maximum decimals','number');
else if(tab==='Trellis')s+='<button class="dtv-column-chip" data-v-axis="facet">Trellis by: '+E(f.facet||'(None)')+' ▾</button>'+propControl('trellis_columns','Panels per row','number')+propControl('trellis_scale','Scale across panels','select',[['shared','Common scale'],['panel','One scale per panel']])+'<p class="dtv-help">범주별 패널로 나누어 비교합니다. 최대 24개 패널을 표시합니다.</p>';
else if(tab==='Lines / Error Bars'){if(shownTab==='Error Bars'&&k==='scatter')return s+scatterErrorControls();s+=(['bar','line'].includes(k)&&f.measures.every(m=>m.aggregation==='mean')&&o.layout==='grouped'?propControl('error_bars','Error bars','select',[['none','(None)'],['sd','± 1 StdDev'],['se','± 1 Std Error']]):'')+(o.reference_lines||[]).map((r,i)=>'<div class="dtv-measure"><header><b>Reference line '+(i+1)+'</b><button data-v-remove-line="'+i+'">×</button></header>'+(['line','combination'].includes(k)&&f.measures.some(m=>m.axis==='right')?'<label class="dtv-prop">Axis<select data-v-ref="'+i+':axis"><option value="left" '+(r.axis!=='right'?'selected':'')+'>Left</option><option value="right" '+(r.axis==='right'?'selected':'')+'>Right</option></select></label>':'')+'<label class="dtv-prop">Value<input type="number" step="any" data-v-ref="'+i+':value" value="'+r.value+'"></label><label class="dtv-prop">Label<input data-v-ref="'+i+':label" value="'+E(r.label||'')+'"></label><label class="dtv-prop">Color<input type="color" data-v-ref="'+i+':color" value="'+(r.color||'#a55b49')+'"></label></div>').join('')+'<button class="dtv-column-chip" data-v-add-line>＋ Reference line</button>';}
else if(tab==='Statistics')s+=propControl('box_whiskers','Whiskers','select',[['tukey','Adjacent values (1.5 × IQR)'],['minmax','Minimum / maximum']])+propControl('show_mean','Show mean marker')+propControl('show_outliers','Show outliers')+propControl('statistics','Show statistics table')+'<p class="dtv-help">Q1·Median·Q3는 현재 범위 전체로 계산합니다. 수염은 1.5×IQR 안의 실제 관측값 또는 최솟값·최댓값을 선택합니다. 이상치 구분은 수염 선택과 관계없이 IQR 기준이며, 이상치 수와 표시 점 수를 구분합니다.</p>';
else if(tab==='Sorting')s+=propControl('cross_sort_mode','Sorting scope','select',[['hierarchy','Within hierarchy'],['global','Ignore hierarchy (rows)']])+propControl('cross_sort_axis','Sort axis','select',[['rows','Rows'],['columns','Columns']])+propControl('sort','Order','select',[['category','Category'],['value_asc','Value ascending'],['value_desc','Value descending']])+propControl('sort_measure','Sort measure','select',f.measures.map((m,i)=>[i,label(m)]))+'<p class="dtv-help">머리글을 클릭하면 해당 컬럼 값으로 행을 전역 정렬합니다. 계층 정렬도 선택할 수 있으며 총계 모드는 정렬값에 적용됩니다.</p>';
else if(tab==='Totals')s+=propControl('totals_mode','Calculate totals','select',[['source','Source aggregation'],['display_cells','Sum of cell values']])+propControl('totals','Show grand totals')+propControl('totals_rows','Grand-total row (bottom)')+propControl('totals_columns','Grand-total column (right)')+propControl('subtotals','Show subtotals')+propControl('subtotals_rows','Row subtotals')+propControl('subtotals_columns','Column subtotals')+subtotalControls()+propControl('heat','Color cells by value')+propControl('empty','Empty cells','select',[['blank','Blank'],['zero','Display 0']])+'<p class="dtv-help">Grand-total row는 아래쪽에 각 열의 총계를, Grand-total column은 오른쪽에 각 행의 총계를 표시합니다. Source aggregation은 원본 행을 집계합니다. Sum of cell values는 최하위 셀 값만 합하며 중간 소계를 중복 합산하지 않습니다. 빈 셀의 0 표시는 계산값을 변경하지 않습니다.</p>';
return s;}
function propertyTabs(){return view.f.chart_type==='crosstable'?['Data','Filters','Axes','Measures / Series','Formatting','Sorting','Totals','Style']:['Data','Filters','Axes','Measures / Series','Appearance','Colors','Legend','Labels','Formatting','Trellis','Lines & Curves',...(view.f.chart_type==='scatter'?['Rotation']:[]),...(['bar','line','scatter'].includes(view.f.chart_type)?['Error Bars']:[]),...(view.f.chart_type==='boxplot'?['Statistics']:[])];}
async function properties(tab='Data'){if(!view||view.g?.origin_type==='api'||!await loadSource())return;ensureDraft();propTab=({'Colors / Legend':'Colors','Labels / Formatting':'Formatting','Lines / Error Bars':'Lines & Curves'})[tab]||tab;let d=document.getElementById('dtv-properties');if(!d){d=document.createElement('dialog');d.id='dtv-properties';d.className='dtv-property-dialog dtv';document.body.append(d);d.addEventListener('close',()=>{closePopup();H.render();});}renderProperties();if(!d.open)d.showModal();}
function renderProperties(){if(view&&H.model.graphForm){const generation=autoRender?.generation;ensureAutoRender(view.source,view.g,view.f);if(generation!==autoRender?.generation)Promise.resolve().then(()=>{if(view&&H.model.graphForm){H.render();syncAutoControls();}});}const d=document.getElementById('dtv-properties');if(!d)return;if(!propertyTabs().includes(propTab))propTab='Data';d.innerHTML='<header class="dtv-property-title">'+E(LABELS[view.f.chart_type])+' Properties<button data-v-close-properties aria-label="닫기">×</button></header><div class="dtv-property-body"><nav class="dtv-property-tabs">'+propertyTabs().map(t=>'<button data-v-tab="'+t+'" class="'+(t===propTab?'active':'')+'">'+t+'</button>').join('')+'</nav><section class="dtv-property-content">'+propertyContents(propTab)+'</section></div><footer class="dtv-property-footer"><button data-v-close-properties>Close</button><button class="primary" data-v-save '+(autoRender?.status!=='ready'?'disabled':'')+'>'+(view.g?'Save changes':'Save graph')+'</button></footer>';}
function changeKind(k){if(!view||!TYPES.includes(k))return;const previous=ensureDraft();if(previous.chart_type===k){H.render();return;}const next=normalize(defaultSpec(view.source,k),view.source);for(const name of ['palette','legend','decimals'])next.options[name]=previous.options[name];next.source_ref=previous.source_ref;H.model.graphForm=next;view.f=next;H.render();if(document.getElementById('dtv-properties')?.open)renderProperties();}

async function save(){if(!view||H.model.busy)return;const f=ensureDraft(),g=view.g,ws=H.model.current;if(autoRender?.status!=='ready'||autoRender.key!==calculationKey(f)){H.toast('전체 데이터 차트가 준비되면 저장할 수 있어요.');return;}f.y=f.measures[0]?.column;f.aggregation=f.measures[0]?.aggregation;delete f.ys;delete f.auto_note;const body={...clone(f),workspace_id:ws.id,expected_revision:ws.revision,source_version:view.source?.version,graph_id:g?.id,title:g?.title||(view.source?.title||'Data')+' · '+LABELS[f.chart_type],query_id:H.uuid(),render_id:autoRender?.render_id||undefined};H.model.busy={label:'그래프 저장 중',query_id:body.query_id,cancelable:true};document.getElementById('dtv-properties')?.close();closePopup();H.render();try{const r=await H.api(g?'/graph/update':'/graph/create',body);stopAutoWork();autoRender=null;H.apply(r.workspace);H.model.graphForm=null;H.model.graphSetupSource=null;H.model.tab='graph';H.showResult();}catch(e){await H.fail(e);}finally{H.model.busy=null;H.render();}}
function showTip(el,event){const p=(view?.displayChart||view?.g?.chart)?.data?.[Number(el.dataset.vPoint)];if(!p)return;if(!tip){tip=document.createElement('div');tip.className='dtv-tip';document.body.append(tip);}tip.textContent=tooltip(p,view.displayChart||view.g.chart);tip.style.left=Math.max(8,Math.min(innerWidth-350,event.clientX+14))+'px';tip.style.top=Math.min(innerHeight-tip.offsetHeight-10,event.clientY+14)+'px';}
function hideTip(){tip?.remove();tip=null;}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function exportChart(type){if(!view?.g)return;if(type==='svg'&&e44Export())return;if(type==='csv'){const c=view.displayChart;if(!c){H.toast('차트 계산이 완료되면 내보낼 수 있어요.');return;}const lines=[['Rows','Columns','Measure','Value','Non-null count']];for(const p of c.data)lines.push([(p.r||[]).join(' / '),(p.c||[]).join(' / '),label(c.measures[p.measure]),p.y??'',p.n]);const csv=lines.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');downloadBlob(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}),view.g.canonical_ref+'.csv');return;}const displayed=view.displayChart;if(!displayed){H.toast('차트 계산이 완료되면 내보낼 수 있어요.');return;}const plots=[...document.querySelectorAll('#dtv-root svg.dtv-svg')];if(!plots.length)return;
const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('xmlns',ns);
const perRow=plots.length>1?Number(view.f.options.trellis_columns||2):1,rows=Math.ceil(plots.length/perRow),legend=allSeries(displayed);
const width=700*perRow,height=60+450*rows+Math.ceil(legend.length/3)*24;
svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
const style=document.createElementNS(ns,'style');style.textContent='text{font:11px Segoe UI,Malgun Gothic,sans-serif;fill:#5b626c}.dtv-axis{stroke:#89929e;stroke-width:.8}.dtv-grid{stroke:#e6e9ed;stroke-width:.65}';svg.append(style);
const bg=document.createElementNS(ns,'rect');bg.setAttribute('width','100%');bg.setAttribute('height','100%');bg.setAttribute('fill','white');svg.append(bg);
function caption(text,x,y,size=12){const t=document.createElementNS(ns,'text');t.textContent=text;t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('style','font-size:'+size+'px');svg.append(t);}
caption(view.g.title,20,25,17);caption(view.g.canonical_ref+' · '+view.g.source_ref+' · '+displayed.scope,20,45);
plots.forEach((plot,i)=>{const x=(i%perRow)*700,y=60+Math.floor(i/perRow)*450;const copy=plot.cloneNode(true);copy.setAttribute('x',x);copy.setAttribute('y',y+20);copy.setAttribute('width',700);copy.setAttribute('height',420);copy.querySelector('.dtv-brush')?.remove();copy.querySelectorAll('[style]').forEach(el=>{el.style.opacity='';});svg.append(copy);caption(plot.closest('.dtv-facet')?.querySelector('h4')?.textContent||'',x+20,y+15);});
if(view.f.options.legend!==false)legend.forEach((name,i)=>caption('● '+name,20+(i%3)*(width/3),75+450*rows+Math.floor(i/3)*24));
downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),view.g.canonical_ref+'.svg');}

function previewHTML(g){const previous=view;try{view={id:g.canonical_ref,source:null,g,f:normalize(g.spec||{}),displayChart:g.chart};return chartHTML(g.chart);}finally{view=previous;}}
function mount(){if(view&&H.model.graphForm&&document.getElementById('dtv-root'))ensureAutoRender(view.source,view.g,view.f);mountInteractions();mountE44();}
/* v2.5 interaction helpers. Insert inside the existing visualization IIFE.
 * Replaces selection / mark / updateMarking; call installInteractions from init,
 * mountInteractions from mount. State stores indices and viewport ranges only.
 * No database requests are made by marking, panning, zooming or context menus.
 */
let activeZoomPanel='', vInteractionInstalled=false, vGesture=null, vContext=null;
let vContextElement=null, vRenderFrame=0, vSuppressClickUntil=0;
const vLoadedStates=new Set(), vSharedMarks=new Map();
const V_NS='http://www.w3.org/2000/svg';

function vChart(){return view?.displayChart||view?.g?.chart||null;}
function vStateId(){
  const g=view?.g,c=vChart();
  const computation={type:c?.type,x_columns:c?.x_columns||[c?.x_column||null],
    series_pairs:(c?.series_pairs||[]).map(p=>({x:p.x,y:p.y,aggregation:p.aggregation,x_aggregation:p.x_aggregation})),
    measures:(c?.measures||[]).map(m=>({column:m.column,aggregation:m.aggregation,x_aggregation:m.x_aggregation,x:m.x,type:c?.type==='combination'?m.type:null})),
    series_types:c?.type==='combination'?c?.options?.series_types:null,series_labels:c?.type==='combination'?(c?.measures||[]).map(m=>label(m)):null,rotation_column:c?.rotation_column,rotation_aggregation:c?.options?.rotation_aggregation,cumulative_order:(c?.measures||[]).some(m=>m.aggregation==='cumulative_sum')?[c?.options?.sort,c?.options?.reverse]:null,
    time_transforms:c?.time_transforms,axis_hierarchies:c?.axis_hierarchies,group_column:c?.group_column,line_column:c?.line_column,scatter_mode:c?.scatter_mode,marker_columns:c?.marker_columns||c?.marker_by,shape_column:c?.shape_column,size_column:c?.size_column,facet_column:c?.facet_column,rows:c?.rows,columns:c?.columns};
  return [view?.id||'draft',g?.created_at||'',JSON.stringify(computation),
    g?.source_ref||view?.f?.source_ref||'',g?.source_version||view?.source?.version||0,
    c?.snapshot_id||''].join('|');
}
function vStorageKey(){return 'datatalk.visuals.v2.5.'+vStateId();}
function vZoomMapKey(panel=''){return vStateId()+'|zoom:'+String(panel);}
function vLoadState(){
  const id=vStateId();if(vLoadedStates.has(id))return;vLoadedStates.add(id);
  try{
    const old=JSON.parse(sessionStorage.getItem(vStorageKey())||'null');
    if(!old||old.version!==1)return;
    const n=vChart()?.data?.length||0;
    if(Array.isArray(old.selected))marks.set(id,new Set(old.selected.filter(i=>Number.isInteger(i)&&i>=0&&i<n)));
    if(old.zooms&&typeof old.zooms==='object')for(const [panel,z] of Object.entries(old.zooms)){
      if(panel.length<300&&z&&typeof z==='object')zooms.set(vZoomMapKey(panel),vCleanZoom(z));
    }
  }catch{/* Storage denial must not prevent analysis. */}
}
function vPersistState(){
  if(!view?.g)return;
  const prefix=vStateId()+'|zoom:',z={};
  for(const [k,value] of zooms)if(k.startsWith(prefix))z[k.slice(prefix.length)]=value;
  try{
    const state={version:1,selected:[...(marks.get(vStateId())||[])].slice(0,20000),zooms:z};
    sessionStorage.setItem(vStorageKey(),JSON.stringify(state));
    const keys=Object.keys(sessionStorage).filter(k=>k.startsWith('datatalk.visuals.v2.5.'));
    for(const k of keys.slice(0,Math.max(0,keys.length-40)))sessionStorage.removeItem(k);
  }catch{/* Keep memory state when browser storage is unavailable/full. */}
}
function selection(){vLoadState();const id=vStateId();if(!marks.has(id))marks.set(id,new Set());return marks.get(id);}
function vClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function vCleanRange(r){
  if(!Array.isArray(r)||r.length!==2||!r.every(Number.isFinite))return [0,100];
  let a=vClamp(r[0],0,99.75),b=vClamp(r[1],.25,100);
  if(b-a<.25)b=Math.min(100,a+.25);
  return [a,b];
}
function vCleanZoom(z){return {x:vCleanRange(z?.x),y:vCleanRange(z?.y),right:vCleanRange(z?.right)};}
function getZoom(panel=activeZoomPanel){vLoadState();return clone(zooms.get(vZoomMapKey(panel))||{x:[0,100],y:[0,100],right:[0,100]});}
function vRerender(){
  if(vRenderFrame)return;
  vRenderFrame=requestAnimationFrame(()=>{
    vRenderFrame=0;
    const focused=document.activeElement,track=focused?.closest?.('[data-v-range-track]'),svg=focused?.matches?.('svg.dtv-svg')?focused:null;
    const restore=track?{axis:track.dataset.vRangeTrack,panel:track.dataset.vPanel||'',end:focused.dataset.vRangeEnd}:svg?{panel:vPlot(svg).zoomKey}:null;
    H.render();
    if(restore?.axis){const next=[...document.querySelectorAll('#dtv-root [data-v-range-track]')].find(el=>el.dataset.vRangeTrack===restore.axis&&(el.dataset.vPanel||'')===restore.panel);next?.querySelector(restore.end===undefined?'[data-v-range-pan]':'[data-v-range-end="'+restore.end+'"]')?.focus({preventScroll:true});}
    else if(restore){[...document.querySelectorAll('#dtv-root svg.dtv-svg')].find(el=>vPlot(el).zoomKey===restore.panel)?.focus({preventScroll:true});}
  });
}
function setZoom(panel,z,render=true){zooms.set(vZoomMapKey(panel),vCleanZoom(z));vPersistState();if(render)vRerender();}
function resetZoom(panel=null){
  const prefix=vStateId()+'|zoom:';
  for(const k of [...zooms.keys()])if(k.startsWith(prefix)&&(panel===null||k===vZoomMapKey(panel)))zooms.delete(k);
  vPersistState();vRerender();
}
function vPlot(svg){
  try{const p=JSON.parse(svg.dataset.vPlot||'{}');if([p.L,p.T,p.PW,p.PH].every(Number.isFinite))return {...p,zoomKey:p.zoomKey||''};}catch{}
  return {L:65,T:25,PW:605,PH:330,xHorizontal:true,zoomKey:''};
}
function vPoint(svg,event){
  const matrix=svg.getScreenCTM();
  if(matrix){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const q=p.matrixTransform(matrix.inverse());return {x:q.x,y:q.y};}
  const r=svg.getBoundingClientRect(),b=svg.viewBox.baseVal;
  return {x:(event.clientX-r.left)*b.width/r.width,y:(event.clientY-r.top)*b.height/r.height};
}
function vInside(p,f){return p.x>=f.L&&p.x<=f.L+f.PW&&p.y>=f.T&&p.y<=f.T+f.PH;}
function vBoundPoint(p,f){return {x:vClamp(p.x,f.L,f.L+f.PW),y:vClamp(p.y,f.T,f.T+f.PH)};}
function vFractions(p,f){
  const a=vClamp((p.x-f.L)/f.PW,0,1),b=vClamp((p.y-f.T)/f.PH,0,1);
  const values=f.xHorizontal===false?{x:b,y:a,right:a}:{x:a,y:1-b,right:1-b};
  if(f.xReverse)values.x=1-values.x;
  if(f.yReverse)values.y=1-values.y;
  if(f.rightReverse??f.yReverse)values.right=1-values.right;
  return values;
}
function vGesturePoint(g,event){
  if(g.inverse){const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(g.inverse);return {x:p.x,y:p.y};}
  return {x:(event.clientX-g.screenRect.left)*g.viewBox.width/g.screenRect.width,y:(event.clientY-g.screenRect.top)*g.viewBox.height/g.screenRect.height};
}
function vScope(){const c=vChart();return c?.scope==='bounded_sample'?'displayed_sample':c?.scope==='preview'?'preview_items':'rendered_items';}
function vSourceLinkKey(){const g=view?.g,c=vChart();return g&&c?.snapshot_id?key([g.source_ref,g.source_version,c.snapshot_id]):null;}
function vDescriptor(p){
  if(p?.selection)return clone(p.selection);
  const c=vChart();return p&&Number.isInteger(p.row_index)&&c?.snapshot_id?{kind:'row',row_index:p.row_index,snapshot_id:c.snapshot_id}:null;
}
function vCriteriaIncludes(candidate,wanted){
  const entries=Object.entries(wanted||{});
  return entries.every(([n,v])=>Object.prototype.hasOwnProperty.call(candidate||{},n)&&key(candidate[n])===key(v));
}
function vDescriptorIncluded(candidate,selected){
  if(!candidate||!selected||!candidate.snapshot_id||candidate.snapshot_id!==selected.snapshot_id)return false;
  if(['range','polygon'].includes(selected.kind)){
    const row=candidate.criteria||{};if(!vCriteriaIncludes(row,selected.criteria))return false;
    if(selected.kind==='range')return selected.bounds.every(b=>row[b.column]!=null&&Number(row[b.column])>=b.min&&Number(row[b.column])<=b.max);
    const x=row[selected.x_column],y=row[selected.value_column],tr=(v,n)=>selected.axis_scales?.[n]==='log'?Math.log10(v):Number(v);return x!=null&&y!=null&&vInPolygon({x:tr(x,'x'),y:tr(y,'y')},selected.vertices.map(p=>({x:tr(p[0],'x'),y:tr(p[1],'y')})));
  }
  if(selected.kind==='row')return candidate.kind==='row'?candidate.row_index===selected.row_index:candidate.kind==='group'&&vCriteriaIncludes(selected.criteria,candidate.criteria)&&(!candidate.value_column||selected.criteria?.[candidate.value_column]!=null)&&(!candidate.valid_pairs_only||selected.criteria?.[candidate.x_column]!=null);
  if(selected.kind==='group'){if(candidate.kind==='group'&&candidate.value_column===selected.value_column&&!!candidate.valid_pairs_only===!!selected.valid_pairs_only&&(!selected.valid_pairs_only||candidate.x_column===selected.x_column)&&vCriteriaIncludes(selected.criteria,candidate.criteria))return true;return vCriteriaIncludes(candidate.criteria,selected.criteria)&&(candidate.kind!=='row'||(!selected.value_column||candidate.criteria?.[selected.value_column]!=null)&&(!selected.valid_pairs_only||candidate.criteria?.[selected.x_column]!=null));}
  return false;
}
function vSyncRelatedMarks(){
  const sourceKey=vSourceLinkKey(),shared=sourceKey&&vSharedMarks.get(sourceKey),c=vChart();
  if(!shared||shared.graph_ref===view?.id&&shared.state_id===vStateId()||!c?.data)return;
  const result=new Set();
  c.data.forEach((p,i)=>{const d=vDescriptor(p);if(shared.descriptors.some(s=>vDescriptorIncluded(d,s)))result.add(i);});
  marks.set(vStateId(),result);
  resolveRelatedMarking(shared,c);
}
function vEmitMarking(){
  if(markRequest){markRequest.controller.abort();H.api('/cancel',{query_id:markRequest.query_id}).catch(()=>{});markRequest=null;}
  const c=vChart(),g=view?.g;if(!c||!g)return;
  const selected=[...selection()].sort((a,b)=>a-b).map(index=>({point_index:index,selection:vDescriptor(c.data[index])}));
  const descriptors=selected.map(x=>x.selection).filter(Boolean),sourceKey=vSourceLinkKey();
  if(sourceKey)vSharedMarks.set(sourceKey,{graph_ref:view.id,state_id:vStateId(),descriptors});
  document.dispatchEvent(new CustomEvent('DataTalk:marking',{detail:{
    version:1,origin:'DataTalkVisuals',graph_ref:g.canonical_ref||view.id,
    source_ref:g.source_ref,source_version:g.source_version,snapshot_id:c.snapshot_id||null,
    scope:vScope(),chart_scope:c.scope,filters:clone(view.f.filters||[]),selected,selected_item_count:selected.length,
    mapping_complete:selected.length===descriptors.length,
    note:'표시 항목의 선택입니다. 원본 전체 행 선택과 동일하지 않을 수 있습니다.'
  }}));
}
function updateMarking(){
  const root=document.getElementById('dtv-root');if(!root||!view)return;
  const m=selection(),c=vChart();
  for(const el of root.querySelectorAll('[data-v-point]')){
    const on=m.has(Number(el.dataset.vPoint));
    el.classList.toggle('dtv-marked',on);el.classList.toggle('dtv-selected',on);
    if(el.tagName.toLowerCase()!=='td')el.style.opacity=m.size&&!on?'.18':'';
    el.setAttribute('aria-pressed',String(on));
  }
  for(const el of root.querySelectorAll('[data-v-series]')){
    const indices=(c?.data||[]).map((p,i)=>seriesMatches(p,c,el.dataset.vSeries)?i:-1).filter(i=>i>=0);
    const any=indices.some(i=>m.has(i));el.style.opacity=m.size&&(el.tagName.toLowerCase()==='path'||!any)?'.18':'';
    el.setAttribute('aria-pressed',String(indices.length>0&&indices.every(i=>m.has(i))));
  }
  for(const el of root.querySelectorAll('[data-v-line-segment]')){const ids=JSON.parse(el.dataset.vLineSegment);el.toggleAttribute('hidden',!(m.size&&ids.every(i=>m.has(i))));}
  for(const el of root.querySelectorAll('[data-v-legend]')){
    const indices=(c?.data||[]).map((p,i)=>seriesOf(p,c)===el.dataset.vLegend?i:-1).filter(i=>i>=0);
    el.setAttribute('aria-pressed',String(indices.length>0&&indices.every(i=>m.has(i))));
  }
  const status=document.getElementById('dtv-marking-status');
  if(status)status.textContent=markRequest?.id===vStateId()?'선택한 원본 행과 이 차트의 교집합을 확인 중…':m.size?m.size+'개 표시 항목 선택'+(c?.scope==='bounded_sample'?' · 표본에 표시된 항목 기준':'')+' · Selection details로 확인':'클릭·드래그: 선택 · Alt: 올가미 · Shift: 이동 · Ctrl+휠: 확대';
}
function mark(indices,mode='replace'){
  const m=selection(),limit=vChart()?.data?.length||0;
  const ids=[...new Set(indices)].filter(i=>Number.isInteger(i)&&i>=0&&i<limit);
  if(mode===true)mode='toggle';if(mode===false)mode='replace';
  if(mode==='replace')m.clear();
  const remove=false; // Ctrl+rectangle adds, as specified by Spotfire's marking guide.
  for(const i of ids){if(mode==='toggle'?m.has(i):remove)m.delete(i);else m.add(i);}
  updateMarking();vPersistState();vEmitMarking();for(const chart of e44Charts.values()){chart.dispatchAction({type:'unselect',seriesIndex:'all'});const option=chart.getOption();option.series.forEach((series,si)=>{const selected=series.data.map((p,di)=>m.has(p?._point_index)?di:-1).filter(i=>i>=0);if(selected.length)chart.dispatchAction({type:'select',seriesIndex:si,dataIndex:selected});});}
}
function vIndicesForSeries(s){const c=vChart();return (c?.data||[]).map((p,i)=>seriesMatches(p,c,s)?i:-1).filter(i=>i>=0);}
function vHeaderIndices(el){
  const c=vChart();if(!c)return [];
  let values,axis;
  try{if(el.dataset.vRowPrefix!==undefined){values=JSON.parse(el.dataset.vRowPrefix);axis='r';}else{values=JSON.parse(el.dataset.vColPrefix);axis='c';}}catch{return [];}
  return c.data.map((p,i)=>Array.isArray(p[axis])&&(el.dataset.vCrossMeasure===undefined||p.measure===Number(el.dataset.vCrossMeasure))&&values.every((v,j)=>key(v)===key(p[axis][j]))?i:-1).filter(i=>i>=0);
}
function vInPolygon(p,vertices){
  let inside=false;
  for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
    const a=vertices[i],b=vertices[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function vSegmentCross(a,b,c,d){
  const cc=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  return cc(a,b,c)*cc(a,b,d)<=0&&cc(c,d,a)*cc(c,d,b)<=0&&Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)>=Math.min(a.y,b.y);
}
function vLassoHitsRect(points,b){
  const corners=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}];
  if(corners.some(p=>vInPolygon(p,points))||points.some(p=>p.x>=b.x&&p.x<=b.x+b.width&&p.y>=b.y&&p.y<=b.y+b.height))return true;
  for(let i=0;i<points.length;i++)for(let j=0;j<4;j++)if(vSegmentCross(points[i],points[(i+1)%points.length],corners[j],corners[(j+1)%4]))return true;
  return false;
}
function vShapeBounds(el){
  try{const b=el.getBBox(),m=el.ownerSVGElement.getCTM().inverse().multiply(el.getCTM()),v=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)),xs=v.map(p=>p.x),ys=v.map(p=>p.y);return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};}catch{return null;}
}
function vSelectedInGesture(g,last){
  const x=Math.min(g.first.x,last.x),y=Math.min(g.first.y,last.y),w=Math.abs(g.first.x-last.x),h=Math.abs(g.first.y-last.y);
  const result=new Set();
  for(const el of g.svg.querySelectorAll('[data-v-point]')){
    const b=vShapeBounds(el);if(!b)continue;
    const clipped={x:Math.max(b.x,g.frame.L),y:Math.max(b.y,g.frame.T),width:Math.min(b.x+b.width,g.frame.L+g.frame.PW)-Math.max(b.x,g.frame.L),height:Math.min(b.y+b.height,g.frame.T+g.frame.PH)-Math.max(b.y,g.frame.T)};
    if(clipped.width<0||clipped.height<0)continue;
    if(g.axis){const c=vChart(),p=c.data[Number(el.dataset.vPoint)],bar=(c.type==='bar'||c.type==='combination'&&seriesType(p,c)!=='line')&&el.tagName.toLowerCase()==='rect',horizontal=g.frame.xHorizontal===false;const coord=g.axis==='x'?bar&&horizontal?(p.y<0?b.x:b.x+b.width):b.x+b.width/2:bar&&!horizontal?(p.y<0?b.y+b.height:b.y):b.y+b.height/2;const low=g.axis==='x'?x:y,high=low+(g.axis==='x'?w:h);if(coord>=low&&coord<=high)result.add(Number(el.dataset.vPoint));continue;}
    if(g.mode==='lasso'?vLassoHitsRect(g.points,clipped):clipped.x+clipped.width>=x&&clipped.x<=x+w&&clipped.y+clipped.height>=y&&clipped.y<=y+h)result.add(Number(el.dataset.vPoint));
  }
  return [...result];
}
function vOverlay(g,last){
  let el=g.svg.querySelector('.dtv-gesture');
  if(!el){el=document.createElementNS(V_NS,g.mode==='lasso'?'path':'rect');el.classList.add('dtv-gesture');el.setAttribute('pointer-events','none');el.setAttribute('fill',g.mode==='zoom'?'#3e8f6740':'#438acb26');el.setAttribute('stroke',g.mode==='zoom'?'#2a8050':'#397eba');el.setAttribute('stroke-width','1');el.setAttribute('stroke-dasharray','4 3');g.svg.append(el);}
  if(g.mode==='lasso')el.setAttribute('d',g.points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join('')+'Z');
  else{el.setAttribute('x',Math.min(g.first.x,last.x));el.setAttribute('y',Math.min(g.first.y,last.y));el.setAttribute('width',Math.abs(g.first.x-last.x));el.setAttribute('height',Math.abs(g.first.y-last.y));}
}
function vMappedRange(range,a,b){return vCleanRange([range[0]+(range[1]-range[0])*Math.min(a,b),range[0]+(range[1]-range[0])*Math.max(a,b)]);}
function vShiftRange(range,delta){const width=range[1]-range[0],lo=vClamp(range[0]+delta,0,100-width);return [lo,lo+width];}
function vFinishGesture(event,cancel=false){
  const g=vGesture;if(!g)return;vGesture=null;document.body.classList.remove('dtv-interacting');
  g.svg?.querySelector('.dtv-gesture')?.remove();
  if(cancel||g.state!==vStateId())return;
  if(g.slider){if(g.moved)vSuppressClickUntil=Date.now()+100;vPersistState();return;}
  const end=vBoundPoint(vGesturePoint(g,event),g.frame);
  if(g.moved){
    vSuppressClickUntil=Date.now()+150;
    if(g.mode==='zoom'){
      if(Math.abs(end.x-g.first.x)<3||Math.abs(end.y-g.first.y)<3)return;
      const a=vFractions(g.first,g.frame),b=vFractions(end,g.frame),z=g.zoom;
      setZoom(g.frame.zoomKey,{x:vMappedRange(z.x,a.x,b.x),y:vMappedRange(z.y,a.y,b.y),right:vMappedRange(z.right,a.right,b.right)});
    }else if(g.mode==='rect'||g.mode==='lasso')mark(vSelectedInGesture(g,end),g.ctrl?(g.mode==='lasso'?'toggle':'region'):'replace');
  }else if(g.mode!=='pan'&&g.mode!=='zoom'){
    if(g.point!==null){const c=vChart(),p=c.data[g.point];if(c.type==='line'||c.type==='combination'&&seriesType(p,c)==='line')mark(vIndicesForSeries(lineKey(p,c)),g.ctrl?'toggle':'replace');else mark([g.point],g.ctrl?'toggle':'replace');}
    else if(g.series!==null)mark(vIndicesForSeries(g.series),g.ctrl?'toggle':'replace');
    else if(!g.ctrl)mark([]);
  }
}
function vZoomToSelection(){
  if(e44ZoomSelection())return;
  const root=document.getElementById('dtv-root'),selected=selection();
  if(!selected.size){H.toast('확대할 표시 항목을 먼저 선택해 주세요.');return;}
  let changed=false;
  for(const svg of root?.querySelectorAll('svg.dtv-svg')||[]){
    const f=vPlot(svg),bounds=[...svg.querySelectorAll('[data-v-point]')].filter(el=>selected.has(Number(el.dataset.vPoint))).map(vShapeBounds).filter(Boolean);
    if(!bounds.length)continue;
    const l=vClamp(Math.min(...bounds.map(b=>b.x))-f.PW*.04,f.L,f.L+f.PW),r=vClamp(Math.max(...bounds.map(b=>b.x+b.width))+f.PW*.04,f.L,f.L+f.PW);
    const t=vClamp(Math.min(...bounds.map(b=>b.y))-f.PH*.04,f.T,f.T+f.PH),b=vClamp(Math.max(...bounds.map(b=>b.y+b.height))+f.PH*.04,f.T,f.T+f.PH);
    const a=vFractions({x:l,y:t},f),z=vFractions({x:r,y:b},f),old=getZoom(f.zoomKey);
    setZoom(f.zoomKey,{x:vMappedRange(old.x,a.x,z.x),y:vMappedRange(old.y,a.y,z.y),right:vMappedRange(old.right,a.right,z.right)},false);changed=true;
  }
  if(changed)vRerender();else H.toast('선택 항목이 현재 표시 범위 밖에 있습니다. Reset zoom 후 다시 시도해 주세요.');
}

function vPanelLabel(panel){const c=vChart();if(!c)return 'Main panel';const pair=/^pair(\d+)-facet(\d+)$/.exec(panel||''),facet=/^facet(\d+)$/.exec(panel||'');let title='Main panel',fi=facet?Number(facet[1]):pair?Number(pair[2]):0;if(pair){const p=c.series_pairs?.[Number(pair[1])];if(p)title=p.x+' × '+p.y;}if(c.facet_column){const values=[...new Set(c.data.map(p=>key(p.facet??null)))];if(values[fi]!==undefined)title+=(title==='Main panel'?'':' · ')+c.facet_column+': '+String(JSON.parse(values[fi]));}return title;}
function zoomControlsHTML(panel=activeZoomPanel){
  const c=vChart();if(!c||c.type==='crosstable'||c.options?.zoom===false)return '';
  const z=getZoom(panel),right=c.measures?.some(m=>m.axis==='right');
  return '<div class="dtv-zoom-controls" data-v-zoom-controls><div class="dtv-zoom-caption">Zoom <span>'+E(vPanelLabel(panel))+'</span><small>양끝: 범위 · 가운데: 이동</small></div>'+['x','y',...(right?['right']:[])].map(axis=>'<div class="dtv-zoom-row"><b>'+axis.toUpperCase()+'</b><div class="dtv-range-track" data-v-range-track="'+axis+'" data-v-panel="'+E(panel)+'"><div class="dtv-range-selected" data-v-range-pan style="left:'+z[axis][0]+'%;width:'+(z[axis][1]-z[axis][0])+'%" role="slider" tabindex="0" aria-label="'+axis.toUpperCase()+' 범위 이동" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(z[axis][0])+'"></div><button class="dtv-range-handle" data-v-range-end="0" style="left:'+z[axis][0]+'%" role="slider" aria-label="'+axis.toUpperCase()+' 시작" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(z[axis][0])+'"></button><button class="dtv-range-handle" data-v-range-end="1" style="left:'+z[axis][1]+'%" role="slider" aria-label="'+axis.toUpperCase()+' 끝" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.round(z[axis][1])+'"></button></div><span>'+z[axis].map(v=>Math.round(v)+'%').join(' – ')+'</span><button data-v-zoom-axis-reset="'+axis+'" data-v-panel="'+E(panel)+'" title="축 범위 초기화">↺</button></div>').join('')+'</div>';
}
function vRefreshZoomControls(){
  const old=document.querySelector('#dtv-root [data-v-zoom-controls]');
  if(old)old.outerHTML=zoomControlsHTML();
}
function vCloseContext(){vContextElement?.remove();vContextElement=null;vContext=null;}
function vContextValid(snapshot){return snapshot&&snapshot.state===vStateId()&&snapshot.graph_ref===view?.id;}
function vContextItem(action,text,disabled=false,extra=''){return '<button role="menuitem" data-v-context="'+action+'" '+(disabled?'disabled':'')+' '+extra+'>'+text+'</button>';}
function vOpenContext(event){
  const target=event.target.closest?.('#dtv-root');if(!target||!view)return;
  event.preventDefault();closePopup();hideTip();vCloseContext();
  const point=event.target.closest('[data-v-point]'),legend=event.target.closest('[data-v-legend],[data-v-series]'),axis=event.target.closest('[data-v-axis]'),header=event.target.closest('[data-v-row-prefix],[data-v-col-prefix]'),svg=event.target.closest('svg.dtv-svg');
  let region=point?'point':legend?'legend':axis?'axis':header?'header':'background',axisName=axis?.dataset.vAxis||'x';
  if(svg){const p=vPoint(svg,event),f=vPlot(svg),pair=/^pair(\d+)-/.exec(f.zoomKey||''),chart=vChart(),left='m'+(pair?Number(pair[1]):Math.max(0,(chart?.measures||[]).findIndex(m=>m.axis!=='right'))),right='m'+Math.max(0,(chart?.measures||[]).findIndex(m=>m.axis==='right')),x=pair?'mx'+pair[1]:'x';activeZoomPanel=f.zoomKey;if(!point&&!legend){if(p.y>f.T+f.PH){region='axis';axisName=f.xHorizontal===false?left:x;}else if(p.x<f.L){region='axis';axisName=f.xHorizontal===false?x:left;}else if(p.x>f.L+f.PW&&f.right){region='axis';axisName=right;}else if(f.xHorizontal===false&&p.y<f.T&&f.right){region='axis';axisName=right;}}}
  if(point&&!selection().has(Number(point.dataset.vPoint)))mark([Number(point.dataset.vPoint)]);
  const c=vChart(),readonly=view.g?.origin_type==='api';
  vContext={state:vStateId(),graph_ref:view.id,region,axis:axisName,series:legend?.dataset.vLegend??legend?.dataset.vSeries??null,point:point?Number(point.dataset.vPoint):null,header_prefix:header?JSON.parse(header.dataset.vColPrefix||header.dataset.vRowPrefix||'[]'):[],header_axis:header?.dataset.vColPrefix!==undefined?'rows':'columns',header_measure:Number(header?.dataset.vCrossMeasure||0),header_indices:header?vHeaderIndices(header):[],panel:activeZoomPanel,anchor:{left:event.clientX,top:event.clientY,bottom:event.clientY,right:event.clientX}};
  let items='';
  if(region==='axis')items+=vContextItem('select-axis','Select columns…',readonly)+vContextItem('axes','Axis range / Scale…',readonly)+vContextItem('format','Format…',readonly)+vContextItem('reset-panel','Reset panel zoom');
  else if(region==='legend')items+=vContextItem('mark-series','Mark series')+vContextItem('series-color','Change color…',readonly)+vContextItem('series-properties','Series properties…',readonly);
  else if(region==='point')items+=vContextItem('details','Selection details…')+vContextItem('zoom-selection','Zoom to selection',c?.type==='crosstable')+(c?.type==='crosstable'?vContextItem('copy-value','Copy value'):'')+(c?.type==='boxplot'?vContextItem('statistics','Statistics…',readonly):'');
  else if(region==='header')items+=vContextItem('mark-header','Mark values')+vContextItem('cross-sort-asc','Sort ascending',readonly)+vContextItem('cross-sort-desc','Sort descending',readonly)+vContextItem('cross-sort-none','No sorting',readonly)+vContextItem('totals','Totals / Subtotals…',readonly)+vContextItem('format','Format…',readonly);
  else items+=vContextItem('properties','Properties…',readonly)+vContextItem('details','Selection details…',!selection().size)+vContextItem('zoom-selection','Zoom to selection',!selection().size||c?.type==='crosstable')+vContextItem('duplicate','Duplicate chart',readonly||!view.g||!!H.model.busy);
  if(['bar','combination'].includes(c?.type))items+='<hr>'+['grouped','stacked','percent'].map((layout,i)=>vContextItem('layout',['Side-by-side','Stacked','100% stacked'][i],readonly,'data-v-layout="'+layout+'"')).join('');
  items+='<hr>'+vContextItem('clear','Clear marking',!selection().size)+vContextItem('reset','Reset zoom',c?.type==='crosstable')+vContextItem('export',c?.type==='crosstable'?'Export CSV':'Export SVG');
  vContextElement=document.createElement('div');vContextElement.className='dtv dtv-context-menu';vContextElement.setAttribute('role','menu');vContextElement.setAttribute('aria-label','Visualization menu');vContextElement.innerHTML='<header class="dtv-popup-title" data-popup-drag>Visualization menu</header>'+items;document.body.append(vContextElement);
  vContextElement.style.left=Math.max(8,Math.min(innerWidth-vContextElement.offsetWidth-8,event.clientX))+'px';vContextElement.style.top=Math.max(8,Math.min(innerHeight-vContextElement.offsetHeight-8,event.clientY))+'px';vContextElement.querySelector('button:not(:disabled)')?.focus();
}
function vCsvCell(value){let text=String(value??'');if(typeof value==='string'&&/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function vPreviewMatches(row,columns,descriptor){
  if(!descriptor?.criteria)return false;
  const entries=Object.entries(descriptor.criteria);
  if(!entries.length)return descriptor.kind==='group';
  return entries.every(([name,value])=>{const i=columns.findIndex(c=>c.name===name);if(i<0)return false;const actual=Array.isArray(row)?row[i]:row[name];return actual===value||actual!=null&&value!=null&&String(actual)===String(value);});
}
function vDetails(){
  const c=vChart(),g=view?.g;if(!c||!g)return;
  const selected=[...selection()].sort((a,b)=>a-b),points=selected.map(i=>c.data[i]).filter(Boolean);
  if(!points.length){H.toast('확인할 표시 항목을 먼저 선택해 주세요.');return;}
  document.getElementById('dtv-selection-dialog')?.remove();
  const columns=tableCols(view.source),descriptors=points.map(vDescriptor).filter(Boolean),source=view.source;
  const currentVersion=source?.version===g.source_version;
  const preview=currentVersion?(source?.rows||[]).filter(row=>descriptors.some(d=>vPreviewMatches(row,columns,d))).slice(0,100):[];
  const d=document.createElement('dialog');d.id='dtv-selection-dialog';d.className='dtv dtv-selection-dialog';
  d.innerHTML='<header><strong>Selection details · '+E(g.canonical_ref)+'</strong><button data-v-close-details aria-label="Close">×</button></header><p>'+E(g.source_ref)+' v'+E(g.source_version)+' · '+points.length+'개 표시 항목 · '+E(c.scope)+'</p><p class="dtv-help">선택된 점·막대·셀의 결과입니다. 집계 항목 수는 원본 행 수와 다릅니다. 표본 차트의 선택은 표시된 표본에 한정됩니다.</p><div class="dtv-selection-scroll"><table><thead><tr><th>Item</th><th>Series / Group</th><th>X / Rows</th><th>Value</th><th>N</th></tr></thead><tbody>'+points.slice(0,500).map((p,i)=>'<tr><td>'+E(selected[i]+1)+'</td><td>'+E(seriesOf(p,c))+'</td><td>'+E(c.type==='crosstable'?(p.r||[]).join(' / ')+' | '+(p.c||[]).join(' / '):p.x??p.group)+'</td><td>'+E(fmt(p.y??p.mean,c.options))+'</td><td>'+E(p.n??p.selection?.row_count??'—')+'</td></tr>').join('')+'</tbody></table></div>'+(points.length>500?'<p>화면에는 500개까지 표시합니다. Export selection은 선택된 표시 항목 전체를 내보냅니다.</p>':'')+'<h4>Source preview · 원본 미리보기</h4><p class="dtv-help">'+(!currentVersion?'원본 테이블 버전이 달라 미리보기를 연결하지 않았습니다.':preview.length?'선택 조건에 일치하는 현재 원본 미리보기를 최대 100행 표시합니다. 선택된 전체 원본 행을 조회한 결과가 아닙니다.':'현재 원본 미리보기에서 일치하는 행을 확인하지 못했습니다. 전체 데이터에 행이 없다는 뜻은 아닙니다.')+'</p>'+(preview.length?'<div class="dtv-selection-scroll"><table><thead><tr>'+columns.map(col=>'<th>'+E(col.name)+'</th>').join('')+'</tr></thead><tbody>'+preview.map(row=>'<tr>'+columns.map((col,i)=>'<td>'+E(Array.isArray(row)?row[i]:row[col.name])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'')+'<footer><button data-v-export-selection>Export selection CSV</button><button data-open-table="'+E(g.source_ref)+'" data-v-details-source>Open source table</button><button data-v-close-details>Close</button></footer>';
  document.body.append(d);
  d.addEventListener('click',event=>{
    if(event.target.closest('[data-v-close-details]'))d.close();
    if(event.target.closest('[data-v-details-source]'))d.close();
    if(event.target.closest('[data-v-export-selection]')){
      const rows=[['Display item','Series','X / Rows','Value','Count'],...points.map((p,i)=>[selected[i]+1,seriesOf(p,c),c.type==='crosstable'?(p.r||[]).join(' / ')+' | '+(p.c||[]).join(' / '):p.x??p.group,p.y??p.mean,p.n??p.selection?.row_count])];
      downloadBlob(new Blob(['\uFEFF'+rows.map(row=>row.map(vCsvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),g.canonical_ref+'_selected_display_items.csv');
    }
  });
  d.addEventListener('close',()=>d.remove());d.showModal();
}
async function vDuplicateChart(snapshot){
  if(!vContextValid(snapshot)||H.model.busy)return;
  const g=clone(view.g),ws=H.model.current,qid=H.uuid();
  H.model.busy={label:'그래프 복제 중',query_id:qid,cancelable:true};H.render();
  try{const r=await H.api('/graph/create',{...clone(g.spec),workspace_id:ws.id,expected_revision:ws.revision,source_ref:g.source_ref,source_version:g.source_version,title:g.title+' (copy)',query_id:qid});stopAutoWork();autoRender=null;H.apply(r.workspace);H.model.graphForm=null;H.model.graphSetupSource=null;H.model.tab='graph';H.showResult();}catch(e){await H.fail(e);}finally{H.model.busy=null;H.render();}
}
async function vContextAction(button){
  const snapshot=vContext,action=button.dataset.vContext;if(!snapshot)return;vCloseContext();
  if(!vContextValid(snapshot)){H.toast('그래프가 변경되었습니다. 다시 우클릭해 주세요.');return;}
  if(action==='properties')return properties('Data');
  if(action==='select-axis')return pickAxis(snapshot.axis,{getBoundingClientRect:()=>snapshot.anchor});
  const tabs={axes:'Axes',format:'Labels / Formatting','series-properties':'Measures / Series',statistics:'Statistics',totals:'Totals'};
  if(tabs[action])return properties(tabs[action]);
  if(action==='mark-series')return mark(vIndicesForSeries(snapshot.series));
  if(action==='mark-header')return mark(snapshot.header_indices);
  if(action.startsWith('cross-sort-')){const f=ensureDraft();f.options.cross_sort_axis=snapshot.header_axis;f.options.sort_measure=snapshot.header_measure;f.options.cross_sort_prefix=snapshot.header_prefix;f.options.cross_sort_mode=snapshot.header_axis==='rows'?'global':'hierarchy';f.options.sort=action==='cross-sort-none'?'category':action==='cross-sort-asc'?'value_asc':'value_desc';H.render();return;}
  if(action==='details')return vDetails();
  if(action==='zoom-selection')return vZoomToSelection();
  if(action==='clear')return mark([]);
  if(action==='reset')return resetZoom();
  if(action==='reset-panel')return resetZoom(snapshot.panel);
  if(action==='export')return exportChart(vChart()?.type==='crosstable'?'csv':'svg');
  if(action==='duplicate')return vDuplicateChart(snapshot);
  if(action==='layout'){ensureDraft().options.layout=button.dataset.vLayout;H.render();return;}
  if(action==='copy-value'){
    const value=String(vChart()?.data?.[snapshot.point]?.y??'');
    try{await navigator.clipboard.writeText(value);H.toast('값을 복사했습니다.');}catch{H.toast('클립보드 권한이 없어 복사하지 못했습니다. Selection details에서 값을 선택해 주세요.');}
    return;
  }
  if(action==='series-color'){
    const f=ensureDraft(),input=document.createElement('input');input.type='color';input.value=/^#[0-9a-f]{6}$/i.test(f.options.color_map?.[snapshot.series])?f.options.color_map[snapshot.series]:'#4b85b8';input.style.position='fixed';input.style.left='-100px';document.body.append(input);
    input.addEventListener('change',()=>{if(vContextValid(snapshot)){f.options.color_map[snapshot.series]=input.value;H.render();}input.remove();},{once:true});input.addEventListener('blur',()=>setTimeout(()=>input.remove(),300),{once:true});input.click();
  }
}

function mountInteractions(){
  const root=document.getElementById('dtv-root');if(!root)return;
  const panels=[...root.querySelectorAll('svg.dtv-svg')].map(svg=>vPlot(svg).zoomKey);
  if(panels.length&&!panels.includes(activeZoomPanel))activeZoomPanel=panels[0];
  root.querySelectorAll('svg.dtv-svg').forEach(svg=>{svg.setAttribute('tabindex','0');svg.setAttribute('aria-label',(svg.getAttribute('aria-label')||'Chart')+' · Ctrl+휠 확대, Shift+드래그 이동, Alt+드래그 올가미 선택');});
  vSyncRelatedMarks();updateMarking();vRefreshZoomControls();
  if(vContext&&!vContextValid(vContext))vCloseContext();
  if(!root.querySelector('[data-v-details]')&&view?.g){const tools=root.querySelector('.dtv-tools');if(tools){const button=document.createElement('button');button.dataset.vDetails='';button.textContent='Selection details';tools.append(button);}}
}
function installInteractions(){
  if(vInteractionInstalled)return;vInteractionInstalled=true;
  document.addEventListener('pointerdown',event=>{
    if(vContextElement&&!vContextElement.contains(event.target))vCloseContext();
    if(popup&&!popup.contains(event.target)&&!event.target.closest('[data-v-axis]'))closePopup();
    const track=event.target.closest('#dtv-root [data-v-range-track]');
    if(track&&event.button===0){
      event.preventDefault();const panel=track.dataset.vPanel||'',axis=track.dataset.vRangeTrack,z=getZoom(panel),rect=track.getBoundingClientRect(),handle=event.target.closest('[data-v-range-end]');
      activeZoomPanel=panel;vGesture={slider:true,state:vStateId(),panel,axis,zoom:z,rect,startX:event.clientX,mode:handle?'resize':'slide',end:handle?Number(handle.dataset.vRangeEnd):null,moved:false};document.body.classList.add('dtv-interacting');return;
    }
    const svg=event.target.closest('#dtv-root svg.dtv-svg');if(!svg||![0,1].includes(event.button))return;
    const frame=vPlot(svg),first=vPoint(svg,event);if(event.target.closest('[data-v-axis]'))return;const axis=!vInside(first,frame)?first.x<frame.L&&first.y>=frame.T&&first.y<=frame.T+frame.PH?'y':first.y>frame.T+frame.PH&&first.x>=frame.L&&first.x<=frame.L+frame.PW?'x':null:null;if(!vInside(first,frame)&&!axis)return;
    activeZoomPanel=frame.zoomKey;vRefreshZoomControls();
    const mode=event.ctrlKey&&event.altKey&&event.shiftKey?'zoom':event.button===1||event.shiftKey?'pan':event.altKey?'lasso':'rect';
    if(mode==='zoom'&&vChart()?.options?.zoom===false){H.toast('Properties → Axes에서 Show zoom sliders를 켜 주세요.');return;}
    event.preventDefault();svg.focus({preventScroll:true});hideTip();
    const el=event.target.closest('[data-v-point]'),series=event.target.closest('[data-v-series]');
    vGesture={state:vStateId(),pointer:event.pointerId,svg,frame,axis,first,points:[first],inverse:svg.getScreenCTM()?.inverse(),screenRect:svg.getBoundingClientRect(),viewBox:{width:svg.viewBox.baseVal.width,height:svg.viewBox.baseVal.height},client:{x:event.clientX,y:event.clientY},ctrl:event.ctrlKey||event.metaKey,mode,zoom:getZoom(frame.zoomKey),point:el?Number(el.dataset.vPoint):null,series:series?.dataset.vSeries??null,moved:false};document.body.classList.add('dtv-interacting');
  });
  document.addEventListener('pointermove',event=>{
    const g=vGesture;
    if(!g){const point=event.target.closest('#dtv-root [data-v-point]');if(point)showTip(point,event);else hideTip();return;}
    if(g.state!==vStateId()){vFinishGesture(event,true);return;}
    event.preventDefault();
    if(g.slider){
      const delta=(event.clientX-g.startX)/g.rect.width*100;g.moved=g.moved||Math.abs(delta)>.1;
      const z=clone(g.zoom),range=z[g.axis];
      if(g.mode==='slide')z[g.axis]=vShiftRange(range,delta);
      else if(g.end===0)z[g.axis]=[vClamp(range[0]+delta,0,range[1]-.25),range[1]];
      else z[g.axis]=[range[0],vClamp(range[1]+delta,range[0]+.25,100)];
      setZoom(g.panel,z);return;
    }
    const end=vBoundPoint(vGesturePoint(g,event),g.frame);
    g.moved=g.moved||Math.hypot(event.clientX-g.client.x,event.clientY-g.client.y)>4;if(!g.moved)return;
    if(g.mode==='pan'){
      const a=vFractions(g.first,g.frame),b=vFractions(end,g.frame),z=clone(g.zoom);
      for(const axis of ['x','y','right'])z[axis]=vShiftRange(g.zoom[axis],(a[axis]-b[axis])*(g.zoom[axis][1]-g.zoom[axis][0]));
      setZoom(g.frame.zoomKey,z);return;
    }
    if(g.mode==='lasso'&&Math.hypot(end.x-g.points[g.points.length-1].x,end.y-g.points[g.points.length-1].y)>2)g.points.push(end);
    vOverlay(g,end);
  },{passive:false});
  document.addEventListener('pointerup',event=>vFinishGesture(event));
  document.addEventListener('pointercancel',event=>vFinishGesture(event,true));
  window.addEventListener('blur',()=>{if(vGesture){vGesture.svg?.querySelector('.dtv-gesture')?.remove();vGesture=null;document.body.classList.remove('dtv-interacting');}hideTip();vCloseContext();});
  document.addEventListener('wheel',event=>{
    const svg=event.target.closest('#dtv-root svg.dtv-svg');if(!svg||!event.ctrlKey||vChart()?.options?.zoom===false)return;
    const f=vPlot(svg),p=vPoint(svg,event);if(!vInside(p,f))return;
    event.preventDefault();activeZoomPanel=f.zoomKey;const frac=vFractions(p,f),z=getZoom(f.zoomKey),factor=vClamp(Math.exp(event.deltaY*(event.deltaMode===1?.035:.0015)),.5,2);
    for(const axis of ['x','y','right']){const range=z[axis],width=vClamp((range[1]-range[0])*factor,.25,100),anchor=range[0]+(range[1]-range[0])*frac[axis],lo=vClamp(anchor-width*frac[axis],0,100-width);z[axis]=[lo,lo+width];}
    setZoom(f.zoomKey,z);
  },{passive:false});
  document.addEventListener('click',event=>{
    if(event.target.closest('#dtv-root')&&Date.now()<vSuppressClickUntil){event.preventDefault();event.stopImmediatePropagation();return;}
    const context=event.target.closest('[data-v-context]');if(context){event.preventDefault();if(!context.disabled)vContextAction(context);return;}
    const b=event.target.closest('button'),root=event.target.closest('#dtv-root');if(!root)return;
    if(b?.dataset.vLegend!==undefined){mark(vIndicesForSeries(b.dataset.vLegend),event.ctrlKey||event.metaKey?'toggle':'replace');return;}
    if(b?.dataset.vReset!==undefined){resetZoom();return;}
    if(b?.dataset.vClear!==undefined){mark([]);return;}
    if(b?.dataset.vDetails!==undefined){vDetails();return;}
    if(b?.dataset.vZoomAxisReset!==undefined){const panel=b.dataset.vPanel||'',z=getZoom(panel);z[b.dataset.vZoomAxisReset]=[0,100];setZoom(panel,z);return;}
    const header=event.target.closest('[data-v-row-prefix],[data-v-col-prefix]');
    if(header&&event.shiftKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();vOpenContext(event);vContextAction({dataset:{vContext:view.f.options.sort==='value_asc'?'cross-sort-desc':'cross-sort-asc'}});return;}
    if(header&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();vOpenContext(event);return;}
    if(header&&event.altKey){event.preventDefault();event.stopImmediatePropagation();mark(vHeaderIndices(header),event.ctrlKey||event.metaKey?'region':'replace');return;}
    const td=event.target.closest('td[data-v-point]');if(td)mark([Number(td.dataset.vPoint)],event.ctrlKey||event.metaKey?'toggle':'replace');
  },true);
  document.addEventListener('contextmenu',vOpenContext);
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){if(vGesture)vFinishGesture(event,true);vCloseContext();closePopup();hideTip();return;}
    if(vContextElement?.contains(event.target)){
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=[...vContextElement.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}return;
    }
    const root=event.target.closest?.('#dtv-root');if(!root||event.target.matches('input,textarea,select,[contenteditable=true]'))return;
    const range=event.target.closest('[data-v-range-track]');
    if(range&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const panel=range.dataset.vPanel||'',axis=range.dataset.vRangeTrack,z=getZoom(panel),r=z[axis],end=event.target.dataset.vRangeEnd,step=event.shiftKey?10:1;
      if(end!==undefined){const i=Number(end),d=event.key==='Home'?0:event.key==='End'?100:r[i]+(event.key==='ArrowRight'?step:-step);z[axis]=i===0?[vClamp(d,0,r[1]-.25),r[1]]:[r[0],vClamp(d,r[0]+.25,100)];}
      else z[axis]=vShiftRange(r,event.key==='Home'?-100:event.key==='End'?100:event.key==='ArrowRight'?step:-step);
      setZoom(panel,z);return;
    }
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();mark((vChart()?.data||[]).map((_,i)=>i));return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='e'){event.preventDefault();mark([]);return;}
    if(['Enter',' '].includes(event.key)&&event.target.matches('[data-v-axis]')){event.preventDefault();pickAxis(event.target.dataset.vAxis,event.target);return;}
    if(['Enter',' '].includes(event.key)&&event.target.matches('[data-v-point],[data-v-series]')){event.preventDefault();const p=event.target.dataset.vPoint;if(p!==undefined)mark([Number(p)],event.ctrlKey||event.metaKey?'toggle':'replace');else mark(vIndicesForSeries(event.target.dataset.vSeries),event.ctrlKey||event.metaKey?'region':'replace');}
  });
  document.addEventListener('DataTalk:marking',event=>{
    const d=event.detail;if(!d||d.origin==='DataTalkVisuals'||!d.snapshot_id||!Array.isArray(d.selected))return;
    const sourceKey=key([d.source_ref,d.source_version,d.snapshot_id]);
    vSharedMarks.set(sourceKey,{graph_ref:d.graph_ref,descriptors:d.selected.map(s=>s.selection).filter(Boolean)});
    if(sourceKey===vSourceLinkKey()){vSyncRelatedMarks();updateMarking();}
  });
}

function init(host){H=host;
document.addEventListener('click',e=>{const axis=e.target.closest('[data-v-axis]');if(axis&&!axis.disabled&&axis.tagName.toLowerCase()!=='button'){pickAxis(axis.dataset.vAxis,axis);return;}const b=e.target.closest('button');if(!b||b.disabled)return;if(featureClick(b))return;
if(b.dataset.vSeriesToggle!==undefined){pickSeriesType(b.dataset.vSeriesToggle,b);return;}
if(b.dataset.vSeriesKind!==undefined){const f=ensureDraft();f.options.series_types[popup.dataset.series]=b.dataset.vSeriesKind;if(b.dataset.vSeriesKind==='bar'){f.options.log_y=false;f.options.log_right=false;}finishAxisChange();return;}
if(b.dataset.vAggToggle!==undefined){const menu=popup?.querySelector('.dtv-aggregation-menu');if(menu){menu.hidden=!menu.hidden;b.setAttribute('aria-expanded',String(!menu.hidden));window.DataTalkDialogs?.clamp(popup);}return;}
if(b.dataset.vAggMore!==undefined){const menu=popup.querySelector('.dtv-aggregation-more');menu.hidden=!menu.hidden;b.setAttribute('aria-expanded',String(!menu.hidden));return;}
if(b.dataset.vAggChoice){setAggregation(b.dataset.vAggChoice);return;}
if(b.dataset.vFilterRemove!==undefined){commitFilters(view.f.filters.filter((_,i)=>i!==Number(b.dataset.vFilterRemove)));return;}
if(b.dataset.vFilterClear!==undefined){commitFilters([]);return;}
if(b.dataset.vFilterApply!==undefined){const column=document.getElementById('dtv-filter-column').value,type=kind(tableCols(view.source).find(c=>c.name===column)?.type),values=document.getElementById('dtv-filter-values').value.split(/\r?\n/).filter(v=>type==='number'||type==='boolean'?v.trim()!=='':v!=='').map(v=>type==='number'?Number(v):type==='boolean'?v.trim().toLowerCase()==='true'?true:v.trim().toLowerCase()==='false'?false:NaN:v);if(values.some(v=>typeof v==='number'&&!num(v))){H.toast(type==='boolean'?'Boolean 필터에는 true 또는 false를 입력하세요.':'숫자형 필터에는 숫자를 입력하세요.');return;}if(document.getElementById('dtv-filter-null').checked)values.push(null);commitFilters([...view.f.filters.filter(q=>q.column!==column),{column,values}]);return;}
if(b.dataset.vAxisAdd){const n=b.dataset.vAxisAdd;pickAxis(['left','right','values'].includes(n)?'addm_'+(n==='right'?'right':'left'):n,b,'add');return;}
if(b.dataset.vRetry!==undefined){retryAutoRender();return;}
if(b.dataset.vCrossSort!==undefined){if(e.altKey)return;const f=ensureDraft(),mi=Number(b.dataset.vCrossSort);f.options.sort=f.options.sort_measure===mi&&f.options.sort==='value_desc'?'value_asc':'value_desc';f.options.sort_measure=mi;f.options.cross_sort_mode='global';H.render();return;}
if(b.dataset.vKind){changeKind(b.dataset.vKind);return;}if(b.dataset.vProperties){properties(b.dataset.vProperties);return;}if(b.dataset.vAxis){pickAxis(b.dataset.vAxis,b);return;}if(b.dataset.vTab){propTab=b.dataset.vTab;renderProperties();return;}if(b.dataset.vCloseProperties!==undefined){document.getElementById('dtv-properties').close();return;}
if(b.dataset.vCol!==undefined){chooseColumn(b);return;}
if(b.dataset.vPickerDone!==undefined){closePopup();return;}if(b.dataset.vTypes!==undefined){const ref=view?.f?.source_ref;closePopup();document.getElementById('dtv-properties')?.close();H.openTableTypes(ref);return;}
if(b.dataset.vSave!==undefined){save();return;}if(b.dataset.vCancel!==undefined){deactivate();H.model.graphForm=null;H.model.graphSetupSource=null;H.model.tab='table';H.render();return;}
if(b.dataset.vExport){exportChart(b.dataset.vExport);return;}
if(b.dataset.vAddMeasure!==undefined){const f=view.f,cols=tableCols(view.source),n=cols.find(c=>kind(c.type)==='number'&&!f.measures.some(m=>m.column===c.name))||cols.find(c=>kind(c.type)==='number')||(f.chart_type==='scatter'?cols[0]:null);f.measures.push({column:n?.name||null,x:f.chart_type==='scatter'?f.x:undefined,x_aggregation:f.chart_type==='scatter'&&f.scatter_mode==='aggregate'?'mean':'none',aggregation:f.chart_type==='scatter'&&f.scatter_mode==='aggregate'?'mean':['scatter','boxplot'].includes(f.chart_type)?'none':n?'mean':'count_rows',type:'line',axis:f.chart_type==='combination'?'right':'left'});renderProperties();return;}if(b.dataset.vRemoveMeasure!==undefined){const f=ensureDraft();if(f.measures.length<2)return;f.measures.splice(Number(b.dataset.vRemoveMeasure),1);f.options.sort_measure=Math.min(f.options.sort_measure,f.measures.length-1);if(f.chart_type==='scatter'){f.x_columns=[...new Set(f.measures.map(m=>m.x))];f.x=f.x_columns[0];}finishAxisChange();return;}
if(b.dataset.vRemoveDim){const [n,ix]=b.dataset.vRemoveDim.split(':'),axis=n==='x_columns'?'x':n,i=Number(ix),f=ensureDraft(),items=axisDimensions(f,axis);if(items[i]===COLUMN_NAMES)return;if(axis==='x'&&items.length===1){H.toast('X축 컬럼은 하나 이상 필요합니다.');return;}if(f.chart_type==='crosstable'&&f.rows.length+f.columns.length<=1){H.toast('행 또는 열에 실제 컬럼을 하나 이상 유지해 주세요.');return;}const removed=items.splice(i,1)[0];setAxisDimensions(f,axis,items);if(axis==='x'&&f.chart_type==='scatter')f.measures=f.measures.filter(m=>m.x!==removed);finishAxisChange();return;}
if(b.dataset.vMoveDim){const [n,ix,dir]=b.dataset.vMoveDim.split(':'),axis=n==='x_columns'?'x':n,i=Number(ix),j=i+Number(dir),f=ensureDraft(),arr=axisDimensions(f,axis);if(j>=0&&j<arr.length)[arr[i],arr[j]]=[arr[j],arr[i]];setAxisDimensions(f,axis,arr);const target=popup?.dataset.target,r=popup?.getBoundingClientRect(),mode=popup?.dataset.mode,ixn=popup?.dataset.index;H.render();if(target)pickAxis(target,{getBoundingClientRect:()=>({...r,bottom:r.top-5})},mode,ixn);else renderProperties();return;}
if(b.dataset.vMoveMeasure){const [ix,dir]=b.dataset.vMoveMeasure.split(':'),i=Number(ix),j=i+Number(dir),arr=ensureDraft().measures;if(j>=0&&j<arr.length)[arr[i],arr[j]]=[arr[j],arr[i]];H.render();renderProperties();return;}
if(b.dataset.vAllPairs!==undefined){const f=view.f,ys=[...new Map(f.measures.map(m=>[m.column,m])).values()];if(f.x_columns.length*ys.length>12){H.toast('조합이 '+f.x_columns.length*ys.length+'개입니다. 최대 12쌍까지 선택해 주세요.');return;}f.measures=f.x_columns.flatMap(x=>ys.map(m=>({...clone(m),x})));renderProperties();H.toast(f.measures.length+'개 XY 좌표 쌍을 만들었어요. 아래 목록을 확인해 주세요.');return;}
if(b.dataset.vAddLine!==undefined){if(view.f.options.reference_lines.length<8)view.f.options.reference_lines.push({value:0,label:'Reference',color:'#a55b49',axis:'left'});renderProperties();return;}if(b.dataset.vRemoveLine!==undefined){view.f.options.reference_lines.splice(Number(b.dataset.vRemoveLine),1);renderProperties();return;}
if(b.dataset.vFold){const id=view.id;if(!collapsed.has(id))collapsed.set(id,new Set());const set=collapsed.get(id);set.has(b.dataset.vFold)?set.delete(b.dataset.vFold):set.add(b.dataset.vFold);H.render();return;}
});
document.addEventListener('input',e=>{featureInput(e.target);if(e.target.dataset.vSearch!==undefined){const q=e.target.value.toLowerCase();popup?.querySelectorAll('[data-search]').forEach(el=>el.hidden=!el.dataset.search.includes(q));}});
document.addEventListener('change',e=>{const el=e.target;if(featureChange(el))return;if(el.dataset.vPickerLabel!==undefined){const target=popup?.dataset.target,m=popup?._pendingMetric||view.f.measures[Number(target?.slice(1))];if(m){m.label=el.value||undefined;H.render();}return;}if(el.dataset.vScatterMode!==undefined){const f=ensureDraft();f.scatter_mode=el.value;f.options.error_bars='none';f.options.error_bars_x='none';f.measures.forEach(m=>{m.aggregation=f.scatter_mode==='aggregate'?'mean':'none';m.x_aggregation=f.scatter_mode==='aggregate'?'mean':'none';});H.render();renderProperties();return;}if(el.dataset.vOpt){let value=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?null:Number(el.value)):el.value;if(el.dataset.vOpt==='sort_measure')value=Number(value);view.f.options[el.dataset.vOpt]=value;if(el.dataset.vOpt==='layout'&&value!=='grouped'){view.f.options.error_bars='none';view.f.options.log_y=false;view.f.options.log_right=false;}H.render();return;}
if(el.dataset.vAgg!==undefined){const i=Number(el.dataset.vAgg),pending=popup?._pendingMetric,m=pending||view.f.measures[i];if(!m)return;resetAutoLabel(m);m.aggregation=el.value;if(el.value!=='mean')view.f.options.error_bars='none';if(el.value==='count_rows')m.column=null;else if(!['count','distinct'].includes(el.value)&&kind(tableCols(view.source).find(c=>c.name===m.column)?.type)!=='number')m.column=null;const target=popup.dataset.target,r=popup.getBoundingClientRect(),mode=popup.dataset.mode,ix=popup.dataset.index;if(pending&&el.value==='count_rows'){view.f.measures.push({...pending});finishAxisChange();return;}pickAxis(target,{getBoundingClientRect:()=>({...r,bottom:r.top-5})},mode,ix);if(!pending)H.render();return;}
if(el.dataset.vM){const [i,k]=el.dataset.vM.split(':');if(['aggregation','column'].includes(k))resetAutoLabel(view.f.measures[Number(i)]);view.f.measures[Number(i)][k]=el.value;clearInvalidLogs(view.f,view.source,true);H.render();renderProperties();return;}if(el.dataset.vRef){const [i,k]=el.dataset.vRef.split(':');view.f.options.reference_lines[Number(i)][k]=k==='value'?Number(el.value):el.value;H.render();return;}
if(el.dataset.vSeriesColor){view.f.options.color_map[el.dataset.vSeriesColor]=el.value;H.render();return;}if(el.dataset.vScope!==undefined){view.f.scope=el.value;H.render();return;}
if(el.dataset.vChartType!==undefined){changeKind(el.value);return;}if(el.dataset.vSource!==undefined){const t=sourceFor(el.value);if(!t)return;view.source=t;const old=view.f;view.f=normalize({...defaultSpec(t,old.chart_type),source_ref:el.value},t);H.model.graphForm=view.f;H.model.graphSetupSource=t;H.render();renderProperties();return;}
});
document.addEventListener('dragstart',e=>{const b=e.target.closest('[data-v-dim-drag]');if(b)e.dataTransfer.setData('application/x-datatalk-axis',b.dataset.vDimDrag);});
document.addEventListener('dragover',e=>{if(e.target.closest('[data-axis-zone]')&&Array.from(e.dataTransfer.types).includes('application/x-datatalk-axis'))e.preventDefault();});
document.addEventListener('drop',e=>{const zone=e.target.closest('[data-axis-zone]'),value=e.dataTransfer.getData('application/x-datatalk-axis');if(!zone||!value)return;e.preventDefault();const [from,ix]=value.split(':'),to=zone.dataset.axisZone;if(!['x','rows','columns','marker_by'].includes(to))return;const f=ensureDraft(),a=axisDimensions(f,from),n=a[Number(ix)],b=from===to?a:axisDimensions(f,to),target=e.target.closest('[data-v-axis-index]'),at=target?Number(target.dataset.vAxisIndex):b.length;if(from!==to&&n!==COLUMN_NAMES&&b.includes(n))return;if(from==='x'&&to!=='x'&&a.length<=1&&f.chart_type!=='boxplot'){H.toast('X축에는 기준 컬럼을 하나 이상 유지해 주세요.');return;}a.splice(Number(ix),1);if(from!==to)setAxisDimensions(f,from,a);b.splice(Math.min(at,b.length),0,n);setAxisDimensions(f,to,b);if(from===to)setAxisDimensions(f,from,b);finishAxisChange();});
installInteractions();
}
// Bundled Apache ECharts 6.0.0; no CDN or external runtime requests.
const e44Charts=new Map(),e44Specs=new Map();let e44Sequence=0;
function e44HTML(c){
 if(!c?.data?.length||c.type==='crosstable')return chartFallbackHTML(c);
 const facets=[...new Set(c.data.map(p=>key(p.facet??null)))],pairs=c.type==='scatter'?(c.series_pairs?.length?c.series_pairs:[{x:c.x_column,y:c.y_column,x_type:c.x_type,y_type:c.y_type}]):[null],panels=[];
 pairs.forEach((pair,mi)=>facets.forEach(f=>{
  const data=measured(c).filter(p=>key(p.facet??null)===f&&(!pair||(p.pair??p.measure??0)===mi));if(!data.length)return;
  const id='dtv-e44-'+(++e44Sequence),sub={...c,_zoomKey:pair?'pair'+mi+'-facet'+facets.indexOf(f):'facet'+facets.indexOf(f),...(pair?{x_column:pair.x,y_column:pair.y,x_type:pair.x_type,y_type:pair.y_type}:{}),_facetValue:JSON.parse(f),_domainData:measured(c).filter(p=>!pair||(p.pair??p.measure??0)===mi),data};
  e44Specs.set(id,sub);panels.push('<div class="dtv-facet">'+(pairs.length>1||facets.length>1?'<h4>'+E((pair?pair.x+' × '+pair.y:'')+(facets.length>1?' · '+String(JSON.parse(f)):''))+'</h4>':'')+'<div class="dtv-echart44" id="'+id+'" role="img" aria-label="'+E(c.title||LABELS[c.type])+'"></div></div>');
 }));
 const cols=tableCols(view?.source),chosen=view?.f?.options?.tooltip_columns||[];
 return '<div class="dtv-e44-tools"><span>드래그로 영역 선택 · 클릭으로 항목 선택</span><details><summary>Tooltip columns</summary><select multiple data-e44-tooltip aria-label="툴팁에 추가할 컬럼">'+cols.map(q=>'<option value="'+E(q.name)+'" '+(chosen.includes(q.name)?'selected':'')+'>'+E(q.name)+'</option>').join('')+'</select></details></div><div class="dtv-plot-layout '+(c.options?.legend_position==='left'?'legend-left ':'')+(!c.options?.legend?'no-legend':'')+'">'+axisFrame(c,'<div class="dtv-facets" style="--facets:'+Math.min(panels.length,c.options?.trellis_columns||2)+'">'+panels.join('')+'</div>')+e44Legend(c)+'</div>'+statistics(c);
}

function e44Legend(c){const o={...DEFAULT,...c.options};return !o.legend?'':'<div class="dtv-legend">'+(o.legend_selector?'<button data-v-axis="group">'+E(view?.f?.group||'(Column Names)')+' ▾</button>':o.legend_title?'<strong>'+E(view?.f?.group||'(Column Names)')+'</strong>':'')+allSeries(c).slice(0,o.legend_max_values).map((name,i)=>'<div class="dtv-legend-row"><button data-v-legend="'+E(name)+'"><i style="background:'+seriesColor(c,name,i,o)+'"></i>'+E(name)+'</button>'+(c.type==='combination'?'<button data-v-series-toggle="'+E(name)+'">'+E(seriesType(c.data.find(p=>seriesOf(p,c)===name),c,o))+' ▾</button>':'')+'</div>').join('')+'</div>';}

function chartHTML(c){return e44HTML(c);}
function e44AnovaTooltip(p,c){
 const f=v=>Number.isFinite(v)?fmt(v,{decimals:4}):'—';
 const means=c.analysis_scope==='all_unit_means',lines=['그룹: '+p.group,(means?'분석 대상 수 n: ':'표본 수 n: ')+f(p.n)];
 if(Number.isFinite(p.mean))lines.push('평균: '+f(p.mean));
 if(Number.isFinite(p.std??p.sd))lines.push('표준편차: '+f(p.std??p.sd));
 if(c.type==='mean_ci')lines.push((Number.isFinite(c.confidence_level)?f(c.confidence_level*100)+'% ':'')+'신뢰구간: '+f(p.ci_low)+' ~ '+f(p.ci_high));
 else{
  lines.push('중앙값: '+f(p.median),'Q1 / Q3: '+f(p.q1)+' / '+f(p.q3),'수염: '+f(p.whisker_low)+' ~ '+f(p.whisker_high));
  if(Number.isFinite(p.sample_count))lines.push('분포 계산에 사용: '+f(p.sample_count)+(means?'개 대상 평균':'개 관측'));
  if(Number.isFinite(p.sample_outlier_count))lines.push('분포 표본 내 이상치: '+f(p.sample_outlier_count)+'개 (개별 점 생략)');
  if(p.approximate)lines.push('표본 기반 분포 · 전체 데이터 ANOVA 결과와 구분');
 }
 lines.push('측정값: '+(c.value_column||c.label||c.y_column||'측정값')+(c.value_unit?' ('+c.value_unit+')':''));
 lines.push(means?'대상별 평균 1개를 관측 1개로 비교 · 대상당 가중치 동일':'전체 유효 관측으로 평균·ANOVA 계산');
 if(c.omitted_groups)lines.push('차트에서 생략한 '+f(c.omitted_groups)+'개 그룹은 전체 결과표에서 확인');
 return lines.map(E).join('<br>');
}

function e44Tooltip(p,c){
 if(c.analysis_scope && ['mean_ci','boxplot'].includes(c.type))return e44AnovaTooltip(p,c);
 let text=tooltip(p,c);const criteria=p.row_criteria||p.selection?.criteria||{},cols=tableCols(view?.source),extras=view?.f?.options?.tooltip_columns||[];
 const defaults=cols.filter(q=>/(?:lot|wafer|root|step|eqp|equipment|chamber|time|inspection|retest|subitem|item_id|item_level|dut|^x$|^y$|bin_no)/i.test(q.name)).map(q=>q.name);
 for(const n of [...new Set([...defaults,...extras])])if(Object.prototype.hasOwnProperty.call(criteria,n))text+='\n'+n+': '+(num(criteria[n])?fmt(criteria[n]):String(criteria[n]??'NULL'));
 const m=c.measures?.[p.measure||0],meta=cols.find(q=>q.name===m?.column);if(meta?.unit)text+='\n단위: '+meta.unit;if(meta?.description)text+='\n항목: '+meta.description;
 if(p.selection?.kind==='group'||p.aggregated)text+='\n집계 기여 행: '+fmt(p.row_count??p.n)+' · 현재 필터 범위';
 if(c.scope==='bounded_sample')text+='\n표본 점 표시 · 영역 선택은 원본 전체에서 조회';
 return E(text).replace(/\n/g,'<br>');
}
function e44Option(c){
 const o={...DEFAULT,...c.options};let data=c.data;const scatter=c.type==='scatter',box=c.type==='boxplot',ci=c.type==='mean_ci',horizontal=!scatter&&o.orientation==='horizontal';
 const temporal=t=>['datetime','time'].includes(kind(t)),numeric=t=>kind(t)==='number',cast=(v,t)=>v==null?null:temporal(t)?(kind(t)==='time'?timeValue(v):xValue(v,{x_type:t})):numeric(t)?Number(v):String(v);
 const category=v=>Array.isArray(v)?v.map(x=>num(x)?fmt(x):String(x??'(Empty)')).join(' / '):num(v)?fmt(v):String(v??'(Empty)');
 if(c.type==='line'&&o.line_normalized){data=data.map(p=>{const v=c.data.filter(q=>lineKey(q,c)===lineKey(p,c)&&num(q.y)).map(q=>q.y),lo=Math.min(...v),hi=Math.max(...v),factor=hi===lo?0:100/(hi-lo);return {...p,raw_y:p.y,y:num(p.y)?(p.y-lo)*factor:null,sd:num(p.sd)?p.sd*factor:null,se:num(p.se)?p.se*factor:null};});}
 const domainData=o.trellis_scale==='shared'&&c.facet_column&&!o.line_normalized?(c._domainData||data):data;
 const catValue=p=>box||ci?p.group:p.x;const rawCats=[...new Map(domainData.map(p=>[key(catValue(p)),catValue(p)])).values()];
 if(o.sort==='category')rawCats.sort(categoryCompare);else{const score=v=>data.filter(p=>key(catValue(p))===key(v)&&(box||ci||(p.measure||0)===Number(o.sort_measure||0))).reduce((sum,p)=>sum+(p.y??p.mean??p.median??0),0);rawCats.sort((a,b)=>(score(a)-score(b))*(o.sort==='value_desc'?-1:1));}
 const cats=rawCats.map(key);
 const seriesName=p=>c.type==='line'||c.type==='combination'&&seriesType(p,c,o)==='line'?lineKey(p,c):seriesOf(p,c);const names=[...new Set(data.map(seriesName))],series=[];
 const xContinuous=!box&&!ci&&!horizontal&&(numeric(c.x_type)||temporal(c.x_type))&&(scatter||c.type==='line'||o.x_mode==='continuous')&&o.x_mode!=='categorical';
 const yContinuous=scatter&&(numeric(c.y_type)||temporal(c.y_type))&&o.y_mode!=='categorical';
 const point=(p,value)=>({value,_point_index:p._index,_point:p,symbol:['circle','rect','triangle','diamond','arrow'][markerShape(o,p,[...new Set(data.map(q=>String(q.shape??'')))])]||'circle',symbolRotate:(p.rotation||0)*(o.rotation_direction==='counterclockwise'?-1:1),symbolOffset:scatter&&o.jitter?[Math.sin(((p._index??0)+1)*12.9898)*o.jitter,Math.sin(((p._index??0)+1)*78.233)*o.jitter]:[0,0]});
 if(box){
  series.push({name:'Distribution',type:'boxplot',layout:horizontal?'horizontal':'vertical',data:cats.map(cat=>{const p=data.find(p=>key(p.group)===cat);return p?point(p,[p.whisker_low,p.q1,p.median,p.q3,p.whisker_high]):{value:null};}),itemStyle:{color:'#a9c8ef',borderColor:'#3e6eab'},selectedMode:'multiple'});
  const out=[];data.forEach((p,i)=>(p.outliers||[]).forEach(v=>out.push(point(p,horizontal?[v,cats.indexOf(key(p.group))]:[cats.indexOf(key(p.group)),v]))));if(o.show_outliers&&out.length)series.push({name:'Outliers',type:'scatter',data:out,symbolSize:5});
  if(o.show_mean&&data.some(p=>num(p.mean)))series.push({name:'Mean',type:'scatter',symbol:'diamond',symbolSize:8,data:data.filter(p=>num(p.mean)).map(p=>point(p,horizontal?[p.mean,key(p.group)]:[key(p.group),p.mean])),selectedMode:'multiple'});
 }else if(ci){
  series.push({name:'Mean',type:'scatter',data:data.map(p=>point(p,horizontal?[p.mean,key(p.group)]:[key(p.group),p.mean])),symbolSize:9});
  series.push({name:'CI',type:'custom',encode:{x:horizontal?[1,2]:[0],y:horizontal?[0]:[1,2]},data:data.map(p=>point(p,[key(p.group),p.ci_low,p.ci_high])),renderItem:(params,api)=>{const lo=api.coord(horizontal?[api.value(1),api.value(0)]:[api.value(0),api.value(1)]),hi=api.coord(horizontal?[api.value(2),api.value(0)]:[api.value(0),api.value(2)]);return {type:'group',children:[{type:'line',shape:{x1:lo[0],y1:lo[1],x2:hi[0],y2:hi[1]},style:{stroke:'#466a99',lineWidth:2}},{type:'line',shape:{x1:lo[0]-(horizontal?0:5),y1:lo[1]-(horizontal?5:0),x2:lo[0]+(horizontal?0:5),y2:lo[1]+(horizontal?5:0)},style:{stroke:'#466a99'}},{type:'line',shape:{x1:hi[0]-(horizontal?0:5),y1:hi[1]-(horizontal?5:0),x2:hi[0]+(horizontal?0:5),y2:hi[1]+(horizontal?5:0)},style:{stroke:'#466a99'}}]};}});
 }else for(const [si,name] of names.entries()){
  const points=data.filter(p=>seriesName(p)===name),m=c.measures?.[points[0]?.measure||0]||{},type=scatter?'scatter':c.type==='combination'?seriesType(points[0],c,o):c.type;
  const values=scatter?points.map(p=>point(p,[xContinuous?cast(p.x,c.x_type):key(p.x),yContinuous?cast(p.y,c.y_type):key(p.y)])):cats.map(cat=>{
   const p=points.find(p=>key(p.x)===cat);if(!p)return {value:null};let y=p.y;
   if(o.layout==='percent'&&type==='bar'&&y!=null){const total=data.filter(q=>key(q.x)===cat).filter(q=>(c.measures?.[q.measure||0]?.axis||'left')===(m.axis||'left')&&(c.type==='bar'||seriesType(q,c,o)!=='line')).reduce((s,q)=>s+(Number(q.y)||0),0);y=total?100*y/total:null;}
   return point(p,xContinuous?[cast(p.x,c.x_type),y]:y);
  });
  series.push({name:seriesOf(points[0],c),type,data:values,...(horizontal?{xAxisIndex:m.axis==='right'?1:0}:{yAxisIndex:m.axis==='right'?1:0}),selectedMode:'multiple',select:{itemStyle:{borderWidth:2,borderColor:'#172d58'}},
   itemStyle:{color:seriesColor(c,seriesOf(points[0],c),allSeries(c).indexOf(seriesOf(points[0],c)),o),opacity:o.opacity},lineStyle:{width:o.line_width},showSymbol:o.markers,symbolSize:scatter?(q,params)=>{const p=params.data?._point;return p?.size!=null?Math.max(4,Math.min(22,Math.sqrt(Math.max(0,p.size))+4)):Math.max(4,o.marker_size*2);}:6,
   connectNulls:!o.break_empty,step:o.step?'end':false,stack:type==='bar'&&o.layout!=='grouped'?'total'+(m.axis||'left'):undefined,barWidth:(o.bar_width*100)+'%',symbol:p=>['circle','rect','triangle','diamond','arrow'][markerShape(o,{shape:p?.shape},[...new Set(data.map(q=>String(q.shape??'')))])]||'circle',symbolRotate:(value,params)=>(params.data?._point?.rotation||0)*(o.rotation_direction==='counterclockwise'?-1:1),
   barMaxWidth:70,label:{show:o.labels,formatter:p=>fmt(Array.isArray(p.value)?p.value[1]:p.value,o)}});
 }
 for(const axis of ['y','x']){const mode=axis==='y'?o.error_bars:o.error_bars_x;if(mode==='none'||box||ci)continue;
  const isX=axis==='x',items=data.filter(p=>num(isX?p.x:p.y)).map(p=>{let lo,hi;if(mode==='columns'){const v=isX?p.x:p.y,lower=isX?p.x_error_lower:p.error_lower,upper=isX?p.x_error_upper:p.error_upper;lo=num(lower)?v-lower:v;hi=num(upper)?v+upper:v;}else{const d=mode==='sd'?(isX?p.x_sd:p.sd):(isX?p.x_se:p.se),v=isX?p.x:p.y;lo=num(d)?v-d:null;hi=num(d)?v+d:null;}return {p,lo,hi};}).filter(d=>num(d.lo)&&num(d.hi));
  for(const side of ['left','right']){const subset=items.filter(d=>(c.measures?.[d.p.measure||0]?.axis||'left')===side);if(!subset.length)continue;
   series.push({name:axis+' error',type:'custom',silent:true,encode:{[horizontal?'y':'x']:o.error_include_range&&isX?[0,2,3]:[0],[horizontal?'x':'y']:o.error_include_range&&!isX?[1,2,3]:[1]},...(horizontal?{xAxisIndex:side==='right'?1:0}:{yAxisIndex:side==='right'?1:0}),data:subset.map(d=>({value:[scatter||xContinuous?cast(d.p.x,c.x_type):key(d.p.x),scatter?cast(d.p.y,c.y_type):d.p.y,d.lo,d.hi]})),renderItem:(params,api)=>{const a=[api.value(0),api.value(1)],b=[...a];a[isX?0:1]=api.value(2);b[isX?0:1]=api.value(3);if(horizontal){a.reverse();b.reverse();}const lo=api.coord(a),hi=api.coord(b),style={stroke:o.error_color==='marker'?seriesColor(c,seriesOf(subset[params.dataIndex].p,c),allSeries(c).indexOf(seriesOf(subset[params.dataIndex].p,c)),o):o.error_color,lineWidth:1.5},vertical=horizontal?isX:!isX,cap=(p)=>({type:'line',shape:{x1:p[0]-(vertical?5:0),y1:p[1]-(vertical?0:5),x2:p[0]+(vertical?5:0),y2:p[1]+(vertical?0:5)},style});return {type:'group',children:[{type:'line',shape:{x1:lo[0],y1:lo[1],x2:hi[0],y2:hi[1]},style},...(o.error_end_caps?[cap(lo),cap(hi)]:[])]};}});
  }
 }
 if(['bar','combination'].includes(c.type)&&o.layout!=='grouped'&&(o.segment_sort||o.segment_reverse)){
  const bars=series.filter(s=>s.type==='bar'),others=series.filter(s=>s.type!=='bar');series.length=0;series.push(...others);
  for(const side of [0,1]){const sources=bars.filter(s=>(horizontal?s.xAxisIndex:s.yAxisIndex)===side);if(!sources.length)continue;
   const columns=cats.map((cat,di)=>{let items=sources.map(s=>({datum:s.data[di],color:s.itemStyle.color})).filter(x=>x.datum?._point);if(o.segment_sort)items.sort((a,b)=>Math.abs(b.datum._point.y??0)-Math.abs(a.datum._point.y??0));if(o.segment_reverse)items.reverse();return items;});
   for(let rank=0;rank<sources.length;rank++)series.push({...sources[0],name:'Stack '+side+' / '+rank,data:columns.map(items=>items[rank]?{...items[rank].datum,itemStyle:{color:items[rank].color}}:{value:null})});
  }
 }
 const catAxis={type:'category',data:scatter?undefined:cats,name:c.x_column||'',axisLabel:{hideOverlap:true,formatter:v=>{try{return category(JSON.parse(v));}catch{return String(v);}}},inverse:o.reverse},valAxis={type:o.log_y?'log':'value',name:c.y_column||'',min:o.y_min??undefined,max:o.y_max??undefined,inverse:o.reverse_y};
 let xAxis=scatter||xContinuous?{type:xContinuous?(temporal(c.x_type)?'time':o.log_x?'log':'value'):'category',name:c.x_column,min:o.x_min??undefined,max:o.x_max??undefined,inverse:o.reverse,...(!xContinuous?{data:rawCats.map(key),axisLabel:{formatter:v=>category(JSON.parse(v))}}:{})}:horizontal?valAxis:catAxis;
 let yAxis=scatter?{type:yContinuous?(temporal(c.y_type)?'time':o.log_y?'log':'value'):'category',name:c.y_column,min:o.y_min??undefined,max:o.y_max??undefined,inverse:o.reverse_y,...(!yContinuous?{data:[...new Set(domainData.map(p=>key(p.y)))],axisLabel:{formatter:v=>category(JSON.parse(v))}}:{})}:horizontal?catAxis:valAxis;
 if(!scatter&&series.some(s=>s.yAxisIndex===1))yAxis=[yAxis,{type:o.log_right?'log':'value',position:'right',min:o.right_min??undefined,max:o.right_max??undefined}];
if(horizontal&&series.some(s=>s.xAxisIndex===1))xAxis=[xAxis,{type:o.log_right?'log':'value',position:'top',min:o.right_min??undefined,max:o.right_max??undefined}];
 for(const axis of [...(Array.isArray(xAxis)?xAxis:[xAxis]),...(Array.isArray(yAxis)?yAxis:[yAxis])]){axis.splitLine={show:o.grid};axis.axisLabel={...axis.axisLabel,...(axis.type==='value'||axis.type==='log'?{formatter:v=>fmt(v,o)}:{})};}
 for(const r of o.reference_lines||[]){
  const side=r.axis==='right'?1:0,indexKey=horizontal?'xAxisIndex':'yAxisIndex';
  let target=series.find(s=>(s[indexKey]||0)===side&&s.type!=='custom');
  if(!target){target={name:'Reference '+side,type:'scatter',data:[],silent:true,[indexKey]:side};series.push(target);}
  if(!target.markLine)target.markLine={silent:true,symbol:'none',data:[]};
  target.markLine.data.push({[(r.axis==='x')?'xAxis':horizontal?'xAxis':'yAxis']:r.value,name:r.label||'',lineStyle:{color:r.color||'#777',type:'dashed'}});
 }
 if(domainData!==data){
  const axes={x:Array.isArray(xAxis)?xAxis[0]:xAxis,y:Array.isArray(yAxis)?yAxis[0]:yAxis,right:horizontal?xAxis[1]:yAxis[1]};
  const extentFor=(axis,values,min,max)=>{if(!axis||axis.type==='category')return;values=values.filter(Number.isFinite).filter(v=>axis.type!=='log'||v>0);if(!values.length)return;let lo=Math.min(...values),hi=Math.max(...values);if(axis.type==='value'){const pad=(hi-lo||Math.abs(lo)||1)*.035;lo-=pad;hi+=pad;if(!scatter){lo=Math.min(0,lo);hi=Math.max(0,hi);}}if(axis.type==='log'&&lo===hi){lo/=1.1;hi*=1.1;}if(min==null)axis.min=lo;if(max==null)axis.max=hi;};
  if(scatter)extentFor(axes.x,domainData.flatMap(p=>{const v=cast(p.x,c.x_type),d=o.error_bars_x==='sd'?p.x_sd:o.error_bars_x==='se'?p.x_se:null;return o.error_include_range?[v,v-(d||p.x_error_lower||0),v+(d||p.x_error_upper||0)]:[v];}),o.x_min,o.x_max);
  for(const side of ['left','right']){const items=domainData.filter(p=>(c.measures?.[p.measure||0]?.axis||'left')===side);let values=items.flatMap(p=>box?[p.whisker_low,p.whisker_high,...(o.show_outliers?p.outliers||[]:[])]:ci?[p.ci_low,p.ci_high,p.mean]:[p.y,...(o.error_include_range&&o.error_bars!=='none'?[p.y-(o.error_bars==='sd'?p.sd:o.error_bars==='se'?p.se:p.error_lower)||p.y,p.y+(o.error_bars==='sd'?p.sd:o.error_bars==='se'?p.se:p.error_upper)||p.y]:[])]);
   if(['bar','combination'].includes(c.type)&&o.layout!=='grouped'){const stacks=new Map();items.filter(p=>c.type==='bar'||seriesType(p,c,o)==='bar').forEach(p=>{const k=key([p.facet,p.x,p.y>=0]);stacks.set(k,(stacks.get(k)||0)+(Number(p.y)||0));});values.push(...stacks.values());if(o.layout==='percent')values=values.map(v=>v<0?-100:100);}
   extentFor(side==='right'?axes.right:horizontal?axes.x:axes.y,values,side==='right'?o.right_min:o.y_min,side==='right'?o.right_max:o.y_max);
  }
 }
 const z=getZoom(c._zoomKey||'');
 return {animation:false,grid:{left:75,right:Array.isArray(yAxis)?75:40,top:70,bottom:85,containLabel:true},
  legend:{show:false,type:'scroll',top:0},tooltip:{trigger:'item',confine:true,formatter:params=>params.data?._point?e44Tooltip(params.data._point,c):''},
  toolbox:{right:8,feature:{brush:{type:['rect','polygon','clear']},dataZoom:{yAxisIndex:'none'},restore:{},saveAsImage:{type:'png'}}},
  brush:{toolbox:['rect','polygon','clear'],xAxisIndex:0,yAxisIndex:0,brushMode:'single',throttleType:'debounce',throttleDelay:200},
  dataZoom:o.zoom?[{type:'inside',[horizontal?'yAxisIndex':'xAxisIndex']:0,filterMode:'none',start:z.x[0],end:z.x[1],zoomOnMouseWheel:'ctrl',moveOnMouseMove:'shift',moveOnMouseWheel:false},{type:'inside',[horizontal?'xAxisIndex':'yAxisIndex']:0,filterMode:'none',start:z.y[0],end:z.y[1],zoomOnMouseWheel:'ctrl',moveOnMouseMove:'shift',moveOnMouseWheel:false},...((horizontal?Array.isArray(xAxis):Array.isArray(yAxis))?[{type:'inside',[horizontal?'xAxisIndex':'yAxisIndex']:1,filterMode:'none',start:z.right[0],end:z.right[1],zoomOnMouseWheel:'ctrl',moveOnMouseMove:'shift',moveOnMouseWheel:false}]:[])]:[],xAxis,yAxis,series};
}
function e44Emit(c,indices,range=null){
 const g=view?.g;if(!g||!c.snapshot_id)return;
 const regions=range?(Array.isArray(range)?range:[range]):[];
 if(regions.length){const sourceKey=vSourceLinkKey();if(sourceKey)vSharedMarks.set(sourceKey,{graph_ref:view.id,state_id:vStateId(),descriptors:regions});
  const selectedIndices=(vChart()?.data||[]).map((p,i)=>{const d=vDescriptor(p);return d&&regions.some(r=>vDescriptorIncluded(d,r))?i:-1;}).filter(i=>i>=0);marks.set(vStateId(),new Set(selectedIndices));updateMarking();vPersistState();}
 const selected=regions.length?regions.map(r=>({selection:r})):[...new Set(indices)].map(i=>{const p=(view.displayChart||g.chart)?.data?.[i];return {point_index:i,selection:vDescriptor(p)};}).filter(q=>q.selection);
 document.dispatchEvent(new CustomEvent('DataTalk:marking',{detail:{version:1,origin:'DataTalkVisuals',graph_ref:g.canonical_ref,source_ref:g.source_ref,source_version:g.source_version,snapshot_id:c.snapshot_id,scope:range?'full_range':vScope(),chart_scope:c.scope,filters:clone(view.f.filters||[]),selected,mapping_complete:true}}));
}
function mountE44(){
 for(const [id,chart] of e44Charts)if(!document.getElementById(id)){chart._dtResize44?.disconnect();chart.dispose();e44Charts.delete(id);e44Specs.delete(id);}
 for(const el of document.querySelectorAll('.dtv-echart44')){
  if(e44Charts.has(el.id))continue;const c=e44Specs.get(el.id);if(!c)continue;if(!window.echarts){if(!el.dataset.e44Missing){el.dataset.e44Missing='1';el.innerHTML='<div class="dtv-auto-message" role="alert"><p>차트 라이브러리(Apache ECharts)를 불러오지 못했습니다. 연결 HTML을 서버에서 다시 열어 주세요.</p></div>';}continue;}
  const chart=window.echarts.init(el,null,{renderer:'svg'});e44Charts.set(el.id,chart);const option=e44Option(c);chart.setOption(option);if(![...e44Specs.values()].some(q=>q._zoomKey===activeZoomPanel)){activeZoomPanel=c._zoomKey||'';vRefreshZoomControls();}el.addEventListener('pointerenter',()=>{if(activeZoomPanel!==c._zoomKey){activeZoomPanel=c._zoomKey;vRefreshZoomControls();}});
  chart._dtResize44=new ResizeObserver(()=>{if(!chart.isDisposed()&&(chart.getWidth()!==el.clientWidth||chart.getHeight()!==el.clientHeight))chart.resize();});chart._dtResize44.observe(el);
  chart.on('click',p=>{const i=p.data?._point_index;if(Number.isInteger(i)){const raw=p.data._point,indices=p.seriesType==='line'?vIndicesForSeries(lineKey(raw,c)):[i];mark(indices,p.event?.event?.ctrlKey||p.event?.event?.metaKey?'toggle':'replace');}});
  const fullRegion=c.type==='scatter'&&c.scatter_mode!=='aggregate'&&kind(c.x_type)==='number'&&kind(c.y_type)==='number'&&['value','log'].includes(option.xAxis.type)&&['value','log'].includes(option.yAxis.type);
  chart.on('brushEnd',event=>{
   const areas=event.areas||[];if(!areas.length){mark([]);return;}const regions=[];
   for(const area of areas){const r=area.coordRange;if(fullRegion&&Array.isArray(r)){
    const criteria=c.facet_column?{[c.facet_column]:c._facetValue}:{};
    if(area.brushType==='polygon'&&r.length>=3){regions.push({kind:'polygon',snapshot_id:c.snapshot_id,x_column:c.x_column,value_column:c.y_column,vertices:r,criteria,axis_scales:{x:option.xAxis.type==='log'?'log':'linear',y:option.yAxis.type==='log'?'log':'linear'}});}
    else if((!area.brushType||area.brushType==='rect')&&r.length===2){regions.push({kind:'range',snapshot_id:c.snapshot_id,bounds:[{column:c.x_column,min:Math.min(...r[0]),max:Math.max(...r[0])},{column:c.y_column,min:Math.min(...r[1]),max:Math.max(...r[1])}],criteria});}
   }}if(regions.length)e44Emit(c,[],regions);
  });
  chart.on('brushSelected',event=>{
   if(fullRegion)return;
   const indices=[];for(const batch of event.batch||[])for(const s of batch.selected||[])for(const i of s.dataIndex||[]){const p=option.series[s.seriesIndex]?.data?.[i];if(Number.isInteger(p?._point_index))indices.push(p._point_index);}mark(indices);
  });
  el.addEventListener('mousedown',e=>{chart.dispatchAction({type:'takeGlobalCursor',key:'brush',brushOption:{brushType:e.shiftKey?false:e.altKey?'polygon':'rect',brushMode:e.ctrlKey?'multiple':'single'}});},true);
  chart.on('datazoom',()=>{const options=chart.getOption(),ranges=options.dataZoom||[],previous=getZoom(c._zoomKey||'');if(ranges[0])previous.x=[ranges[0].start,ranges[0].end];if(ranges[1])previous.y=[ranges[1].start,ranges[1].end];if(ranges[2])previous.right=[ranges[2].start,ranges[2].end];setZoom(c._zoomKey||'',previous,false);vRefreshZoomControls();});
  chart.dispatchAction({type:'takeGlobalCursor',key:'brush',brushOption:{brushType:'rect',brushMode:'single'}});
 }
 while(e44Specs.size>80){const id=e44Specs.keys().next().value;if(e44Charts.has(id))break;e44Specs.delete(id);}
}
addEventListener('resize',()=>{for(const c of e44Charts.values())c.resize();});
document.addEventListener('change',event=>{if(event.target.matches('[data-e44-tooltip]')){const f=ensureDraft();f.options.tooltip_columns=[...event.target.selectedOptions].map(o=>o.value);for(const [id,chart] of e44Charts){const c=e44Specs.get(id);chart.setOption({tooltip:{formatter:p=>p.data?._point?e44Tooltip(p.data._point,c):''}});}}});

function e44Export(){const charts=[...e44Charts.values()].filter(c=>document.getElementById(c.getDom().id));if(!charts.length)return false;const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('xmlns',ns);svg.setAttribute('width',Math.max(...charts.map(c=>c.getWidth()))+40);let y=30;const text=(value,size=13)=>{const t=document.createElementNS(ns,'text');t.setAttribute('x','20');t.setAttribute('y',y);t.setAttribute('font-size',size);t.textContent=value;svg.append(t);y+=24;};text(view?.g?.title||'DataTalk',18);for(const chart of charts){const copy=chart.getDom().querySelector('svg')?.cloneNode(true);if(!copy)continue;const caption=chart.getDom().parentElement.querySelector('h4')?.textContent;if(caption)text(caption);copy.setAttribute('x','20');copy.setAttribute('y',y);svg.append(copy);y+=chart.getHeight()+24;}if(view?.f?.options?.legend)text(allSeries(vChart()).join(' · '));svg.setAttribute('height',y+15);downloadBlob(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),(view?.g?.canonical_ref||'chart')+'.svg');return true;}

function e44ZoomSelection(){const chosen=selection();if(!chosen.size)return false;let changed=false;for(const [id,chart] of e44Charts){const c=e44Specs.get(id),data=c.data.filter(p=>chosen.has(p._index));if(!data.length)continue;const option=chart.getOption(),xa=option.xAxis[0],ya=option.yAxis[0],range=(axis,values)=>axis.type==='category'?values.map(v=>axis.data.indexOf(JSON.stringify(v))).filter(i=>i>=0):values.map(v=>axis.type==='time'?xValue(v,{x_type:c.x_type}):Number(v)).filter(Number.isFinite);const xs=range(xa,data.map(p=>p.x)),ys=range(ya,data.map(p=>p.y));if(xs.length){chart.dispatchAction({type:'dataZoom',dataZoomIndex:0,startValue:Math.min(...xs),endValue:Math.max(...xs)});changed=true;}if(ys.length&&option.dataZoom?.length>1)chart.dispatchAction({type:'dataZoom',dataZoomIndex:1,startValue:Math.min(...ys),endValue:Math.max(...ys)});}return changed;}

new MutationObserver(()=>requestAnimationFrame(mountE44)).observe(document.body,{childList:true,subtree:true});
window.DataTalkVisuals={version:'5.0.0',contract:'datatalk.visuals.v2',init,formHTML,panel,mount,save,deactivate,defaultSpec,chartHTML,previewHTML,cleanSpec:normalize,typeKind:kind,types:TYPES,engine:'Apache ECharts 6.0.0',activeFilters:(source)=>clone(sharedFilters.get(key([refOf(source),source?.version]))||[]),e44Option,anovaTooltip:e44AnovaTooltip,displayNumber:dtNumber4,numberDisplayHotfix:'DATATALK_RESULT_NUMBER_UI_FIX_2026_10_12_3'};
})();

