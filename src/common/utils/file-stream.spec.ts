import { fullFileStream } from './file-stream';

function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

describe('fullFileStream', () => {
  it('emits the whole file and then ends', async () => {
    const bytes = Buffer.alloc(180000, 9);
    const out = await readAll(fullFileStream(bytes));
    expect(out.equals(bytes)).toBe(true);
  });
});
