# Turbobaby — signing link page

A static page used as the client signing link for Turbobaby rental agreements.

Some browsers are signed in to several Google accounts. In those browsers Google rewrites links to Apps Script web apps (`script.google.com`) to `/macros/u/N/` and shows "file not found". This page lives outside Google, asks the TB e-Sign web app for a fresh BoldSign signing link without Google cookies, and sends the client straight to BoldSign.

- The document id and the client key travel in the URL fragment (`#d=…&k=…`). The fragment is never sent to this host.
- The page redirects only to `https://app.boldsign.com/`. The web app address is fixed in the page and cannot be passed in the link.
- Link previews in messengers do not run scripts, so opening the link is what sends the agreement.

`test_page.js` runs the page script with fake `fetch` and `location`: `node test_page.js`.
