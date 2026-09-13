import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const database = process.env.DATABASE_URL;
assert.ok(database, 'DATABASE_URL required');
assert.equal(new URL(database).hostname, '127.0.0.1', 'Only the isolated local database is allowed');
const args = [database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const sql = async command => (await execute('psql', [...args, '-c', command], { timeout: 15000 })).stdout.trim();
const coach = crypto.randomUUID();
const client = crypto.randomUUID();
const processes = [];
const asUser = id => `SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${id}',true);`;
const leave = `SELECT public.client_end_coach_link();`;
const adapt = key => `SELECT public.apply_intervention(NULL,'${key}',NULL,'sent','{}',
 '${JSON.stringify({ assign_client_id: client, note: { body: 'Concurrent test note' } })}'::jsonb,NULL);`;

function session(name) {
  const child = spawn('psql', args, { env: { ...process.env, PGAPPNAME: name }, stdio: 'pipe' });
  processes.push(child);
  let output = '';
  let errors = '';
  let counter = 0;
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  const closed = new Promise(resolve => child.on('close', code => resolve({ code, errors })));
  child.on('error', error => { errors += error.message; });
  return {
    async run(command) {
      const marker = `READY_${++counter}`;
      child.stdin.write(command + '\n\\echo ' + marker + '\n');
      const deadline = Date.now() + 10000;
      while (!output.includes(marker)) {
        if (child.exitCode !== null) throw new Error(errors || 'psql exited early');
        if (Date.now() > deadline) throw new Error('Timed out waiting for transaction: ' + name);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    },
    finish(command) {
      child.stdin.end(command + '\n');
      return closed;
    },
  };
}

async function waitForDatabaseLock(name) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${name}' AND wait_event_type='Lock')`) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Expected a real database lock for ' + name);
}

try {
  await sql(`INSERT INTO auth.users(id,email) VALUES('${coach}','${coach}@example.test'),('${client}','${client}@example.test');
   UPDATE public.user_roles SET coaching_role='coach' WHERE user_id='${coach}';
   UPDATE public.user_roles SET coaching_role='client' WHERE user_id='${client}';
   INSERT INTO public.coach_client_links(coach_id,client_id,status) VALUES('${coach}','${client}','active');`);

  const first = session('departure_first');
  await first.run(`BEGIN; ${asUser(client)} ${leave}`);
  const late = session('adaptation_waiter');
  const rejected = late.finish(`BEGIN; ${asUser(coach)} ${adapt('after-departure-key')} COMMIT;`);
  await waitForDatabaseLock('adaptation_waiter');
  assert.equal((await first.finish('COMMIT;')).code, 0);
  const lateResult = await rejected;
  assert.notEqual(lateResult.code, 0);
  assert.match(lateResult.errors, /Not authorized for this client/);
  assert.equal(await sql(`SELECT count(*) FROM public.coach_notes WHERE client_id='${client}'`), '0');
  assert.equal(await sql(`SELECT count(*) FROM public.mutation_idempotency WHERE user_id='${coach}'`), '0');
  console.log('PASS: departure locks out a delayed adaptation, with no partial note or idempotency row');

  await sql(`UPDATE public.coach_client_links SET status='active' WHERE client_id='${client}';
   UPDATE public.user_roles SET coaching_role='client' WHERE user_id='${client}';`);
  const prior = session('adaptation_first');
  await prior.run(`BEGIN; ${asUser(coach)} ${adapt('before-departure-key')}`);
  const departure = session('departure_waiter');
  const completed = departure.finish(`BEGIN; ${asUser(client)} ${leave} COMMIT;`);
  await waitForDatabaseLock('departure_waiter');
  assert.equal((await prior.finish('COMMIT;')).code, 0);
  assert.equal((await completed).code, 0);
  assert.equal(await sql(`SELECT status FROM public.coach_client_links WHERE client_id='${client}'`), 'ended');
  assert.equal(await sql(`SELECT count(*) FROM public.coach_notes WHERE client_id='${client}'`), '1');
  assert.equal(await sql(`SELECT count(*) FROM public.coach_relationship_endings WHERE client_id='${client}'`), '2');
  console.log('PASS: an earlier adaptation finishes before departure, and each departure is recorded once');
} finally {
  for (const child of processes) if (child.exitCode === null) child.kill('SIGTERM');
  await sql(`DELETE FROM auth.users WHERE id IN ('${coach}','${client}');`);
}
