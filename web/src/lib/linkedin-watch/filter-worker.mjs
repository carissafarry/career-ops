// Runs in its own Node process so it always reads the core scanner fresh from disk.
// (Importing scan.mjs inside the long-lived web server reuses whatever modules it cached earlier, which
// breaks after the core is updated underneath a running app.)
// usage: node filter-worker.mjs <path to scan.mjs>   stdin: {filters, cards}   stdout: {keep: [card ids]}
import { pathToFileURL } from "node:url";
import { buildCardFilter } from "./filter.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const { filters, cards } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const keep = await buildCardFilter(filters, () => import(pathToFileURL(process.argv[2]).href));
process.stdout.write(JSON.stringify({ keep: cards.filter((c) => !keep || keep(c)).map((c) => c.id) }));
