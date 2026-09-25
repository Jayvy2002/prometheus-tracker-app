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
  const password = 'Local-P12-' + crypto.randomUUID();
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

const coach = await actor('p12-coach', true);
const coached = await actor('p12-coached', false);
const dual = await actor('p12-dual', true);
const roster = await actor('p12-roster', false);
check(await admin.from('coach_client_links').insert([
  { coach_id: coach.id, client_id: coached.id, status: 'active' },
  { coach_id: coach.id, client_id: dual.id, status: 'active' },
  { coach_id: dual.id, client_id: roster.id, status: 'active' },
]));

const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4175'], {
  env: {
    ...process.env,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: config.ANON_KEY,
  },
  stdio: 'ignore',
});
const origin = 'http://127.0.0.1:4175';
const browser = await chromium.launch();
await mkdir('artifacts/p12', { recursive: true });
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
  await coachedPage.goto(origin + '/stats');
  await coachedPage.getByTestId('stats-page').waitFor();
  await coachedPage.screenshot({
    path: 'artifacts/p12/coached-stats.png',
    fullPage: true,
    animations: 'disabled',
  });

  await coachedPage.goto(origin + '/programs');
  await coachedPage.getByRole('heading', { name: 'My program', exact: true }).waitFor();
  await coachedPage.getByTestId('assigned-plan-read-only').waitFor();
  assert.equal(await coachedPage.getByRole('button', { name: 'Save plan' }).count(), 0);
  assert.equal(await coachedPage.getByRole('button', { name: 'Create my program' }).count(), 0);
  await coachedPage.screenshot({
    path: 'artifacts/p12/coached-program.png',
    fullPage: true,
    animations: 'disabled',
  });

  await coachedPage.goto(origin + '/calendar');
  await coachedPage.getByTestId('calendar-page').waitFor();
  await coachedPage.screenshot({
    path: 'artifacts/p12/coached-calendar.png',
    fullPage: true,
    animations: 'disabled',
  });

  const dualPage = await openAs(dual, { width: 1440, height: 1000 });
  await dualPage.goto(origin + '/profile');
  const group = dualPage.getByRole('group', { name: 'Workspace' }).filter({ visible: true });
  await group.getByRole('button', { name: 'Personal', exact: true }).click();
  await dualPage.goto(origin + '/profile');
  await group.getByRole('button', { name: 'Personal', exact: true, pressed: true }).waitFor();
  await dualPage.goto(origin + '/stats');
  await dualPage.getByTestId('stats-page').waitFor();
  // p5-22: the personal stats page is « Summary » in the Progress group (mobile and desktop menus alike).
  await dualPage.getByRole('link', { name: 'Summary', exact: true }).filter({ visible: true }).first().waitFor();
  await dualPage.screenshot({
    path: 'artifacts/p12/coach-coached-personal-stats.png',
    fullPage: true,
    animations: 'disabled',
  });

  await dualPage.goto(origin + '/programs');
  await dualPage.getByTestId('assigned-plan-read-only').waitFor();
  assert.equal(await dualPage.getByRole('button', { name: 'Save plan' }).count(), 0);

  await dualPage.goto(origin + '/profile');
  await group.getByRole('button', { name: 'Coaching', exact: true }).click();
  await dualPage.goto(origin + '/profile');
  await group.getByRole('button', { name: 'Coaching', exact: true, pressed: true }).waitFor();
  await dualPage.goto(origin + '/clients');
  await dualPage.getByText('p12-roster', { exact: true }).first().waitFor();
  assert.equal(await dualPage.getByText('p12-dual', { exact: true }).count(), 0);
  await dualPage.screenshot({
    path: 'artifacts/p12/coach-coached-roster.png',
    fullPage: true,
    animations: 'disabled',
  });

  await writeFile(
    'artifacts/p12/results.txt',
    'PASS: coached stats history, assigned plan read-only, calendar open, Coach+Coached personal stats and roster.\n',
  );
} catch (error) {
  for (const [i, page] of pages.entries()) {
    if (!page.isClosed()) {
      await page.screenshot({
        path: `artifacts/p12/failure-${i}.png`,
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
