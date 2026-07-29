/**
 * In-memory store for the active step-up (re-authentication) token.
 * Deliberately NOT persisted: a page reload forces a fresh confirmation.
 */
let token: string | null = null;
let expiresAt = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setStepUpToken(next: string, expires: string) {
  token = next;
  expiresAt = new Date(expires).getTime();
  emit();
}

export function clearStepUpToken() {
  token = null;
  expiresAt = 0;
  emit();
}

export function getStepUpToken(): string | null {
  if (!token) return null;
  // Leave a small safety margin so the server doesn't reject a just-expiring token.
  if (Date.now() > expiresAt - 5_000) {
    clearStepUpToken();
    return null;
  }
  return token;
}

export function getStepUpExpiry(): number {
  return getStepUpToken() ? expiresAt : 0;
}

export function subscribeStepUp(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
