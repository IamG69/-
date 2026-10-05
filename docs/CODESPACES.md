# HTTPS preview and Excel persistence

Run `python -m app.start` from the repository root. The application listens on port 8000; open its existing forwarded address from the Codespaces Ports panel. Keep the port's existing access settings.

The default working copy is `data/01_База_исследования_рабочая.xlsx`, outside Git tracking. Keep it in the Codespace workspace, not `/tmp`. An existing working copy is never replaced by the bundled template. Download Excel before deleting a Codespace. Use fictional data only.

API requests use the current preview origin and credentials. API responses use `Cache-Control: no-store`; the page and scripts revalidate so refreshed clients receive fixes. Errors distinguish JSON validation failures, HTTP proxy failures, expired preview access, unexpected HTML and network failures. A failed response does not prove a write failed: check the saved record before retrying. POST requests are not automatically retried.

On 2026-10-05 the original TEST2 form failed with a generic connection message, while new fictional records saved. The failed attempts were absent from the backend access log. Restarting the same backend with the same working book restored saving that form. The exact earlier proxy status was not captured; CORS and hardcoded localhost were not present in the client. The working copy was preserved byte for byte when moved from /tmp into the workspace.

Checks: `node --test tests/test_api.cjs` and `python -m unittest discover -s tests -p 'test_*.py'`. Browser validation must include creating and editing fictional data through the HTTPS preview, reloading and reopening the record, plus reading the corresponding rows in the exported or on-disk Excel file.
