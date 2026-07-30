#!/usr/bin/env node

const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");
const { existsSync } = require("node:fs");
const { join, resolve } = require("node:path");

const apiRoot = resolve(__dirname, "..");
const distEntry = join(apiRoot, "dist", "index.mjs");
const loadSmoke = join(apiRoot, "scripts", "multiplayer-load-smoke.cjs");

let config;

main().catch((error) => {
  console.error(`[multiplayer-multiworker-smoke] ${redact(error.message)}`);
  process.exitCode = 1;
});

async function main() {
  config = readConfig();
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for multi-worker smoke. Use a disposable or production-like Postgres target; this script does not clear target state.",
    );
  }
  if (!existsSync(distEntry)) {
    throw new Error("dist/index.mjs was not found. Run pnpm -C artifacts/api-server run build first.");
  }

  console.log(
    `[multiplayer-multiworker-smoke] workers=${config.workers} rounds=${config.rounds} timeoutMs=${config.timeoutMs} socketPollMs=${config.socketPollIntervalMs}`,
  );
  console.log("[multiplayer-multiworker-smoke] using DATABASE_URL with MULTIPLAYER_DATABASE_STORE=1");

  const workerPorts = await allocatePorts(config.workers);
  const workers = [];
  let proxy = null;

  try {
    for (let index = 0; index < workerPorts.length; index += 1) {
      workers.push(startWorker(index, workerPorts[index]));
    }
    await Promise.all(workers.map((worker) => waitForWorker(worker)));
    proxy = await startProxy(workerPorts);
    await runLoadSmoke(proxy.baseUrl);
    console.log(`[multiplayer-multiworker-smoke] success workers=${config.workers} rounds=${config.rounds}`);
  } finally {
    await Promise.allSettled([
      proxy ? proxy.close() : Promise.resolve(),
      ...workers.map((worker) => stopWorker(worker)),
    ]);
  }
}

function readConfig() {
  const apiAuthToken = process.env.MULTIPLAYER_MULTIWORKER_API_AUTH_TOKEN?.trim() ||
    process.env.MULTIPLAYER_SMOKE_API_AUTH_TOKEN?.trim() ||
    process.env.MULTIPLAYER_API_AUTH_TOKEN?.trim() ||
    `multiworker-smoke-${process.pid}-${Date.now()}`;
  return {
    workers: positiveInteger(process.env.MULTIPLAYER_MULTIWORKER_WORKERS, 2, "MULTIPLAYER_MULTIWORKER_WORKERS", 2, 8),
    rounds: positiveInteger(process.env.MULTIPLAYER_SMOKE_ROUNDS, 2, "MULTIPLAYER_SMOKE_ROUNDS", 1, 50),
    timeoutMs: positiveInteger(process.env.MULTIPLAYER_SMOKE_TIMEOUT_MS, 10_000, "MULTIPLAYER_SMOKE_TIMEOUT_MS", 1_000, 60_000),
    socketPollIntervalMs: positiveInteger(
      process.env.MULTIPLAYER_MULTIWORKER_SOCKET_POLL_INTERVAL_MS || process.env.MULTIPLAYER_SOCKET_POLL_INTERVAL_MS,
      250,
      "MULTIPLAYER_MULTIWORKER_SOCKET_POLL_INTERVAL_MS",
      50,
      60_000,
    ),
    apiAuthToken,
    trustedUserHeader: (
      process.env.MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER ||
      process.env.MULTIPLAYER_TRUSTED_USER_ID_HEADER ||
      ""
    ).trim().toLowerCase(),
  };
}

function positiveInteger(rawValue, defaultValue, name, min, max) {
  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return parsed;
}

async function allocatePorts(count) {
  const ports = [];
  for (let index = 0; index < count; index += 1) {
    ports.push(await allocatePort());
  }
  return ports;
}

function allocatePort() {
  return new Promise((resolvePort, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!address || typeof address === "string") {
          reject(new Error("Port allocation did not return a TCP port."));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function startWorker(index, port) {
  const child = spawn(process.execPath, ["--enable-source-maps", distEntry], {
    cwd: apiRoot,
    env: {
      ...process.env,
      PORT: String(port),
      MULTIPLAYER_DATABASE_STORE: "1",
      MULTIPLAYER_MATCH_STORE_PATH: "",
      MULTIPLAYER_API_AUTH_TOKEN: config.apiAuthToken,
      MULTIPLAYER_SOCKET_POLL_INTERVAL_MS: String(config.socketPollIntervalMs),
      NODE_ENV: process.env.NODE_ENV || "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const worker = {
    index,
    port,
    process: child,
    logs: "",
    exited: false,
  };
  child.stdout.on("data", (chunk) => appendWorkerLog(worker, chunk));
  child.stderr.on("data", (chunk) => appendWorkerLog(worker, chunk));
  child.on("exit", (code, signal) => {
    worker.exited = true;
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`[multiplayer-multiworker-smoke] worker=${index} exited code=${code} signal=${signal || ""}`);
      if (worker.logs) {
        console.error(redact(worker.logs.trim()).slice(-2000));
      }
    }
  });
  console.log(`[multiplayer-multiworker-smoke] worker=${index} port=${port}`);
  return worker;
}

function appendWorkerLog(worker, chunk) {
  worker.logs = `${worker.logs}${chunk.toString()}`.slice(-4000);
}

async function waitForWorker(worker) {
  const deadline = Date.now() + config.timeoutMs;
  const url = `http://127.0.0.1:${worker.port}/api/multiplayer/matches?limit=1`;
  while (Date.now() < deadline) {
    if (worker.exited) {
      throw new Error(`worker ${worker.index} exited before becoming ready: ${worker.logs}`);
    }
    try {
      const response = await fetch(url, {
        headers: readinessHeaders(worker),
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        console.log(`[multiplayer-multiworker-smoke] worker=${worker.index} ready`);
        return;
      }
    } catch {
      // Retry until the readiness deadline; worker startup includes DB schema checks.
    }
    await delay(100);
  }
  throw new Error(`worker ${worker.index} did not become ready before timeout: ${worker.logs}`);
}

function readinessHeaders(worker) {
  const headers = { authorization: `Bearer ${config.apiAuthToken}` };
  if (config.trustedUserHeader) {
    headers[config.trustedUserHeader] = `multiworker-smoke-ready-${worker.index}`;
  }
  return headers;
}

async function startProxy(workerPorts) {
  let nextIndex = 0;
  const nextTarget = () => {
    const port = workerPorts[nextIndex % workerPorts.length];
    nextIndex += 1;
    return port;
  };

  const server = http.createServer((request, response) => {
    const port = nextTarget();
    const proxyRequest = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: request.url,
        method: request.method,
        headers: request.headers,
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
        proxyResponse.pipe(response);
      },
    );
    proxyRequest.on("error", (error) => {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "PROXY_ERROR", message: redact(error.message) }));
    });
    request.pipe(proxyRequest);
  });

  server.on("upgrade", (request, socket, head) => {
    const port = nextTarget();
    const proxySocket = net.connect(port, "127.0.0.1", () => {
      proxySocket.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n`);
      for (let index = 0; index < request.rawHeaders.length; index += 2) {
        proxySocket.write(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}\r\n`);
      }
      proxySocket.write("\r\n");
      if (head.length > 0) {
        proxySocket.write(head);
      }
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    proxySocket.on("error", (error) => {
      socket.write(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n${redact(error.message)}`);
      socket.destroy();
    });
    socket.on("error", () => {
      proxySocket.destroy();
    });
  });

  const port = await listen(server);
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`[multiplayer-multiworker-smoke] proxy=${baseUrl}`);
  return {
    baseUrl,
    close: () => closeServer(server),
  };
}

function listen(server) {
  return new Promise((resolvePort, reject) => {
    const handleError = (error) => {
      server.off("listening", handleListening);
      reject(error);
    };
    const handleListening = () => {
      server.off("error", handleError);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Proxy did not bind to a TCP port."));
        return;
      }
      resolvePort(address.port);
    };
    server.once("error", handleError);
    server.once("listening", handleListening);
    server.listen(0, "127.0.0.1");
  });
}

function runLoadSmoke(baseUrl) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [loadSmoke], {
      cwd: apiRoot,
      env: {
        ...process.env,
        MULTIPLAYER_SMOKE_API_BASE_URL: baseUrl,
        MULTIPLAYER_SMOKE_API_AUTH_TOKEN: config.apiAuthToken,
        MULTIPLAYER_SMOKE_ROUNDS: String(config.rounds),
        MULTIPLAYER_SMOKE_TIMEOUT_MS: String(config.timeoutMs),
        ...(config.trustedUserHeader ? { MULTIPLAYER_SMOKE_TRUSTED_USER_HEADER: config.trustedUserHeader } : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(redact(chunk.toString())));
    child.stderr.on("data", (chunk) => process.stderr.write(redact(chunk.toString())));
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      reject(new Error(`load smoke failed code=${code} signal=${signal || ""}`));
    });
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}

function stopWorker(worker) {
  return new Promise((resolveStop) => {
    if (worker.process.exitCode !== null || worker.process.killed) {
      resolveStop();
      return;
    }
    const timer = setTimeout(() => {
      worker.process.kill("SIGKILL");
      resolveStop();
    }, 3000);
    worker.process.once("exit", () => {
      clearTimeout(timer);
      resolveStop();
    });
    worker.process.kill("SIGTERM");
  });
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function redact(value) {
  let output = String(value);
  if (process.env.DATABASE_URL) {
    output = output.split(process.env.DATABASE_URL).join("[redacted-database-url]");
  }
  if (config?.apiAuthToken) {
    output = output.split(config.apiAuthToken).join("[redacted-auth-token]");
  }
  return output;
}
