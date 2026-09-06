import { app, BrowserWindow } from "electron";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./dist/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".moc3": "application/octet-stream"
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
        const relative = normalize(pathname).replace(/^[/\\]+/, "") || "index.html";
        let target = join(root, relative);
        if ((await stat(target)).isDirectory()) target = join(target, "index.html");
        const data = await readFile(target);
        response.writeHead(200, {
          "Content-Type": mime[extname(target)] ?? "application/octet-stream",
          "Cache-Control": "no-store"
        });
        response.end(data);
      } catch {
        response.writeHead(404);
        response.end("Not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

app.whenReady().then(async () => {
  const server = await startServer();
  const address = server.address();
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: "#121018",
    title: "艾莲 Live2D 桌宠预览",
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  window.setMenuBarVisibility(false);
  await window.loadURL(`http://127.0.0.1:${address.port}`);
  window.on("closed", () => server.close());
});

app.on("window-all-closed", () => app.quit());
