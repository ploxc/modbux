/**
 * After a compaction, have every reminder hook state its rule in full again.
 *
 * Wired on `SessionStart` with the matcher `compact`, which is when the session
 * resumes from a summary. Prints nothing, and exits 0 whatever it reads.
 */

import { readPayload } from './payload.mjs'
import { forgetThisSession } from './session-marker.mjs'

const payload = await readPayload()
try {
  forgetThisSession(payload.session_id)
} catch {
  // A marker left behind costs one short reminder, not a failed resume.
}
