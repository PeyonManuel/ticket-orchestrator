export function stripTypename<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(stripTypename) as T;
  if (obj !== null && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>))
      if (k !== "__typename") out[k] = stripTypename(v);
    return out as T;
  }
  return obj;
}
