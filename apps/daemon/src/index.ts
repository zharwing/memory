import { loadDaemonConfig } from "./config.js";
import { createDaemonServer } from "./server.js";

const config = loadDaemonConfig();
const server = createDaemonServer(config);

server.listen(config.port, config.host, () => {
  process.stdout.write(
    JSON.stringify(
      {
        event: "zharwing-memory-daemon-started",
        host: config.host,
        port: config.port,
        memoryRoot: config.memoryRoot
      },
      null,
      2
    ) + "\n"
  );
});
