export async function initTimerPanel({ container, onFired, primaryTime, primaryTask, onUpdate }) {
  let timers=await window.desktopTimers.list(); let interval=null;
  function render(){
    container.replaceChildren();
    // changed 事件传来的数组是创建顺序，不能直接取 timers[0]。
    // 每次刷新按结束时间排序，头顶始终展示剩余时间最短的倒计时。
    const orderedTimers=[...timers].sort((a,b)=>a.endsAt-b.endsAt);
    const first=orderedTimers[0];
    const firstRemain=first?Math.max(0,Math.ceil((first.endsAt-Date.now())/1000)):0;
    if(primaryTime) primaryTime.textContent=first?format(firstRemain):"--:--";
    if(primaryTask) primaryTask.textContent=first?(first.task||"倒计时"):"没有进行中的倒计时";
    onUpdate?.({timer:first||null,remainingSeconds:firstRemain,formatted:first?format(firstRemain):""});
    if(!orderedTimers.length){container.textContent="没有进行中的倒计时";return;}
    for(const timer of orderedTimers){const row=document.createElement("div"); row.className="timer-item"; const text=document.createElement("span"); const remain=Math.max(0,Math.ceil((timer.endsAt-Date.now())/1000)); text.textContent=`${timer.task||"倒计时"} · ${format(remain)}`; const cancel=document.createElement("button");cancel.textContent="取消";cancel.onclick=()=>window.desktopTimers.cancel(timer.id);row.append(text,cancel);container.append(row);}
  }
  function startTick(){clearInterval(interval);interval=setInterval(render,1000);render();}
  window.desktopTimers.onChanged(value=>{timers=value;startTick();});
  window.desktopTimers.onFired(timer=>{timers=timers.filter(x=>x.id!==timer.id);render();onFired(timer);}); startTick();
}
function format(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`;}
