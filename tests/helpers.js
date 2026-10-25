import { createSeed } from '../src/seed.js';
import { act, currentCycle } from '../src/domain.js';

export function fixture(scenario = 'andamento') {
  const state = createSeed();
  const deal = state.deals.find(d => d.scenario === scenario);
  return { state, deal, cycle: currentCycle(state, deal) };
}
export function visit(state, deal, propertyId = 'apartment-301') {
  act(state, deal.id, 'send-properties', { propertyIds: [propertyId] });
  act(state, deal.id, 'request-visit', { propertyId, date: state.referenceDate, time: '11:00' });
  act(state, deal.id, 'confirm-visit');
  act(state, deal.id, 'complete-visit');
}
