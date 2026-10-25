import { JsonStore } from './storage.js';
import { runAutomation } from './automation.js';
import { today, dateBR } from './dates.js';

const store = new JsonStore();
const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'reset' && args.length === 0) {
    const result = await store.reset();
    console.log(`Demonstração restaurada. Referência: ${dateBR(result.date)}\nDados: ${result.file}\n${result.backup ? `Backup anterior: ${result.backup}` : 'Primeira inicialização.'}`);
  } else if (command === 'verify') {
    if (args.length && !(args.length === 2 && args[0] === '--date')) throw new Error('Uso: npm.cmd run verify -- --date AAAA-MM-DD');
    const date = args[1] || today();
    const { result } = await store.transact(state => runAutomation(state, date, { source: 'cli' }));
    console.log(`Verificação em ${dateBR(date)} — ${result.results.length} ciclos — ${result.actionCount} ações\nArquivo: ${store.file}`);
    console.log(`Horário simulado (referência civil UTC): ${result.simulatedAt}\nRegistro real: ${result.recordedAt}\nEventos criados: ${result.eventsCreated}; notificações criadas: ${result.notificationsCreated}`);
    for (const item of result.results) {
      console.log(`\n${item.code} / ${item.cycleId} — ${item.clientName}`);
      console.log(`Condições: ${JSON.stringify(item.conditions)}`);
      console.log(`Antes: ${JSON.stringify(item.before)}\nDepois: ${JSON.stringify(item.after)}`);
      console.log(`Resultado: ${item.outcome}\nAlterações: ${JSON.stringify(item.changes)}`);
      console.log(item.actions.length ? item.actions.join('\n') : 'Nenhuma alteração necessária.');
    }
  } else throw new Error('Comandos: node src/cli.js verify [--date AAAA-MM-DD] | node src/cli.js reset');
} catch (error) { console.error(`Erro: ${error.message}`); process.exitCode = 1; }
