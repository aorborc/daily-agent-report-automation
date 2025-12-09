const Client = require('ssh2-sftp-client');
const moment = require('moment');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const winston = require('winston');

// Logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// ---- SFTP servers ----
const servers = [
  {
    name:"AlvinACW",
    host: 'cwtarchive.blob.core.windows.net',
    username: 'cwtarchive.five9',
    password: '4fWavmwAY3k49qRaIsFZ5LmbPzzP2qdK',
    folder: 'AlvinACW',
    port: 22
  },
  {
    name:"AlvinRRFUBRLUNCH",
    host: 'cwtarchive.blob.core.windows.net',
    username: 'cwtarchive.five9',
    password: '4fWavmwAY3k49qRaIsFZ5LmbPzzP2qdK',
    folder: 'AlvinRRFUBRLUNCH',
    port: 22
  }
];

async function downloadFromServer(config) {
  const sftp = new Client();
  try {
    await sftp.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      port: config.port
    });

    const files = await sftp.list(config.folder);
    if (!files.length) return logger.error(`No files in ${config.folder}`);

    const latest = files.sort((a,b)=> new Date(b.modifyTime)-new Date(a.modifyTime))[0];

    const today = moment().format("YYYY-MM-DD");
    const dir = path.join("downloads", today);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });

    const timestamp = moment().format("HH-mm");
    const localCSV = path.join(dir, `${config.name}_${today}_${timestamp}.csv`);
    const localXLSX = path.join(dir, `${config.name}_${today}_${timestamp}.xlsx`);

    await sftp.get(`${config.folder}/${latest.name}`, localCSV);
    logger.info(`Downloaded CSV ✔ ${localCSV}`);

    // Convert CSV to Excel auto
    const data = fs.readFileSync(localCSV, "utf8").split("\n").map(r => r.split(","));
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
    xlsx.writeFile(wb, localXLSX);

    logger.info(`Converted to Excel ✔ ${localXLSX}`);
  }
  catch(err){
    logger.error("Error:",err.message);
  }
  finally{
    sftp.end();
  }
}

async function start(){
  for(const server of servers){
    await downloadFromServer(server);
  }
  logger.info("🎉 All download + conversion completed.");
}

start();
