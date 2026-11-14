import { DurableObject, env as currentEnv } from "cloudflare:workers";
import { handleAsNodeRequest } from "cloudflare:node";
import { createServer } from "node:http";
import { createLmsApp } from "../server/app.js";
import { createDurableStore } from "./store.js";

const CLIENT_ADDRESS_HEADER = "x-meridian-client-address";

export class MeridianWorkspace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.context = ctx;
    const store = createDurableStore(ctx.storage);
    const { app } = createLmsApp({
      store,
      demo: false,
      seed: false,
      bootstrap: true,
      // Resolve the active binding during each request. Binding-only updates
      // can reuse running isolates, so don't capture the key at construction.
      setupToken: () => currentEnv.LMS_SETUP_TOKEN,
      // Only the front Worker can address this Durable Object. It replaces this
      // header with Cloudflare's client address before making the binding call.
      clientAddress: (req) =>
        typeof req.headers[CLIENT_ADDRESS_HEADER] === "string"
          ? req.headers[CLIENT_ADDRESS_HEADER]
          : "unknown",
    });
    this.app = app;
  }

  async fetch(request) {
    // Serialize API work, including asynchronous scrypt hashing. This keeps
    // concurrent password requests from allocating multiple 64 MB work areas
    // in the same object, and makes the document-store request ordering clear.
    return this.context.blockConcurrencyWhile(async () => {
      const server = createServer(this.app);
      try {
        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(0, resolve);
        });
        const address = server.address();
        const response = await handleAsNodeRequest(address.port, request);
        // API responses are finite JSON. Consume them before closing the virtual
        // server so no listener or response stream outlives its request.
        const body = await response.arrayBuffer();
        return new Response(
          request.method === "HEAD" || [204, 205, 304].includes(response.status)
            ? null
            : body,
          {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          },
        );
      } finally {
        if (server.listening)
          await new Promise((resolve) => server.close(resolve));
      }
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const headers = new Headers(request.headers);
      // Ignore caller-supplied identity hints. CF-Connecting-IP is set by the
      // Cloudflare edge on deployed requests; local Wrangler uses one bucket.
      headers.delete(CLIENT_ADDRESS_HEADER);
      headers.set(
        CLIENT_ADDRESS_HEADER,
        request.headers.get("CF-Connecting-IP") || "unknown",
      );
      headers.set("Host", url.host);
      const workspace = env.LMS_WORKSPACE.get(
        env.LMS_WORKSPACE.idFromName("workspace"),
      );
      return workspace.fetch(new Request(request, { headers }));
    }
    return env.ASSETS.fetch(request);
  },
};
