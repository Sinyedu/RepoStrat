/** True when Discord reports the channel, thread or message no longer exists. */
export function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('status' in error && error.status === 404) ||
      ('code' in error && (error.code === 10003 || error.code === 10008)))
  );
}
