// A browser keeps saved filters, Sources, shortlist marks and the theme per address, so
// http://127.0.0.1:3000 and http://localhost:3000 do not share them. The server cannot send
// this redirect (Next treats the two hosts as one origin and rewrites the target into a loop),
// so the page does it: first thing in <body>, before anything is drawn.
export const LOOPBACK_REDIRECT_SCRIPT =
  "(function(){var l=window.location;if(l.hostname==='127.0.0.1'){l.replace(l.protocol+'//localhost'+(l.port?':'+l.port:'')+l.pathname+l.search+l.hash);}})();";
