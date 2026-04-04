import axios from 'axios';
import { scanMobile } from './mobile.scanner';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const appleAssociation = {
  applinks: {
    details: [
      { appIDs: ['TEAMID.com.example.app'], paths: ['/app/*', '/open/*'] },
      { appID: 'TEAMID.com.example.widget' },
    ],
  },
};

const assetLinks = [
  { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.example.app' } },
  { relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'com.example.lite' } },
];

const itunesResponse = {
  resultCount: 1,
  results: [
    { trackId: 1234, trackName: 'Example App', trackViewUrl: 'https://apps.apple.com/app/id1234', bundleId: 'TEAMID.com.example.app' },
  ],
};

const htmlWithStoreLinks = `
  <a href="https://apps.apple.com/app/example/id1234">App Store</a>
  <a href="https://play.google.com/store/apps/details?id=com.example.app">Play Store</a>
`;

beforeEach(() => jest.clearAllMocks());

describe('scanMobile', () => {
  it('parses iOS apps from apple-app-site-association', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 200, data: appleAssociation })   // apple association
      .mockResolvedValueOnce({ status: 404, data: [] })                  // assetlinks
      .mockResolvedValueOnce({ status: 200, data: '' })                  // homepage html
      .mockResolvedValueOnce({ data: { resultCount: 0, results: [] } }); // itunes

    const result = await scanMobile('example.com');

    expect(result.hasAppleAssociation).toBe(true);
    const iosApps = result.apps.filter((a) => a.platform === 'ios');
    expect(iosApps.some((a) => a.appId === 'TEAMID.com.example.app')).toBe(true);
    expect(iosApps.some((a) => a.appId === 'TEAMID.com.example.widget')).toBe(true);
    expect(iosApps.find((a) => a.appId === 'TEAMID.com.example.app')?.deepLinkPaths).toEqual(['/app/*', '/open/*']);
  });

  it('parses Android apps from assetlinks.json', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 404, data: {} })                  // apple association
      .mockResolvedValueOnce({ status: 200, data: assetLinks })           // assetlinks
      .mockResolvedValueOnce({ status: 200, data: '' })                  // homepage html
      .mockResolvedValueOnce({ data: { resultCount: 0, results: [] } }); // itunes

    const result = await scanMobile('example.com');

    expect(result.hasAndroidAssociation).toBe(true);
    const androidApps = result.apps.filter((a) => a.platform === 'android');
    expect(androidApps.map((a) => a.appId)).toEqual(['com.example.app', 'com.example.lite']);
  });

  it('enriches iOS app with iTunes name and store URL', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 200, data: appleAssociation })   // apple association
      .mockResolvedValueOnce({ status: 404, data: [] })                  // assetlinks
      .mockResolvedValueOnce({ status: 200, data: '' })                  // homepage html
      .mockResolvedValueOnce({ data: itunesResponse });                  // itunes

    const result = await scanMobile('example.com');

    const app = result.apps.find((a) => a.appId === 'TEAMID.com.example.app');
    expect(app?.name).toBe('Example App');
    expect(app?.storeUrl).toBe('https://apps.apple.com/app/id1234');
  });

  it('does not add iOS apps from iTunes when AASA is not configured', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 404, data: {} })                  // apple association - not found
      .mockResolvedValueOnce({ status: 404, data: [] })                  // assetlinks - not found
      .mockResolvedValueOnce({ status: 200, data: '' })                  // homepage html
      .mockResolvedValueOnce({ data: itunesResponse });                  // itunes returns a result

    const result = await scanMobile('example.com');

    // iTunes-only results must not be added - they are fuzzy name matches, not domain associations
    expect(result.apps).toHaveLength(0);
    expect(result.hasAppleAssociation).toBe(false);
  });

  it('extracts store links from homepage HTML', async () => {
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 404, data: {} })                  // apple association
      .mockResolvedValueOnce({ status: 404, data: [] })                  // assetlinks
      .mockResolvedValueOnce({ status: 200, data: htmlWithStoreLinks })  // homepage html
      .mockResolvedValueOnce({ data: { resultCount: 0, results: [] } }); // itunes

    const result = await scanMobile('example.com');

    expect(result.appStoreLinksInHtml.some((l) => l.includes('apps.apple.com'))).toBe(true);
    expect(result.appStoreLinksInHtml.some((l) => l.includes('play.google.com'))).toBe(true);
  });

  it('returns empty result when all sources fail', async () => {
    mockedAxios.get = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await scanMobile('example.com');

    expect(result.apps).toEqual([]);
    expect(result.hasAppleAssociation).toBe(false);
    expect(result.hasAndroidAssociation).toBe(false);
    expect(result.appStoreLinksInHtml).toEqual([]);
  });

  it('does not overwrite Android app with iTunes store URL when bundle IDs collide', async () => {
    // assetlinks gives Android package 'com.letstop'
    // iTunes returns bundleId 'com.letstop' (same string) - must NOT enrich the Android entry
    const androidLinks = [
      { target: { namespace: 'android_app', package_name: 'com.letstop' } },
    ];
    const itunesCollision = {
      resultCount: 1,
      results: [{ trackId: 9, trackName: 'LETSTOP', trackViewUrl: 'https://apps.apple.com/app/id9', bundleId: 'com.letstop' }],
    };
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 404, data: {} })
      .mockResolvedValueOnce({ status: 200, data: androidLinks })
      .mockResolvedValueOnce({ status: 200, data: '' })
      .mockResolvedValueOnce({ data: itunesCollision });

    const result = await scanMobile('letstop.io');

    const androidApp = result.apps.find((a) => a.appId === 'com.letstop');
    expect(androidApp?.platform).toBe('android');
    expect(androidApp?.storeUrl).toBeUndefined();
    // iTunes entry with same ID should not be added as a duplicate iOS app either
    expect(result.apps.filter((a) => a.appId === 'com.letstop')).toHaveLength(1);
  });

  it('skips non-android_app namespace entries in assetlinks', async () => {
    const mixedLinks = [
      { target: { namespace: 'web', package_name: 'not-an-app' } },
      { target: { namespace: 'android_app', package_name: 'com.example.real' } },
    ];
    mockedAxios.get = jest.fn()
      .mockResolvedValueOnce({ status: 404, data: {} })
      .mockResolvedValueOnce({ status: 200, data: mixedLinks })
      .mockResolvedValueOnce({ status: 200, data: '' })
      .mockResolvedValueOnce({ data: { resultCount: 0, results: [] } });

    const result = await scanMobile('example.com');

    expect(result.apps.map((a) => a.appId)).toEqual(['com.example.real']);
  });
});
