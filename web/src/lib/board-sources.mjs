// Client-safe catalog of the job boards Explore can read besides company ATS
// boards. A board is a site that lists many employers' postings (Jobstreet,
// Kalibrr, Himalayas, ...). Each one is read through the scanner's own provider
// of the same name, so Explore sees what the scheduled scan sees.
//
// `search: true` means the board takes a search phrase, so each "Roles to find"
// entry is sent to it as one query. The others return their whole feed and are
// narrowed by the filters alone.

export const BOARD_SOURCES = [
  "jobstreet",
  "glints",
  "kalibrr",
  "techinasia",
  "himalayas",
  "remoteok",
  "remotive",
  "weworkremotely",
  "workingnomads",
  "jobicy",
];

export const BOARD_LABEL = {
  jobstreet: "Jobstreet",
  glints: "Glints",
  kalibrr: "Kalibrr",
  techinasia: "Tech in Asia",
  himalayas: "Himalayas",
  remoteok: "RemoteOK",
  remotive: "Remotive",
  weworkremotely: "We Work Remotely",
  workingnomads: "Working Nomads",
  jobicy: "Jobicy",
};

/** Where each board's postings are mostly from, shown next to the checkbox. */
export const BOARD_REGION = {
  jobstreet: "Indonesia",
  glints: "Indonesia and SEA",
  kalibrr: "Indonesia and Philippines",
  techinasia: "SEA startups",
  himalayas: "Remote, worldwide",
  remoteok: "Remote, worldwide",
  remotive: "Remote, worldwide",
  weworkremotely: "Remote, worldwide",
  workingnomads: "Remote, worldwide",
  jobicy: "Remote, worldwide",
};

export const BOARD_ENTRIES = {
  jobstreet: { name: "Jobstreet", provider: "jobstreet", siteKey: "ID-Main", search: true, maxPages: 3 },
  glints: { name: "Glints", provider: "glints", countryCode: "ID", search: true, maxPages: 3 },
  kalibrr: { name: "Kalibrr", provider: "kalibrr", search: true, maxPages: 3 },
  techinasia: { name: "Tech in Asia", provider: "techinasia", search: false, maxPages: 5 },
  himalayas: { name: "Himalayas", provider: "himalayas", search: false, maxPages: 10 },
  remoteok: { name: "RemoteOK", provider: "remoteok", search: false },
  remotive: { name: "Remotive", provider: "remotive", search: false },
  weworkremotely: { name: "We Work Remotely", provider: "weworkremotely", search: false },
  workingnomads: { name: "Working Nomads", provider: "workingnomads", search: false },
  jobicy: { name: "Jobicy", provider: "jobicy", search: false },
};

export function isBoardSource(id) {
  return BOARD_SOURCES.includes(id);
}
