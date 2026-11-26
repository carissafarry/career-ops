// tests/visa-marker.test.mjs — the visa/relocation marker labels a posting and never drops one
import { pass, fail } from './helpers.mjs';
import { detectVisaSignal, formatPipelineOffer } from '../scan.mjs';

console.log('\nVisa marker');

const cases = [
  ['We offer visa sponsorship and relocation assistance.', 'sponsored+relocation'],
  ['Relocation package included.', 'relocation'],
  ['Skilled Worker visa available for the right candidate.', 'sponsored'],
  ['We do not sponsor visas. Relocation support is provided.', 'relocation+no-sponsorship'],
  ['No sponsorship available.', 'no-sponsorship'],
  ['Must be willing to relocate to Berlin.', ''],
  ['A fully remote role.', ''],
  ['', ''],
  [undefined, ''],
];
for (const [text, want] of cases) {
  const got = detectVisaSignal(text);
  if (got === want) pass(`detectVisaSignal(${JSON.stringify(text)}) = "${want}"`);
  else fail(`detectVisaSignal(${JSON.stringify(text)}) = "${got}", expected "${want}"`);
}

const base = { url: 'https://example.com/jobs/1', company: 'Acme', title: 'Backend Engineer' };
const withVisa = formatPipelineOffer({ ...base, visa: 'sponsored+relocation' });
if (withVisa.endsWith('| visa: sponsored+relocation')) pass('pipeline row carries a visa: label');
else fail(`pipeline row with visa: ${withVisa}`);

if (formatPipelineOffer({ ...base, visa: '' }) === formatPipelineOffer(base)) pass('no visa signal leaves the row byte-identical');
else fail('an empty visa signal changed the pipeline row');
