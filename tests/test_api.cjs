const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const source = fs.readFileSync('app/static/api.js', 'utf8');
function client(fetch) { const ctx = { URL, fetch, window: { location: { href: 'https://preview.example/', origin: 'https://preview.example' } } }; vm.createContext(ctx); vm.runInContext(source, ctx); return ctx.api; }
function response(status, body, type = 'application/json', redirected = false) { return { status, ok: status < 400, redirected, headers: { get: () => type }, json: async () => body }; }
test('HTTPS POST stays on preview and preserves JSON payload', async () => { let sent; const api = client(async (url, options) => { sent = { url, options }; return response(200, { code: 'TEST' }); }); assert.equal((await api('/api/patients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"code":"TEST"}' })).code, 'TEST'); assert.equal(sent.url, 'https://preview.example/api/patients'); assert.equal(sent.options.credentials, 'same-origin'); assert.equal(sent.options.cache, 'no-store'); assert.equal(sent.options.method, 'POST'); assert.equal(sent.options.body, '{"code":"TEST"}'); assert.equal(sent.options.headers.Accept, 'application/json'); });
test('validation message is preserved', async () => { await assert.rejects(client(async () => response(422, { detail: 'Invalid field' }))('/api/patients'), /Invalid field/); });
test('proxy failure reports HTTP status without retrying POST', async () => { let calls = 0; await assert.rejects(client(async () => { calls++; return response(502, null, 'text/html'); })('/api/patients', { method: 'POST' }), /HTTP 502/); assert.equal(calls, 1); });
test('expired preview session is identified', async () => { await assert.rejects(client(async () => response(403, null, 'text/html'))('/api/patients'), /Сессия preview/); });
test('HTML login redirect is never treated as saved', async () => { await assert.rejects(client(async () => response(200, null, 'text/html', true))('/api/patients'), /Сессия preview/); });
test('network failure does not claim that save failed or retry', async () => { await assert.rejects(client(async () => { throw new TypeError('fetch failed'); })('/api/patients'), /Сохранение не подтверждено/); });
test('external API destinations are rejected', async () => { await assert.rejects(client(async () => { throw new Error('must not fetch'); })('https://other.example/api'), /текущего приложения/); });
