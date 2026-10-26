import { spawn } from "node:child_process";
import { createServer } from "node:net";
import * as z from "zod";

const config = z
  .object({
    DATABASE_SSH_HOST: z.string().regex(/^[\w.-]+@[\w.-]+$/),
    DATABASE_CONNECTION_STRING: z.url(),
  })
  .parse(process.env);
const database = new URL(config.DATABASE_CONNECTION_STRING);
if (database.hostname !== "127.0.0.1" || !database.port) {
  throw new Error(
    "The database tunnel requires a connection URL at 127.0.0.1 with an explicit port",
  );
}

const connections = new Set();
const server = createServer({ allowHalfOpen: true }, (socket) => {
  // The server key must have a forced command restricted to the database stream.
  // This works even when the host disables SSH port forwarding.
  const ssh = spawn(
    "ssh",
    [
      "-T",
      "-o",
      "BatchMode=yes",
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      "ConnectTimeout=10",
      "-o",
      "ServerAliveInterval=30",
      "-o",
      "ServerAliveCountMax=3",
      config.DATABASE_SSH_HOST,
      "memories-database",
    ],
    { stdio: ["pipe", "pipe", "inherit"] },
  );
  connections.add(socket);
  socket.pipe(ssh.stdin);
  ssh.stdout.pipe(socket);
  ssh.stdin.on("error", () => socket.destroy());
  ssh.on("error", () => socket.destroy());
  ssh.on("close", () => socket.destroy());
  socket.on("error", () => {});
  socket.on("close", () => {
    connections.delete(socket);
    ssh.kill();
  });
});
server.on("error", (error) => {
  console.error(`Database tunnel: ${error.message}`);
  process.exitCode = 1;
});
server.listen(Number(database.port), "127.0.0.1", () => {
  console.log(`Database tunnel listening on 127.0.0.1:${database.port}; leave this terminal open.`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    for (const socket of connections) socket.destroy();
  });
}
