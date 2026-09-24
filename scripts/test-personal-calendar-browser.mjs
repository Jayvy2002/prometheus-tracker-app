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

function civil(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return civil(d);
}

function nextWeekdayStrictlyAfter(from, weekday) {
  const d = new Date(`${from}T12:00:00`);
  let delta = (weekday - d.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return civil(d);
}

async function actor(name, capability) {
  const password = 'Local-P13-' + crypto.randomUUID();
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

function sessionKey() {
  return 'sb-' + new URL(url).hostname.split('.')[0] + '-auth-token';
}

const coach = await actor('p13-coach', true);
const coached = await actor('p13-coached', false);
const dual = await actor('p13-dual', true);
check(await admin.from('coach_client_links').insert([
  { coach_id: coach.id, client_id: coached.id, status: 'active' },
  { coach_id: coach.id, client_id: dual.id, status: 'active' },
]));
// As a real activation does: the coach follows training, so personal routines stay open.
check(await admin.from('client_tracking_config').insert([
  { coach_id: coach.id, client_id: coached.id, track_workouts: true },
  { coach_id: coach.id, client_id: dual.id, track_workouts: true },
]));

function civilInTimeZone(timeZone, d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const utcToday = civilInTimeZone('UTC');
const torontoToday = civilInTimeZone('America/Toronto');
const earliestToday = utcToday <= torontoToday ? utcToday : torontoToday;
const latestToday = utcToday >= torontoToday ? utcToday : torontoToday;
const futureMonday = nextWeekdayStrictlyAfter(latestToday, 1);
let pastMonday = addDays(futureMonday, -7);
while (pastMonday >= earliestToday) {
  pastMonday = addDays(pastMonday, -7);
}
const dayName = 'Upper pull';

check(await coach.client.rpc('create_program_complete', {
  p_name: 'P13 assigned plan',
  p_description: '',
  p_duration_weeks: 8,
  p_days: [{
    weekday: 1,
    name: dayName,
    order_index: 0,
    routine_id: null,
    exercises: [{
      name: 'Barbell row',
      default_sets: 3,
      default_reps: 8,
      default_rest_seconds: 90,
      order_index: 0,
    }],
  }],
  p_assign_client_id: coached.id,
  p_start_date: pastMonday,
}));

const assignment = check(await admin.from('program_assignments')
  .select('id, program_id, status')
  .eq('client_id', coached.id)
  .eq('status', 'active')
  .single());
const mondayDay = check(await admin.from('program_days')
  .select('id')
  .eq('program_id', assignment.program_id)
  .eq('weekday', 1)
  .single());
check(await admin.from('workouts').insert({
  user_id: coached.id,
  name: dayName,
  date: `${pastMonday}T12:00:00`,
  completed: true,
  program_day_id: mondayDay.id,
  program_assignment_id: assignment.id,
}));

const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4176'], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: config.ANON_KEY,
  },
  stdio: 'ignore',
});
const origin = 'http://127.0.0.1:4176';
const browser = await chromium.launch();
await mkdir('artifacts/p13', { recursive: true });
const pages = [];

try {
  for (let i = 0; i < 60; i++) {
    if (await fetch(origin).then(r => r.ok).catch(() => false)) break;
    await new Promise(r => setTimeout(r, 500));
  }

  async function openAs(person, viewport = { width: 390, height: 844 }) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(({ session, key }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem('i18nextLng', 'en');
    }, { session: person.session, key: sessionKey() });
    const page = await context.newPage();
    pages.push(page);
    page.setDefaultTimeout(25000);
    return page;
  }

  async function revealDate(page, dateStr, direction) {
    for (let i = 0; i < 6; i++) {
      const cell = page.getByTestId(`calendar-day-${dateStr}`);
      if (await cell.count()) {
        await cell.click();
        await page.locator(`[data-testid="calendar-day-${dateStr}"][data-selected="true"]`).waitFor();
        return cell;
      }
      await page.getByTestId(direction === 'next' ? 'calendar-next' : 'calendar-prev').click();
    }
    throw new Error(`calendar day ${dateStr} not found`);
  }

  const coachedPage = await openAs(coached);
  await coachedPage.goto(origin + '/calendar');
  await coachedPage.getByTestId('calendar-page').waitFor();
  const planLegend = coachedPage.getByTestId('calendar-plan-legend');
  await planLegend.getByText('Planned session', { exact: true }).waitFor();
  await planLegend.getByText('Started', { exact: true }).waitFor();
  await planLegend.getByText('Done', { exact: true }).waitFor();
  assert.equal(await coachedPage.getByRole('button', { name: 'Save plan' }).count(), 0);
  assert.equal(await coachedPage.getByRole('button', { name: 'Create my program' }).count(), 0);

  const futureCell = await revealDate(coachedPage, futureMonday, 'next');
  await futureCell.locator('[data-testid="ux47-plan-dot"][data-plan-status="scheduled"]').waitFor();
  const futureCard = coachedPage.getByTestId('ux47-plan-card');
  await futureCard.waitFor();
  assert.equal(await futureCard.getAttribute('data-plan-status'), 'scheduled');
  await futureCard.getByText(dayName, { exact: true }).waitFor();
  await futureCard.getByText("Scheduled workout. It hasn't been started yet.").waitFor();
  await coachedPage.screenshot({
    path: 'artifacts/p13/coached-calendar-future.png',
    fullPage: true,
    animations: 'disabled',
  });

  const pastCell = await revealDate(coachedPage, pastMonday, 'prev');
  await pastCell.locator('[data-testid="ux47-plan-dot"][data-plan-status="done"]').waitFor();
  assert.equal(await coachedPage.getByTestId('ux47-plan-card').getAttribute('data-plan-status'), 'done');
  await coachedPage.getByTestId('ux47-plan-card').getByText(dayName, { exact: true }).waitFor();

  await coachedPage.getByTestId('calendar-view-toggle').click();
  await coachedPage.getByTestId('calendar-period-label').waitFor();
  await coachedPage.screenshot({
    path: 'artifacts/p13/coached-calendar-month.png',
    fullPage: true,
    animations: 'disabled',
  });

  check(await admin.from('program_assignments').update({
    status: 'paused',
    updated_at: new Date().toISOString(),
  }).eq('id', assignment.id));

  await coachedPage.goto(origin + '/calendar');
  await coachedPage.getByTestId('calendar-page').waitFor();
  const futureAfterPause = await revealDate(coachedPage, futureMonday, 'next');
  assert.equal(
    await futureAfterPause.locator('[data-testid="ux47-plan-dot"]').count(),
    0,
  );
  assert.equal(await coachedPage.getByTestId('ux47-plan-card').count(), 0);
  await coachedPage.screenshot({
    path: 'artifacts/p13/coached-calendar-paused-future.png',
    fullPage: true,
    animations: 'disabled',
  });

  const pastAfterPause = await revealDate(coachedPage, pastMonday, 'prev');
  await pastAfterPause.locator('[data-testid="ux47-plan-dot"][data-plan-status="done"]').waitFor();
  assert.equal(await coachedPage.getByTestId('ux47-plan-card').getAttribute('data-plan-status'), 'done');

  await coachedPage.goto(origin + '/programs');
  await coachedPage.getByTestId('assigned-plan-read-only').waitFor();
  assert.equal(await coachedPage.getByRole('button', { name: 'Save plan' }).count(), 0);

  // Vision §7.1: a coached athlete may still run a personal routine.
  await coachedPage.goto(origin + '/routines');
  await coachedPage.getByRole('heading', { name: 'Routines' }).waitFor();
  assert.equal(new URL(coachedPage.url()).pathname, '/routines');

  const dualPage = await openAs(dual, { width: 1440, height: 1000 });
  await dualPage.goto(origin + '/profile');
  const group = dualPage.getByRole('group', { name: 'Workspace' }).filter({ visible: true });
  await group.getByRole('button', { name: 'Personal', exact: true }).click();
  await dualPage.goto(origin + '/profile');
  await group.getByRole('button', { name: 'Personal', exact: true, pressed: true }).waitFor();
  await dualPage.goto(origin + '/calendar');
  await dualPage.getByTestId('calendar-page').waitFor();
  await dualPage.getByRole('link', { name: 'Calendar', exact: true }).first().waitFor();
  await dualPage.screenshot({
    path: 'artifacts/p13/coach-coached-personal-calendar.png',
    fullPage: true,
    animations: 'disabled',
  });

  const pass = 'PASS: coached calendar past/future, assigned Upper pull scheduled, paused hides future scheduled, plan legend, no plan editor, personal routines open, Coach+Coached personal calendar.';
  await writeFile('artifacts/p13/results.txt', pass + '\n');
  console.log(pass);
} catch (error) {
  for (const [i, page] of pages.entries()) {
    if (!page.isClosed()) {
      await page.screenshot({
        path: `artifacts/p13/failure-${i}.png`,
        fullPage: true,
        animations: 'disabled',
      }).catch(() => {});
    }
  }
  throw error;
} finally {
  await browser.close();
  vite.kill();
  for (const id of actors) await admin.auth.admin.deleteUser(id);
}
