import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
import { JsonStore } from '../src/storage.js';

const qaDir = resolve('.qa');
const edgePath = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await access(edgePath).catch(() => { throw new Error('Microsoft Edge não encontrado. Configure EDGE_PATH para executar esta validação opcional.'); });
const profileDir = resolve(qaDir, `edge-profile-${process.pid}`);
await mkdir(qaDir, { recursive: true });
await mkdir(resolve('docs/evidencias'), { recursive: true });
const store = new JsonStore(resolve(qaDir, 'browser-store.json'));
await store.reset();
const server = createApp(store);
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const edge = spawn(edgePath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let browserDiagnostics = '';
edge.stderr.on('data', data => { browserDiagnostics = (browserDiagnostics + data.toString()).slice(-5000); });
const edgeEnded = new Promise(done => edge.once('exit', done));
console.log('Servidor de teste:', base, 'Navegador iniciado:', edge.pid);
let ws;
const results = [];
const errors = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function poll(fn, message, timeout = 15000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) { try { const result = await fn(); if (result) return result; } catch {} await sleep(100); }
  throw new Error(`Timeout: ${message}`);
}
try {
  const debugPort = await poll(async () => Number((await readFile(resolve(profileDir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]), 'porta do navegador');
  const tabs = await poll(async () => (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json(), 'iniciar navegador');
  console.log('Conectando ao navegador');
  ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, fail) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', fail, { once: true }); });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const p = pending.get(message.id); pending.delete(message.id);
      message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text);
  });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  const waitText = text => poll(() => evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`), text);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const fill = (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value = ${JSON.stringify(value)}`);
  async function screenshot(name) {
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve('docs/evidencias', name), Buffer.from(shot.data, 'base64'));
  }
  await cdp('Runtime.enable'); await cdp('Log.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: base });
  await waitText('João Silva');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await screenshot('desktop.png');
  results.push('Desktop 1440px: painel carregado, sem transbordamento horizontal.');
  for (const width of [1024, 768, 375]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    await sleep(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `overflow ${width}`);
    results.push(`Layout ${width}px: sem transbordamento horizontal.`);
  }
  await screenshot('mobile.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
  const initial = await (await fetch(`${base}/api/state`)).json();
  const lucas = initial.deals.find(d => d.scenario === 'contraproposta');
  const ana = initial.deals.find(d => d.scenario === 'acordo');
  await click(`[data-deal="${lucas.id}"]`);
  await waitText('Novo valor mensal (R$)');
  await click('[data-tab="proposals"]');
  await waitText('Os aceites acima não se aplicam às propostas posteriores.');
  await click('[data-tab="summary"]');
  await click('[data-deal-action="accept"]');
  await waitText('Acordo confirmado em');
  assert.equal((await store.read()).cycles.find(c => c.dealId === lucas.id).status, 'agreed');
  results.push('Contraproposta: histórico acessível e aceite do cliente gerou acordo pela interface.');
  await click('[data-action="close-dialog"]');
  await click(`[data-deal="${ana.id}"]`);
  await evaluate('document.querySelector("form[data-kind=schedule-meeting]").requestSubmit()');
  await waitText('Reunião: 25/10/2026');
  await click('[data-tab="documents"]');
  await fill('#field-contact', 'Contato fictício');
  await fill('#field-notes', 'Ficha fictícia preenchida na validação pelo navegador.');
  await evaluate('document.querySelector("form[data-kind=registration]").requestSubmit()');
  await waitText('Anexar documento');
  await writeFile(resolve(qaDir, 'documento-ficticio.txt'), 'Documento fictício de validação.');
  const root = await cdp('DOM.getDocument');
  const fileInput = await cdp('DOM.querySelector', { nodeId: root.root.nodeId, selector: '#document-file' });
  await cdp('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [resolve(qaDir, 'documento-ficticio.txt')] });
  await evaluate('document.querySelector("form[data-form=upload]").requestSubmit()');
  await waitText('documento-ficticio.txt');
  await click('[data-deal-action="forward-contracts"]');
  await waitText('Encaminhamento registrado.');
  results.push('Documentação: reunião, ficha, upload real e encaminhamento concluídos pela interface.');
  await click('[data-action="close-dialog"]');
  await click('[data-action="new-deal"]');
  await fill('#field-clientName', 'Cliente de teste no navegador');
  await fill('#field-needs', 'Casa com dois quartos.');
  await evaluate('document.querySelector("form[data-form=new-deal]").requestSubmit()');
  await waitText('Registrar apresentação de imóveis');
  await click('input[name="propertyIds"]');
  await evaluate('document.querySelector("form[data-kind=send-properties]").requestSubmit()');
  await waitText('Consultar disponibilidade do proprietário');
  await evaluate('document.querySelector("form[data-kind=request-visit]").requestSubmit()');
  await waitText('Proprietário confirmou o horário');
  await click('[data-deal-action="confirm-visit"]');
  await waitText('Registrar visita realizada');
  await click('[data-deal-action="complete-visit"]');
  await waitText('Iniciar ciclo de negociação');
  await fill('#field-amount', '2000');
  await evaluate('document.querySelector("form[data-kind=start-cycle]").requestSubmit()');
  await waitText('Registrar contraproposta');
  results.push('Novo atendimento: seleção, solicitação, confirmação, visita e primeira proposta concluídas pela interface.');
  await click('[data-action="close-dialog"]');
  await evaluate('location.hash = "#simulator"');
  await waitText('Data da verificação');
  const beforeReset = await readFile(store.file, 'utf8');
  await click('[data-action="reset-demo"]');
  await click('form[data-form="reset-demo"] button[type="submit"]');
  await waitText('Demonstração restaurada em 25/10/2026');
  const demoInitial = await store.read();
  assert.equal(demoInitial.deals.length, 5);
  assert.equal(demoInitial.documents.length, 0);
  assert.equal(demoInitial.referenceDate, '2026-10-25');
  const { readdir } = await import('node:fs/promises');
  const backups = await readdir(resolve(qaDir, 'backups'));
  assert.ok((await Promise.all(backups.map(file => readFile(resolve(qaDir, 'backups', file), 'utf8')))).includes(beforeReset));
  const demoAna = demoInitial.deals.find(d => d.scenario === 'acordo');
  const anaCycle = demoInitial.cycles.find(c => c.dealId === demoAna.id);
  await click(`[data-demo-proposals="${demoAna.id}"]`);
  await waitText('22/10/2026 · Aceite confirmado');
  assert.equal(await evaluate('document.querySelectorAll(".proposal-card .acceptance.yes").length'), 2);
  await screenshot('acordo.png');
  await click('[data-action="close-dialog"]');
  results.push('Restauração pela interface: cinco cenários recuperados, documentos removidos e backup integral conferido. Ana tem dois aceites na mesma proposta.');
  await click('[data-date="2026-11-02"]');
  await click('form[data-form="simulate"] button[type="submit"]');
  await waitText('Verificação em 02/11/2026');
  const warned = await store.read();
  const joao = warned.deals.find(d => d.scenario === 'andamento');
  assert.ok(warned.notifications.some(n => n.dealId === joao.id && n.kind === 'deadline-warning'));
  assert.equal(warned.runs.at(-1).simulatedAt, '2026-11-02T00:00:00.000Z');
  assert.equal(await evaluate('document.querySelector("[data-demo-scenario=andamento]").innerText.includes("1 dia restante")'), true);
  await screenshot('aviso.png');
  await click('form[data-form="simulate"] button[type="submit"]');
  await waitText('Nenhuma alteração necessária. Avisos já gerados');
  const repeatedWarning = await store.read();
  assert.deepEqual(repeatedWarning.notifications, warned.notifications);
  assert.deepEqual(repeatedWarning.events, warned.events);
  await click('[data-date="2026-11-03"]');
  await click('form[data-form="simulate"] button[type="submit"]');
  await waitText('Verificação em 03/11/2026');
  const expired = await store.read();
  assert.equal(expired.deals.find(d => d.id === joao.id).stage, 'search');
  assert.equal(expired.cycles.find(c => c.dealId === joao.id).endedOn, '2026-11-03');
  assert.deepEqual(expired.cycles.find(c => c.dealId === demoAna.id), anaCycle);
  assert.equal(expired.notifications.filter(n => n.dealId === demoAna.id).length, 0);
  const ownerNotification = expired.notifications.filter(n => n.dealId === joao.id && n.recipient === 'owner');
  assert.equal(ownerNotification.length, 1);
  assert.equal(ownerNotification[0].status, 'pending');
  assert.equal(await evaluate('document.querySelector("[data-demo-scenario=andamento]").innerText.includes("Envio de imóveis")'), true);
  assert.equal(await evaluate('document.querySelector("[data-demo-scenario=acordo]").innerText.includes("Acordo registrado")'), true);
  await screenshot('simulador.png');
  await click('form[data-form="simulate"] button[type="submit"]');
  await waitText('0 eventos criados · 0 notificações criadas');
  const repeatedExpiration = await store.read();
  for (const key of ['events', 'notifications', 'cycles', 'deals']) assert.deepEqual(repeatedExpiration[key], expired[key]);
  assert.equal(repeatedExpiration.runs.length, expired.runs.length + 1);
  await cdp('Page.reload');
  await waitText('0 eventos criados · 0 notificações criadas');
  assert.equal(await evaluate('document.querySelector("[data-demo-scenario=andamento]").innerText.includes("Prazo expirado")'), true);
  for (const width of [375, 1440]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: width < 600 });
    await sleep(150);
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `simulator overflow ${width}`);
  }
  await writeFile(resolve('docs/evidencias/demonstracao.json'), JSON.stringify({
    recordedAt: new Date().toISOString(), referenceDate: repeatedExpiration.referenceDate,
    runs: repeatedExpiration.runs.filter(r => r.source === 'simulator'),
    deals: repeatedExpiration.deals.map(d => ({ code: d.code, clientName: d.clientName, stage: d.stage,
      cycle: repeatedExpiration.cycles.find(c => c.dealId === d.id) })),
    notifications: repeatedExpiration.notifications,
    repetitionVerified: { warningEventsUnchanged: true, expirationEventsUnchanged: true, notificationsUnchanged: true }
  }, null, 2));
  results.push('Botões de simulação: aviso real em 02/11, expiração em 03/11, Envio de imóveis e mensagem pendente ao proprietário; acordo de Ana integralmente preservado.');
  results.push('Repetição em ambas as datas: eventos, notificações, ciclos e atendimentos idênticos; apenas novo log. Dados preservados após recarregar a página.');
  results.push('Logs exibem condições, horário simulado, registro real, resultado, mudanças e contadores; simulador sem transbordamento em 375 e 1440px.');
  await click(`[data-demo-proposals="${joao.id}"]`);
  await click('[data-tab="notifications"]');
  await waitText('Pendente de envio');
  await screenshot('notificacao.png');
  await click('[data-action="close-dialog"]');
  for (const route of ['notifications', 'properties', 'history', 'guide', 'deals']) {
    await evaluate(`location.hash = '#${route}'`); await sleep(150);
    assert.equal(await evaluate('document.querySelector("#main").children.length > 0'), true);
  }
  await evaluate('location.hash = "#properties?imovel=house-2055"');
  await waitText('Ver todos os imóveis');
  assert.equal(await evaluate('document.querySelectorAll(".property-grid article").length'), 1);
  results.push('Link específico do catálogo local abre apenas o imóvel selecionado.');
  assert.deepEqual(errors, []);
  results.push('Todas as páginas acessíveis; nenhum erro JavaScript no navegador.');
  const report = { browser: 'Microsoft Edge headless (CDP)', recordedAt: new Date().toISOString(), results, errors };
  await writeFile(resolve('docs/evidencias/navegador.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(browserDiagnostics);
  throw error;
} finally {
  ws?.close();
  edge.kill();
  await Promise.race([edgeEnded, sleep(3000)]);
  server.closeAllConnections();
  await new Promise(done => server.close(done));
  assert.ok(profileDir.startsWith(qaDir + sep), 'Perfil temporário fora da pasta de validação.');
  await rm(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }).catch(() => {});
}
