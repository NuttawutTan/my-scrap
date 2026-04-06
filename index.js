const puppet = require("./puppet");
const fs = require("fs");

const logFile = "run.log";

function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    fs.appendFileSync(logFile, line + "\n");
}

// Clear previous log
if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

log("Starting scraper...");

puppet.parseXDCalendar()
    .then(() => {
        log("Done.");
    })
    .catch((err) => {
        log("ERROR: " + err.message);
        log(err.stack || "");
        log("Press any key to exit...");
    });
