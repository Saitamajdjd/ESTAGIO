import { act, createDeal } from './domain.js';
import { runAutomation } from './automation.js';

export const DEMO_DATE = '2026-10-25';
export function createSeed() {
  const state = { schemaVersion: 1, revision: 0, referenceDate: DEMO_DATE, nextDealNumber: 1001,
    properties: [
      { id: 'house-2055', name: 'Casa 2055', address: 'Rua das Acácias, 55 · Pituba', city: 'Salvador, BA', type: 'Casa', beds: 3, area: 120, rentCents: 210000, owner: 'Carlos Almeida' },
      { id: 'apartment-301', name: 'Apartamento 301', address: 'Av. Oceânica, 301 · Barra', city: 'Salvador, BA', type: 'Apartamento', beds: 2, area: 78, rentCents: 280000, owner: 'Helena Ribeiro' },
      { id: 'house-1020', name: 'Casa 1020', address: 'Rua dos Ipês, 20 · Piatã', city: 'Salvador, BA', type: 'Casa', beds: 3, area: 145, rentCents: 320000, owner: 'Roberto Dias' },
      { id: 'apartment-804', name: 'Apartamento 804', address: 'Rua das Palmeiras, 80 · Caminho das Árvores', city: 'Salvador, BA', type: 'Apartamento', beds: 2, area: 85, rentCents: 250000, owner: 'Luciana Nunes' },
      { id: 'studio-112', name: 'Studio 112', address: 'Rua da Fonte, 112 · Rio Vermelho', city: 'Salvador, BA', type: 'Studio', beds: 1, area: 42, rentCents: 180000, owner: 'Paulo Mendes' }
    ], deals: [], cycles: [], events: [], notifications: [], documents: [], runs: [] };
  const scenarios = [
    ['João Silva', 'house-2055', 1950, '2026-10-20', 'Casa com 3 quartos, próxima ao trabalho. Até R$ 2.100.', 'andamento'],
    ['Mariana Santos', 'apartment-301', 2650, '2026-10-12', 'Apartamento com 2 quartos e boa iluminação.', 'perto-do-prazo'],
    ['Pedro Oliveira', 'house-1020', 3000, '2026-10-11', 'Casa para família com espaço para escritório.', 'expirada'],
    ['Ana Costa', 'apartment-804', 2400, '2026-10-20', 'Apartamento perto de serviços e transporte.', 'acordo'],
    ['Lucas Ferreira', 'studio-112', 1650, '2026-10-20', 'Studio para uma pessoa, até R$ 1.800.', 'contraproposta']
  ];
  for (const [name, propertyId, amount, date, needs, scenario] of scenarios) {
    state.referenceDate = date;
    const deal = createDeal(state, { clientName: name, needs });
    deal.scenario = scenario;
    act(state, deal.id, 'send-properties', { propertyIds: [propertyId] });
    act(state, deal.id, 'request-visit', { propertyId, date, time: '10:00' });
    act(state, deal.id, 'confirm-visit');
    act(state, deal.id, 'complete-visit');
    const cycle = act(state, deal.id, 'start-cycle', { propertyId, amount, author: 'client' });
    if (scenario === 'acordo') {
      state.referenceDate = '2026-10-22';
      act(state, deal.id, 'accept', { proposalId: cycle.currentProposalId, party: 'owner' });
    }
    if (scenario === 'contraproposta') {
      state.referenceDate = '2026-10-22';
      act(state, deal.id, 'counterproposal', { proposalId: cycle.currentProposalId, amount: 1750, author: 'owner' });
    }
  }
  state.referenceDate = DEMO_DATE;
  const expired = state.deals.find(d => d.scenario === 'expirada');
  runAutomation(state, DEMO_DATE, { source: 'demo', dealId: expired.id });
  return state;
}
