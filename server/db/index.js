const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { applySchema } = require('./schema');
const { runMigrations } = require('./migrations');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'database.sqlite');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

applySchema(db);
runMigrations(db);

module.exports = db;
