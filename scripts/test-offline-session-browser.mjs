// Vision §26 — the planned session starts and is logged without network, then
// syncs once: one workout, program provenance kept, the offline set on its real row.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const config = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
}));
const url = config.API_URL;
assert.equal(new URL(url).hostname, '127.0.0.1');
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const admin = createClient(url, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actors = [];

async function actor(name, capability) {
  const password = 'Local-Offline-' + crypto.randomUUID();
  const { user } = check(await admin.auth.admin.createUser({
    email: `${name}@example.test`,
    password,
    email_confirm: true,
  }));
  actors.push(user.id);
  check(await admin.from('user_profiles').update({
    full_name: name,
    language: 'en',
    onboarding_completed: true,
    kinesiology_intake_completed_at: new Date().toISOString(),
    entry_intent: 'solo',
  }).eq('id', user.id));
  const client = createClient(url, config.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { session } = check(await client.auth.signInWithPassword({
    email: `${name}@example.test`,
    password,
  }));
  if (capability) check(await client.rpc('set_coach_capability', { p_enabled: true }));
  return { id: user.id, client, session };
}

function civil(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const coach = await actor('offline-coach', true);
const athlete = await actor('offline-athlete', false);
check(await admin.from('coach_client_links').insert({ coach_id: coach.id, client_id: athlete.id, status: 'active' }));

// A session every day, started two weeks ago: whatever the runner's weekday, one is due today.
const start = new Date();
start.setDate(start.getDate() - 14);
check(await coach.client.rpc('create_program_complete', {
  p_name: 'Offline plan',
  p_description: '',
  p_duration_weeks: 8,
  p_days: [0, 1, 2, 3, 4, 5, 6].map((weekday, i) => ({
    weekday,
    name: `Day ${i + 1}`,
    order_index: i,
    routine_id: null,
    exercises: [
      { name: 'Squat', default_sets: 3, default_reps: 5, default_rest_seconds: 120, order_index: 0 },
      { name: 'Leg curl', default_sets: 2, default_reps: 10, default_rest_seconds: 90, order_index: 1 },
    ],
  })),
  p_assign_client_id: athlete.id,
  p_start_date: civil(start),
}));

const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4177'], {
  env: { ...process.env, VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: config.ANON_KEY },
  stdio: 'ignore',
});
const origin = 'http://127.0.0.1:4177';
const browser = await chromium.launch();
await mkdir('artifacts/offline', { recursive: true });
let page;

try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ session, key }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('i18nextLng', 'en');
  }, { session: athlete.session, key: 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token' });
  page = await context.newPage();
  page.setDefaultTimeout(25000);
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e)));

  // Online once: the plan and the logger are cached.
  await page.goto(origin + '/workout');
  const startButton = page.getByRole('button', { name: /^Start/ }).first();
  await startButton.waitFor();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // The network drops in the gym.
  await context.setOffline(true);
  await startButton.click();
  await page.waitForURL(/\/workout\/local-/);
  const weight = page.locator('input[inputmode="decimal"]').first();
  await weight.fill('120');
  await weight.blur();
  await page.getByRole('button', { name: 'Mark set done' }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/offline/logged-offline.png', animations: 'disabled' });
  assert.deepEqual(pageErrors, [], 'the logger must open offline');
  const serverWhileOffline = check(await admin.from('workouts').select('id').eq('user_id', athlete.id));
  assert.equal(serverWhileOffline.length, 0, 'nothing reaches the server while offline');

  // Back online: one replay, real ids, the URL follows.
  await context.setOffline(false);
  await page.waitForURL(url => !url.pathname.includes('/workout/local-'), { timeout: 30000 });

  const workouts = check(await admin.from('workouts')
    .select('id, client_op_id, program_day_id, program_revision_no')
    .eq('user_id', athlete.id));
  assert.equal(workouts.length, 1, 'exactly one workout after sync');
  assert.ok(workouts[0].client_op_id, 'the replay carries its op id');
  assert.ok(workouts[0].program_day_id && workouts[0].program_revision_no, 'program provenance kept');
  const exercises = check(await admin.from('workout_exercises')
    .select('id, name, order_index, workout_sets(order_index, weight_kg, completed)')
    .eq('workout_id', workouts[0].id)
    .order('order_index'));
  assert.deepEqual(exercises.map(e => e.name), ['Squat', 'Leg curl']);
  const squatSets = [...exercises[0].workout_sets].sort((a, b) => a.order_index - b.order_index);
  assert.equal(squatSets.length, 3);
  assert.equal(Number(squatSets[0].weight_kg), 120);
  assert.equal(squatSets[0].completed, true);
  await page.screenshot({ path: 'artifacts/offline/synced.png', animations: 'disabled' });

  const pass = 'PASS: planned session started offline, set logged offline, one replay with program provenance, URL follows the real id.';
  await writeFile('artifacts/offline/results.txt', pass + '\n');
  console.log(pass);
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: 'artifacts/offline/failure.png', fullPage: true, animations: 'disabled' }).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  vite.kill();
  for (const id of actors) await admin.auth.admin.deleteUser(id);
}
