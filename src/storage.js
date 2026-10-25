import { mkdir, open, readFile, rename, unlink, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createSeed } from './seed.js';
import { ensure } from './domain.js';

export const DEFAULT_DATA_FILE = fileURLToPath(new URL('../data/store.json', import.meta.url));

export class JsonStore {
  constructor(file = process.env.DATA_FILE || DEFAULT_DATA_FILE) {
    this.file = resolve(file);
    this.lock = `${this.file}.lock`;
  }
  async withLock(fn) {
    await mkdir(dirname(this.file), { recursive: true });
    const until = Date.now() + 6000;
    let handle;
    while (!handle) {
      try { handle = await open(this.lock, 'wx'); }
      catch (error) {
        if (error.code !== 'EEXIST') throw error;
        ensure(Date.now() < until, 'Arquivo em uso. Tente novamente. Se um processo foi interrompido, consulte a recuperação do bloqueio em docs/README.md.', 503);
        await new Promise(done => setTimeout(done, 35));
      }
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      return await fn();
    } finally { await handle.close(); await unlink(this.lock); }
  }
  async loadUnlocked() {
    try {
      const state = JSON.parse(await readFile(this.file, 'utf8'));
      ensure(state.schemaVersion === 1 && Number.isInteger(state.revision) && ['deals', 'cycles', 'events', 'notifications', 'documents', 'runs', 'properties'].every(k => Array.isArray(state[k])), 'Arquivo de dados inválido. Restaure um backup; os dados existentes não foram substituídos.', 500);
      return state;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const state = createSeed();
      await this.saveUnlocked(state);
      return state;
    }
  }
  async saveUnlocked(state) {
    const temp = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temp, 'wx');
      try { await handle.writeFile(JSON.stringify(state, null, 2), 'utf8'); await handle.sync(); }
      finally { await handle.close(); }
      // Substituição atômica dentro da mesma pasta. O lock também coordena CLI e HTTP.
      await rename(temp, this.file);
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  read() { return this.withLock(() => this.loadUnlocked()); }
  transact(mutator, revision) {
    return this.withLock(async () => {
      const state = await this.loadUnlocked();
      if (revision !== undefined) ensure(revision === state.revision, 'Os dados mudaram em outra aba ou no terminal. Atualize e tente novamente.', 409);
      const result = await mutator(state);
      state.revision += 1;
      await this.saveUnlocked(state);
      return { result, revision: state.revision };
    });
  }
  reset(revision) {
    return this.withLock(async () => {
      if (revision !== undefined) {
        const current = await this.loadUnlocked();
        ensure(revision === current.revision, 'Os dados mudaram em outra aba ou no terminal. Atualize e tente novamente.', 409);
      }
      let backup = null;
      await mkdir(resolve(dirname(this.file), 'backups'), { recursive: true });
      const target = resolve(dirname(this.file), 'backups', `store-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
      try { await copyFile(this.file, target); backup = target; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      const state = createSeed();
      // Revisão diferente também invalida formulários abertos antes da restauração.
      state.revision = Math.max(Date.now(), (revision ?? 0) + 1);
      await this.saveUnlocked(state);
      return { backup, date: state.referenceDate, file: this.file, revision: state.revision };
    });
  }
}
