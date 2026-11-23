// tests/viewed-state.test.mjs — the Viewed state (employer opened the application, no reply yet) sits between Applied and Responded
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { pass, fail } from './helpers.mjs';
import { computeFunnel } from '../stats.mjs';
import { computeUrgency } from '../followup-cadence.mjs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf-8');

console.log('\nViewed state');

const ids = load(read('templates/states.yml')).states.map((s) => s.id);
if (ids.indexOf('applied') < ids.indexOf('viewed') && ids.indexOf('viewed') < ids.indexOf('responded')) {
  pass('states.yml orders viewed between applied and responded');
} else {
  fail(`states.yml order: ${ids.join(', ')}`);
}

// Viewed is a submitted application, not a reply: it counts as applied, never as responded.
const funnel = computeFunnel({ Viewed: 1 });
if (funnel.everApplied === 1 && funnel.everResponded === 0) {
  pass('stats funnel counts Viewed as applied, not responded');
} else {
  fail(`stats funnel for one Viewed row: everApplied=${funnel.everApplied} everResponded=${funnel.everResponded}`);
}

if (/canonical\s*=\s*\[[^\]]*'Viewed'/s.test(read('normalize-statuses.mjs'))) {
  pass('normalize-statuses.mjs treats Viewed as canonical');
} else {
  fail('normalize-statuses.mjs canonical array missing Viewed');
}

const rank = (id) => Number(read('dedup-tracker.mjs').match(new RegExp(`'${id}': ([\\d.]+)`))?.[1]);
if (rank('applied') < rank('viewed') && rank('viewed') < rank('responded')) {
  pass('dedup-tracker.mjs ranks viewed between applied and responded');
} else {
  fail(`dedup-tracker.mjs ranks: applied=${rank('applied')} viewed=${rank('viewed')} responded=${rank('responded')}`);
}

// A viewed application with no reply still follows the Applied follow-up cadence.
if (computeUrgency('viewed', 30, null, 0) === computeUrgency('applied', 30, null, 0)) {
  pass('follow-up cadence treats Viewed like Applied');
} else {
  fail('follow-up cadence treats Viewed differently from Applied');
}
