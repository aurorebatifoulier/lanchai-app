// Admin callable errors always carry the real code (lib/adminErrors.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminErrorCode, adminErrorMessage } from '../../lib/adminErrors';

test('function not deployed / network → generic text + transport code', () => {
  assert.equal(adminErrorMessage({ code: 'functions/not-found', message: 'not-found' }, 'Couldn’t load the team'),
    'Couldn’t load the team (not-found).');
  assert.equal(adminErrorMessage({ code: 'functions/internal', message: 'internal' }, 'Couldn’t add this person'),
    'Couldn’t add this person (internal).');
  assert.equal(adminErrorMessage(new Error('boom'), 'Couldn’t update'), 'Couldn’t update (unknown).');
});

test('our coded HttpsError → server message + details.code', () => {
  const err = { code: 'functions/permission-denied', message: 'Only an owner can do this.', details: { code: 'owner-only' } };
  assert.equal(adminErrorCode(err), 'owner-only');
  assert.equal(adminErrorMessage(err, 'Couldn’t load the team'), 'Only an owner can do this (owner-only).');
});

test('no account with this email → the sign-up hint', () => {
  const err = { code: 'functions/not-found', message: 'whatever', details: { code: 'no-account' } };
  assert.equal(adminErrorMessage(err, 'Couldn’t add this person'), 'No account with this email: ask them to sign up first.');
});
