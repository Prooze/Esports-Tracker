require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../src/db');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.error('Usage: node scripts/createFirstAdmin.js <username> <password>');
  process.exit(1);
}

const { count } = db.prepare('SELECT COUNT(*) AS count FROM admins').get();
if (count > 0) {
  console.error('Admin accounts already exist. Use the Accounts tab in the admin panel to add more.');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  db.prepare(
    "INSERT INTO admins (username, password_hash, permissions, is_superadmin) VALUES (?, ?, '[]', 1)"
  ).run(username, hash);
  console.log(`✓ Super admin account "${username}" created.`);
  console.log('  Log in at /login');
});
