export function log(tag, data) {
  if (data === undefined) {
    console.log(`[${new Date().toISOString()}] ${tag}`);
  } else {
    console.log(
      `[${new Date().toISOString()}] ${tag}`,
      typeof data === "string" ? data : JSON.stringify(data)
    );
  }
}
