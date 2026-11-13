import express from "express";
import { createServer } from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import { createStore } from "./store.js";
import { createLmsApp } from "./app.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function createApp({
  database = process.env.LMS_DB || resolve(root, ".data/lms.sqlite"),
  demo = process.env.LMS_DEMO === "true" ||
    (process.env.LMS_DEMO !== "false" && process.env.NODE_ENV !== "production"),
  seed = process.env.LMS_SEED !== "false",
  bootstrap = false,
  setupToken,
  clientAddress,
} = {}) {
  return createLmsApp({
    store: createStore(database),
    demo,
    seed,
    bootstrap,
    setupToken,
    clientAddress,
  });
}
export async function startServer(options = {}) {
  const { app, store } = createApp(options);
  const server = createServer(app);
  let vite;
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      root,
      server: { middlewareMode: true, allowedHosts: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve(root, "dist")));
    app.use((req, res) => {
      if (existsSync(resolve(root, "dist/index.html")))
        res.sendFile(resolve(root, "dist/index.html"));
      else
        res
          .status(503)
          .send(
            "Build the frontend with npm run build before starting in production.",
          );
    });
  }
  const port = Number(process.env.PORT || 3000);
  await new Promise((resolve) => server.listen(port, "0.0.0.0", resolve));
  console.log(`Meridian LMS listening on port ${port}`);
  return { server, store, vite };
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
