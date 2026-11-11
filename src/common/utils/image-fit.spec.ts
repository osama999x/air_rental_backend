import sharp = require('sharp');
import { fitImage } from './image-fit';

describe('fitImage', () => {
  it('fits a tall photo inside 256 pixels and returns a smaller jpeg', async () => {
    const source = await sharp({
      create: { width: 1920, height: 2560, channels: 3, background: { r: 20, g: 40, b: 80 } },
    }).jpeg().toBuffer();
    const fitted = await fitImage(source, 256);
    const info = await sharp(fitted).metadata();
    expect(fitted.length).toBeLessThan(source.length);
    expect(info.format).toBe('jpeg');
    expect(info.width).toBeLessThanOrEqual(256);
    expect(info.height).toBe(256);
  });
});
