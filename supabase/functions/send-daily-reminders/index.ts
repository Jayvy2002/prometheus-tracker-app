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

  // Current UTC time as "HH:MM"
  const now = new Date();
  const currentTime = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

  // Find users with a reminder configured at this exact minute
  const { data: workoutUsers } = await admin
    .from('user_profiles')
    .select('id')
    .eq('notification_workout_enabled', true)
    .eq('notification_workout_time', currentTime);

  const { data: nutritionUsers } = await admin
    .from('user_profiles')
    .select('id')
    .eq('notification_nutrition_enabled', true)
    .eq('notification_nutrition_time', currentTime);

  const today = now.toISOString().split('T')[0];

  let sent = 0;
  const staleEndpoints: string[] = [];

  const processUsers = async (
    users: { id: string }[] | null,
    type: 'workout' | 'nutrition',
  ) => {
    if (!users?.length) return;

    for (const { id: userId } of users) {
      // Skip if user already logged the activity today
      if (type === 'workout') {
        const { count } = await admin.from('workouts').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).gte('date', today).lte('date', today + 'T23:59:59');
        if ((count ?? 0) > 0) continue;
      } else {
        const { count } = await admin.from('nutrition_logs').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('logged_at', today);
        if ((count ?? 0) > 0) continue;
      }

      // Get push subscriptions for this user
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);

      if (!subs?.length) continue;

      const payload = type === 'workout'
        ? { title: 'Prometheus 💪', body: "You haven't logged a workout today. Go crush it!", tag: 'workout-reminder', url: '/workout' }
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
