const { mkdir, readFile, writeFile } = require("node:fs/promises");
const { dirname } = require("node:path");
const { randomUUID } = require("node:crypto");

function createTodoService(dataFile) {
  let writeChain = Promise.resolve();
  async function readAll() {
    try { return JSON.parse(await readFile(dataFile, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }
  function save(items) {
    writeChain = writeChain.then(async () => {
      await mkdir(dirname(dataFile), { recursive: true });
      await writeFile(dataFile, JSON.stringify(items, null, 2), "utf8");
    });
    return writeChain;
  }
  async function list({ from, to } = {}) {
    return (await readAll()).filter((item) => (!from || item.date >= from) && (!to || item.date <= to));
  }
  async function add({ title, date, time = "", notes = "" }) {
    validateDate(date); if (!String(title || "").trim()) throw new Error("待办标题不能为空");
    const items = await readAll();
    const item = { id: randomUUID(), title: String(title).trim().slice(0, 200), date, time: validateTime(time), notes: String(notes).trim().slice(0, 1000), completed: false, createdAt: new Date().toISOString() };
    items.push(item); await save(items); return item;
  }
  async function update(id, changes) {
    const items = await readAll(); const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error("找不到待办事项");
    if (changes.title !== undefined) item.title = String(changes.title).trim().slice(0, 200);
    if (changes.date !== undefined) { validateDate(changes.date); item.date = changes.date; }
    if (changes.time !== undefined) item.time = validateTime(changes.time);
    if (changes.completed !== undefined) item.completed = Boolean(changes.completed);
    await save(items); return item;
  }
  async function remove(id) { const items = await readAll(); const next = items.filter((item) => item.id !== id); if (next.length === items.length) throw new Error("找不到待办事项"); await save(next); return { success: true }; }
  return { list, add, update, remove };
}
function validateDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00`))) throw new Error("日期必须为 YYYY-MM-DD"); }
function validateTime(value) { if (!value) return ""; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("时间必须为 HH:mm"); return value; }
module.exports = { createTodoService };
