const FAKE_ID = '9d1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c';

if (process.argv.includes('create')) {
  process.stdout.write([
    '\u{1F300} Creating namespace with title "ARENAS"',
    '\u{1F300} Successfully created namespace with binding "ARENAS"',
    '\u{1F300} Begin by adding the namespace to your wrangler.toml:',
    '[[kv_namespaces]]',
    'binding = "ARENAS"',
    `id = "${FAKE_ID}"`,
    '',
  ].join('\n'));
  process.exit(0);
}

if (process.argv.includes('list')) {
  if (process.env.KV_FAKE_MODE === 'list-exists') {
    process.stdout.write(`data\n[{"id":"${FAKE_ID}","title":"ARENAS"}]\n`);
  } else {
    process.stdout.write('data\n[]\ntrailer\n');
  }
  process.exit(0);
}

process.exit(2);