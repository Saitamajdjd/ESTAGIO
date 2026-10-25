import { currentCycle, currentProposal, STAGES, STATUS } from './domain.js';
import { daysBetween } from './dates.js';

export function publicState(state) {
  const cycles = state.cycles.map(c => ({ ...c, currentProposal: currentProposal(c), daysRemaining: daysBetween(state.referenceDate, c.deadline) }));
  const metrics = { active: cycles.filter(c => c.status === 'open').length,
    near: cycles.filter(c => c.status === 'open' && c.daysRemaining === 1).length,
    expired: cycles.filter(c => c.status === 'expired').length,
    agreed: cycles.filter(c => c.status === 'agreed').length,
    pending: state.notifications.filter(n => n.status === 'pending').length };
  return { ...state, stages: STAGES, statuses: STATUS, metrics, cycles,
    documents: state.documents.map(({ base64, ...meta }) => meta),
    deals: state.deals.map(d => ({ ...d, cycle: cycles.find(c => c.id === currentCycle(state, d)?.id) || null })) };
}
