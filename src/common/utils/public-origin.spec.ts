import { apiPublicOrigin } from './public-origin';

describe('apiPublicOrigin', () => {
  it('uses the server address when the public URL is missing or still the localhost placeholder', () => {
    expect(apiPublicOrigin(undefined, 3009)).toBe('http://179.236.65.153:3009');
    expect(apiPublicOrigin('', 3009)).toBe('http://179.236.65.153:3009');
    expect(apiPublicOrigin('http://localhost:3000', 3009)).toBe('http://179.236.65.153:3009');
    expect(apiPublicOrigin('http://localhost:3000/', 3009)).toBe('http://179.236.65.153:3009');
  });

  it('keeps an address that was set on purpose', () => {
    expect(apiPublicOrigin('https://api.example.com', 3009)).toBe('https://api.example.com');
    expect(apiPublicOrigin('http://179.236.65.153:3009/', 3009)).toBe('http://179.236.65.153:3009');
  });
});
