cat > src/utils.mjs <<'EOF'
export function log(ev, payload) {
  try {
    const t = new Date().toISOString();
    if (typeof payload === "string") {
      console.log(`[${t}] ${ev}`, payload);
    } else {
      console.log(`[${t}] ${ev}`, JSON.stringify(payload));
    }
  } catch {
    // no-op
  }
}
EOF
