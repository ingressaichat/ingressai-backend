export function log(tag, data) {
  const ts = new Date().toISOString();
  if (typeof data === 'object') {
    // eslint-disable-next-line no-console
    console.log(`[${ts}] ${tag}`, data);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[${ts}] ${tag} ${data}`);
  }
}
