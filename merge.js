// mergeAndMail.js
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const sendEmail = require('./sendEmail'); // your Resend module

// ---------------------------------
// Convert minutes → Hours
// ---------------------------------
function formatMinutesToHours(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

// ---------------------------------
// Build HTML Email Body
// ---------------------------------
// ---------------------------
// Helpers (place near top)
// ---------------------------
function timeToMinutes(t) {
  if (!t || t === "0" || t === "0:00:00") return 0;
  // If already a number-like string e.g. "31.66"
  if (!isNaN(t) && t.toString().indexOf(":") === -1) {
    return Math.round(Number(t));
  }
  const parts = t.toString().split(":").map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  const total = h * 60 + m + s / 60;    // keep fractional minutes
  return Math.round(total);            // show rounded minutes
}

function formatMinutesToHours(mins) {
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${m}m`;
}

// ---------------------------
// HTML email body (replace your generateEmail)
// ---------------------------
function generateEmail(agent, date_str) {
  const name = agent["AGENT NAME"] || agent.AGENT || "Agent";
  const acw       = timeToMinutes(agent["After Call Work / AGENT STATE TIME"]);
  const restroom  = timeToMinutes(agent["Restroom / AGENT STATE TIME"]);
  const brk       = timeToMinutes(agent["Break / AGENT STATE TIME"]);
  const lunch     = timeToMinutes(agent["Lunch / AGENT STATE TIME"]);
  const followUp  = timeToMinutes(agent["Follow-Up Work / AGENT STATE TIME"]);

  const total = acw + restroom + brk + lunch + followUp;
  const totalHours = formatMinutesToHours(total);

  return `
  <p style="margin-bottom:12px;">Hello <b>${name}</b>,</p>
  <p style="margin-bottom:12px;">Here are your activity stats for <b>${date_str}</b>:</p>

  <div style="background:#fdf7f5;border-left:4px solid #6A3826;padding:12px 15px;font-size:15px;margin:18px 0;color:#6A3826;">
    <p><b>After Call Work:</b> ${acw} mins</p>
    <p><b>Restroom:</b> ${restroom} mins</p>
    <p><b>Break:</b> ${brk} mins</p>
    <p><b>Lunch:</b> ${lunch} mins</p>
    <p><b>Follow-Up:</b> ${followUp} mins</p>

    <hr style="border:none;border-top:1px solid #ccc;margin:10px 0;">
    <p style="font-size:16px;"><b>Total Hours:</b> ${totalHours}</p>
  </div>

  <p>If you have any questions, please contact your supervisor.</p>
  <p style="margin-top:25px;font-size:13px;color:#777;">Thank you,<br>HIW Marketing LLC Team</p>
  `;
}

// ---------------------------------
// Main function merges → picks 2 → mail
// ---------------------------------
async function mergeAndMail() {
    const dir = path.join(__dirname, "downloads");

    // Pick only CSV/XLSX
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".csv") || f.endsWith(".xlsx"));

    if (files.length < 2) return console.log("❌ Need at least 2 files to merge");

    console.log("📄 Files:", files);

    // Latest 2 files
    const file1 = path.join(dir, files[0]);
    const file2 = path.join(dir, files[1]);

    const load = fp => xlsx.readFile(fp);
    const wb1 = load(file1);
    const wb2 = load(file2);

    const s1 = xlsx.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);
    const s2 = xlsx.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);

    // Merge using AGENT as key
    const map = new Map();
    s1.forEach(r => r.AGENT && map.set(r.AGENT, { ...r }));
    s2.forEach(r => {
        if (r.AGENT) map.set(r.AGENT, map.has(r.AGENT) ? { ...map.get(r.AGENT), ...r } : r);
    });

    const final = Array.from(map.values());

    // Save merged CSV
    const outfile = path.join(dir, "Merged_Final.csv");
    const csv = xlsx.utils.sheet_to_csv(xlsx.utils.json_to_sheet(final));
    fs.writeFileSync(outfile, csv);
    console.log("✅ Merged File Created →", outfile);

    if (final.length < 2) return console.log("❌ Not enough agents for mailing");

    // Pick random 2 agents
    const shuffled = final.sort(() => 0.5 - Math.random());
    const two = shuffled.slice(0, 2);

    const date = new Date().toISOString().split("T")[0];

    // Send emails using Resend
    for (let i = 0; i < 2; i++) {
        const agent = two[i];
        const html = generateEmail(agent, date);
        const subject = `Daily Activity Report - ${agent.AGENT_NAME || agent.AGENT}`;

        // Send via sendEmail.js
        await sendEmail(subject, html);
    }

    console.log("\n🎉 Completed → Reports sent to 2 random agents");
}

mergeAndMail();
