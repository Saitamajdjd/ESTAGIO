import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { JsonStore } from '../src/storage.js';
import { createApp } from '../src/server.js';
import { runAutomation } from '../src/automation.js';
import { act } from '../src/domain.js';
const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), 'locaflux-test-'));
  const file = join(dir, 'store.json');
  const store = new JsonStore(file);
  const server = createApp(store);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); assert.ok(dir.startsWith(join(tmpdir(), 'locaflux-test-'))); await rm(dir, { recursive: true, force: true }); });
  const get = async () => (await fetch(`${base}/api/state`)).json();
  const post = async (path, input, headers = {}) => {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) });
    return { status: response.status, data: await response.json() };
  };
  return { dir, file, store, server, base, get, post };
}
test('HTTP serve interface, módulos e dados reais, sem expor armazenamento', async t => {
  const { base, get } = await setup(t);
  const html = await fetch(base);
  assert.equal(html.status, 200);
  assert.match(await html.text(), /LocaFlux/);
  assert.match(html.headers.get('content-security-policy'), /default-src 'self'/);
  for (const path of ['/app.js', '/styles.css', '/favicon.svg']) assert.equal((await fetch(`${base}${path}`)).status, 200);
  for (const path of ['/data/store.json', '/src/storage.js', '/unknown']) assert.equal((await fetch(`${base}${path}`)).status, 404);
  const state = await get();
  assert.equal(state.deals.length, 5);
  assert.equal(state.referenceDate, '2026-10-25');
});
test('simulador HTTP persiste alterações e dados sobrevivem a nova instância do servidor', async t => {
  const { store, file, get, post } = await setup(t);
  const before = await get();
  const result = await post('/api/simulate', { date: '2026-11-03', revision: before.revision });
  assert.equal(result.status, 200);
  assert.equal(result.data.result.results.length, 5);
  const reopened = await new JsonStore(file).read();
  const joao = reopened.deals.find(d => d.clientName === 'João Silva');
  assert.equal(joao.stage, 'search');
  assert.equal(reopened.referenceDate, '2026-11-03');
  assert.ok(reopened.notifications.some(n => n.dealId === joao.id && n.recipient === 'owner'));
  const secondServer = createApp(new JsonStore(file));
  await new Promise(done => secondServer.listen(0, '127.0.0.1', done));
  try {
    const response = await fetch(`http://127.0.0.1:${secondServer.address().port}/api/state`);
    assert.equal((await response.json()).referenceDate, '2026-11-03');
  } finally { secondServer.closeAllConnections(); await new Promise(done => secondServer.close(done)); }
  assert.equal((await store.read()).revision, before.revision + 1);
});
test('CLI e HTTP compartilham o mesmo arquivo e preservam idempotência entre processos', async t => {
  const { file, get, post } = await setup(t);
  await get();
  const command = () => execute(process.execPath, [cli, 'verify', '--date', '2026-11-02'], { env: { ...process.env, DATA_FILE: file }, windowsHide: true });
  const results = await Promise.all([command(), command()]);
  assert.ok(results.every(r => r.stdout.includes('02/11/2026')));
  const state = await get();
  const joao = state.deals.find(d => d.clientName === 'João Silva');
  assert.equal(state.notifications.filter(n => n.dealId === joao.id && n.kind === 'deadline-warning').length, 1);
  assert.equal(state.runs.filter(r => r.source === 'cli').length, 2);
  assert.equal((await post('/api/simulate', { date: '2026-11-02' })).data.result.actionCount, 0);
});
test('transações concorrentes não perdem eventos; falha não grava alteração parcial', async t => {
  const { file, store } = await setup(t);
  const initial = await store.read();
  const deal = initial.deals.find(d => d.scenario === 'andamento');
  await Promise.all(Array.from({ length: 10 }, () => new JsonStore(file).transact(state => runAutomation(state, '2026-11-02'))));
  const result = await store.read();
  assert.equal(result.notifications.filter(n => n.dealId === deal.id && n.kind === 'deadline-warning').length, 1);
  assert.equal(result.runs.length, initial.runs.length + 10);
  const original = await readFile(file, 'utf8');
  await assert.rejects(store.transact(state => { state.referenceDate = '2040-01-01'; throw new Error('Falha planejada'); }), /Falha planejada/);
  assert.equal(await readFile(file, 'utf8'), original);
});
test('revisão antiga recebe 409 sem aplicar alteração', async t => {
  const { get, post } = await setup(t);
  const state = await get();
  await post('/api/simulate', { date: '2026-10-25', revision: state.revision });
  const result = await post('/api/simulate', { date: '2026-11-03', revision: state.revision });
  assert.equal(result.status, 409);
  assert.equal((await get()).referenceDate, '2026-10-25');
});
test('API valida origem, JSON, datas e ação indevida', async t => {
  const { base, get, post } = await setup(t);
  const state = await get();
  assert.equal((await post('/api/simulate', { date: '2026-02-30' })).status, 422);
  assert.equal((await post('/api/simulate', { date: '2026-11-02' }, { Origin: 'https://example.com' })).status, 403);
  const bad = await fetch(`${base}/api/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(bad.status, 400);
  const wrongType = await fetch(`${base}/api/simulate`, { method: 'POST', body: 'date=2026-11-03' });
  assert.equal(wrongType.status, 415);
  assert.equal((await post(`/api/deals/${state.deals[0].id}/actions`, { action: 'forward-contracts' })).status, 422);
  assert.equal((await post('/api/deals/not-found/actions', { action: 'accept' })).status, 404);
});
test('upload, download e encaminhamento funcionam de ponta a ponta', async t => {
  const { get, post, base } = await setup(t);
  const state = await get();
  const ana = state.deals.find(d => d.scenario === 'acordo');
  const action = async (action, payload = {}) => post(`/api/deals/${ana.id}/actions`, { action, payload });
  assert.equal((await action('schedule-meeting', { date: state.referenceDate, time: '15:00' })).status, 200);
  assert.equal((await action('registration', { name: 'Ana', contact: 'Contato fictício', notes: 'Ficha fictícia' })).status, 200);
  const content = Buffer.from('Documento de teste — sem dados reais');
  const attached = await action('attach-document', { name: 'ficha.txt', base64: content.toString('base64') });
  assert.equal(attached.status, 200);
  assert.equal(attached.data.result.base64, undefined);
  const download = await fetch(`${base}/api/documents/${attached.data.result.id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), content);
  assert.equal((await action('forward-contracts')).status, 200);
  const after = await get();
  assert.equal(after.deals.find(d => d.id === ana.id).stage, 'contracts');
  assert.equal(after.documents[0].base64, undefined);
});
test('notificação interna pode ser lida; mensagem externa permanece pendente', async t => {
  const { get, post } = await setup(t);
  await post('/api/simulate', { date: '2026-10-25' });
  const state = await get();
  const internal = state.notifications.find(n => n.recipient === 'consultant');
  const owner = state.notifications.find(n => n.recipient === 'owner');
  assert.equal((await post(`/api/notifications/${internal.id}/read`, {})).status, 200);
  await post(`/api/notifications/${internal.id}/read`, {});
  assert.equal((await post(`/api/notifications/${owner.id}/read`, {})).status, 422);
  const after = await get();
  assert.equal(after.events.filter(e => e.key === `${internal.id}:read`).length, 1);
  assert.equal(after.notifications.find(n => n.id === owner.id).status, 'pending');
});
test('restauração guarda backup e recupera cenários e referência originais', async t => {
  const { store, file, dir } = await setup(t);
  await store.transact(state => runAutomation(state, '2026-11-03'));
  const changed = await readFile(file, 'utf8');
  const reset = await store.reset();
  assert.equal(await readFile(reset.backup, 'utf8'), changed);
  assert.equal((await store.read()).referenceDate, '2026-10-25');
  assert.equal((await readdir(join(dir, 'backups'))).length, 1);
});
test('arquivo corrompido não é substituído silenciosamente', async t => {
  const { store, file } = await setup(t);
  await store.read();
  await writeFile(file, '{json inválido');
  await assert.rejects(store.read());
  assert.equal(await readFile(file, 'utf8'), '{json inválido');
});
test('aceite e expiração concorrentes convergem para um estado consistente', async t => {
  const { store, file } = await setup(t);
  const initial = await store.read();
  const deal = initial.deals.find(d => d.scenario === 'andamento');
  const proposalId = initial.cycles.find(c => c.dealId === deal.id).currentProposalId;
  await Promise.allSettled([
    store.transact(state => act(state, deal.id, 'accept', { party: 'owner', proposalId })),
    new JsonStore(file).transact(state => runAutomation(state, '2026-11-03'))
  ]);
  const state = await store.read();
  const c = state.cycles.find(c => c.dealId === deal.id);
  const d = state.deals.find(d => d.id === deal.id);
  assert.ok(['agreed', 'expired'].includes(c.status));
  assert.equal(d.stage, c.status === 'agreed' ? 'meeting' : 'search');
  assert.equal(state.notifications.filter(n => n.cycleId === c.id && n.recipient === 'owner').length, c.status === 'agreed' ? 0 : 1);
});

test('restauração HTTP recupera cenários, salva backup exato e rejeita revisão antiga', async t => {
  const { get, post, file, dir } = await setup(t);
  const initial = await get();
  await post('/api/simulate', { date: '2026-11-03', revision: initial.revision });
  const changed = await get();
  const persisted = await readFile(file, 'utf8');
  assert.equal((await post('/api/demo/reset', {})).status, 422);
  assert.equal((await post('/api/demo/reset', { revision: initial.revision })).status, 409);
  assert.equal(await readFile(file, 'utf8'), persisted);
  const reset = await post('/api/demo/reset', { revision: changed.revision });
  assert.equal(reset.status, 200);
  assert.equal(await readFile(reset.data.result.backup, 'utf8'), persisted);
  const restored = await get();
  assert.equal(restored.referenceDate, '2026-10-25');
  assert.equal(restored.deals.length, 5);
  assert.equal(restored.runs.length, 1);
  assert.equal(restored.documents.length, 0);
  assert.equal(restored.deals.find(d => d.scenario === 'andamento').cycle.status, 'open');
  assert.equal(restored.deals.find(d => d.scenario === 'acordo').cycle.status, 'agreed');
  assert.equal((await readdir(join(dir, 'backups'))).length, 1);
  assert.equal((await post('/api/simulate', { date: '2026-11-03', revision: changed.revision })).status, 409);
  assert.equal((await post('/api/simulate', { date: '2026-11-02', revision: restored.revision })).status, 200);
});

test('roteiro HTTP completo persiste aviso, expiração, acordo protegido e repetição sem eventos duplicados', async t => {
  const { get, post, file } = await setup(t);
  const initial = await get();
  const joao = initial.deals.find(d => d.scenario === 'andamento');
  const ana = initial.deals.find(d => d.scenario === 'acordo');
  for (const date of ['2026-11-02', '2026-11-03']) {
    const before = await get();
    const run = await post('/api/simulate', { date, revision: before.revision });
    assert.equal(run.status, 200);
    assert.equal(run.data.result.simulatedAt, `${date}T00:00:00.000Z`);
    const changed = await new JsonStore(file).read();
    const repeated = await post('/api/simulate', { date, revision: changed.revision });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.result.actionCount, 0);
    assert.equal(repeated.data.result.eventsCreated, 0);
    assert.equal(repeated.data.result.notificationsCreated, 0);
    const after = await new JsonStore(file).read();
    for (const key of ['events', 'notifications', 'cycles', 'deals']) assert.deepEqual(after[key], changed[key]);
    assert.equal(after.runs.length, changed.runs.length + 1);
  }
  const final = await get();
  const expired = final.deals.find(d => d.id === joao.id);
  assert.equal(expired.stage, 'search');
  assert.equal(expired.cycle.status, 'expired');
  assert.equal(expired.cycle.endedOn, '2026-11-03');
  assert.equal(final.notifications.filter(n => n.dealId === joao.id && n.kind === 'deadline-warning').length, 1);
  const owner = final.notifications.filter(n => n.dealId === joao.id && n.recipient === 'owner');
  assert.equal(owner.length, 1);
  assert.equal(owner[0].status, 'pending');
  assert.deepEqual(final.deals.find(d => d.id === ana.id).cycle.proposals, ana.cycle.proposals);
  assert.equal(final.deals.find(d => d.id === ana.id).cycle.status, 'agreed');
  assert.equal(final.notifications.filter(n => n.dealId === ana.id).length, 0);
});
