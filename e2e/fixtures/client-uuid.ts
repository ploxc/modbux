/**
 * The uuid the client store addresses main's client by, for a spec that calls
 * `window.api` itself.
 *
 * Written out rather than imported: a spec importing `@shared` does not load,
 * with "ReferenceError: exports is not defined in ES module scope". Measured
 * with `playwright test --list`. `__tests__/client-uuid.test.ts` holds it to
 * `MAIN_CLIENT_UUID`.
 */
export const CLIENT_UUID = '084550bd-a9eb-452e-83f9-dc7a125b2ba4'
