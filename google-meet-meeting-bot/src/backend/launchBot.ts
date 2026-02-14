// src/backend/botLauncher.ts
import Docker = require("dockerode"); // safe import for TS projects
import fs from "fs";
import path from "path";
// import Docker from "dockerode";    // alternative if your tsconfig has esModuleInterop

// init Docker client
const docker = new Docker();

// launch Docker container to run mtg bot
export async function launchBotContainer(meetingUrl: string, jobId: string, userId?: string, meetingTitle?: string, language?: string) {
  // assign container a unique name using timestamp
  const containerName = `meetingbot-${Date.now()}`;

  // Prepare service account JSON for the child container
  let saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "";
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saJson && saPath) {
    try {
      saJson = fs.readFileSync(saPath, "utf8");
    } catch { }
  }

  const env = [
    `MEETING_URL=${meetingUrl}`,
    `JOB_ID=${jobId}`,
    `USER_ID=${userId || ""}`,
    `MEETING_TITLE=${meetingTitle || ""}`,
    `GOOGLE_ACCOUNT_USER=${process.env.GOOGLE_ACCOUNT_USER ?? ""}`,
    `GOOGLE_ACCOUNT_PASSWORD=${process.env.GOOGLE_ACCOUNT_PASSWORD ?? ""}`,
    `DATABASE_URL=${process.env.DATABASE_URL ?? ""}`,
    `ENABLE_FIRESTORE=${process.env.ENABLE_FIRESTORE ?? ""}`,
    `FIREBASE_SERVICE_ACCOUNT_JSON=${saJson}`,
    `ASSEMBLYAI_API_KEY=${process.env.ASSEMBLYAI_API_KEY ?? ""}`,
    // Use Docker network service names for Redis/MongoDB (not localhost)
    `REDIS_URL=redis://meetingbot-redis:6379`,
    `MONGODB_URI=mongodb://meetingbot-mongo:27017/meeting-transcripts`,
    `CAPTIONS_LANGUAGE=${language || 'English'}`,
  ];

  // Determine auth.json host path for mounting into bot container
  // Strategy: Try multiple methods to get the host path
  let authJsonHostPath: string | null = null;

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:40', message: 'checking auth.json mount', data: { hasEnvVar: !!process.env.AUTH_JSON_HOST_PATH, envVarValue: process.env.AUTH_JSON_HOST_PATH?.substring(0, 50) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  // Option 1: Check if AUTH_JSON_HOST_PATH is explicitly set (absolute host path)
  if (process.env.AUTH_JSON_HOST_PATH) {
    authJsonHostPath = process.env.AUTH_JSON_HOST_PATH;
    console.log(`📁 Using AUTH_JSON_HOST_PATH: ${authJsonHostPath}`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:48', message: 'AUTH_JSON_HOST_PATH found', data: { path: authJsonHostPath }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
  } else {
    // Option 2: Try to get host path from backend container's mount info
    try {
      const backendContainer = docker.getContainer("meetingbot-backend");
      const inspect = await backendContainer.inspect();
      const mounts = inspect.Mounts || [];

      // Find the auth.json mount
      const authMount = mounts.find((m: any) =>
        m.Destination === "/app/auth.json" ||
        m.Destination === "/app/auth.json" && m.Type === "bind"
      );

      if (authMount && authMount.Source) {
        authJsonHostPath = authMount.Source;
        console.log(`📁 Detected auth.json host path from backend container: ${authJsonHostPath}`);

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:64', message: 'auth.json path from container inspect', data: { path: authJsonHostPath }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion
      } else {
        console.log("⚠️ Could not detect auth.json host path from backend container mounts");
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:69', message: 'mount inspection failed', data: { mountsCount: mounts.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion
      }
    } catch (inspectError: any) {
      console.log("⚠️ Could not inspect backend container:", inspectError.message);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:74', message: 'container inspect error', data: { error: inspectError.message }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion
    }

    // Option 3: Fallback - check if auth.json exists in container
    if (!authJsonHostPath) {
      const containerAuthPath = "/app/auth.json";
      if (fs.existsSync(containerAuthPath)) {
        console.log("⚠️ Found auth.json in container at /app/auth.json, but cannot determine host path");
        console.log("💡 Set AUTH_JSON_HOST_PATH environment variable to absolute host path");
        console.log("💡 For Windows: AUTH_JSON_HOST_PATH=/f/Laraib-Zafar/FYP/onix/onix new/AI-Meeting-Assistant/google-meet-meeting-bot/auth.json");

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:82', message: 'AUTH_JSON_HOST_PATH not set, fallback', data: { containerAuthExists: true }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion
      }
    }
  }

  // Build HostConfig with volume mount if auth.json path is available
  const hostConfig: any = {
    AutoRemove: true,
    NetworkMode: "meetingbot-net",
  };

  // Mount auth.json if we have a valid host path
  // Note: Path must be absolute and accessible from Docker host
  if (authJsonHostPath) {
    // Convert Windows path to Docker-compatible format if needed
    // Docker Desktop on Windows expects paths in format: /drive/path or //drive/path
    let dockerPath = authJsonHostPath;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:82', message: 'before path conversion', data: { originalPath: authJsonHostPath, platform: process.platform, matchesWindows: !!dockerPath.match(/^[A-Z]:/) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion

    // Check if it's a Windows path (starts with drive letter like F:\ or F:/)
    if (dockerPath.match(/^[A-Z]:[\\\/]/)) {
      // Convert Windows path (F:\path\to\file or F:/path/to/file) to Docker path (/f/path/to/file)
      const driveLetter = dockerPath.charAt(0).toLowerCase();
      dockerPath = dockerPath.replace(/^[A-Z]:[\\\/]/, `/${driveLetter}/`).replace(/\\/g, '/');
      console.log(`🔄 Converted Windows path: ${authJsonHostPath} -> ${dockerPath}`);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:91', message: 'path converted', data: { originalPath: authJsonHostPath, dockerPath }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
      // #endregion
    } else if (process.platform === 'win32' && !dockerPath.startsWith('/')) {
      // If we're on Windows but path doesn't start with /, it might need conversion
      console.log(`⚠️ Path format may need conversion: ${dockerPath}`);
    }

    hostConfig.Binds = [`${dockerPath}:/app/auth.json:ro`];
    console.log(`📁 Will mount auth.json: ${dockerPath} -> /app/auth.json`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:100', message: 'mounting auth.json', data: { originalPath: authJsonHostPath, dockerPath, hasBinds: !!hostConfig.Binds, binds: hostConfig.Binds }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
  } else {
    console.warn("⚠️ auth.json not mounted - bot will use session from image (may be stale)");
    console.warn("💡 If auth.json expires, set AUTH_JSON_HOST_PATH environment variable");
    console.warn("💡 Or rebuild bot image after regenerating auth.json with: npm run gen:auth");

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:85', message: 'auth.json not mounted', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
  }

  // create Docker container with bot image to run, env vars, run cmd
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:91', message: 'creating container', data: { hasBinds: !!hostConfig.Binds, binds: hostConfig.Binds }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
  // #endregion

  let container;
  try {
    container = await docker.createContainer({
      Image: "meetingbot-bot",
      Env: env,
      Cmd: ["node", "dist/bot/index.js"],
      HostConfig: hostConfig,
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:100', message: 'container created', data: { containerId: container.id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
  } catch (createError: any) {
    console.error("❌ Failed to create bot container:", createError.message);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:104', message: 'container creation failed', data: { error: createError.message, stack: createError.stack }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
    throw createError;
  }

  try {
    await container.start();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:111', message: 'container started', data: {}, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
  } catch (startError: any) {
    console.error("❌ Failed to start bot container:", startError.message);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/7726de41-bcce-4be7-9752-b9df8be12bdb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'launchBot.ts:115', message: 'container start failed', data: { error: startError.message, stack: startError.stack }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
    // #endregion
    // If mount failed, provide helpful error message
    if (startError.message?.includes('mount') || startError.message?.includes('path')) {
      console.error("💡 This might be a path mounting issue. Check AUTH_JSON_HOST_PATH format.");
      console.error("💡 For Windows, try: /f/Laraib-Zafar/FYP/onix/onix new/AI-Meeting-Assistant/google-meet-meeting-bot/auth.json");
    }
    throw startError;
  }

  // attach to container logs and stream to curr process output
  const stream: NodeJS.ReadableStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
  });

  stream.on("data", (chunk: Buffer | string) => {
    // Node's stdout.write accepts Buffer or string
    process.stdout.write(chunk as Buffer | string);
  });

  console.log(`Started bot container: ${containerName}`);
  return containerName;
}
