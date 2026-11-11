import sharp = require('sharp');

export async function fitImage(bytes: Buffer, maxEdge = 256): Promise<Buffer> {
  return sharp(bytes, { failOn: 'none', animated: false })
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
}
