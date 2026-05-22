require('dotenv').config();

const app = require('./app');
const { PORT, REDIRECT_URI } = require('./config');

app.listen(PORT, '127.0.0.1', () => {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║          Spotify Playlist Cleaner              ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  console.log('Setup instructions:');
  console.log('  1. Go to https://developer.spotify.com/dashboard');
  console.log('  2. Create an app (or use an existing one)');
  console.log(`  3. Add redirect URI: ${REDIRECT_URI}`);
  console.log('  4. Copy Client ID and Client Secret into .env');
  console.log(`\nServer running at: http://127.0.0.1:${PORT}\n`);
});
