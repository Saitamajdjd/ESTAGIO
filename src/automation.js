import { daysBetween, validateDate, isNearDeadline, isExpired, dateBR } from './dates.js';
import { id, ensure, getDeal, currentProposal, validAgreement, endCycle, createNotification, moveStage, recordEvent } from './domain.js';

function snapshot(cycle, deal) {
  return { status: cycle.status, stage: deal.stage, endedOn: cycle.endedOn, deadline: cycle.deadline,
    currentProposalId: cycle.currentProposalId, proposalStatus: currentProposal(cycle)?.status,
    selectedPropertyId: deal.propertyId, visit: structuredClone(deal.visit) };
}

export function evaluateCycle(state, cycle, date) {
  const deal = getDeal(state, cycle.dealId);
  const before = snapshot(cycle, deal);
  const eventStart = state.events.length;
  const notificationStart = state.notifications.length;
  const proposal = currentProposal(cycle);
  const accepted = party => Boolean(proposal?.acceptances.some(a => a.party === party && a.proposalId === proposal.id
    && a.date >= cycle.firstProposalDate && a.date < cycle.deadline));
  const conditions = {
    started: date >= cycle.firstProposalDate,
    active: cycle.status === 'open',
    agreement: validAgreement(cycle),
    clientAcceptedCurrent: accepted('client'),
    ownerAcceptedCurrent: accepted('owner'),
    oneDayLeft: isNearDeadline(cycle, date),
    deadlineReached: isExpired(cycle, date),
    warningExists: state.notifications.some(n => n.key === `${cycle.id}:deadline-warning`)
  };
  const eligible = conditions.started && conditions.active && !conditions.agreement;
  const actions = [];
  let outcome = conditions.agreement ? 'agreement-preserved' : !conditions.active ? 'already-closed'
    : conditions.oneDayLeft && conditions.warningExists ? 'warning-already-exists' : 'no-action';
  if (conditions.active && conditions.agreement) {
    endCycle(state, cycle, 'agreed', 'Acordo válido confirmado pelo motor.');
    moveStage(state, deal, 'meeting', 'Acordo preservado pelo motor.', cycle.id);
    actions.push('Acordo preservado; contagem encerrada.');
    outcome = 'agreement-preserved';
  } else if (eligible && conditions.deadlineReached) {
    endCycle(state, cycle, 'expired', 'Prazo máximo de 14 dias atingido sem acordo.');
    createNotification(state, cycle, 'deadline-expired');
    moveStage(state, deal, 'search', 'Prazo expirado; retomar a busca de imóveis.', cycle.id);
    deal.propertyId = null;
    deal.visit = null;
    recordEvent(state, { dealId: deal.id, cycleId: cycle.id, type: 'expiration-actions', key: `${cycle.id}:expiration-actions`,
      message: 'Ciclo preservado, mensagem pendente ao proprietário e retorno para Envio de imóveis.', details: { before, after: snapshot(cycle, deal) } });
    actions.push('Ciclo encerrado como Prazo expirado.', 'Mensagem ao proprietário gerada e pendente de envio.', 'Atendimento retornou para Envio de imóveis.');
    outcome = 'expired';
  } else if (eligible && conditions.oneDayLeft && !conditions.warningExists) {
    createNotification(state, cycle, 'deadline-warning');
    actions.push('Aviso interno de prazo próximo gerado para o consultor.');
    outcome = 'warning-created';
  }
  const after = snapshot(cycle, deal);
  return { cycleId: cycle.id, dealId: deal.id, code: deal.code, clientName: deal.clientName, propertyId: cycle.propertyId,
    daysRemaining: daysBetween(date, cycle.deadline), conditions, actions, outcome, before, after,
    changes: Object.keys(before).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map(field => ({ field, before: before[field], after: after[field] })),
    eventIds: state.events.slice(eventStart).map(e => e.id),
    notificationIds: state.notifications.slice(notificationStart).map(n => n.id) };
}

export function runAutomation(state, date, { source = 'simulator', dealId = null } = {}) {
  validateDate(date);
  ensure(date >= state.referenceDate, `A referência atual é ${dateBR(state.referenceDate)}. Não é permitido retroceder; restaure a demonstração para repetir datas anteriores.`);
  if (dealId) {
    getDeal(state, dealId);
    ensure(date === state.referenceDate, 'Verificação individual deve usar a referência atual. Para avançar a data, avalie todos os ciclos.');
  }
  const previousDate = state.referenceDate;
  state.referenceDate = date;
  const results = state.cycles.filter(c => !dealId || c.dealId === dealId).map(c => evaluateCycle(state, c, date));
  const run = { id: id('run'), date, previousDate, source,
    simulatedAt: `${date}T00:00:00.000Z`, recordedAt: new Date().toISOString(), results,
    eventsCreated: results.reduce((sum, item) => sum + item.eventIds.length, 0),
    notificationsCreated: results.reduce((sum, item) => sum + item.notificationIds.length, 0),
    actionCount: results.reduce((sum, item) => sum + item.actions.length, 0) };
  // Cada execução é auditada; eventos de negócio e notificações têm chaves únicas por ciclo.
  state.runs.push(run);
  return run;
}
