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

  const coachedPage = await openAs(coached);
  await coachedPage.goto(origin + '/calendar');
  await coachedPage.getByTestId('calendar-page').waitFor();
  await coachedPage.getByText('Scheduled', { exact: true }).waitFor();
  await coachedPage.getByText('Started', { exact: true }).waitFor();
  await coachedPage.getByText('Done', { exact: true }).waitFor();
  assert.equal(await coachedPage.getByRole('button', { name: 'Save plan' }).count(), 0);
  assert.equal(await coachedPage.getByRole('button', { name: 'Create my program' }).count(), 0);

  await coachedPage.getByTestId('calendar-next').click();
  const future = coachedPage.locator('[data-testid^="calendar-day-"][data-future="true"]').first();
  await future.waitFor();
  const futureId = await future.getAttribute('data-testid');
  assert.ok(futureId?.startsWith('calendar-day-'));
  await future.click();
  await coachedPage.locator(`[data-testid="${futureId}"][data-selected="true"]`).waitFor();
  await coachedPage.getByTestId('calendar-page').waitFor();
  await coachedPage.screenshot({
    path: 'artifacts/p13/coached-calendar-future.png',
    fullPage: true,
    animations: 'disabled',
  });

  await coachedPage.getByTestId('calendar-view-toggle').click();
  await coachedPage.getByTestId('calendar-period-label').waitFor();
  await coachedPage.screenshot({
    path: 'artifacts/p13/coached-calendar-month.png',
    fullPage: true,
    animations: 'disabled',
  });

  await coachedPage.goto(origin + '/routines');
  await coachedPage.waitForURL(/\/dashboard/);

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

  const pass = 'PASS: coached calendar past/future, plan legend, no plan editor, routines still deferred, Coach+Coached personal calendar.';
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
