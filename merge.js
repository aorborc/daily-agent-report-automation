// mergeAndMail.js
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const winston = require("winston");

const sendEmail = require("./sendEmail");
const downloadFromServers = require("./sftpDownload");

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

  const yesterday = new Date();
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


// ✅ Store last processed file path here (inside state folder)
const STATE_DIR = path.join(__dirname, "state");
const LAST_FILE_PATH = path.join(STATE_DIR, "lastProcessedFile.txt");
const LAST_RUN_TIME_PATH = path.join(STATE_DIR, "lastRunTime.txt");



// ✅ Logs folder + daily log file
const LOGS_DIR = path.join(__dirname, "logs");

// -----------------------------
// Logger Setup (Winston)
// -----------------------------
function getTodayDateString() {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

function createLogger() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }

  const today = getTodayDateString();
  const logFilePath = path.join(LOGS_DIR, `${today}.log`);

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

// -----------------------------
// Time Helpers
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
  // 🌙 Daily cleanup (runs safely even if folder not exists)
cleanupYesterdayFolder(logger);


  logger.info("🚀 mergeAndMail job started");

  const now = Date.now();
  const lastRun = getLastRunTime();
  const diffMinutes = (now - lastRun) / (1000 * 60);

  if (lastRun && diffMinutes < 10) {
    logger.info(`⏭ Skipping run (only ${diffMinutes.toFixed(1)} min passed). Waiting for 10 min gap...`);
    return;
  }

  setLastRunTime(now);

  // ✅ STEP 1: Download from AlvinACW server
  const downloadedFilePath = await downloadFromServers();


  if (!downloadedFilePath) {
    logger.info("⏭ No file downloaded (today file not available). Skipping run.");
    return;
  }

  logger.info(`✅ Downloaded File: ${downloadedFilePath}`);

  // ✅ If same file already processed, SKIP sending mail
  const lastFile = getLastProcessedFile();

  if (lastFile && lastFile === downloadedFilePath) {
    logger.info("⏭ No new file found (same as last processed). Skipping email...");
    return;
  }

  // ✅ STEP 2: Read that single file
  const wb = xlsx.readFile(downloadedFilePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });

  if (!rows.length) {
    logger.error("❌ No data rows found in sheet");
    return;
  }

  // ✅ STEP 3: Group + Combine duplicate AGENT email rows
  const map = new Map();

  rows.forEach((r) => {
    const email = (r["AGENT"] || "").toString().trim();
    if (!email) return;

    const calls = Number(r["CALLS count"] || 0);
    const handleSec = timeToSeconds(r["HANDLE TIME"]);
    const talkSec = timeToSeconds(r["TALK TIME"]);
    const acwSec = timeToSeconds(r["AFTER CALL WORK TIME"]);

    if (!map.has(email)) {
      map.set(email, {
        "AGENT GROUP": r["AGENT GROUP"] || "",
        AGENT: email,
        "AGENT FIRST NAME": r["AGENT FIRST NAME"] || "",
        "AGENT LAST NAME": r["AGENT LAST NAME"] || "",

        TOTAL_CALLS: 0,
        TOTAL_HANDLE: 0,
        TOTAL_TALK: 0,
        TOTAL_ACW: 0,
      });
    }

    const a = map.get(email);

    // fill missing names if first row empty
    if (!a["AGENT FIRST NAME"] && r["AGENT FIRST NAME"])
      a["AGENT FIRST NAME"] = r["AGENT FIRST NAME"];

    if (!a["AGENT LAST NAME"] && r["AGENT LAST NAME"])
      a["AGENT LAST NAME"] = r["AGENT LAST NAME"];

    if (!a["AGENT GROUP"] && r["AGENT GROUP"])
      a["AGENT GROUP"] = r["AGENT GROUP"];

    // add totals (2 rows -> summed)
    a.TOTAL_CALLS += calls;
    a.TOTAL_HANDLE += handleSec;
    a.TOTAL_TALK += talkSec;
    a.TOTAL_ACW += acwSec;

    map.set(email, a);
  });

  // ✅ STEP 4: Create final agent list with recalculated averages
  const final = Array.from(map.values()).map((a) => {
    return {
      "AGENT GROUP": a["AGENT GROUP"],
      AGENT: a.AGENT,
      "AGENT FIRST NAME": a["AGENT FIRST NAME"],
      "AGENT LAST NAME": a["AGENT LAST NAME"],

      "CALLS count": a.TOTAL_CALLS,

      "HANDLE TIME": secondsToTime(a.TOTAL_HANDLE),
      "Average HANDLE TIME": calcAvg(a.TOTAL_HANDLE, a.TOTAL_CALLS),

      "TALK TIME": secondsToTime(a.TOTAL_TALK),
      "Average TALK TIME": calcAvg(a.TOTAL_TALK, a.TOTAL_CALLS),

      "AFTER CALL WORK TIME": secondsToTime(a.TOTAL_ACW),
      "Average AFTER CALL WORK TIME": calcAvg(a.TOTAL_ACW, a.TOTAL_CALLS),
    };
  });

  logger.info(`✅ Total unique agents: ${final.length}`);

  // ✅ STEP 5: Save summary output CSV (optional)
  const dir = path.join(__dirname, "downloads");
  const outFile = path.join(dir, "AlvinACW_AgentSummary.csv");
  const csv = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(final));
  fs.writeFileSync(outFile, csv);
  logger.info(`✅ Summary File Created → ${outFile}`);

  // ✅ STEP 6: Demo mail -> first 2 agents only
  const firstTwo = final.slice(0, 2);

  if (firstTwo.length === 0) {
    logger.error("❌ No agents to email");
    return;
  }

  const date = new Date().toISOString().split("T")[0];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < firstTwo.length; i++) {
    const agent = firstTwo[i];

    const subject = `Hourly Activity Report - ${agent.AGENT}`;
    const html = generateEmail(agent, date);

    try {
      await sendEmail(subject, html);
      successCount++;
      logger.info(`📧 Email sent successfully: ${subject}`);
    } catch (err) {
      failCount++;
      logger.error(`❌ Email failed: ${subject} | ${err.message}`);
    }
  }

 logger.info(`✅ Email Summary: Success=${successCount}, Failed=${failCount}`);

// ✅ Mark file processed
setLastProcessedFile(downloadedFilePath);

// ✅ DELETE FILE only if at least one mail sent
if (successCount > 0) {
  deleteDownloadedFile(downloadedFilePath, logger);
}

logger.info("🎉 Completed → Reports sent");

}

mergeAndMail();
