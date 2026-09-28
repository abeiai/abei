import { createServer, request } from "node:http";

const defaultListenPort = 3320;
const defaultWebPort = 3321;

export function createLocalDevProxy({ listenPort = defaultListenPort, webPort = defaultWebPort } = {}) {
  const server = createServer((incomingRequest, incomingResponse) => {
    const proxyRequest = request(
      {
        hostname: "127.0.0.1",
        port: webPort,
        method: incomingRequest.method,
        path: incomingRequest.url,
        headers: {
          ...incomingRequest.headers,
          "x-forwarded-host": incomingRequest.headers.host ?? `127.0.0.1:${listenPort}`,
          "x-forwarded-proto": "http"
        }
      },
      (proxyResponse) => {
        incomingResponse.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
        proxyResponse.pipe(incomingResponse);
      }
    );

    proxyRequest.once("error", (error) => {
      if (incomingResponse.headersSent) {
        incomingResponse.destroy(error);
        return;
      }

      incomingResponse.writeHead(502, {
        "content-type": "application/json; charset=utf-8"
      });
      incomingResponse.end(JSON.stringify({
        message: "本地 Web 开发服务未启动，请运行 pnpm dev。"
      }));
    });

    incomingRequest.pipe(proxyRequest);
  });

  server.on("upgrade", (incomingRequest, incomingSocket, head) => {
    const proxyRequest = request({
      hostname: "127.0.0.1",
      port: webPort,
      method: incomingRequest.method,
      path: incomingRequest.url,
      headers: {
        ...incomingRequest.headers,
        "x-forwarded-host": incomingRequest.headers.host ?? `127.0.0.1:${listenPort}`,
        "x-forwarded-proto": "http"
      }
    });

    proxyRequest.once("upgrade", (proxyResponse, proxySocket, proxyHead) => {
      incomingSocket.write(`HTTP/${proxyResponse.httpVersion} ${proxyResponse.statusCode} ${proxyResponse.statusMessage}\r\n`);
      for (let index = 0; index < proxyResponse.rawHeaders.length; index += 2) {
        incomingSocket.write(`${proxyResponse.rawHeaders[index]}: ${proxyResponse.rawHeaders[index + 1]}\r\n`);
      }
      incomingSocket.write("\r\n");

      if (proxyHead.length > 0) {
        incomingSocket.write(proxyHead);
      }
      if (head.length > 0) {
        proxySocket.write(head);
      }

      proxySocket.pipe(incomingSocket);
      incomingSocket.pipe(proxySocket);
    });

    proxyRequest.once("error", () => {
      incomingSocket.destroy();
    });
    proxyRequest.end();
  });

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const proxy = createLocalDevProxy();

  proxy.listen(defaultListenPort, "127.0.0.1", () => {
    console.log(`本地统一入口已启动：http://localhost:${defaultListenPort}`);
  });
}
