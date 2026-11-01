/** Bound memory use before decoding user-supplied request bodies. */
export async function readRequestText(req: Request, maxBytes = 30000) {
  const declared = Number(req.headers.get("content-length"));
  if (declared > maxBytes) throw Error("Request too large");
  if (!req.body) return "";
  const reader = req.body.getReader(),
    decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw Error("Request too large");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function redactSecrets(
  message: string,
  secrets: (string | undefined)[],
) {
  return secrets
    .filter((s): s is string => !!s)
    .reduce((safe, secret) => safe.split(secret).join("[redacted]"), message)
    .slice(0, 1200);
}
