export function buildDedupeKey(type: string, parts: Array<string | number>): string {
  return [type, ...parts].join(':');
}

export function shouldCreateNotification(existing: boolean): boolean {
  return !existing;
}
