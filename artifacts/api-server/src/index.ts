import { logger } from "./lib/logger";
import { assertMultiplayerDeploymentPreflight } from "./lib/multiplayerDeploymentPreflight";

void main().catch((err) => {
  logger.error({ err }, "Server failed to start");
  process.exit(1);
});

async function main(): Promise<void> {
  assertMultiplayerDeploymentPreflight();

  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);
  const host = process.env["HOST"]?.trim();

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  const [{ default: app }, { attachMultiplayerWebSocketServer }] = await Promise.all([
    import("./app"),
    import("./lib/multiplayerSocket"),
  ]);

  const onListening = (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ host: host || "all interfaces", port }, "Server listening");
  };
  const server = host
    ? app.listen(port, host, onListening)
    : app.listen(port, onListening);

  attachMultiplayerWebSocketServer(server);
}
