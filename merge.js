const fs = require("fs");
const path = require("path");
const winston = require("winston");
const xlsx = require("xlsx"); 
const sendEmail = require("./sendEmail");
const downloadFromServers = require("./sftpDownload");

// -----------------------------
// STATE PATHS (MUST COME FIRST)
// -----------------------------
const STATE_DIR = path.join(__dirname, "state");
const LAST_FILE_PATH = path.join(STATE_DIR, "lastProcessedFile.txt");
const LAST_RUN_TIME_PATH = path.join(STATE_DIR, "lastRunTime.txt");

// ✅ Script start / end flags
const SCRIPT_START_FLAG = path.join(STATE_DIR, "scriptStarted.txt");
const SCRIPT_END_FLAG = path.join(STATE_DIR, "scriptEnded.txt");

// ✅ Sheet count file
const SHEET_COUNT_FILE = path.join(STATE_DIR, "todaySheetCount.txt");


// ✅ LOCK FILE (ADD THIS LINE HERE 👇)
const LOCK_FILE = path.join(STATE_DIR, "script.lock");

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

function getLADateString() {
  const d = getLADate();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLAHour() {
  return getLADate().getHours(); // 0–23 (LA)
}

// -----------------------------
// SCRIPT START HELPERS (LA SAFE)
// -----------------------------
function isScriptStartedToday() {
  try {
    if (!fs.existsSync(SCRIPT_START_FLAG)) return false;
    const savedDate = fs.readFileSync(SCRIPT_START_FLAG, "utf8").trim();
    return savedDate === getLADateString(); // ✅ LA date
  } catch {
    return false;
  }
}

function markScriptStartedToday() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  fs.writeFileSync(SCRIPT_START_FLAG, getLADateString(), "utf8"); // ✅ LA date
}

// -----------------------------
// FILE CLEANUP HELPERS (LA SAFE)
// -----------------------------
function deleteDownloadedFile(filePath, logger) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`🗑 Deleted processed file: ${filePath}`);
    }
  } catch (err) {
    logger.error(`❌ File delete failed: ${err.message}`);
  }
}

function cleanupYesterdayFolder(logger) {
  const BASE_DOWNLOAD_DIR = path.join(__dirname, "downloads");

  // ✅ LA-based yesterday
  const yesterday = getLADate();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split("T")[0];

  const folderPath = path.join(BASE_DOWNLOAD_DIR, dateStr);

  try {
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
      logger.info(`🧹 Deleted yesterday folder: ${folderPath}`);
    }
  } catch (err) {
    logger.error(`❌ Folder cleanup failed: ${err.message}`);
  }
}

// -----------------------------
// SHEET COUNT HELPERS
// -----------------------------
function incrementTodaySheetCount() {
  let count = 0;
  if (fs.existsSync(SHEET_COUNT_FILE)) {
    count = Number(fs.readFileSync(SHEET_COUNT_FILE, "utf8")) || 0;
  }
  fs.writeFileSync(SHEET_COUNT_FILE, String(count + 1), "utf8");
}

function getTodaySheetCount() {
  if (!fs.existsSync(SHEET_COUNT_FILE)) return 0;
  return Number(fs.readFileSync(SHEET_COUNT_FILE, "utf8")) || 0;
}

function resetTodaySheetCount() {
  if (fs.existsSync(SHEET_COUNT_FILE)) {
    fs.unlinkSync(SHEET_COUNT_FILE);
  }
}

// -----------------------------
// SCRIPT END HELPERS (LA SAFE)
// -----------------------------
function isScriptEndedToday() {
  try {
    if (!fs.existsSync(SCRIPT_END_FLAG)) return false;
    const savedDate = fs.readFileSync(SCRIPT_END_FLAG, "utf8").trim();
    return savedDate === getLADateString(); // ✅ LA date
  } catch {
    return false;
  }
}

function markScriptEndedToday() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  fs.writeFileSync(SCRIPT_END_FLAG, getLADateString(), "utf8");
}

function acquireLock() {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString(), { flag: "wx" });
    return true;
  } catch {
    return false; // another instance already running
  }
}

function releaseLock() {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
  }
}
// -----------------------------
// LOGS
// -----------------------------
const LOGS_DIR = path.join(__dirname, "logs");

// -----------------------------
// LOGGER SETUP
// -----------------------------

function createLogger() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  // ✅ LA-based log date
  const today = getLADateString();
  const logFilePath = path.join(LOGS_DIR, `${today}.log`);

  return winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.printf(
        (info) =>
          `${info.timestamp} [${info.level.toUpperCase()}] ${info.message}`
      )
    ),
    transports: [
      new winston.transports.File({ filename: logFilePath }),
      new winston.transports.Console(),
    ],
  });
}

// -----------------------------
// Time Helpers (NO CHANGE NEEDED)
// -----------------------------

// "HH:MM:SS" -> seconds
function timeToSeconds(t) {
  if (!t) return 0;

  const str = t.toString().trim();
  if (!str) return 0;

  // numeric value case
  if (!isNaN(str) && str.indexOf(":") === -1) {
    return Number(str);
  }

  const parts = str.split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;

  return h * 3600 + m * 60 + s;
}

// seconds -> "HH:MM:SS"
function secondsToTime(sec) {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}:${String(s).padStart(2, "0")}`;
}

// avg time = totalSeconds / calls
function calcAvg(totalSeconds, calls) {
  if (!calls || calls <= 0) return "00:00:00";
  return secondsToTime(totalSeconds / calls);
}

// -----------------------------
// Duplicate file skip helpers
// -----------------------------
function getLastProcessedFile() {
  try {
    if (!fs.existsSync(LAST_FILE_PATH)) return null;
    return fs.readFileSync(LAST_FILE_PATH, "utf8").trim();
  } catch (err) {
    return null;
  }
}

function setLastProcessedFile(filePath) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(LAST_FILE_PATH, filePath, "utf8");
  } catch (err) {
    console.log("❌ Unable to save last processed file:", err.message);
  }
}

function getLastRunTime() {
  try {
    if (!fs.existsSync(LAST_RUN_TIME_PATH)) return 0;
    return Number(fs.readFileSync(LAST_RUN_TIME_PATH, "utf8").trim()) || 0;
  } catch (err) {
    return 0;
  }
}

function setLastRunTime(timestamp) {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(LAST_RUN_TIME_PATH, String(timestamp), "utf8");
  } catch (err) {
    console.log("❌ Unable to save last run time:", err.message);
  }
}

// -----------------------------
// HTML Email Body
// -----------------------------
function generateEmail(agent, date_str) {
  const fullName = `${agent["AGENT FIRST NAME"] || ""} ${
    agent["AGENT LAST NAME"] || ""
  }`.trim();

  const displayName = fullName || agent.AGENT || "Agent";

  return `
    <p style="margin-bottom:12px;">Hello <b>${displayName}</b>,</p>
    <p style="margin-bottom:12px;">Here is your activity stats for <b>${date_str}</b>:</p>

    <div style="background:#fdf7f5;border-left:4px solid #6A3826;padding:12px 15px;font-size:15px;margin:18px 0;color:#6A3826;">
      <p><b>Email (AGENT):</b> ${agent.AGENT}</p>
      <p><b>Calls Count:</b> ${agent["CALLS count"]}</p>

      <hr style="border:none;border-top:1px solid #ccc;margin:10px 0;">

      <p><b>Handle Time:</b> ${agent["HANDLE TIME"]}</p>
      <p><b>Avg Handle Time:</b> ${agent["Average HANDLE TIME"]}</p>

      <p><b>Talk Time:</b> ${agent["TALK TIME"]}</p>
      <p><b>Avg Talk Time:</b> ${agent["Average TALK TIME"]}</p>

      <p><b>After Call Work Time:</b> ${agent["AFTER CALL WORK TIME"]}</p>
      <p><b>Avg After Call Work Time:</b> ${agent["Average AFTER CALL WORK TIME"]}</p>
    </div>

    <p style="margin-top:25px;font-size:13px;color:#777;">
      Thank you,<br>HIW Marketing LLC Team
    </p>
  `;
}

// -----------------------------
// MAIN
// -----------------------------
async function mergeAndMail() {
  const logger = createLogger();
  if (!acquireLock()) {
    return; // another instance running, exit silently
  }
try{
  // 🌙 Daily cleanup (LA-based)
  cleanupYesterdayFolder(logger);

  const laHour = getLAHour();

  


  // -----------------------------
  // 🛑 DAILY END MAIL (RUNS EVEN AFTER 6 PM)
  // -----------------------------
  if (laHour >= 18 && !isScriptEndedToday()) {
    logger.info(" END condition met, attempting END mail...");
    try {
      const sheets = getTodaySheetCount();

      await sendEmail(
        ["jordan@aorborc.com", "vijay@aorborc.com"],
        `🛑 Daily Agent Script Ended - ${getLADateString()}`,
        `
          <p>Hello Team,</p>
          <p>The daily agent report script has <b>ENDED</b>.</p>
          <p><b>Date:</b> ${getLADateString()}</p>
          <p><b>Total Sheets Processed:</b> ${sheets}</p>
          <p><b>End Time:</b> ${getLADate().toLocaleString()}</p>
          <br>
          <p>— System</p>
        `
      );

      logger.info(
        `🛑 END MAIL SENT | Sheets=${sheets}`
      );

      markScriptEndedToday();
      resetTodaySheetCount();
    } catch (err) {
      logger.error(`❌ END MAIL FAILED | ${err.message}`);
    }
  }

  // -----------------------------
  // ⏭ HARD STOP (AFTER END CHECK)
  // -----------------------------
  if (laHour < 6 || laHour >= 18) {
    return;
  }

logger.info("🚀 mergeAndMail run started");
  // -----------------------------
  // ⏱️ 10 MIN GAP CHECK
  // -----------------------------
  const now = Date.now();
  const lastRun = getLastRunTime();
  const diffMinutes = (now - lastRun) / (1000 * 60);

  if (lastRun && diffMinutes < 10) {
    logger.info(
      `⏭ Skipping run (only ${diffMinutes.toFixed(1)} min passed)`
    );
    return;
  }

  setLastRunTime(now);

  // -----------------------------
  // 📧 START MAIL (ONCE PER LA DAY)
  // -----------------------------
  if (!isScriptStartedToday()) {
    resetTodaySheetCount();

    try {
      await sendEmail(
        ["jordan@aorborc.com", "vijay@aorborc.com"],
        `✅ Daily Agent Script Started - ${getLADateString()}`,
        `
          <p>Hello Team,</p>
          <p>The daily agent report script has <b>STARTED</b>.</p>
          <p><b>Start Time:</b> ${getLADate().toLocaleString()}</p>
          <br>
          <p>— System</p>
        `
      );

      logger.info("✅ START MAIL SENT");
      markScriptStartedToday();
    } catch (err) {
      logger.error(`❌ START MAIL FAILED | ${err.message}`);
    }
  }

  // -----------------------------
  // 📥 DOWNLOAD FILE
  // -----------------------------
  let downloadedFilePath;
  try {
    downloadedFilePath = await downloadFromServers();
  } catch (err) {
    logger.error(`❌ DOWNLOAD FAILED | ${err.message}`);
    return;
  }

  if (!downloadedFilePath) {
    logger.info("⏭ No file available yet");
    return;
  }

  logger.info(`📥 File downloaded: ${downloadedFilePath}`);

  // -----------------------------
  // ⛔ DUPLICATE CHECK
  // -----------------------------
  const lastFile = getLastProcessedFile();
  if (lastFile === downloadedFilePath) {
    logger.info("⏭ Same file already processed");
    return;
  }

 
  // -----------------------------
  // 📊 READ SHEET
  // -----------------------------
  let rows;
  try {
    const wb = xlsx.readFile(downloadedFilePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  } catch (err) {
    logger.error(`❌ EXCEL READ FAILED | ${err.message}`);
    return;
  }

  if (!rows.length) {
    logger.error("❌ Sheet has no rows");
    return;
  }

  // -----------------------------
  // 🔄 MERGE AGENTS
  // -----------------------------
  const map = new Map();

  rows.forEach((r) => {
    const email = (r["AGENT"] || "").toString().trim();
    if (!email) return;

    const calls = Number(r["CALLS count"] || 0);

    const handle = timeToSeconds(r["HANDLE TIME"]);
    const talk = timeToSeconds(r["TALK TIME"]);
    const acw = timeToSeconds(r["AFTER CALL WORK TIME"]);

    if (!map.has(email)) {
      map.set(email, {
        AGENT: email,
        FIRST: r["AGENT FIRST NAME"] || "",
        LAST: r["AGENT LAST NAME"] || "",
        GROUP: r["AGENT GROUP"] || "",
        CALLS: 0,
        HANDLE: 0,
        TALK: 0,
        ACW: 0,
      });
    }

    const a = map.get(email);
    a.CALLS += calls;
    a.HANDLE += handle;
    a.TALK += talk;
    a.ACW += acw;
  });

  const final = Array.from(map.values()).map((a) => ({
    AGENT: a.AGENT,
    "AGENT FIRST NAME": a.FIRST,
    "AGENT LAST NAME": a.LAST,
    "AGENT GROUP": a.GROUP,
    "CALLS count": a.CALLS,
    "HANDLE TIME": secondsToTime(a.HANDLE),
    "Average HANDLE TIME": calcAvg(a.HANDLE, a.CALLS),
    "TALK TIME": secondsToTime(a.TALK),
    "Average TALK TIME": calcAvg(a.TALK, a.CALLS),
    "AFTER CALL WORK TIME": secondsToTime(a.ACW),
    "Average AFTER CALL WORK TIME": calcAvg(a.ACW, a.CALLS),
  }));

  logger.info(`📊 Agents prepared: ${final.length}`);

  // -----------------------------
  // 📧 SEND AGENT MAILS
  // -----------------------------
  let successCount = 0;
  let failCount = 0;

  for (const agent of final) {
    try {
      await sendEmail(
        agent.AGENT,
        `Hourly Activity Report - ${getLADateString()}`,
        generateEmail(agent, getLADateString())
      );
      successCount++;
    } catch (err) {
      failCount++;
      logger.error(`❌ MAIL FAIL | ${agent.AGENT} | ${err.message}`);
    }
  }

  logger.info(
    `📨 MAIL SUMMARY | Success=${successCount} | Failed=${failCount}`
  );
  // ✅ Increment sheet count ONLY if mails actually went out
if (successCount > 0) {
  incrementTodaySheetCount();
}

  setLastProcessedFile(downloadedFilePath);

  if (successCount > 0) {
    deleteDownloadedFile(downloadedFilePath, logger);
  }

logger.info("🎉 RUN COMPLETED SUCCESSFULLY");
} 
 catch (err) {
    // 🔥 catches ANY unexpected error
    logger.error(`🔥 UNHANDLED ERROR | ${err.message}`);
  } finally {
    // 🔓 ALWAYS runs
    releaseLock();
  }
}



mergeAndMail();
