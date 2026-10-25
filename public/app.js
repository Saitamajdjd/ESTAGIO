const $ = (selector, root = document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
const dateBR = date => date ? date.split('-').reverse().join('/') : '—';
const realTime = value => new Date(value).toLocaleString('pt-BR');
const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('');
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  deals: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M3 11h18M10 11v3h4v-3"/>',
  play: '<path d="m9 5 11 7-11 7z"/><path d="M3 5v14"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  house: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1v15"/>',
  refresh: '<path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M21 21v-5h-5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  alert: '<path d="m12 3 10 18H2zM12 9v5M12 17v1"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 11l3 3 5-6"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
  file: '<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  building: '<path d="M4 22V3h12v19M16 10h5v12M1 22h22M8 7h4M8 11h4M8 15h4M9 22v-4h3v4"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.file}</svg>`;
const routes = [
  ['overview', 'Visão geral', 'grid'], ['deals', 'Negociações', 'deals'], ['simulator', 'Simulador de Execução', 'play'],
  ['notifications', 'Notificações', 'bell'], ['properties', 'Imóveis', 'house'], ['history', 'Histórico', 'history'], ['guide', 'Guia da demonstração', 'book']
];
const conditionLabels = { started: 'Ciclo já iniciado', active: 'Ciclo em andamento', agreement: 'Acordo válido', oneDayLeft: 'Falta exatamente 1 dia', deadlineReached: 'Prazo de 14 dias atingido', warningExists: 'Aviso já gerado anteriormente' };
Object.assign(conditionLabels, { clientAcceptedCurrent: 'Cliente aceitou a proposta atual no prazo', ownerAcceptedCurrent: 'Proprietário aceitou a proposta atual no prazo' });
const outcomeLabels = { 'agreement-preserved': 'Acordo válido: protegido contra expiração.', 'already-closed': 'Ciclo encerrado: nenhuma nova ação.', 'warning-already-exists': 'Aviso existente: duplicação evitada.', 'no-action': 'Nenhuma regra de prazo exige ação nesta data.', 'expired': 'Negociação encerrada por prazo sem acordo.', 'warning-created': 'Aviso de 1 dia criado para o consultor.' };
let state, page = 'overview', filter = 'all', search = '', selectedDeal = null, detailTab = 'summary', lastRun = null, busy = false, toastTimer;
const dialog = $('#detail-dialog');
const property = id => state.properties.find(p => p.id === id);
const dealById = id => state.deals.find(d => d.id === id);
const cycleById = id => state.cycles.find(c => c.id === id);

async function api(path, input) {
  const response = await fetch(path, input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, revision: state?.revision }) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Não foi possível concluir a ação.'); error.status = response.status; throw error; }
  return data;
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = message; el.className = error ? 'error' : ''; el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 10000 : 5000);
}
async function reload() { state = await api('/api/state'); render(); }
async function mutate(path, input, message) {
  if (busy) return;
  busy = true;
  const buttons = [...document.querySelectorAll('button:not([disabled])')];
  buttons.forEach(b => { b.disabled = true; });
  if ($('.dialog-error')) $('.dialog-error').textContent = '';
  try {
    const result = await api(path, input);
    if (path === '/api/simulate') lastRun = result.result.id;
    if (path === '/api/demo/reset') { lastRun = null; filter = 'all'; search = ''; selectedDeal = null; dialog.close(); }
    await reload();
    if (selectedDeal && dialog.open) renderDetail();
    toast(message || 'Alteração registrada no histórico.');
    return result;
  } catch (error) {
    toast(error.message, true);
    if ($('.dialog-error')) $('.dialog-error').textContent = error.message;
    if (error.status === 409) {
      state = await api('/api/state'); render();
      if (selectedDeal && dialog.open) { renderDetail(); $('.dialog-error').textContent = error.message; }
    }
  } finally { busy = false; buttons.forEach(b => { b.disabled = false; }); }
}
function statusOf(cycle) {
  if (!cycle) return { text: 'Sem negociação', class: 'neutral' };
  if (cycle.status !== 'open') return { text: state.statuses[cycle.status], class: cycle.status };
  if (cycle.daysRemaining <= 0) return { text: 'Verificação necessária', class: 'expired' };
  if (cycle.daysRemaining === 1) return { text: 'Prazo próximo', class: 'near' };
  return { text: 'Em andamento', class: 'open' };
}
function badge(cycle) { const status = statusOf(cycle); return `<span class="badge ${status.class}">${status.text}</span>`; }
function remaining(cycle) {
  if (cycle.status === 'agreed') return 'Contagem encerrada';
  if (cycle.status !== 'open') return `Encerrado em ${dateBR(cycle.endedOn)}`;
  if (cycle.daysRemaining <= 0) return 'Prazo atingido';
  return `${cycle.daysRemaining} ${cycle.daysRemaining === 1 ? 'dia restante' : 'dias restantes'}`;
}
function empty(text) { return `<div class="empty">${icon('deals')}<p>${text}</p></div>`; }
function heading(title, subtitle, label = 'ACOMPANHAMENTO', actions = true) {
  return `<div class="page-heading"><div><div class="eyebrow">${label}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="heading-actions"><span class="reference-chip">${icon('calendar')} Referência <strong>${dateBR(state.referenceDate)}</strong></span>${actions ? `<button class="button primary" data-action="new-deal">${icon('plus')} Novo atendimento</button>` : ''}</div></div>`;
}
function metrics() {
  const items = [
    ['active', 'Em andamento', 'deals', 'blue', 'Ciclos de negociação abertos'],
    ['near', 'Próximas do prazo', 'clock', 'orange', 'Exatamente 1 dia restante'],
    ['expired', 'Prazo expirado', 'alert', 'red', 'Ciclos preservados no histórico'],
    ['agreed', 'Com acordo', 'check', 'green', 'Proposta aceita por ambas as partes'],
    ['pending', 'Notificações pendentes', 'bell', 'green', 'Avisos internos e mensagens geradas']
  ];
  return `<div class="metrics">${items.map(([key, title, ic, color, note]) => `<article class="metric"><div class="metric-top"><span>${title}</span>${icon(ic)}</div><div class="metric-value ${color}">${String(state.metrics[key]).padStart(2, '0')}</div><div class="metric-note"><span class="dot ${color}"></span>${note}</div></article>`).join('')}</div>`;
}
function simulationForm(detailed = false) {
  return `<div class="panel simulator-card"><div class="section-title">${icon('play')}<h2>Simulador de Execução</h2></div><p>Avance a data e acompanhe as regras de negócio em ação.</p>${detailed ? `<div class="quick-dates">${['2026-10-25', '2026-11-02', '2026-11-03'].map(date => `<button class="quick-date" data-date="${date}" ${date < state.referenceDate ? 'disabled' : ''}>${dateBR(date)}</button>`).join('')}</div>` : ''}<form data-form="simulate"><div class="field"><label for="simulation-date">Data da verificação</label><input id="simulation-date" name="date" type="date" min="${state.referenceDate}" max="9998-12-31" value="${state.referenceDate}" required></div><button class="button primary" type="submit">${icon('play')} Executar verificação</button></form><p class="fine-print">O relógio do computador permanece inalterado.</p>${detailed ? `<div class="callout warning">A execução altera os dados persistidos.<small>É permitido repetir a data, sem duplicar notificações. Para retroceder, use <span class="mono">npm.cmd run reset</span>.</small></div><p>Referência atual: <strong>${dateBR(state.referenceDate)}</strong><br>Todos os ciclos são avaliados, inclusive os já encerrados.</p>` : ''}</div>`;
}
function overview() {
  return `${heading('Cada etapa, sob controle.', 'Acompanhe negociações, prazos e decisões em um só lugar.', 'PAINEL DE AUTOMAÇÃO')}${metrics()}<div class="hero-grid"><section class="panel rule-panel"><div class="rule-top"><span class="rule-label">${icon('bolt')} REGRA DE NEGOCIAÇÃO</span><span class="tag">Execução sob demanda</span></div><h2>14 dias para chegar a um acordo.<br>Clareza em cada decisão.</h2><p>Do primeiro valor proposto ao desfecho da negociação: prazos calculados, aceites validados e todas as ações registradas.</p><div class="rule-steps"><div class="rule-step"><small>Dia 0</small><strong>Primeira proposta</strong></div><div class="rule-step"><small>Dia 13</small><strong>Aviso ao consultor</strong></div><div class="rule-step"><small>Dia 14 · sem acordo</small><strong>Retorno à busca</strong></div></div></section>${simulationForm()}</div>${dealsPanel()}<div class="bottom-grid"><section class="panel"><div class="panel-heading"><h2>Últimas movimentações</h2><a class="text-link" href="#history">Ver histórico ${icon('arrow')}</a></div>${state.events.slice(-3).reverse().map(event => activity(event)).join('')}</section><section class="panel"><div class="panel-heading"><h2>Uma demonstração transparente</h2>${icon('shield')}</div><div class="demo-note">${icon('bell')}<div><h3>Mensagem gerada ≠ mensagem enviada</h3><p>Ao expirar, o ciclo gera uma mensagem pendente para o proprietário. Não há envio de e-mail ou WhatsApp neste ambiente.</p></div></div><div class="demo-note">${icon('book')}<div><h3>Preparado para apresentar</h3><p>Cinco cenários fictícios, histórico auditável e restauração dos dados.</p><a class="text-link" href="#guide">Abrir guia da demonstração ${icon('arrow')}</a></div></div></section></div>`;
}
function filteredDeals() {
  const term = search.toLocaleLowerCase('pt-BR');
  return state.deals.filter(deal => {
    const c = deal.cycle;
    const matches = filter === 'all' || (filter === 'near' ? c?.status === 'open' && c.daysRemaining === 1 : c?.status === filter);
    const text = `${deal.code} ${deal.clientName} ${property(c?.propertyId || deal.propertyId)?.name || ''}`.toLocaleLowerCase('pt-BR');
    return matches && text.includes(term);
  });
}
function dealsPanel() {
  return `<section class="panel"><div class="panel-heading"><div><h2>Negociações <span class="count-label">${state.deals.length}</span></h2><p>O ciclo mais recente de cada atendimento. Abra os detalhes para consultar os anteriores.</p></div><a class="text-link" href="#simulator">Verificar prazos ${icon('arrow')}</a></div><div class="toolbar"><div class="tabs" aria-label="Filtrar negociações">${[['all', 'Todas'], ['open', 'Em andamento'], ['near', 'Próximas'], ['expired', 'Expiradas'], ['agreed', 'Com acordo']].map(([key, label]) => `<button class="tab ${filter === key ? 'active' : ''}" data-filter="${key}" aria-pressed="${filter === key}">${label}</button>`).join('')}</div><label class="search-wrap">${icon('search')}<input class="input" id="deal-search" type="search" value="${esc(search)}" placeholder="Buscar cliente, imóvel ou código" aria-label="Buscar negociações"></label></div><div id="deal-table">${dealTable()}</div><div class="table-footer"><span>${icon('shield')} Alterações persistidas localmente · Referência ${dateBR(state.referenceDate)}</span><span>Selecione um atendimento para ver detalhes ${icon('arrow')}</span></div></section>`;
}
function dealTable() {
  const deals = filteredDeals();
  if (!deals.length) return empty('Nenhum atendimento encontrado com esses filtros.');
  return `<div class="table-scroll"><table><thead><tr><th>CLIENTE / NEGÓCIO</th><th>IMÓVEL</th><th>PROPOSTA ATUAL</th><th>STATUS DO CICLO</th><th>PRAZO DA NEGOCIAÇÃO</th><th>ETAPA ATUAL</th><th><span class="muted">ABRIR</span></th></tr></thead><tbody>${deals.map((deal, index) => {
    const c = deal.cycle, p = property(c?.propertyId || deal.propertyId);
    return `<tr><td class="client-col"><div class="client-cell"><span class="avatar tone-${index % 5}">${esc(initials(deal.clientName))}</span><div><button data-deal="${deal.id}">${esc(deal.clientName)}</button><small>${deal.code}${c ? ` · Ciclo ${c.number}` : ''}</small></div></div></td><td><div class="property-name">${p ? esc(p.name) : 'Imóvel a definir'}</div><small class="property-location">${p ? esc(p.address.split(' · ')[1]) : 'Atendimento inicial'}</small></td><td><span class="money">${c ? money(c.currentProposal.amountCents) : '—'}</span>${c ? '<small class="deadline-meta">aluguel / mês</small>' : ''}</td><td class="status-col">${badge(c)}</td><td class="deadline-col">${c ? `<div class="deadline-date">${dateBR(c.deadline)}</div><div class="deadline-meta">Início ${dateBR(c.firstProposalDate)}</div><div class="remaining ${c.status === 'expired' ? 'red' : c.daysRemaining === 1 ? 'orange' : 'green'}">${remaining(c)}</div>` : '—'}</td><td class="stage-cell">${esc(state.stages[deal.stage])}</td><td class="open-col"><button class="icon-button" data-deal="${deal.id}" aria-label="Abrir ${esc(deal.clientName)}">${icon('arrow')}</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function activity(event) {
  const deal = dealById(event.dealId);
  return `<div class="activity"><span class="activity-mark">${icon(event.type === 'notification' ? 'bell' : 'activity')}</span><div><p>${esc(event.message)}</p><small>${dateBR(event.date)} · <button class="text-link" data-deal="${event.dealId}">${deal?.code || ''} · ${esc(deal?.clientName)}</button></small></div></div>`;
}
function runMarkup(run, compact = false) {
  return `<article class="run-card"><div class="run-header"><div>
    <div class="eyebrow">EXECUÇÃO ${run.source === 'cli' ? 'PELO TERMINAL' : run.source === 'demo' ? 'DOS DADOS INICIAIS' : 'DO SIMULADOR'}</div>
    <h2>Verificação em ${dateBR(run.date)}</h2><p>${run.results.length} ciclos avaliados · ${run.actionCount} ações executadas</p>
    <p>Horário simulado: ${dateBR(run.date)} às 00:00:00 UTC (referência civil)</p>
    <p>Registro real: ${realTime(run.recordedAt)}</p>
    ${run.eventsCreated !== undefined ? `<p class="run-counts">${run.eventsCreated} eventos criados · ${run.notificationsCreated} notificações criadas</p>` : ''}
    </div><span class="badge agreed">Concluída</span></div>
    ${run.actionCount === 0 ? '<div class="callout">Nenhuma alteração necessária. Avisos já gerados e ciclos encerrados foram preservados.</div>' : ''}
    ${run.results.map(result => `<div class="run-result" data-result-code="${esc(result.code)}">
      <h3><button class="text-link" data-deal="${result.dealId}">${result.code} · ${esc(result.clientName)}</button> <span class="muted">/ ${esc(property(result.propertyId)?.name)} · Ciclo ${cycleById(result.cycleId)?.number || ''}</span></h3>
      <div class="conditions">${Object.entries(result.conditions).map(([key, value]) => `<div class="condition"><span>${esc(conditionLabels[key] || key)}</span><span class="${value ? 'truth' : 'falsehood'}">${value ? 'Verdadeiro' : 'Falso'}</span></div>`).join('')}</div>
      <p class="hint"><strong>Resultado:</strong> ${esc(outcomeLabels[result.outcome] || (result.conditions.agreement ? outcomeLabels['agreement-preserved'] : 'Consulte as ações e os estados abaixo.'))}</p>
      ${result.actions.length ? `<ul class="action-list">${result.actions.map(action => `<li>${esc(action)}</li>`).join('')}</ul>` : ''}
      <div class="state-comparison">${[['before', 'Estado anterior'], ['after', 'Estado posterior']].map(([key, label]) => `<div class="state-box">${label}<strong>${state.statuses[result[key].status]}</strong><p>${state.stages[result[key].stage]}</p><p>Encerramento: ${dateBR(result[key].endedOn)}</p></div>`).join('')}</div>
      ${result.changes ? `<details class="audit-details"><summary>Alterações e registros desta negociação (${result.changes.length} campos)</summary><pre>${esc(JSON.stringify({ changes: result.changes, eventIds: result.eventIds, notificationIds: result.notificationIds }, null, 2))}</pre></details>` : ''}
    </div>`).join('')}
    ${compact ? '' : `<p class="hint mono">ID da execução: ${run.id}</p><details class="audit-details"><summary>Log completo da execução (JSON)</summary><pre>${esc(JSON.stringify(run, null, 2))}</pre></details>`}</article>`;
}
function demoCases() {
  return `<section class="panel panel-padding demo-panel"><div class="panel-heading"><div><h2>Demonstração local · dados fictícios</h2><p>Execute 02/11 e 03/11 e compare os dois casos. Os cartões refletem os dados salvos.</p></div><button class="button small" data-action="reset-demo">${icon('refresh')} Restaurar demonstração</button></div><div class="demo-cases">${['andamento', 'acordo'].map(scenario => {
    const deal = state.deals.find(d => d.scenario === scenario);
    if (!deal?.cycle) return '';
    const c = deal.cycle;
    return `<article data-demo-scenario="${scenario}"><h3>${scenario === 'andamento' ? '1. Negociação sem acordo' : '2. Acordo entre as partes'} · ${esc(deal.clientName)}</h3><p>Início ${dateBR(c.firstProposalDate)} · Prazo ${dateBR(c.deadline)}</p>${badge(c)}<p>${remaining(c)} · ${esc(state.stages[deal.stage])}</p><p>${['client', 'owner'].map(party => `${party === 'client' ? 'Cliente' : 'Proprietário'}: ${c.currentProposal.acceptances.some(a => a.party === party && a.proposalId === c.currentProposalId) ? 'aceite registrado' : 'sem aceite'}`).join(' · ')}</p><button class="button small" data-demo-proposals="${deal.id}">Ver proposta e aceites</button></article>`;
  }).join('')}</div><p class="hint">Repetir uma data cria outro log de execução. Eventos de negócio e notificações não se repetem.</p></section>`;
}
function simulator() {
  const run = state.runs.find(r => r.id === lastRun) || state.runs.at(-1);
  return `${heading('Simulador de Execução', 'Veja quais condições foram avaliadas e o que mudou em cada negociação.', 'MOTOR DE AUTOMAÇÃO', false)}${demoCases()}<div class="split-layout">${simulationForm(true)}<section>${run ? runMarkup(run) : empty('Execute uma verificação para visualizar os resultados.')}<div class="run-log">${state.runs.filter(r => r.id !== run?.id).slice().reverse().map(r => `<details><summary>${dateBR(r.date)} · ${r.actionCount} ações · ${r.source === 'demo' ? 'Preparação dos cenários' : r.source === 'cli' ? 'Terminal' : 'Simulador'}</summary>${runMarkup(r, true)}</details>`).join('')}</div></section></div>`;
}
function notificationMarkup(n) {
  return `<article class="panel notification-card"><div class="activity-mark">${icon(n.recipient === 'owner' ? 'file' : 'bell')}</div><div><h3>${n.recipient === 'owner' ? 'Mensagem ao proprietário' : 'Aviso ao consultor'} <span class="badge ${n.status === 'pending' ? 'near' : 'neutral'}">${n.status === 'pending' ? n.recipient === 'owner' ? 'Pendente de envio' : 'Pendente de leitura' : 'Lida'}</span></h3><p>${esc(n.message)}</p><div class="notification-meta"><span>Para ${esc(n.recipientName)} · ${dateBR(n.date)} · ${esc(property(cycleById(n.cycleId)?.propertyId)?.name)}</span><button class="text-link" data-deal="${n.dealId}">${dealById(n.dealId)?.code} ${icon('arrow')}</button>${n.recipient === 'consultant' && n.status === 'pending' ? `<button class="button small" data-read="${n.id}">${icon('check')} Marcar como lida</button>` : ''}</div>${n.recipient === 'owner' ? '<p class="hint">Rascunho disponível para envio manual. Nenhum e-mail ou mensagem foi enviado pelo sistema.</p>' : ''}</div></article>`;
}
function notifications() { return `${heading('Central de notificações', 'Avisos internos e mensagens preparadas pelo motor de automação.', 'COMUNICAÇÃO', false)}<div class="notification-list">${state.notifications.length ? state.notifications.slice().reverse().map(notificationMarkup).join('') : empty('Nenhuma notificação gerada até o momento.')}</div>`; }
function properties() {
  const selected = new URLSearchParams(location.hash.split('?')[1] || '').get('imovel');
  const list = selected ? state.properties.filter(p => p.id === selected) : state.properties;
  return `${heading('Imóveis em carteira', 'Portfólio fictício para demonstrar a jornada de locação.', 'CATÁLOGO LOCAL', false)}${selected ? '<p class="hint"><a class="text-link" href="#properties">← Ver todos os imóveis</a></p>' : ''}<div class="property-grid">${list.map(p => `<article class="panel"><div class="property-art"><span class="tag">${p.type} · Disponível para demonstração</span>${icon(p.type === 'Casa' ? 'house' : 'building')}</div><div class="property-info"><h2>${esc(p.name)}</h2><p>${esc(p.address)}<br>${esc(p.city)}</p><div class="property-specs"><span>${p.beds} ${p.beds === 1 ? 'quarto' : 'quartos'}</span><span>${p.area} m²</span></div><div class="property-price"><div><strong>${money(p.rentCents)}</strong><small>Aluguel de referência / mês</small></div></div><p>Proprietário: ${esc(p.owner)}</p><button class="button small" data-action="new-deal">${icon('plus')} Iniciar atendimento</button> <a class="text-link" href="#properties?imovel=${p.id}">Link do imóvel</a></div></article>`).join('') || empty('Imóvel não encontrado.')}</div>`;
}
function timeline(events) { return events.length ? `<ol class="timeline">${events.slice().reverse().map(e => `<li><small>${dateBR(e.date)} · ${dealById(e.dealId)?.code || ''}${e.cycleId ? ` · Ciclo ${cycleById(e.cycleId)?.number || ''}` : ''}</small><p>${esc(e.message)}</p><small>Registro real: ${realTime(e.recordedAt)}</small>${Object.keys(e.details).length ? `<details><summary>Detalhes do registro</summary><pre>${esc(JSON.stringify(e.details, null, 2))}</pre></details>` : ''}</li>`).join('')}</ol>` : empty('Nenhum evento registrado.'); }
function history() { return `${heading('Histórico de eventos', 'Datas de referência, movimentações e decisões preservadas por atendimento.', 'TRILHA DE AUDITORIA', false)}<section class="panel panel-padding">${timeline(state.events)}</section>`; }
function guide() { return `${heading('Uma demonstração, cinco cenários.', 'Um roteiro direto para apresentar a regra de 14 dias e seus fluxos alternativos.', 'GUIA DO CASE NIA', false)}<div class="guide-grid"><section class="panel panel-padding"><h2>1. Comece pela referência inicial</h2><p>O conjunto original usa <strong>25/10/2026</strong>. João está negociando, Mariana tem 1 dia restante, Pedro já expirou, Ana tem acordo e Lucas recebeu uma contraproposta.</p><ol><li>No simulador, execute <strong>25/10/2026</strong> para avisar o consultor de Mariana.</li><li>Execute a mesma data: nenhuma notificação é duplicada.</li><li>Avance para <strong>02/11/2026</strong>: João recebe o aviso de 1 dia.</li><li>Avance para <strong>03/11/2026</strong>: João expira e retorna a Envio de imóveis.</li><li>Ana continua com acordo, sem expiração indevida.</li></ol><a class="button primary" href="#simulator">${icon('play')} Abrir simulador</a></section><section class="panel panel-padding"><h2>2. Explore as decisões</h2><p>Em Negociações, abra Lucas e consulte Propostas: o aceite da proposta de R$ 1.650,00 não vale para a contraproposta de R$ 1.750,00. Confirme o aceite do cliente antes de 03/11 para registrar o acordo.</p><p>Abra Ana para agendar a reunião, registrar a ficha, anexar um arquivo fictício e encaminhar ao setor de contratos. O encaminhamento é um registro local, sem transmissão a outro sistema.</p><p>Para um ciclo novo, abra Pedro, selecione outro imóvel, solicite e confirme a visita, registre sua realização e inicie a proposta.</p></section><section class="panel panel-padding"><h2>3. Execute também no terminal</h2><p>O terminal e a interface usam o mesmo arquivo em <span class="mono">data/store.json</span>. Atualize o painel após executar:</p><code class="code-block">npm.cmd run verify -- --date 2026-11-02\nnpm.cmd run verify -- --date 2026-11-03</code><p>Para usar a data atual do Windows:</p><code class="code-block">npm.cmd run verify</code><p>Não existe execução periódica configurada. Consulte docs/ARQUITETURA.md para preparar o Agendador de Tarefas.</p></section><section class="panel panel-padding"><h2>4. Restaure e repita</h2><p>A restauração recupera os cinco cenários e salva um backup dos dados anteriores. É possível executá-la com o servidor aberto; depois atualize o painel.</p><code class="code-block">npm.cmd run reset\nnpm.cmd test</code><p>O relatório para sua apresentação está em <span class="mono">docs/RELATORIO_TECNICO.md</span>. O projeto complementa o CRM e não inclui assinatura de contratos, cobrança ou integração com o Bitrix24.</p><div class="callout warning">Use apenas dados e arquivos fictícios.<small>Esta é uma demonstração local, sem autenticação ou integração de mensagens.</small></div></section></div>`; }
function render() {
  if (!state) return;
  const route = routes.find(r => r[0] === page) || routes[0];
  document.title = `${route[1]} · LocaFlux`;
  $('#page-label').textContent = route[1];
  $('#navigation').innerHTML = routes.map(([key, label, ic]) => `<a class="nav-item ${page === key ? 'active' : ''} ${key === 'guide' ? 'separator' : ''}" href="#${key}" ${page === key ? 'aria-current="page"' : ''} title="${label}">${icon(ic)}<span>${label}</span>${key === 'notifications' && state.metrics.pending ? `<span class="nav-count">${state.metrics.pending}</span>` : ''}</a>`).join('');
  $('#main').innerHTML = ({ overview, deals: () => `${heading('Negociações', 'Acompanhe propostas, aceites e a evolução de cada atendimento.')}${metrics()}${dealsPanel()}`, simulator, notifications, properties, history, guide })[page]();
}
function field(label, name, type = 'text', value = '', extra = '') {
  return `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra} required></div>`;
}
function authorField() { return '<div class="field"><label for="field-author">Autor da proposta</label><select id="field-author" name="author"><option value="client">Cliente</option><option value="owner">Proprietário</option></select></div>'; }
function dateTimeFields() { return field('Data', 'date', 'date', state.referenceDate, `min="${state.referenceDate}" max="9998-12-31"`) + field('Horário', 'time', 'time', '10:00'); }
function actionButton(action, label, primary = false, payload = {}) { return `<button class="button ${primary ? 'primary' : ''}" data-deal-action="${action}" data-payload="${esc(JSON.stringify(payload))}">${esc(label)}</button>`; }
function dealForm(action, content, label) { return `<form class="form-stack" data-form="deal-action" data-kind="${action}">${content}<button type="submit" class="button primary">${label}</button></form>`; }
function workflowForm(deal) {
  const c = deal.cycle;
  switch (deal.stage) {
    case 'initial': return dealForm('send-properties', `<p>Registre os imóveis compatíveis com as necessidades do cliente.</p><div class="checkbox-grid">${state.properties.map(p => `<label class="check-label"><input type="checkbox" name="propertyIds" value="${p.id}"><span>${esc(p.name)}<small>${money(p.rentCents)} · ${p.beds} quartos</small></span></label>`).join('')}</div>`, 'Registrar apresentação de imóveis');
    case 'search': return `<p>Links locais preparados: ${deal.interestPropertyIds.map(pid => `<a class="text-link" href="/#properties?imovel=${pid}" target="_blank" rel="noopener">${esc(property(pid)?.name)}</a>`).join(' · ')}.</p><p class="hint">Apresentação registrada, sem envio externo de mensagens.</p>${dealForm('request-visit', `<div class="field"><label for="field-propertyId">Imóvel de interesse</label><select name="propertyId" id="field-propertyId" required>${deal.interestPropertyIds.map(pid => `<option value="${pid}">${esc(property(pid)?.name)}</option>`).join('')}</select></div><div class="form-grid">${dateTimeFields()}</div>`, 'Consultar disponibilidade do proprietário')}<details class="close-section"><summary>Apresentar outros imóveis</summary>${dealForm('send-properties', `<div class="checkbox-grid">${state.properties.map(p => `<label class="check-label"><input type="checkbox" name="propertyIds" value="${p.id}">${esc(p.name)}</label>`).join('')}</div>`, 'Adicionar imóveis à seleção')}</details>`;
    case 'owner':
    case 'scheduled': return `<p>Visita em <strong>${dateBR(deal.visit.date)} às ${esc(deal.visit.time)}</strong> · ${esc(property(deal.propertyId)?.name)}</p><div class="form-stack">${actionButton(deal.stage === 'owner' ? 'confirm-visit' : 'complete-visit', deal.stage === 'owner' ? 'Proprietário confirmou o horário' : 'Registrar visita realizada', true)}</div><details class="close-section"><summary>Horário indisponível? Sugerir outra data</summary>${dealForm('reschedule-visit', `<div class="form-grid">${dateTimeFields()}</div>${field('Motivo', 'reason', 'text', '', 'maxlength="300"')}`, 'Sugerir nova data')}</details>`;
    case 'visited': return `${dealForm('start-cycle', `<p>Cliente interessado? Registre a primeira proposta para ${esc(property(deal.propertyId)?.name)}.</p>${field('Valor mensal proposto (R$)', 'amount', 'number', '', 'min="1" max="100000000" step="0.01"')}${authorField()}`, 'Iniciar ciclo de negociação')}<div class="close-section">${actionButton('reject-property', 'Cliente quer buscar outros imóveis')}</div>`;
    case 'negotiation': return c.daysRemaining <= 0 ? '<div class="callout warning">O prazo foi atingido. Use Verificar prazo para encerrar o ciclo e retornar à busca de imóveis.</div>' : `<p>Registre os aceites da proposta atual ou apresente uma contraproposta. O prazo continua em <strong>${dateBR(c.deadline)}</strong>.</p><div class="acceptances">${acceptanceButtons(c)}</div>${dealForm('counterproposal', `${field('Novo valor mensal (R$)', 'amount', 'number', '', 'min="1" max="100000000" step="0.01"')}${authorField()}`, 'Registrar contraproposta')}`;
    case 'meeting': return `<div class="callout">Acordo confirmado em ${dateBR(c.endedOn)}. Este ciclo está protegido contra expiração.</div>${!deal.registration ? `<div class="close-section">${dealForm('schedule-meeting', `<div class="form-grid">${dateTimeFields()}</div>`, deal.meeting ? 'Reagendar reunião' : 'Agendar reunião')}</div>` : ''}${deal.meeting ? `<p class="hint">Reunião: ${dateBR(deal.meeting.date)} às ${esc(deal.meeting.time)}</p>` : ''}<button class="button full" data-tab="documents">${icon('file')} Abrir ficha e documentos</button>`;
    case 'contracts': return '<div class="callout">Ficha e arquivos encaminhados ao setor de contratos no ambiente local. A assinatura e a cobrança estão fora do escopo.</div>';
    default: return `<div class="callout warning">Atendimento encerrado: ${esc(deal.closedReason)}. O histórico foi preservado.</div>`;
  }
}
function acceptanceButtons(c) {
  return ['client', 'owner'].map(party => {
    const yes = c.currentProposal.acceptances.some(a => a.party === party);
    return `<div class="acceptance ${yes ? 'yes' : ''}">${party === 'client' ? 'Cliente' : 'Proprietário'}<small>${yes ? 'Aceite registrado' : 'Aguardando aceite'}</small>${!yes ? `<button class="button small" data-deal-action="accept" data-payload="${esc(JSON.stringify({ party, proposalId: c.currentProposalId }))}">Confirmar aceite</button>` : ''}</div>`;
  }).join('');
}
function summaryDetail(deal) {
  const c = deal.cycle, p = property(deal.propertyId || c?.propertyId);
  return `<div class="detail-grid"><div><section class="detail-section"><h3>${p ? esc(p.name) : 'Imóvel a definir'}</h3><p>${p ? esc(p.address) : 'Identifique as necessidades e apresente os imóveis disponíveis.'}</p>${c ? `<div class="large-amount">${money(c.currentProposal.amountCents)}</div>${badge(c)}<dl class="facts"><div><dt>Primeira proposta</dt><dd>${dateBR(c.firstProposalDate)}</dd></div><div><dt>Prazo final</dt><dd>${dateBR(c.deadline)}</dd></div><div><dt>Contagem</dt><dd>${remaining(c)}</dd></div><div><dt>Ciclo</dt><dd>${c.number} · ${esc(property(c.propertyId)?.name)}</dd></div></dl><button class="button small" data-verify="${deal.id}">${icon('refresh')} Verificar prazo na referência atual</button>` : ''}</section><section class="detail-section"><h3>Próxima ação</h3>${workflowForm(deal)}</section>${!['closed', 'contracts'].includes(deal.stage) ? `<details class="close-section"><summary>Encerrar atendimento</summary>${dealForm('close', '<div class="field"><label for="field-reason">Motivo</label><select id="field-reason" name="reason"><option>Desistência</option><option>Recusa da visita</option><option>Falta de interesse</option></select></div>', 'Registrar encerramento')}</details>` : ''}</div><aside><section class="detail-section"><h3>Jornada de locação</h3><ol class="step-list">${Object.entries(state.stages).filter(([key]) => key !== 'closed').map(([key, label], i) => `<li class="${deal.stage === key ? 'current' : ''}"><span class="step-number">${i + 1}</span>${label}</li>`).join('')}</ol>${deal.stage === 'closed' ? '<p class="red">Atendimento encerrado</p>' : ''}</section><section class="detail-section"><h3>Sobre o atendimento</h3><p>${esc(deal.needs)}</p><dl class="facts"><div><dt>Consultora</dt><dd>${esc(deal.consultant)}</dd></div><div><dt>Iniciado em</dt><dd>${dateBR(deal.createdOn)}</dd></div></dl></section></aside></div>`;
}
function proposalsDetail(deal) {
  const cycles = state.cycles.filter(c => c.dealId === deal.id).reverse();
  return cycles.length ? cycles.map(c => `<section><div class="panel-heading"><div><h2>Ciclo ${c.number} · ${esc(property(c.propertyId)?.name)}</h2><p>${dateBR(c.firstProposalDate)} → ${dateBR(c.deadline)} · ${state.statuses[c.status]}</p></div>${badge(c)}</div>${c.proposals.slice().reverse().map((p, index) => `<article class="proposal-card ${p.status === 'superseded' ? 'old' : ''}"><div class="proposal-header"><h3>${money(p.amountCents)}</h3><span class="badge ${p.status === 'accepted' ? 'agreed' : 'neutral'}">${({ pending: 'Aguardando aceite', superseded: 'Substituída', accepted: 'Aceita', expired: 'Expirada', cancelled: 'Cancelada' })[p.status]}</span></div><p>Proposta por ${p.author === 'client' ? 'cliente' : 'proprietário'} em ${dateBR(p.date)} · ${p.id === c.currentProposalId ? 'Proposta atual deste ciclo' : 'Somente histórico'}</p><div class="acceptances">${['client', 'owner'].map(party => { const a = p.acceptances.find(a => a.party === party); return `<div class="acceptance ${a ? 'yes' : ''}">${party === 'client' ? 'Cliente' : 'Proprietário'}<small>${a ? `${dateBR(a.date)} · ${a.implicit ? 'Aceite como autor' : 'Aceite confirmado'}` : 'Sem aceite para este valor'}</small></div>`; }).join('')}</div>${p.status === 'superseded' ? '<p>Os aceites acima não se aplicam às propostas posteriores.</p>' : ''}<small class="mono">${p.id}</small></article>`).join('')}</section>`).join('') : empty('Ainda não há propostas neste atendimento.');
}
function documentsDetail(deal) {
  const c = deal.cycle;
  if (!c || !['meeting', 'contracts'].includes(deal.stage)) return empty('A ficha e os documentos ficam disponíveis após o acordo entre as partes.');
  const docs = state.documents.filter(d => d.cycleId === c.id && d.dealId === deal.id);
  return `<div class="detail-grid"><section><div class="detail-section"><h3>Ficha cadastral</h3>${deal.stage === 'meeting' && deal.meeting && deal.meeting.date <= state.referenceDate ? dealForm('registration', `${field('Nome completo', 'name', 'text', deal.registration?.name || deal.clientName, 'maxlength="100"')}${field('Contato', 'contact', 'text', deal.registration?.contact || '', 'maxlength="150"')}<div class="field"><label for="field-notes">Dados cadastrais e observações</label><textarea id="field-notes" name="notes" maxlength="2000" required>${esc(deal.registration?.notes || '')}</textarea><small>Use dados fictícios para esta demonstração.</small></div>`, deal.registration ? 'Atualizar ficha cadastral' : 'Registrar ficha cadastral') : deal.registration ? `<p>${esc(deal.registration.name)}<br>${esc(deal.registration.contact)}<br>${esc(deal.registration.notes)}</p>` : '<p>Agende a reunião na aba Resumo. A ficha pode ser preenchida a partir da data agendada.</p>'}</div>${deal.registration && deal.stage === 'meeting' ? `<div class="detail-section"><h3>Anexar documento</h3><form class="form-stack" data-form="upload"><div class="field"><label for="document-file">Arquivo fictício</label><input id="document-file" name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required><small>PDF, imagem ou TXT · até 2 MB · máximo 10 arquivos por ciclo.</small></div><button class="button primary" type="submit">${icon('plus')} Anexar ao ciclo atual</button></form></div>` : ''}</section><aside><section class="detail-section"><h3>Arquivos do ciclo ${c.number}</h3>${docs.length ? docs.map(d => `<div class="document-row"><div><a href="/api/documents/${d.id}" download>${icon('file')} ${esc(d.name)}</a><small>${(d.size / 1024).toFixed(1)} KB · ${dateBR(d.date)}</small></div></div>`).join('') : '<p>Nenhum documento anexado.</p>'}</section>${deal.stage === 'meeting' ? `<div class="detail-section"><h3>Encaminhar ao setor de contratos</h3><p>É necessário ter acordo, ficha e ao menos um documento deste ciclo.</p><div class="close-section">${actionButton('forward-contracts', 'Encaminhar arquivos', true)}</div><p class="hint">Registro local de encaminhamento, sem transmissão externa.</p></div>` : '<div class="callout">Encaminhamento registrado. Documentos disponíveis para consulta.</div>'}</aside></div>`;
}
function renderDetail() {
  const deal = dealById(selectedDeal);
  if (!deal) { dialog.close(); selectedDeal = null; return; }
  const tabs = [['summary', 'Resumo e ações'], ['proposals', 'Propostas e ciclos'], ['documents', 'Documentação'], ['notifications', 'Notificações'], ['history', 'Histórico']];
  $('#dialog-content').innerHTML = `<header class="dialog-header"><div><div class="eyebrow">${deal.code} · REFERÊNCIA ${dateBR(state.referenceDate)}</div><h2 id="dialog-title">${esc(deal.clientName)}</h2><p>${state.stages[deal.stage]}</p></div><button class="icon-button" data-action="close-dialog" aria-label="Fechar detalhes">${icon('close')}</button></header><div class="dialog-error" role="alert"></div><div class="tabs dialog-tabs" aria-label="Detalhes do atendimento">${tabs.map(([key, label]) => `<button class="tab ${detailTab === key ? 'active' : ''}" data-tab="${key}" aria-pressed="${detailTab === key}">${label}</button>`).join('')}</div><div class="dialog-body">${({ summary: () => summaryDetail(deal), proposals: () => proposalsDetail(deal), documents: () => documentsDetail(deal), history: () => timeline(state.events.filter(e => e.dealId === deal.id)), notifications: () => { const list = state.notifications.filter(n => n.dealId === deal.id); return `<div class="notification-list">${list.length ? list.slice().reverse().map(notificationMarkup).join('') : empty('Nenhuma notificação para este atendimento.')}</div>`; } })[detailTab]()}</div>`;
}
function openDeal(id) { selectedDeal = id; detailTab = 'summary'; renderDetail(); if (!dialog.open) dialog.showModal(); }
function resetDemoDialog() {
  selectedDeal = null;
  $('#dialog-content').innerHTML = `<header class="dialog-header"><h2 id="dialog-title">Restaurar demonstração</h2><button class="icon-button" data-action="close-dialog" aria-label="Cancelar restauração">${icon('close')}</button></header><div class="dialog-error" role="alert"></div><div class="dialog-body"><p>Recupera os cinco cenários fictícios em 25/10/2026. As alterações atuais ficam em um backup local na pasta de dados.</p><form data-form="reset-demo"><button class="button primary" type="submit">Restaurar dados iniciais</button></form></div>`;
  if (!dialog.open) dialog.showModal();
}
function newDealDialog() {
  selectedDeal = null;
  $('#dialog-content').innerHTML = `<header class="dialog-header"><div><div class="eyebrow">ATENDIMENTO INICIAL · ${dateBR(state.referenceDate)}</div><h2 id="dialog-title">Uma nova jornada de locação</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Fechar formulário">${icon('close')}</button></header><div class="dialog-error" role="alert"></div><div class="dialog-body"><form class="form-stack" data-form="new-deal">${field('Nome do cliente', 'clientName', 'text', '', 'maxlength="100"')}${field('Consultor responsável', 'consultant', 'text', 'Marina Costa', 'maxlength="100"')}<div class="field"><label for="field-needs">O que o cliente procura?</label><textarea id="field-needs" name="needs" maxlength="1000" placeholder="Tipo de imóvel, localização, orçamento e necessidades…" required></textarea></div><button class="button primary" type="submit">${icon('plus')} Criar atendimento</button></form></div>`;
  if (!dialog.open) dialog.showModal();
}

document.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target || busy) return;
  if (target.dataset.deal) return openDeal(target.dataset.deal);
  if (target.dataset.action === 'new-deal') return newDealDialog();
  if (target.dataset.action === 'reset-demo') return resetDemoDialog();
  if (target.dataset.demoProposals) { openDeal(target.dataset.demoProposals); detailTab = 'proposals'; renderDetail(); return; }
  if (target.dataset.action === 'close-dialog') return dialog.close();
  if (target.dataset.filter) { filter = target.dataset.filter; render(); return; }
  if (target.dataset.date) { $('#simulation-date').value = target.dataset.date; return; }
  if (target.dataset.tab) { detailTab = target.dataset.tab; renderDetail(); return; }
  if (target.dataset.dealAction) return mutate(`/api/deals/${selectedDeal}/actions`, { action: target.dataset.dealAction, payload: JSON.parse(target.dataset.payload || '{}') });
  if (target.dataset.verify) {
    const result = await mutate('/api/simulate', { date: state.referenceDate, dealId: target.dataset.verify }, 'Prazo verificado. Consulte o resultado no simulador.');
    if (result) { dialog.close(); location.hash = '#simulator'; if (page === 'simulator') render(); }
  }
  if (target.dataset.read) return mutate(`/api/notifications/${target.dataset.read}/read`, {}, 'Leitura do aviso registrada.');
});
document.addEventListener('input', event => {
  if (event.target.id === 'deal-search') { search = event.target.value; $('#deal-table').innerHTML = dealTable(); }
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  if (busy) return;
  const data = Object.fromEntries(new FormData(form));
  if (form.dataset.form === 'simulate') {
    const result = await mutate('/api/simulate', data, 'Verificação concluída e persistida.');
    if (result) { location.hash = '#simulator'; if (page === 'simulator') render(); }
  } else if (form.dataset.form === 'new-deal') {
    const result = await mutate('/api/deals', data, 'Atendimento criado.');
    if (result) openDeal(result.result.id);
  } else if (form.dataset.form === 'deal-action') {
    const action = form.dataset.kind;
    if ('amount' in data) data.amount = Number(data.amount);
    if (action === 'send-properties') data.propertyIds = new FormData(form).getAll('propertyIds');
    if (action === 'start-cycle') data.propertyId = dealById(selectedDeal).propertyId;
    if (action === 'counterproposal') data.proposalId = dealById(selectedDeal).cycle.currentProposalId;
    await mutate(`/api/deals/${selectedDeal}/actions`, { action, payload: data });
  } else if (form.dataset.form === 'upload') {
    const file = data.file;
    if (!file?.size || file.size > 2 * 1024 * 1024) return toast('Selecione um arquivo não vazio de até 2 MB.', true);
    try {
      const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(file); });
      await mutate(`/api/deals/${selectedDeal}/actions`, { action: 'attach-document', payload: { name: file.name, base64 } }, 'Arquivo anexado e persistido no ciclo.');
    } catch (error) { toast(error.message, true); }
  }
  if (form.dataset.form === 'reset-demo') return mutate('/api/demo/reset', {}, 'Demonstração restaurada em 25/10/2026. Backup dos dados anteriores salvo.');
});
$('#refresh').innerHTML = icon('refresh');
$('#notification-shortcut').innerHTML = icon('bell');
$('#refresh').addEventListener('click', () => reload().then(() => toast('Dados atualizados.')).catch(error => toast(error.message, true)));
$('#notification-shortcut').addEventListener('click', () => { location.hash = '#notifications'; });
dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
dialog.addEventListener('close', () => { selectedDeal = null; });
function navigate() { const hash = location.hash.slice(1).split('?')[0]; page = routes.some(r => r[0] === hash) ? hash : 'overview'; render(); }
window.addEventListener('hashchange', navigate);
try { state = await api('/api/state'); navigate(); }
catch (error) { $('#main').innerHTML = `<div class="callout danger">Não foi possível carregar os dados. Verifique se o servidor está em execução e use Atualizar.<small>${esc(error.message)}</small></div>`; }
// Consulta alterações da CLI; não executa regras em segundo plano nem interrompe formulários.
setInterval(async () => {
  if (busy || dialog.open || document.hidden || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  try { const next = await api('/api/state'); if (next.revision !== state?.revision) { state = next; render(); } }
  catch { /* A próxima consulta ou atualização manual pode recuperar a conexão. */ }
}, 15000);
