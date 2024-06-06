const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

function initializeDatabase(context) {
    console.log('initializeDatabase');
    const extensionPath = context.extensionPath;
    const dbPath = path.join(extensionPath, 'scan_results.db');
    const db = new sqlite3.Database(dbPath);

    db.exec(`CREATE TABLE IF NOT EXISTS scan_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_at TIMESTAMP,
        total_issue_count INTEGER
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS scan_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_summary_id INTEGER,
        title TEXT,
        severity TEXT,
        description TEXT,
        code_source TEXT,
        code_extract TEXT,
        full_filename TEXT,
        FOREIGN KEY (scan_summary_id) REFERENCES scan_summary(id)
    )`);

    db.exec(`CREATE TABLE IF NOT EXISTS availability_check (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_at TIMESTAMP
    )`);
    return db;
};

function saveJsonToSqlite(db, jsonPath) {
    // Read the JSON file
    fs.readFile(jsonPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading JSON file:', err);
            return;
        }
        const jsonData = JSON.parse(data);

        const formattedJsonData = [];

        for (const severity in jsonData) {
            jsonData[severity].forEach(element => {
                formattedJsonData.push({ ...element, severity });
            });
        }

        const insertSummary = db.prepare('INSERT INTO scan_summary (scan_at, total_issue_count) VALUES (?, ?)');
        insertSummary.run(new Date().toISOString(), formattedJsonData.length, function () {
            const scanSummaryId = this.lastID;
            const insertDetail = db.prepare('INSERT INTO scan_details (scan_summary_id, title, severity, description, code_source, code_extract, full_filename) VALUES (?, ?, ?, ?, ?, ?, ?)');
            for (const detail of formattedJsonData) {
                insertDetail.run(
                    scanSummaryId,
                    detail.title,
                    detail.severity,
                    detail.description,
                    JSON.stringify(detail.source),
                    detail.code_extract,
                    detail.full_filename
                );
            }
        });
    });
};

module.exports = { initializeDatabase, saveJsonToSqlite };
