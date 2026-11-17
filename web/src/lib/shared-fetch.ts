// One request for identical GETs that are in flight at the same time. In `next dev`,
// React runs every effect twice on mount, and several components on a page ask for the
// same data, so one page load sent the same request two or four times, and the server
// handles them one after another. Each caller gets its own copy of the response, so
// reading a body in one place does not break another.
const inFlight = new Map<string, Promise<Response>>();

export function sharedGet(url: string, init?: RequestInit): Promise<Response> {
  let pending = inFlight.get(url);
  if (!pending) {
    pending = fetch(url, init).finally(() => {
      inFlight.delete(url);
    });
    inFlight.set(url, pending);
  }
  return pending.then((response) => response.clone());
}
