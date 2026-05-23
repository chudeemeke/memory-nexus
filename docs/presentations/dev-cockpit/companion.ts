// docs/presentations/dev-cockpit/companion.ts
// Run this companion server script in the background using:
//   bun run docs/presentations/dev-cockpit/companion.ts
// Or:
//   npx ts-node docs/presentations/dev-cockpit/companion.ts

import { spawn } from "child_process";
import * as path from "path";

const PORT = 8080;

console.log(`\n======================================================`);
console.log(`🚀 Universal Cockpit WebSocket Companion Server booting...`);
console.log(`   Address: ws://localhost:${PORT}`);
console.log(`======================================================\n`);

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    // Upgrade HTTP request to WebSocket connection
    if (server.upgrade(req)) {
      return;
    }
    return new Response("Universal Cockpit Companion is running!", {
      headers: { "Content-Type": "text/plain" }
    });
  },
  websocket: {
    open(ws) {
      console.log("🟢 Client connected to companion gateway.");
      
      // Auto-extract and send project information
      try {
        const pkgPath = path.resolve(process.cwd(), "package.json");
        const pkg = require(pkgPath);
        ws.send(JSON.stringify({
          type: "projectInfo",
          name: pkg.name || "Local Project"
        }));
      } catch (e) {
        ws.send(JSON.stringify({
          type: "projectInfo",
          name: path.basename(process.cwd()) || "Local Project"
        }));
      }
    },
    message(ws, message) {
      try {
        const payload = JSON.parse(message as string);
        
        if (payload.type === "command") {
          const cmd = payload.command;
          console.log(`💻 Executing real shell command: "${cmd}"`);
          
          // Determine shell depending on running operating system (Windows PowerShell vs Bash)
          const isWin = process.platform === "win32";
          const shell = isWin ? "powershell.exe" : "bash";
          const args = isWin ? ["-NoProfile", "-NonInteractive", "-Command", cmd] : ["-c", cmd];
          
          const proc = spawn(shell, args, {
            cwd: process.cwd(),
            env: { ...process.env, PAGER: "cat" }
          });
          
          // Stream standard output in real-time
          proc.stdout.on("data", (data) => {
            ws.send(JSON.stringify({ type: "stdout", data: data.toString() }));
          });
          
          // Stream standard error in real-time
          proc.stderr.on("data", (data) => {
            ws.send(JSON.stringify({ type: "stderr", data: data.toString() }));
          });
          
          // Handle exit closure
          proc.on("close", (code) => {
            console.log(`🏁 Process closed with exit code ${code}`);
            ws.send(JSON.stringify({ type: "exit", code }));
            (ws as any).activeProc = null;
          });
          
          // Assign active process to connection for Ctrl+C cancelling support
          (ws as any).activeProc = proc;
        } else if (payload.type === "cancel") {
          const proc = (ws as any).activeProc;
          if (proc) {
            console.log("⏹ Interrupt signal received (Ctrl+C). Terminating running process...");
            proc.kill("SIGINT");
            // Fallback for Windows if SIGINT isn't caught
            setTimeout(() => {
              try {
                proc.kill();
              } catch (e) {}
            }, 100);
            (ws as any).activeProc = null;
          }
        }
      } catch (err) {
        console.error("❌ Failed to parse or process incoming socket message:", err);
      }
    },
    close(ws) {
      console.log("🔴 Client disconnected from companion gateway.");
      const proc = (ws as any).activeProc;
      if (proc) {
        console.log("🧹 Cleaning up orphaned child processes on client exit...");
        proc.kill();
      }
    }
  }
});
