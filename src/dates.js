const DAY = 86_400_000;
function invalid(message) { const error = new Error(message); error.status = 422; throw error; }

// Datas civis em UTC: a aritmética nunca depende do fuso ou do horário de verão.
export function validateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    invalid('Informe uma data válida no formato AAAA-MM-DD.');
  }
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > '9998-12-31') {
    invalid('Data inexistente ou fora do intervalo permitido.');
  }
  return value;
}

export function addDays(date, days) {
  validateDate(date);
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  validateDate(from);
  validateDate(to);
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
}

export function deadline(firstProposalDate) { return addDays(firstProposalDate, 14); }
export function isNearDeadline(cycle, date) { return daysBetween(date, cycle.deadline) === 1; }
export function isExpired(cycle, date) { return validateDate(date) >= cycle.deadline; }
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function dateBR(value) { return value ? value.split('-').reverse().join('/') : '—'; }
