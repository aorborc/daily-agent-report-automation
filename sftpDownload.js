// serverDownload.js
const fs = require("fs");
const path = require("path");
const SftpClient = require("ssh2-sftp-client");
const winston = require("winston");

// -----------------------------
// LOS ANGELES TIME HELPERS
// -----------------------------
function getLADate() {
  return new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
    })
  );
}

// -----------------------------
// Date Helpers (LA Based)
// -----------------------------
function getTodayDateString() {
  const d = getLADate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 👉 Match Five9 format: YYYY_MM-DD
function todayFive9Pattern() {
  const d = getLADate();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}_${m}-${day}`; // 2026_02-10
}

// -----------------------------
// Folder Paths
// -----------------------------
const BASE_DOWNLOAD_DIR = path.join(__dirname, "downloads");
const BASE_LOG_DIR = path.join(__dirname, "logs");

// -----------------------------
// ✅ Winston Logger (LA date-wise log file)
// -----------------------------
function createLogger() {
  if (!fs.existsSync(BASE_LOG_DIR)) {
    fs.mkdirSync(BASE_LOG_DIR, { recursive: true });
  }

  const today = getTodayDateString();
  const logFilePath = path.join(BASE_LOG_DIR, `${today}.log`);

  return winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.printf(
        (info) => `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`
      )
    ),
    transports: [
      new winston.transports.File({ filename: logFilePath }),
      new winston.transports.Console()
    ]
  });
}

// ✅ Only AlvinACW server
const server = {
  name: "AlvinACW",
  host: "cwtarchive.blob.core.windows.net",
  username: "cwtarchive.five9",
  password: "4fWavmwAY3k49qRaIsFZ5LmbPzzP2qdK",
  folder: "AlvinACW",
  port: 22
};

async function downloadFromServer() {
  const logger = createLogger();

  // ✅ Create today's LA-based download folder
  const todayDate = getTodayDateString();
  const DOWNLOAD_DIR = path.join(BASE_DOWNLOAD_DIR, todayDate);

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const todayPattern = todayFive9Pattern();
  logger.info(`📅 Matching Five9 Date Pattern: ${todayPattern}`);

  const sftp = new SftpClient();
  logger.info(`🔗 Connecting → ${server.name}`);

  try {
    await sftp.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      password: server.password
    });

    const remoteDir = `/${server.folder}`;
    const files = await sftp.list(remoteDir);

    const csvFiles = files
      .filter((f) => f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))
      .sort((a, b) => b.modifyTime - a.modifyTime); // latest first

    logger.info(
      `📂 Latest files in ${server.folder}: ${csvFiles
        .slice(0, 5)
        .map((f) => f.name)
        .join(", ")}`
    );

    // 1️⃣ Only pick today's 7PM file (_19_00)
    let selected = csvFiles.find(
      (f) =>
        f.name.includes(todayPattern) &&
        f.name.includes("_19_00")
    );

    // 2️⃣ STRICT MODE: 7PM file must exist
    if (!selected) {
      logger.info(`⏭ 7PM file not found yet. Skipping for now...`);
      return null;
    }

    const remotePath = `${remoteDir}/${selected.name}`;
    const localPath = path.join(DOWNLOAD_DIR, `${server.name}_${selected.name}`);

    await sftp.fastGet(remotePath, localPath);

    logger.info(`✅ Downloaded → ${localPath}`);
    return localPath;

  } catch (err) {
    logger.error(`❌ ${server.name} ERROR: ${err.message}`);
    return null;
  } finally {
    sftp.end();
    logger.info(`🔌 Connection closed`);
  }
}

module.exports = downloadFromServer;
