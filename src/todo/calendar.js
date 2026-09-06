export function initTodoCalendar({ openButton, dialog, closeButton, monthLabel, grid, list, form, titleInput, timeInput, standalone = false, embedded = false }) {
  let month = new Date(); month.setDate(1); let selected = dateKey(new Date()); let items = [];
  openButton?.addEventListener("click", () => {
    if (window.desktopWindow.openCalendar) void window.desktopWindow.openCalendar();
    else { dialog.showModal(); void refresh(); }
  });
  closeButton?.addEventListener("click", () => {
    if (standalone) void window.desktopWindow.close();
    else dialog.close();
  });
  dialog.querySelector("#todo-prev").addEventListener("click", () => { month.setMonth(month.getMonth() - 1); void refresh(); });
  dialog.querySelector("#todo-next").addEventListener("click", () => { month.setMonth(month.getMonth() + 1); void refresh(); });
  form.addEventListener("submit", async (event) => { event.preventDefault(); await window.desktopTodos.add({ title: titleInput.value, date: selected, time: timeInput.value }); titleInput.value = ""; timeInput.value = ""; await refresh(); });
  // Agent、其他窗口或日历自身修改待办后，立即重新读取当前月份。
  // 不再依赖切换月份或重启应用才能看到新事项。
  window.desktopTodos.onChanged?.(() => { void refresh(); });
  async function refresh() {
    const from = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
    const to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    items = await window.desktopTodos.list({ from, to }); renderCalendar(); renderList();
  }
  if (standalone) {
    dialog.show();
    void refresh();
  }
  if (embedded) void refresh();
  function renderCalendar() {
    monthLabel.textContent = `${month.getFullYear()}年 ${month.getMonth() + 1}月`; grid.replaceChildren();
    for (const name of ["日","一","二","三","四","五","六"]) { const el=document.createElement("b"); el.textContent=name; grid.append(el); }
    const first = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    for (let i=0;i<first;i++) grid.append(document.createElement("i"));
    const days = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
    for (let day=1;day<=days;day++) { const key=dateKey(new Date(month.getFullYear(),month.getMonth(),day)); const button=document.createElement("button"); button.textContent=day; button.className=key===selected?"selected":""; if(items.some(x=>x.date===key&&!x.completed)) button.classList.add("has-todo"); button.onclick=()=>{selected=key; renderCalendar(); renderList();}; grid.append(button); }
  }
  function renderList() {
    list.replaceChildren(); const dayItems=items.filter(item=>item.date===selected).sort((a,b)=>a.time.localeCompare(b.time));
    if (!dayItems.length) { const empty=document.createElement("p"); empty.textContent="这天没有待办。"; list.append(empty); return; }
    for (const item of dayItems) { const row=document.createElement("div"); row.className=`todo-item${item.completed?" completed":""}`; const check=document.createElement("button"); check.textContent=item.completed?"✓":"○"; check.onclick=async()=>{await window.desktopTodos.update(item.id,{completed:!item.completed}); await refresh();}; const text=document.createElement("span"); text.textContent=`${item.time?item.time+"  ":""}${item.title}`; const del=document.createElement("button"); del.textContent="×"; del.onclick=async()=>{await window.desktopTodos.remove(item.id); await refresh();}; row.append(check,text,del); list.append(row); }
  }
}
function dateKey(date) { const y=date.getFullYear(); const m=String(date.getMonth()+1).padStart(2,"0"); const d=String(date.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`; }
