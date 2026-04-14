const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Usage: node scripts/hashPassword.js <your-password>');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log('\nAdd this line to your server/.env file:\n');
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log('');
});
