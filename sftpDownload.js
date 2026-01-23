// serverDownload.js
const fs = require("fs");
const path = require("path");
const SftpClient = require("ssh2-sftp-client");
const winston = require("winston");

// -----------------------------
// Date Helpers
// -----------------------------
function getTodayDateString() {
  // YYYY-MM-DD
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// 👉 Match Five9 format: YYYY_MM-DD
function todayFive9Pattern() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}_${m}-${day}`; // 2026_01-22
}

// -----------------------------
// Folder Paths
// -----------------------------
const BASE_DOWNLOAD_DIR = path.join(__dirname, "downloads");
const BASE_LOG_DIR = path.join(__dirname, "logs");

// -----------------------------
// ✅ Winston Logger (date-wise log file)
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

  // ✅ Create today's download folder
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

    // 1️⃣ Try today's file
    let selected = csvFiles.find((f) => f.name.includes(todayPattern));

    // 2️⃣ ✅ STRICT MODE: today file must exist
    if (!selected) {
      logger.info(`⏭ Today file not found yet. Skipping for now...`);
      return null;
    }

    if (!selected) {
      logger.info(`❌ No CSV/XLSX files found in ${server.folder}`);
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
