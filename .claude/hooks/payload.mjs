/**
 * Reading the hook payload off stdin.
 *
 * `JSON.parse` returns `null` for the valid JSON `null`, reaching the `try` and
 * not the `catch`, so the shape is checked rather than assumed.
 *
 * **A hook exits 0 or it is broken.** The harness reads a non-zero code as
 * something to show the user, and 2 as a refusal.
 */

/** The payload, or `{}` when stdin holds anything else. */
export async function readPayload() {
  if (process.stdin.isTTY) return {}
  try {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    // A payload this cannot read is not a reason to interrupt anyone.
    return {}
  }
}
