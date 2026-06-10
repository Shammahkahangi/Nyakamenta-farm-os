/**
 * One-off: load .env and call OpenAI chat completions (prints RESULT line only).
 * Usage: node scripts/verify-openai.js
 */
const path = require('path');
const https = require('https');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const rawKey = process.env.OPENAI_API_KEY || '';
const apiKey = rawKey.trim().replace(/^["']|["']$/g, '');

if (!apiKey || apiKey.startsWith('sk-your')) {
  console.log('RESULT: NO_KEY');
  process.exit(2);
}

const body = JSON.stringify({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  max_tokens: 8,
});

const req = https.request(
  {
    hostname: 'api.openai.com',
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => {
      data += c;
    });
    res.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(data || '{}');
      } catch {
        console.log('RESULT: BAD_JSON', res.statusCode);
        process.exit(3);
      }
      if (res.statusCode >= 400) {
        const msg = parsed.error?.message || parsed.message || '';
        console.log('RESULT: HTTP_' + res.statusCode, msg);
        process.exit(4);
      }
      if (parsed.error) {
        console.log('RESULT: API_ERR', parsed.error.message || '');
        process.exit(4);
      }
      const text = parsed.choices?.[0]?.message?.content || '';
      console.log('RESULT: OK', String(text).trim().slice(0, 40));
      process.exit(0);
    });
  }
);

req.on('error', (e) => {
  console.log('RESULT: NET', e.message);
  process.exit(5);
});

req.setTimeout(60000, () => {
  req.destroy();
  console.log('RESULT: TIMEOUT');
  process.exit(6);
});

req.write(body);
req.end();
