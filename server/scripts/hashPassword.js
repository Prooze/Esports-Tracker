/**
 * Print a bcrypt hash for a given password. Used as a manual alternative to
 * `createFirstAdmin.js` when you want to inject the hash directly into the
 * database (e.g. for restoring a backup).
 *
 * Usage:
 *   node scripts/hashPassword.js <your-password>
 */
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;
const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hashPassword.js <your-password>');
  process.exit(1);
}

bcrypt.hash(password, BCRYPT_ROUNDS).then((hash) => {
  console.log('\nPassword hash:');
  console.log(hash);
  console.log('');
});
