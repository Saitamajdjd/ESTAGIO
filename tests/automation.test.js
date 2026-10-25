import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { deadline, daysBetween, validateDate } from '../src/dates.js';
import { act, currentProposal, createDeal, validAgreement } from '../src/domain.js';
import { runAutomation } from '../src/automation.js';
import { publicState } from '../src/view.js';
import { fixture, visit } from './helpers.js';

test('01 · primeira proposta em 20/10 vence em 03/11, após 14 dias corridos', () => {
  assert.equal(deadline('2026-10-20'), '2026-11-03');
  assert.equal(daysBetween('2026-10-20', deadline('2026-10-20')), 14);
  assert.equal(deadline('2028-02-20'), '2028-03-05');
  assert.equal(deadline('2026-12-25'), '2027-01-08');
});
test('02 · aviso exclusivamente no dia 13 e associado ao consultor', () => {
  const { state, cycle } = fixture();
  runAutomation(state, '2026-11-01');
  assert.equal(state.notifications.filter(n => n.cycleId === cycle.id).length, 0);
  const result = runAutomation(state, '2026-11-02').results.find(r => r.cycleId === cycle.id);
  assert.equal(result.conditions.oneDayLeft, true);
  assert.equal(result.conditions.deadlineReached, false);
  const notification = state.notifications.find(n => n.cycleId === cycle.id);
  assert.equal(notification.recipient, 'consultant');
  assert.equal(notification.status, 'pending');
  assert.equal(cycle.status, 'open');
});
test('03 · no dia 14, expira sem acordo e gera mensagem pendente ao proprietário', () => {
  const { state, cycle, deal } = fixture();
  const result = runAutomation(state, '2026-11-03').results.find(r => r.cycleId === cycle.id);
  assert.equal(result.before.status, 'open');
  assert.equal(result.after.status, 'expired');
  assert.equal(cycle.endedOn, '2026-11-03');
  const notification = state.notifications.find(n => n.cycleId === cycle.id);
  assert.equal(notification.recipient, 'owner');
  assert.equal(notification.status, 'pending');
  assert.equal(deal.stage, 'search');
  assert.equal(result.actions.length, 3);
});
test('04 · acordo válido antes do prazo impede expiração e leva à documentação', () => {
  const { state, deal, cycle } = fixture();
  runAutomation(state, '2026-11-02');
  act(state, deal.id, 'accept', { party: 'owner', proposalId: cycle.currentProposalId });
  assert.equal(validAgreement(cycle), true);
  assert.equal(deal.stage, 'meeting');
  runAutomation(state, '2027-01-15');
  assert.equal(cycle.status, 'agreed');
  assert.equal(cycle.endedOn, '2026-11-02');
  assert.equal(state.notifications.filter(n => n.cycleId === cycle.id && n.recipient === 'owner').length, 0);
});
test('05 · contraproposta não herda aceite nem reinicia o prazo', () => {
  const { state, deal, cycle } = fixture();
  const old = currentProposal(cycle);
  assert.equal(old.acceptances[0].party, 'client');
  act(state, deal.id, 'counterproposal', { amount: 2000, author: 'owner', proposalId: old.id });
  const current = currentProposal(cycle);
  assert.equal(old.status, 'superseded');
  assert.equal(old.acceptances.length, 1);
  assert.equal(current.acceptances.length, 1);
  assert.equal(current.acceptances[0].party, 'owner');
  assert.equal(validAgreement(cycle), false);
  assert.equal(cycle.deadline, '2026-11-03');
  assert.equal(cycle.firstProposalDate, '2026-10-20');
  act(state, deal.id, 'accept', { party: 'client', proposalId: current.id });
  assert.equal(validAgreement(cycle), true);
});
test('06 · reexecução não duplica notificações nem eventos de expiração', () => {
  const { state, cycle } = fixture();
  runAutomation(state, '2026-11-02');
  const first = { events: state.events.length, notifications: state.notifications.length };
  assert.equal(runAutomation(state, '2026-11-02').actionCount, 0);
  assert.equal(state.events.length, first.events);
  assert.equal(state.notifications.length, first.notifications);
  runAutomation(state, '2026-11-03');
  const second = { events: state.events.length, notifications: state.notifications.length };
  runAutomation(state, '2026-11-03');
  runAutomation(state, '2026-12-03');
  assert.equal(state.events.length, second.events);
  assert.equal(state.notifications.length, second.notifications);
  assert.equal(state.events.filter(e => e.key === `${cycle.id}:expired`).length, 1);
  assert.equal(state.runs.length, 6); // preparação + cinco execuções auditadas
});
test('07 · novo imóvel recebe ciclo, datas, proposta e aceites independentes', () => {
  const { state, deal, cycle } = fixture();
  runAutomation(state, '2026-11-03');
  const preserved = structuredClone(cycle);
  visit(state, deal);
  const next = act(state, deal.id, 'start-cycle', { propertyId: 'apartment-301', amount: 2600, author: 'owner' });
  assert.notEqual(next.id, cycle.id);
  assert.equal(next.number, 2);
  assert.equal(next.firstProposalDate, '2026-11-03');
  assert.equal(next.deadline, '2026-11-17');
  assert.deepEqual(next.proposals[0].acceptances.map(a => a.party), ['owner']);
  assert.deepEqual(cycle, preserved);
  runAutomation(state, '2026-11-16');
  assert.equal(state.notifications.filter(n => n.cycleId === next.id && n.kind === 'deadline-warning').length, 1);
  assert.equal(cycle.status, 'expired');
  const visitEvents = state.events.filter(e => e.type === 'stage' && e.date === '2026-11-03' && ['owner', 'scheduled', 'visited'].includes(e.details.to));
  assert.ok(visitEvents.every(e => e.cycleId === null));
});
test('08 · expiração limpa seleção/visita e permite retomar busca', () => {
  const { state, deal } = fixture();
  runAutomation(state, '2026-11-03');
  assert.equal(deal.stage, 'search');
  assert.equal(deal.propertyId, null);
  assert.equal(deal.visit, null);
  assert.ok(state.events.some(e => e.dealId === deal.id && e.details.from === 'negotiation' && e.details.to === 'search'));
  act(state, deal.id, 'send-properties', { propertyIds: ['studio-112'] });
  assert.ok(deal.interestPropertyIds.includes('studio-112'));
});
test('09 · histórico preserva proposta original, motivo e data do encerramento', () => {
  const { state, cycle } = fixture();
  const oldEvents = structuredClone(state.events);
  const originalProposalId = cycle.currentProposalId;
  runAutomation(state, '2026-11-10');
  assert.deepEqual(state.events.slice(0, oldEvents.length), oldEvents);
  assert.equal(cycle.proposals[0].id, originalProposalId);
  assert.match(cycle.endReason, /14 dias/);
  assert.equal(cycle.endedOn, '2026-11-10');
  assert.equal(cycle.deadline, '2026-11-03');
});
test('10 · proposta de outro atendimento/imóvel não pode receber aceite cruzado', () => {
  const { state, deal, cycle } = fixture();
  const other = state.cycles.find(c => c.dealId !== deal.id && c.status === 'open');
  const original = structuredClone(other);
  assert.throws(() => act(state, deal.id, 'accept', { party: 'owner', proposalId: other.currentProposalId }), /proposta atual/);
  assert.equal(cycle.status, 'open');
  assert.deepEqual(other, original);
  act(state, deal.id, 'accept', { party: 'owner', proposalId: cycle.currentProposalId });
  assert.deepEqual(other, original);
});
test('aceite antigo explícito é recusado após mudança do valor', () => {
  const { state, deal, cycle } = fixture();
  const oldId = cycle.currentProposalId;
  act(state, deal.id, 'counterproposal', { amount: 1980, author: 'owner', proposalId: oldId });
  assert.throws(() => act(state, deal.id, 'accept', { party: 'client', proposalId: oldId }), /proposta atual/);
  assert.equal(cycle.status, 'open');
});
test('aceite e contraproposta no dia limite são recusados, mesmo sem executar robô', () => {
  const { state, deal, cycle } = fixture();
  state.referenceDate = '2026-11-03';
  assert.throws(() => act(state, deal.id, 'accept', { party: 'owner', proposalId: cycle.currentProposalId }), /prazo terminou/);
  assert.throws(() => act(state, deal.id, 'counterproposal', { amount: 2000, author: 'owner', proposalId: cycle.currentProposalId }), /prazo terminou/);
});
test('repetir aceite do autor não duplica histórico', () => {
  const { state, deal, cycle } = fixture();
  const count = state.events.length;
  act(state, deal.id, 'accept', { party: 'client', proposalId: cycle.currentProposalId });
  assert.equal(state.events.length, count);
  assert.equal(cycle.proposals[0].acceptances.length, 1);
});
test('datas inválidas, retrocesso e avanço parcial não alteram referência', () => {
  const { state, deal } = fixture();
  for (const value of ['2026-02-30', '20/10/2026', '2026-13-01', null, '2026-2-01']) assert.throws(() => validateDate(value));
  assert.throws(() => runAutomation(state, '2026-10-24'), /retroceder/);
  assert.throws(() => runAutomation(state, '2026-11-03', { dealId: deal.id }), /individual/);
  assert.equal(state.referenceDate, '2026-10-25');
});
test('dias corridos invariantes em fusos distintos, incluindo horário de verão', () => {
  const moduleURL = new URL('../src/dates.js', import.meta.url).href;
  for (const TZ of ['America/Bahia', 'America/New_York', 'Pacific/Auckland']) {
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', `import { deadline, daysBetween } from ${JSON.stringify(moduleURL)}; console.log(deadline('2026-03-01'), daysBetween('2026-03-01', '2026-03-15'));`], { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(result.trim(), '2026-03-15 14');
  }
});
test('reagendamento exige nova confirmação e visita realizada na data adequada', () => {
  const { state } = fixture();
  const deal = createDeal(state, { clientName: 'Teste', needs: 'Dois quartos' });
  act(state, deal.id, 'send-properties', { propertyIds: ['house-2055'] });
  act(state, deal.id, 'request-visit', { propertyId: 'house-2055', date: '2026-10-25', time: '14:00' });
  act(state, deal.id, 'confirm-visit');
  act(state, deal.id, 'reschedule-visit', { date: '2026-10-26', time: '09:00', reason: 'Proprietário indisponível' });
  assert.equal(deal.stage, 'owner');
  assert.equal(deal.visit.attempts.length, 2);
  assert.throws(() => act(state, deal.id, 'complete-visit'), /etapa/);
  act(state, deal.id, 'confirm-visit');
  assert.throws(() => act(state, deal.id, 'complete-visit'), /dia da visita/);
  runAutomation(state, '2026-10-26');
  act(state, deal.id, 'complete-visit');
  act(state, deal.id, 'reject-property');
  assert.equal(deal.stage, 'search');
  assert.equal(deal.propertyId, null);
});
test('avanços inconsistentes, imóvel não visitado e ciclo simultâneo são bloqueados', () => {
  const { state, deal } = fixture();
  assert.throws(() => act(state, deal.id, 'start-cycle', { propertyId: 'house-2055', amount: 2000, author: 'client' }), /etapa/);
  assert.throws(() => act(state, deal.id, 'forward-contracts'), /etapa/);
  const newDeal = createDeal(state, { clientName: 'Nova cliente', needs: 'Casa' });
  visit(state, newDeal, 'house-2055');
  assert.throws(() => act(state, newDeal.id, 'start-cycle', { propertyId: 'studio-112', amount: 2000, author: 'client' }), /imóvel selecionado/);
});
test('encerramento manual preserva histórico e impede expiração posterior', () => {
  for (const reason of ['Desistência', 'Recusa da visita', 'Falta de interesse']) {
    const { state, deal, cycle } = fixture();
    act(state, deal.id, 'close', { reason });
    runAutomation(state, '2026-11-20');
    assert.equal(deal.stage, 'closed');
    assert.equal(cycle.status, 'closed');
    assert.equal(deal.closedReason, reason);
    assert.equal(state.notifications.filter(n => n.cycleId === cycle.id).length, 0);
  }
});
test('dois atendimentos para o mesmo cliente podem negociar imóveis diferentes', () => {
  const { state, deal, cycle } = fixture();
  const other = createDeal(state, { clientName: deal.clientName, needs: 'Outro imóvel' });
  visit(state, other, 'studio-112');
  const newCycle = act(state, other.id, 'start-cycle', { propertyId: 'studio-112', amount: 1700, author: 'client' });
  act(state, deal.id, 'accept', { party: 'owner', proposalId: cycle.currentProposalId });
  assert.equal(newCycle.status, 'open');
  assert.equal(other.stage, 'negotiation');
  assert.notEqual(newCycle.deadline, cycle.deadline);
});
test('valores, autores e campos vazios são validados', () => {
  const { state, deal, cycle } = fixture();
  for (const amount of [-1, 0, 1.001, Infinity, '2000', 100000001]) {
    assert.throws(() => act(state, deal.id, 'counterproposal', { amount, author: 'owner', proposalId: cycle.currentProposalId }), /valor/);
  }
  assert.throws(() => act(state, deal.id, 'accept', { party: 'stranger', proposalId: cycle.currentProposalId }), /Autor/);
  assert.throws(() => createDeal(state, { clientName: ' ', needs: 'Algo' }), /Nome/);
});
test('contratos exigem ficha e anexo do ciclo atual, com conteúdo persistível', () => {
  const { state, deal, cycle } = fixture('acordo');
  assert.throws(() => act(state, deal.id, 'forward-contracts'), /necessários/);
  assert.throws(() => act(state, deal.id, 'registration', { name: 'Ana', contact: 'Fictício', notes: 'Teste' }), /reunião/);
  act(state, deal.id, 'schedule-meeting', { date: state.referenceDate, time: '10:00' });
  act(state, deal.id, 'registration', { name: 'Ana', contact: 'Fictício', notes: 'Cadastro demonstrativo' });
  const other = state.cycles.find(c => c.id !== cycle.id);
  state.documents.push({ id: 'foreign', dealId: other.dealId, cycleId: other.id, name: 'outro.txt', base64: 'QQ==', size: 1 });
  assert.throws(() => act(state, deal.id, 'forward-contracts'), /necessários/);
  assert.throws(() => act(state, deal.id, 'attach-document', { name: 'malware.exe', base64: 'QQ==' }), /Anexe/);
  act(state, deal.id, 'attach-document', { name: 'cadastro.txt', base64: Buffer.from('Documento fictício').toString('base64') });
  act(state, deal.id, 'forward-contracts');
  assert.equal(deal.stage, 'contracts');
  assert.equal(Buffer.from(state.documents.at(-1).base64, 'base64').toString(), 'Documento fictício');
  assert.equal(publicState(state).documents.at(-1).base64, undefined);
});
test('indicadores contam ciclos encerrados mesmo quando novo ciclo começa', () => {
  const { state, deal } = fixture('expirada');
  visit(state, deal, 'house-2055');
  act(state, deal.id, 'start-cycle', { propertyId: 'house-2055', amount: 1900, author: 'client' });
  const view = publicState(state);
  assert.equal(view.metrics.expired, 1);
  assert.equal(view.metrics.active, 4);
  assert.equal(view.metrics.agreed, 1);
});

test('demonstração compara João e Ana com o mesmo início e prazo, preservando os dois aceites de Ana', () => {
  const { state, cycle: joao } = fixture();
  const ana = state.cycles.find(c => c.dealId === state.deals.find(d => d.scenario === 'acordo').id);
  assert.equal(ana.firstProposalDate, joao.firstProposalDate);
  assert.equal(ana.deadline, '2026-11-03');
  assert.equal(ana.endedOn, '2026-10-22');
  assert.deepEqual(currentProposal(ana).acceptances.map(a => [a.party, a.date]), [['client', '2026-10-20'], ['owner', '2026-10-22']]);
  const preserved = structuredClone(ana);
  for (const date of ['2026-11-02', '2026-11-03', '2026-11-03']) {
    const result = runAutomation(state, date).results.find(r => r.cycleId === ana.id);
    assert.equal(result.outcome, 'agreement-preserved');
    assert.equal(result.conditions.clientAcceptedCurrent, true);
    assert.equal(result.conditions.ownerAcceptedCurrent, true);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(result.eventIds, []);
    assert.deepEqual(result.notificationIds, []);
    assert.deepEqual(ana, preserved);
  }
  assert.equal(joao.status, 'expired');
  assert.equal(state.notifications.filter(n => n.cycleId === ana.id).length, 0);
});

test('logs registram relógio simulado, condições, resultado, alterações e IDs realmente criados', () => {
  const { state, cycle } = fixture();
  const warned = runAutomation(state, '2026-11-02');
  assert.equal(warned.simulatedAt, '2026-11-02T00:00:00.000Z');
  assert.ok(Number.isFinite(Date.parse(warned.recordedAt)));
  assert.equal(warned.results.find(r => r.cycleId === cycle.id).outcome, 'warning-created');
  const repeatedWarning = runAutomation(state, '2026-11-02');
  assert.equal(repeatedWarning.results.find(r => r.cycleId === cycle.id).outcome, 'warning-already-exists');
  assert.equal(repeatedWarning.eventsCreated, 0);
  assert.equal(repeatedWarning.notificationsCreated, 0);
  const eventStart = state.events.length;
  const notificationStart = state.notifications.length;
  const expired = runAutomation(state, '2026-11-03');
  const result = expired.results.find(r => r.cycleId === cycle.id);
  assert.equal(result.outcome, 'expired');
  assert.equal(result.conditions.ownerAcceptedCurrent, false);
  assert.equal(result.before.visit.status, 'completed');
  assert.equal(result.after.visit, null);
  assert.ok(result.changes.some(c => c.field === 'stage' && c.before === 'negotiation' && c.after === 'search'));
  assert.ok(result.changes.some(c => c.field === 'selectedPropertyId' && c.after === null));
  assert.deepEqual(expired.results.flatMap(r => r.eventIds), state.events.slice(eventStart).map(e => e.id));
  assert.deepEqual(expired.results.flatMap(r => r.notificationIds), state.notifications.slice(notificationStart).map(n => n.id));
  assert.equal(expired.eventsCreated, state.events.length - eventStart);
  assert.equal(expired.notificationsCreated, state.notifications.length - notificationStart);
  const repeat = runAutomation(state, '2026-11-03');
  assert.equal(repeat.eventsCreated, 0);
  assert.equal(repeat.notificationsCreated, 0);
  assert.ok(repeat.results.every(r => r.changes.length === 0));
});
