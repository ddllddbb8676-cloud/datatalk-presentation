// Shared, viewport-bounded dragging for all application dialogs and popovers.
window.DataTalkDialogs=(()=>{
  const bound=new WeakMap(),interactive='button,input,select,textarea,a,[contenteditable="true"],[role="button"]';
  function visible(el){return el?.isConnected&&!el.hidden&&(el.tagName!=='DIALOG'||el.open)&&el.getBoundingClientRect().width>0;}
  function move(el,left,top){
    if(!visible(el))return;
    const r=el.getBoundingClientRect(),margin=8,w=innerWidth,h=innerHeight;
    el.style.position='fixed';el.style.margin='0';el.style.right='auto';el.style.bottom='auto';el.style.transform='none';
    el.style.maxWidth=Math.max(80,w-margin*2)+'px';el.style.maxHeight=Math.max(80,h-margin*2)+'px';
    // Lock the measured width before leaving centered/absolute layout.
    el.style.width=Math.min(r.width,w-margin*2)+'px';
    el.style.left=Math.max(margin,Math.min(Number(left)||margin,w-Math.min(r.width,w-margin*2)-margin))+'px';
    el.style.top=Math.max(margin,Math.min(Number(top)||margin,h-Math.min(r.height,h-margin*2)-margin))+'px';
  }
  function clamp(el){if(visible(el)){const r=el.getBoundingClientRect();move(el,r.left,r.top);}}
  function place(el,anchor){
    if(!visible(el))return;const a=typeof anchor?.getBoundingClientRect==='function'?anchor.getBoundingClientRect():anchor;
    const r=el.getBoundingClientRect();let left=a?.left??(innerWidth-r.width)/2,top=a?.bottom!=null?a.bottom+6:(innerHeight-r.height)/2;
    if(a&&top+r.height>innerHeight-8&&a.top>=r.height+8)top=a.top-r.height-6;
    move(el,left,top);
  }
  function makeDraggable(el,selector){
    if(!el)return;const handle=typeof selector==='string'?el.querySelector(selector):selector||el.querySelector('[data-popup-drag],.dt-popup-handle,.dialog-top,.dtv-property-title,.popover-heading,header,h2');
    if(!handle||bound.get(el)===handle)return;bound.set(el,handle);
    handle.dataset.popupDrag='';handle.classList.add('dt-popup-handle');if(!handle.hasAttribute('tabindex'))handle.tabIndex=0;
    handle.title=handle.title||'제목을 잡고 이동 · Alt + 방향키로 이동';
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0||event.target.closest(interactive)||!visible(el))return;
      event.preventDefault();const r=el.getBoundingClientRect(),x=event.clientX,y=event.clientY;move(el,r.left,r.top);handle.focus({preventScroll:true});handle.setPointerCapture(event.pointerId);
      document.documentElement.classList.add('dt-popup-dragging');
      const onMove=e=>{if(e.pointerId===event.pointerId)move(el,r.left+e.clientX-x,r.top+e.clientY-y);};
      const done=e=>{if(e.pointerId!==event.pointerId)return;handle.removeEventListener('pointermove',onMove);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(name,done);document.documentElement.classList.remove('dt-popup-dragging');};
      handle.addEventListener('pointermove',onMove);for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,done);
    });
    handle.addEventListener('keydown',event=>{
      if(!event.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||event.target.closest(interactive))return;
      event.preventDefault();const r=el.getBoundingClientRect(),step=event.shiftKey?40:10;
      move(el,r.left+({ArrowLeft:-step,ArrowRight:step}[event.key]||0),r.top+({ArrowUp:-step,ArrowDown:step}[event.key]||0));
    });
  }
  const selectors='dialog,.dtv-popup,.dtv-context-menu,#tool-popover';
  let pending=false;function scan(){pending=false;for(const el of document.querySelectorAll(selectors)){makeDraggable(el);if(visible(el)&&el.hasAttribute('data-viewport-popup'))clamp(el);}}
  new MutationObserver(records=>{for(const record of records)if(record.type==='attributes'&&record.target.matches(selectors)&&visible(record.target))requestAnimationFrame(()=>clamp(record.target));if(!pending){pending=true;requestAnimationFrame(scan);}}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});
  addEventListener('resize',()=>{for(const el of document.querySelectorAll(selectors))clamp(el);});
  document.addEventListener('DOMContentLoaded',scan);scan();
  return {makeDraggable,place,clamp};
})();
