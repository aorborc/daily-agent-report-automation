// serverDownload.js
const fs = require("fs");
const path = require("path");
const SftpClient = require("ssh2-sftp-client");

const DOWNLOAD_DIR = path.join(__dirname, "downloads");

// ✅ Only AlvinACW server
const server = {
  name: "AlvinACW",
  host: "cwtarchive.blob.core.windows.net",
  username: "cwtarchive.five9",
  password: "4fWavmwAY3k49qRaIsFZ5LmbPzzP2qdK",
  folder: "AlvinACW",
  port: 22
};

// 👉 Match Five9 format: YYYY_MM-DD
function todayFive9Pattern() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}_${m}-${day}`; // 2026_01-22
}

async function downloadFromServer() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const todayPattern = todayFive9Pattern();
  console.log("📅 Matching Five9 Date Pattern:", todayPattern);

  const sftp = new SftpClient();
  console.log(`\n🔗 Connecting → ${server.name}`);

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
      .filter(f => f.name.endsWith(".csv") || f.name.endsWith(".xlsx"))
      .sort((a, b) => b.modifyTime - a.modifyTime); // latest first

    console.log(
      `📂 Latest files in ${server.folder}:`,
      csvFiles.slice(0, 5).map(f => f.name)
    );

    // 1️⃣ Try today's file
    let selected = csvFiles.find(f => f.name.includes(todayPattern));

    // 2️⃣ Fallback → latest available file
    if (!selected) {
      console.log(`⚠ Today file not found. Using latest available file`);
      selected = csvFiles[0];
    }

    if (!selected) {
      console.log(`❌ No CSV/XLSX files found in ${server.folder}`);
      return null;
    }

    const remotePath = `${remoteDir}/${selected.name}`;
    const localPath = path.join(DOWNLOAD_DIR, `${server.name}_${selected.name}`);

    await sftp.fastGet(remotePath, localPath);

    console.log(`✅ Downloaded → ${localPath}`);
    return localPath;

  } catch (err) {
    console.error(`❌ ${server.name} ERROR:`, err.message);
    return null;
  } finally {
    sftp.end();
  }
}

module.exports = downloadFromServer;
