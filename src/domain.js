import { randomUUID } from 'node:crypto';
import { deadline, isExpired, validateDate, dateBR } from './dates.js';

export const STAGES = {
  initial: 'Atendimento inicial', search: 'Envio de imóveis', owner: 'Aguardando confirmação do proprietário',
  scheduled: 'Visita agendada', visited: 'Visita realizada', negotiation: 'Negociação e documentação',
  meeting: 'Reunião e documentação', contracts: 'Encaminhado ao setor de contratos', closed: 'Atendimento encerrado'
};
export const STATUS = { open: 'Em andamento', expired: 'Prazo expirado', agreed: 'Acordo registrado', closed: 'Encerrada por desistência' };
export const id = (prefix) => `${prefix}-${randomUUID()}`;
export function ensure(condition, message, status = 422) {
  if (!condition) { const error = new Error(message); error.status = status; throw error; }
}
export function required(value, label, max = 300) {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label}: preencha de 1 a ${max} caracteres.`);
  return value.trim();
}
export function getDeal(state, dealId) {
  const deal = state.deals.find(d => d.id === dealId);
  ensure(deal, 'Atendimento não encontrado.', 404);
  return deal;
}
export function getCycle(state, cycleId) {
  const cycle = state.cycles.find(c => c.id === cycleId);
  ensure(cycle, 'Ciclo não encontrado.', 404);
  return cycle;
}
export function currentCycle(state, deal) { return state.cycles.find(c => c.id === deal.currentCycleId); }
export function currentProposal(cycle) { return cycle?.proposals.find(p => p.id === cycle.currentProposalId); }
export function validAgreement(cycle) {
  const p = currentProposal(cycle);
  return Boolean(p && p.status === 'accepted' && ['client', 'owner'].every(party =>
    p.acceptances.some(a => a.party === party && a.proposalId === p.id && a.date >= cycle.firstProposalDate && a.date < cycle.deadline)
  ));
}
export function recordEvent(state, { dealId, cycleId = null, type, message, details = {}, key = null }) {
  if (key && state.events.some(e => e.key === key)) return null;
  const event = { id: id('evt'), dealId, cycleId, type, message, details, key,
    date: state.referenceDate, recordedAt: new Date().toISOString() };
  state.events.push(event);
  return event;
}
export function moveStage(state, deal, stage, reason, cycleId) {
  if (deal.stage === stage) return;
  const from = deal.stage;
  // Visitas de um novo imóvel não são atribuídas ao ciclo anterior já encerrado.
  if (cycleId === undefined) cycleId = [from, stage].some(s => ['negotiation', 'meeting', 'contracts'].includes(s)) ? deal.currentCycleId : null;
  deal.stage = stage;
  recordEvent(state, { dealId: deal.id, cycleId, type: 'stage', message: `${STAGES[from]} → ${STAGES[stage]}. ${reason}`, details: { from, to: stage, reason } });
}
export function createNotification(state, cycle, kind) {
  const key = `${cycle.id}:${kind}`;
  if (state.notifications.some(n => n.key === key)) return null;
  const property = state.properties.find(p => p.id === cycle.propertyId);
  const notification = { id: id('notification'), key, cycleId: cycle.id, dealId: cycle.dealId,
    kind, recipient: kind === 'deadline-warning' ? 'consultant' : 'owner',
    recipientName: kind === 'deadline-warning' ? getDeal(state, cycle.dealId).consultant : property.owner,
    status: 'pending', date: state.referenceDate, recordedAt: new Date().toISOString(),
    message: kind === 'deadline-warning'
      ? `A negociação de ${property.name} tem apenas 1 dia restante. Verifique os aceites da proposta atual antes do prazo final.`
      : `Olá, ${property.owner}. O prazo máximo de 14 dias da negociação de ${property.name} terminou sem acordo. O ciclo foi encerrado e o atendimento retornou à busca de outros imóveis.`
  };
  state.notifications.push(notification);
  recordEvent(state, { dealId: cycle.dealId, cycleId: cycle.id, type: 'notification', key,
    message: kind === 'deadline-warning' ? 'Aviso interno de prazo próximo gerado para o consultor.' : 'Mensagem ao proprietário gerada e pendente de envio. Nenhum envio externo foi realizado.',
    details: { notificationId: notification.id, recipient: notification.recipient, status: 'pending' } });
  return notification;
}
export function endCycle(state, cycle, status, reason) {
  ensure(cycle.status === 'open', 'Este ciclo já foi encerrado.');
  cycle.status = status;
  cycle.endedOn = state.referenceDate;
  cycle.endReason = reason;
  const p = currentProposal(cycle);
  if (p && status !== 'agreed') p.status = status === 'expired' ? 'expired' : 'cancelled';
  recordEvent(state, { dealId: cycle.dealId, cycleId: cycle.id, type: `cycle-${status}`, key: `${cycle.id}:${status}`, message: reason });
}
function stageIs(deal, ...stages) { ensure(stages.includes(deal.stage), 'Ação indisponível nesta etapa do atendimento.'); }
function partyIs(party) { ensure(['client', 'owner'].includes(party), 'Autor deve ser cliente ou proprietário.'); }
function amountInCents(amount) {
  ensure(typeof amount === 'number' && Number.isFinite(amount) && amount >= 1 && amount <= 100_000_000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.00001,
    'Informe um valor entre R$ 1,00 e R$ 100.000.000,00, com até duas casas decimais.');
  return Math.round(amount * 100);
}
function openForProposal(state, deal, cycle) {
  stageIs(deal, 'negotiation');
  ensure(cycle?.status === 'open', 'O ciclo não está aberto.');
  ensure(state.referenceDate >= cycle.firstProposalDate && !isExpired(cycle, state.referenceDate), 'O prazo terminou. Execute a verificação antes de continuar.');
}
function addProposal(state, cycle, amount, author) {
  partyIs(author);
  const amountCents = amountInCents(amount);
  const previous = currentProposal(cycle);
  if (previous) previous.status = 'superseded';
  const proposal = { id: id('proposal'), amountCents, author, date: state.referenceDate, status: 'pending', acceptances: [] };
  proposal.acceptances.push({ party: author, date: state.referenceDate, proposalId: proposal.id, implicit: true });
  cycle.proposals.push(proposal);
  cycle.currentProposalId = proposal.id;
  recordEvent(state, { dealId: cycle.dealId, cycleId: cycle.id, type: 'proposal',
    message: previous ? 'Contraproposta registrada. Os aceites anteriores permanecem no histórico e não se aplicam ao novo valor.' : 'Primeira proposta registrada. Iniciado o prazo de 14 dias corridos.',
    details: { proposalId: proposal.id, amountCents, author, deadline: cycle.deadline } });
  return proposal;
}
export function startCycle(state, deal, { propertyId, amount, author }) {
  stageIs(deal, 'visited');
  ensure(deal.propertyId === propertyId && deal.visit?.propertyId === propertyId && deal.visit.status === 'completed', 'Realize uma visita ao imóvel selecionado antes de negociar.');
  ensure(!state.cycles.some(c => c.dealId === deal.id && c.status === 'open'), 'Já existe um ciclo aberto neste atendimento.');
  partyIs(author);
  amountInCents(amount);
  const cycle = { id: id('cycle'), dealId: deal.id, propertyId, number: state.cycles.filter(c => c.dealId === deal.id).length + 1,
    firstProposalDate: state.referenceDate, deadline: deadline(state.referenceDate), status: 'open', proposals: [],
    currentProposalId: null, endedOn: null, endReason: null };
  state.cycles.push(cycle);
  deal.currentCycleId = cycle.id;
  deal.meeting = null;
  deal.registration = null;
  addProposal(state, cycle, amount, author);
  moveStage(state, deal, 'negotiation', 'Cliente interessado após a visita.');
  return cycle;
}
export function createDeal(state, input) {
  const name = required(input.clientName, 'Nome do cliente', 100);
  const needs = required(input.needs, 'Necessidades do cliente', 1000);
  const consultant = required(input.consultant || 'Marina Costa', 'Consultor', 100);
  const deal = { id: id('deal'), code: `LOC-${String(state.nextDealNumber++).padStart(4, '0')}`, clientName: name, needs,
    consultant, stage: 'initial', createdOn: state.referenceDate, propertyId: null, interestPropertyIds: [],
    currentCycleId: null, visit: null, meeting: null, registration: null, closedReason: null };
  state.deals.push(deal);
  recordEvent(state, { dealId: deal.id, type: 'created', message: `Atendimento iniciado para ${name}. Necessidades registradas: ${needs}` });
  return deal;
}

// Toda alteração de negócio passa por esta máquina de estados, inclusive via API.
export function act(state, dealId, action, input = {}) {
  const deal = getDeal(state, dealId);
  const cycle = currentCycle(state, deal);
  switch (action) {
    case 'send-properties': {
      stageIs(deal, 'initial', 'search');
      const ids = input.propertyIds;
      ensure(Array.isArray(ids) && ids.length > 0 && ids.length <= state.properties.length && ids.every(v => state.properties.some(p => p.id === v)), 'Selecione imóveis válidos.');
      deal.interestPropertyIds = [...new Set([...deal.interestPropertyIds, ...ids])];
      recordEvent(state, { dealId, type: 'properties', message: 'Seleção de imóveis e links do catálogo local preparados para apresentação ao cliente. Nenhum envio externo realizado.', details: { propertyIds: ids, links: ids.map(pid => `/#properties?imovel=${encodeURIComponent(pid)}`) } });
      moveStage(state, deal, 'search', 'Imóveis compatíveis selecionados.');
      break;
    }
    case 'request-visit': {
      stageIs(deal, 'search');
      ensure(deal.interestPropertyIds.includes(input.propertyId), 'Apresente este imóvel ao cliente antes de solicitar a visita.');
      validateDate(input.date);
      ensure(input.date >= state.referenceDate, 'A visita não pode ser agendada no passado.');
      ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time), 'Informe um horário válido.');
      deal.propertyId = input.propertyId;
      deal.visit = { propertyId: input.propertyId, date: input.date, time: input.time, status: 'requested', attempts: [{ date: input.date, time: input.time }] };
      moveStage(state, deal, 'owner', 'Aguardando disponibilidade do proprietário.');
      break;
    }
    case 'reschedule-visit': {
      stageIs(deal, 'owner', 'scheduled');
      validateDate(input.date);
      ensure(input.date >= state.referenceDate && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time), 'Informe nova data futura ou atual e horário válido.');
      const reason = required(input.reason, 'Motivo do reagendamento');
      Object.assign(deal.visit, { date: input.date, time: input.time, status: 'requested' });
      deal.visit.attempts.push({ date: input.date, time: input.time, reason });
      recordEvent(state, { dealId, type: 'visit-rescheduled', message: `Outra data sugerida: ${dateBR(input.date)} às ${input.time}. ${reason}` });
      moveStage(state, deal, 'owner', 'Novo horário depende da confirmação do proprietário.');
      break;
    }
    case 'confirm-visit':
      stageIs(deal, 'owner');
      ensure(deal.visit.date >= state.referenceDate, 'A data passou; sugira outro horário.');
      deal.visit.status = 'confirmed';
      moveStage(state, deal, 'scheduled', 'Disponibilidade confirmada pelo proprietário.');
      break;
    case 'complete-visit':
      stageIs(deal, 'scheduled');
      ensure(deal.visit.date <= state.referenceDate, 'Avance a data de referência até o dia da visita para registrar sua realização.');
      deal.visit.status = 'completed';
      moveStage(state, deal, 'visited', 'Visita realizada. Aguardando decisão do cliente.');
      break;
    case 'reject-property':
      stageIs(deal, 'visited');
      recordEvent(state, { dealId, type: 'property-rejected', message: 'Cliente não se interessou pelo imóvel após a visita.', details: { propertyId: deal.propertyId } });
      deal.propertyId = null;
      deal.visit = null;
      moveStage(state, deal, 'search', 'Retorno à busca de outros imóveis.');
      break;
    case 'start-cycle': return startCycle(state, deal, input);
    case 'counterproposal':
      openForProposal(state, deal, cycle);
      ensure(input.proposalId === cycle.currentProposalId, 'A proposta mudou. Atualize a página antes de registrar a contraproposta.', 409);
      addProposal(state, cycle, input.amount, input.author);
      break;
    case 'accept': {
      openForProposal(state, deal, cycle);
      partyIs(input.party);
      ensure(input.proposalId === cycle.currentProposalId, 'Este aceite não pertence à proposta atual.', 409);
      const p = currentProposal(cycle);
      if (p.acceptances.some(a => a.party === input.party)) return cycle;
      p.acceptances.push({ party: input.party, date: state.referenceDate, proposalId: p.id, implicit: false });
      recordEvent(state, { dealId, cycleId: cycle.id, type: 'acceptance', message: `Aceite do ${input.party === 'client' ? 'cliente' : 'proprietário'} registrado para a proposta atual.`, details: { proposalId: p.id, party: input.party, amountCents: p.amountCents } });
      if (['client', 'owner'].every(party => p.acceptances.some(a => a.party === party))) {
        p.status = 'accepted';
        ensure(validAgreement(cycle), 'Não foi possível validar o acordo.');
        endCycle(state, cycle, 'agreed', 'Ambas as partes aceitaram a mesma proposta dentro do prazo.');
        moveStage(state, deal, 'meeting', 'Acordo válido. Agende a reunião e registre a documentação.');
      }
      break;
    }
    case 'schedule-meeting':
      stageIs(deal, 'meeting');
      ensure(cycle?.status === 'agreed' && validAgreement(cycle), 'É necessário um acordo válido.');
      validateDate(input.date);
      ensure(input.date >= state.referenceDate && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.time), 'Informe data futura ou atual e horário válido.');
      ensure(!deal.registration, 'A documentação desta reunião já foi registrada.');
      deal.meeting = { date: input.date, time: input.time, cycleId: cycle.id };
      recordEvent(state, { dealId, cycleId: cycle.id, type: 'meeting', message: `Reunião de documentação agendada para ${dateBR(input.date)} às ${input.time}.` });
      break;
    case 'registration':
      stageIs(deal, 'meeting');
      ensure(deal.meeting && deal.meeting.date <= state.referenceDate, 'Agende a reunião e avance a referência até sua data.');
      deal.registration = { cycleId: cycle.id, date: state.referenceDate, name: required(input.name, 'Nome cadastral', 100),
        contact: required(input.contact, 'Contato', 150), notes: required(input.notes, 'Dados da ficha', 2000) };
      recordEvent(state, { dealId, cycleId: cycle.id, type: 'registration', message: 'Ficha cadastral registrada na reunião de documentação.' });
      break;
    case 'attach-document': {
      stageIs(deal, 'meeting');
      ensure(deal.registration?.cycleId === cycle.id, 'Registre a ficha cadastral antes de anexar documentos.');
      const name = required(input.name, 'Nome do arquivo', 160);
      ensure(/\.(pdf|png|jpe?g|txt)$/i.test(name), 'Anexe um PDF, PNG, JPEG ou TXT.');
      ensure(typeof input.base64 === 'string' && input.base64.length > 0 && input.base64.length <= 2_800_000 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64), 'Conteúdo de arquivo inválido.');
      const buffer = Buffer.from(input.base64, 'base64');
      ensure(buffer.length > 0 && buffer.length <= 2 * 1024 * 1024, 'O arquivo deve ter até 2 MB.');
      ensure(state.documents.filter(d => d.cycleId === cycle.id).length < 10, 'Limite de 10 documentos por ciclo.');
      const document = { id: id('doc'), dealId, cycleId: cycle.id, name, size: buffer.length, base64: input.base64, date: state.referenceDate };
      state.documents.push(document);
      recordEvent(state, { dealId, cycleId: cycle.id, type: 'document', message: `Documento anexado: ${name}.`, details: { documentId: document.id, size: document.size } });
      return { ...document, base64: undefined };
    }
    case 'forward-contracts':
      stageIs(deal, 'meeting');
      ensure(validAgreement(cycle) && deal.registration?.cycleId === cycle.id && state.documents.some(d => d.cycleId === cycle.id && d.dealId === deal.id), 'São necessários acordo, ficha cadastral e ao menos um documento do ciclo atual.');
      deal.forwardedOn = state.referenceDate;
      moveStage(state, deal, 'contracts', 'Ficha e arquivos disponibilizados localmente ao setor de contratos. Nenhum envio externo foi realizado.');
      break;
    case 'close':
      ensure(!['closed', 'contracts'].includes(deal.stage), 'Atendimento já finalizado.');
      ensure(['Desistência', 'Recusa da visita', 'Falta de interesse'].includes(input.reason), 'Escolha um motivo válido para encerramento.');
      if (cycle?.status === 'open') endCycle(state, cycle, 'closed', input.reason);
      deal.closedReason = input.reason;
      moveStage(state, deal, 'closed', input.reason);
      break;
    default: ensure(false, 'Ação desconhecida.', 404);
  }
  return deal;
}
