import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createLocalDevProxy } from "./local-proxy.mjs";

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("本地统一入口将页面请求转发到 Web 开发服务", async (t) => {
  const upstream = createServer((request, response) => {
    response.writeHead(200, {
      "content-type": "application/json"
    });
    response.end(JSON.stringify({ path: request.url }));
  });
  await listen(upstream, 3329);
  t.after(async () => {
    await close(upstream);
  });

  const proxy = createLocalDevProxy({
    listenPort: 3326,
    webPort: 3329
  });
  await listen(proxy, 3326);

  t.after(async () => {
    await close(proxy);
  });

  const response = await fetch("http://127.0.0.1:3326/dashboard/profile");

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    path: "/dashboard/profile"
  });
});
