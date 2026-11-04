// Loaded first by every functions test (node --import ./test/setup.ts). Runs against the
// emulators started by `firebase emulators:exec` (Firestore / Storage / Auth env vars set
// by the CLI). Callables are invoked IN-PROCESS through firebase-functions-test `wrap()`.
// No email can leave: fetch to Brevo is stubbed (records the call, answers 201).
process.env.GCLOUD_PROJECT = 'demo-lanchai';
process.env.GOOGLE_CLOUD_PROJECT = 'demo-lanchai';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-lanchai', storageBucket: 'demo-lanchai.appspot.com' });
process.env.BREVO_API_KEY = 'test-key-not-real';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run the functions tests through the emulators: npm run test:emu:functions');
}

export const sentEmails: { to: string; subject: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes('brevo.com')) {
    const body = JSON.parse(String(init?.body ?? '{}'));
    sentEmails.push({ to: body.to?.[0]?.email ?? '', subject: body.subject ?? '' });
    return new Response(JSON.stringify({ messageId: 'test' }), { status: 201, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;
