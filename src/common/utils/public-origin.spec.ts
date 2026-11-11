import { apiPublicOrigin } from './public-origin';

describe('apiPublicOrigin', () => {
  it('uses the public HTTPS API when the URL is missing, localhost, or the server IP', () => {
    expect(apiPublicOrigin(undefined, 3009)).toBe('https://api.airrental1.com');
    expect(apiPublicOrigin('', 3009)).toBe('https://api.airrental1.com');
    expect(apiPublicOrigin('http://localhost:3000', 3009)).toBe('https://api.airrental1.com');
    expect(apiPublicOrigin('http://localhost:3000/', 3009)).toBe('https://api.airrental1.com');
    expect(apiPublicOrigin('http://179.236.65.153:3009/', 3009)).toBe('https://api.airrental1.com');
    expect(apiPublicOrigin('https://api.airrental1.com./', 3009)).toBe('https://api.airrental1.com');
  });

  it('keeps an address that was set on purpose', () => {
    expect(apiPublicOrigin('https://api.example.com', 3009)).toBe('https://api.example.com');
    expect(apiPublicOrigin('https://api.airrental1.com', 3009)).toBe('https://api.airrental1.com');
  });
});
