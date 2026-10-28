import { Readable } from 'stream';

export function fullFileStream(bytes: Buffer): Readable {
  let queued = false;
  return new Readable({
    read() {
      if (queued) return;
      queued = true;
      this.push(bytes);
      this.push(null);
    },
  });
}
