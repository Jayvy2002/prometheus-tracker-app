/**
 * send-daily-reminders
 *
 * Called by pg_cron every minute. Sends Web Push notifications to users whose
 * configured reminder time falls within the current UTC minute.
 *
 * Required Supabase secrets (set via Dashboard → Project Settings → Edge Functions):
 *   VAPID_PUBLIC_KEY   — VAPID public key (base64url)
 *   VAPID_PRIVATE_KEY  — VAPID private key (base64url)
 *   VAPID_SUBJECT      — mailto: or https: identifier (e.g. mailto:admin@example.com)
 *
 * Generate a VAPID key pair:
 *   npx web-push generate-vapid-keys
 *
 * Schedule via SQL (run once in Supabase SQL editor):
 *   SELECT cron.schedule(
 *     'send-daily-reminders',
 *     '* * * * *',
 *     $$
 *     SELECT net.http_post(
 *       url := current_setting('app.supabase_functions_url') || '/send-daily-reminders',
 *       headers := jsonb_build_object(
 *         'Content-Type', 'application/json',
 *         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
 *       ),
 *       body := '{}'::jsonb
 *     )
 *     $$
 *   );
 *
 * Then set the required settings (run once in SQL editor, values are NOT committed to git):
 *   ALTER DATABASE postgres SET app.supabase_functions_url = 'https://<ref>.supabase.co/functions/v1';
 *   ALTER DATABASE postgres SET app.service_role_key = '<service_role_key>';
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

/** Inlined from _shared/clock.ts so this function deploys as one file. */
function todayInTimeZone(now: Date, timeZone: string | null | undefined): string {
  const tz = (timeZone ?? '').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Inlined from _shared/clock.ts so this function deploys as one file. */
function hhmmInTimeZone(now: Date, timeZone: string | null | undefined): string {
  const tz = (timeZone ?? '').trim() || 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${p.hour}:${p.minute}`;
  } catch {
    const h = String(now.getUTCHours()).padStart(2, '0');
    const m = String(now.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

/** Inlined from features/account/domain/reminderDue.ts (UX64). */
function weekdayInTimeZone(now: Date, timeZone: string | null | undefined): number {
  const tz = (timeZone ?? '').trim() || 'UTC';
  try {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(now);
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day);
    return idx >= 0 ? idx : now.getUTCDay();
  } catch {
    return now.getUTCDay();
  }
}

function isProgramTrainingWeekday(
  days: Array<{ weekday: number | null; name?: string | null; exerciseCount?: number }>,
  weekday: number,
): boolean {
  const training = days.filter(day => (day.name ?? '').trim().length > 0 || (day.exerciseCount ?? 0) > 0);
  if (training.length === 0) return false;
  const pinned = training.filter(day => typeof day.weekday === 'number');
  if (pinned.length === 0) return true;
  return pinned.some(day => day.weekday === weekday);
}

function shouldSendDailyReminder(facts: {
  kind: 'workout' | 'nutrition';
  trackingOn: boolean;
  loggedToday: boolean;
  hasAssignedProgram: boolean;
  todayIsTrainingDay: boolean;
}): boolean {
  if (!facts.trackingOn) return false;
  if (facts.loggedToday) return false;
  if (facts.kind === 'workout' && facts.hasAssignedProgram && !facts.todayIsTrainingDay) return false;
  return true;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── VAPID helpers (native Web Crypto — no npm:web-push needed) ───────────────

function base64urlToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  return Uint8Array.from([...binary].map(c => c.charCodeAt(0)));
}

function uint8ArrayToBase64url(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function buildVapidAuthHeader(
  endpoint: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })),
  );
  const payload = uint8ArrayToBase64url(
    new TextEncoder().encode(JSON.stringify({ aud: audience, exp: expiration, sub: vapidSubject })),
  );
  const unsignedToken = `${header}.${payload}`;

  const privateKeyBytes = base64urlToUint8Array(vapidPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    // Wrap raw EC key bytes in PKCS8 DER envelope for P-256
    buildPkcs8Der(privateKeyBytes),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );
  const signature = uint8ArrayToBase64url(new Uint8Array(signatureBuffer));

  const jwt = `${unsignedToken}.${signature}`;
  return `vapid t=${jwt}, k=${vapidPublicKey}`;
}

function buildPkcs8Der(rawPrivateKey: Uint8Array): ArrayBuffer {
  // PKCS#8 DER wrapper for P-256 EC private key (RFC 5958)
  const ecOid = new Uint8Array([0x06, 0x07, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x02, 0x01]);
  const curveOid = new Uint8Array([0x06, 0x08, 0x2A, 0x86, 0x48, 0xCE, 0x3D, 0x03, 0x01, 0x07]);
  const algorithmIdentifier = buildSeq([...ecOid, ...curveOid]);
  const ecPrivKey = buildSeq([0x02, 0x01, 0x01, 0x04, rawPrivateKey.length, ...rawPrivateKey]);
  const privateKeyInfo = buildSeq([0x02, 0x01, 0x00, ...algorithmIdentifier, 0x04, ecPrivKey.length, ...ecPrivKey]);
  return privateKeyInfo.buffer;
}

function buildSeq(contents: number[]): Uint8Array {
  const len = contents.length;
  const lenBytes = len < 0x80 ? [len] : [0x81, len];
  return new Uint8Array([0x30, ...lenBytes, ...contents]);
}

// ─── Encryption (RFC 8188 / aesgcm) ─────────────────────────────────────────

async function encryptPayload(
  payload: string,
  p256dh: string,
  auth: string,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const plaintext = new TextEncoder().encode(payload);
  const recipientPublicKey = base64urlToUint8Array(p256dh);
  const authSecret = base64urlToUint8Array(auth);

  // Generate ephemeral server key pair
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );

  // Import recipient public key
  const recipientKey = await crypto.subtle.importKey(
    'raw',
    recipientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: recipientKey }, serverKeyPair.privateKey, 256),
  );

  // PRK (pseudo-random key) via HKDF
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdf(authSecret, sharedSecret, buildAuthInfo(serverPublicKeyRaw, recipientPublicKey), 32);
  const contentKey = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const cryptoKey = await crypto.subtle.importKey('raw', contentKey, { name: 'AES-GCM' }, false, ['encrypt']);
  const paddedPlaintext = new Uint8Array([...plaintext, 0x02]); // pad delimiter
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cryptoKey, paddedPlaintext),
  );

  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

function buildAuthInfo(serverPublicKey: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  const info = new TextEncoder().encode('WebPush: info\0');
  const combined = new Uint8Array(info.length + recipientPublicKey.length + serverPublicKey.length);
  combined.set(info, 0);
  combined.set(recipientPublicKey, info.length);
  combined.set(serverPublicKey, info.length + recipientPublicKey.length);
  return combined;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    keyMaterial,
    length * 8,
  );
  return new Uint8Array(derived);
}

// ─── Send a single push message ──────────────────────────────────────────────

async function sendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
  payloadObj: Record<string, string>,
): Promise<boolean> {
  const payload = JSON.stringify(payloadObj);
  const { ciphertext, salt, serverPublicKey } = await encryptPayload(payload, p256dh, auth);

  // Build content-encoding header (RFC 8188)
  const header = new Uint8Array(21 + serverPublicKey.length);
  const view = new DataView(header.buffer);
  header.set(salt, 0);
  view.setUint32(16, 4096, false); // record size
  view.setUint8(20, serverPublicKey.length);
  header.set(serverPublicKey, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);

  const authorization = await buildVapidAuthHeader(endpoint, vapidPublicKey, vapidPrivateKey, vapidSubject);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body,
  });

  return res.status === 201 || res.status === 200;
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const cronSecret = (Deno.env.get('REMINDERS_CRON_SECRET') ?? '').trim();
  if (!auth || (auth !== serviceKey && !(cronSecret && auth === cronSecret))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@prometheus.app';

  if (!vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'VAPID keys not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Current instant; each profile's timezone decides whether its HH:MM matches.
  const now = new Date();

  const { data: reminderRows } = await admin
    .from('user_profiles')
    .select('id, language, timezone, notification_workout_enabled, notification_workout_time, notification_nutrition_enabled, notification_nutrition_time')
    .or('notification_workout_enabled.eq.true,notification_nutrition_enabled.eq.true');

  type ReminderRow = {
    id: string;
    language: string | null;
    timezone: string | null;
    notification_workout_enabled: boolean;
    notification_workout_time: string | null;
    notification_nutrition_enabled: boolean;
    notification_nutrition_time: string | null;
  };
  const rows = ((reminderRows ?? []) as ReminderRow[]).filter(r => r.id);

  // Q01/I04 : pas de rappel pour un module que le coach a éteint.
  const trackingByClient = new Map<string, { track_workouts: boolean; track_nutrition: boolean }>();
  if (rows.length > 0) {
    const { data: cfgs } = await admin
      .from('client_tracking_config')
      .select('client_id, track_workouts, track_nutrition')
      .in('client_id', rows.map(r => r.id));
    for (const c of (cfgs ?? []) as Array<{ client_id: string; track_workouts: boolean; track_nutrition: boolean }>) {
      trackingByClient.set(c.client_id, { track_workouts: c.track_workouts !== false, track_nutrition: c.track_nutrition !== false });
    }
  }
  const moduleOn = (userId: string, mod: 'track_workouts' | 'track_nutrition'): boolean => {
    const cfg = trackingByClient.get(userId);
    if (!cfg) return true;
    return cfg[mod] !== false;
  };

  const workoutUsers = rows.filter((r) => {
    if (!r.notification_workout_enabled || !r.notification_workout_time) return false;
    if (!moduleOn(r.id, 'track_workouts')) return false;
    return hhmmInTimeZone(now, r.timezone) === r.notification_workout_time;
  }).map((r) => ({ id: r.id, timezone: r.timezone, language: r.language }));

  const nutritionUsers = rows.filter((r) => {
    if (!r.notification_nutrition_enabled || !r.notification_nutrition_time) return false;
    if (!moduleOn(r.id, 'track_nutrition')) return false;
    return hhmmInTimeZone(now, r.timezone) === r.notification_nutrition_time;
  }).map((r) => ({ id: r.id, timezone: r.timezone, language: r.language }));

  let sent = 0;
  const staleEndpoints: string[] = [];

  const processUsers = async (
    users: { id: string; timezone: string | null; language: string | null }[] | null,
    type: 'workout' | 'nutrition',
  ) => {
    if (!users?.length) return;

    for (const { id: userId, timezone, language } of users) {
      const today = todayInTimeZone(now, timezone);
      let loggedToday = false;
      if (type === 'workout') {
        const { count } = await admin.from('workouts').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).gte('date', today).lte('date', today + 'T23:59:59');
        loggedToday = (count ?? 0) > 0;
      } else {
        const { count } = await admin.from('nutrition_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('logged_at', today);
        loggedToday = (count ?? 0) > 0;
      }

      let hasAssignedProgram = false;
      let todayIsTrainingDay = false;
      if (type === 'workout') {
        const { data: asg } = await admin.from('program_assignments')
          .select('program_id')
          .eq('client_id', userId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        if (asg?.program_id) {
          hasAssignedProgram = true;
          const { data: days } = await admin.from('program_days')
            .select('weekday, name, program_day_exercises(id)')
            .eq('program_id', asg.program_id);
          const rows = (days ?? []) as Array<{
            weekday: number;
            name: string | null;
            program_day_exercises?: { id: string }[] | null;
          }>;
          todayIsTrainingDay = isProgramTrainingWeekday(
            rows.map(row => ({
              weekday: row.weekday,
              name: row.name,
              exerciseCount: row.program_day_exercises?.length ?? 0,
            })),
            weekdayInTimeZone(now, timezone),
          );
        }
      }

      if (!shouldSendDailyReminder({
        kind: type,
        trackingOn: true,
        loggedToday,
        hasAssignedProgram,
        todayIsTrainingDay,
      })) continue;

      // Get push subscriptions for this user
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (!subs?.length) continue;

      const fr = (language ?? 'fr').toLowerCase().startsWith('fr');
      const payload = type === 'workout'
        ? fr
          ? { title: 'Prometheus 💪', body: "Tu n'as pas encore loggé ta séance aujourd'hui. Go !", tag: 'workout-reminder', url: '/workout' }
          : { title: 'Prometheus 💪', body: "You haven't logged a workout today. Go crush it!", tag: 'workout-reminder', url: '/workout' }
        : fr
          ? { title: 'Prometheus 🥗', body: "N'oublie pas de logger tes repas aujourd'hui.", tag: 'nutrition-reminder', url: '/nutrition' }
          : { title: 'Prometheus 🥗', body: "Don't forget to track your nutrition today.", tag: 'nutrition-reminder', url: '/nutrition' };

      for (const sub of subs) {
        try {
          const ok = await sendPush(sub.endpoint, sub.p256dh, sub.auth, vapidPublicKey, vapidPrivateKey, vapidSubject, payload);
          if (ok) { sent++; } else { staleEndpoints.push(sub.endpoint); }
        } catch {
          staleEndpoints.push(sub.endpoint);
        }
      }
    }
  };

  await Promise.all([
    processUsers(workoutUsers, 'workout'),
    processUsers(nutritionUsers, 'nutrition'),
  ]);

  // Clean up dead endpoints
  if (staleEndpoints.length) {
    await admin.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }

  return new Response(JSON.stringify({ sent, cleaned: staleEndpoints.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
