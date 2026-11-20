// Regenerates the reservation state-machine block of firestore.rules from
// functions/src/shared/reservationMachine.ts. Run after ANY change to the table, then
// paste the rules in the Firebase console. tests/unit/reservationMachine.test.ts fails
// while firestore.rules is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { withMachineBlock } from '../utils/machineRules';

const file = path.resolve(__dirname, '..', 'firestore.rules');
const before = fs.readFileSync(file, 'utf8');
const after = withMachineBlock(before);
if (after === before) {
  console.log('firestore.rules: reservation machine block already up to date.');
} else {
  fs.writeFileSync(file, after);
  console.log('firestore.rules: reservation machine block regenerated — paste the rules in the console.');
}
