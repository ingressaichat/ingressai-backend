export function log(labelOrObj, maybeObj) {
  const t = `t=${new Date().toISOString()}`;
  if (maybeObj === undefined && typeof labelOrObj === "object") {
    console.log("[INFO]", labelOrObj, t);
  } else if (maybeObj === undefined) {
    console.log("[INFO]", labelOrObj, t);
  } else {
    console.log("[INFO]", labelOrObj, maybeObj, t);
  }
}
