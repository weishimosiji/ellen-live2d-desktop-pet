const { EventEmitter } = require("node:events");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { dirname } = require("node:path");
const { randomUUID } = require("node:crypto");

function createTimerService(dataFile) {
  const events = new EventEmitter(); const handles = new Map(); let timers = [];
  async function initialize() { try { timers = JSON.parse(await readFile(dataFile, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; } for (const timer of [...timers]) schedule(timer); }
  async function persist() { await mkdir(dirname(dataFile), { recursive: true }); await writeFile(dataFile, JSON.stringify(timers, null, 2), "utf8"); }
  function schedule(timer) { const delay = timer.endsAt - Date.now(); if (delay <= 0) return void fire(timer.id); handles.set(timer.id, setTimeout(() => void fire(timer.id), Math.min(delay, 2147483647))); }
  async function fire(id) { const timer = timers.find(x => x.id === id); if (!timer) return; handles.delete(id); timers = timers.filter(x => x.id !== id); await persist(); events.emit("fired", timer); events.emit("changed", timers); }
  async function start({ durationSeconds, task = "" }) { const seconds = Number(durationSeconds); if (!Number.isFinite(seconds) || seconds < 1 || seconds > 7 * 86400) throw new Error("倒计时必须在1秒到7天之间"); const timer = { id: randomUUID(), type: String(task).trim() ? "task" : "simple", task: String(task).trim().slice(0, 200), durationSeconds: Math.round(seconds), startedAt: Date.now(), endsAt: Date.now() + Math.round(seconds) * 1000 }; timers.push(timer); await persist(); schedule(timer); events.emit("changed", timers); return timer; }
  async function cancel(id) { const before=timers.length; timers=timers.filter(x=>x.id!==id); if(before===timers.length) throw new Error("找不到计时器"); clearTimeout(handles.get(id)); handles.delete(id); await persist(); events.emit("changed",timers); return {success:true}; }
  return { initialize, start, cancel, list: () => [...timers].sort((a,b)=>a.endsAt-b.endsAt), events };
}
module.exports = { createTimerService };
