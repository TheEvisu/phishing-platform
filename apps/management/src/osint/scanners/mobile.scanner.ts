import axios from 'axios';
import { MobileResult, MobileApp } from '../../schemas/osint-scan.schema';

interface AppleAssociation {
  applinks?: { details?: Array<{ appIDs?: string[]; appID?: string; paths?: string[] }> };
  webcredentials?: { apps?: string[] };
}

interface AssetLink {
  relation?: string[];
  target?: { namespace?: string; package_name?: string; sha256_cert_fingerprints?: string[] };
}

interface ItunesResult {
  trackId: number;
  trackName: string;
  trackViewUrl: string;
  bundleId: string;
  artworkUrl60?: string;
}

function extractStoreLinks(html: string): string[] {
  const links: string[] = [];
  const appleMatches = html.matchAll(/https?:\/\/apps\.apple\.com\/[^\s"'<>]+/gi);
  const playMatches  = html.matchAll(/https?:\/\/play\.google\.com\/store\/apps\/[^\s"'<>]+/gi);
  for (const m of appleMatches) links.push(m[0]);
  for (const m of playMatches)  links.push(m[0]);
  return [...new Set(links)];
}

export async function scanMobile(domain: string): Promise<MobileResult> {
  const base = `https://${domain}`;
  const apps: MobileApp[] = [];

  const [appleRes, androidRes, htmlRes, itunesRes] = await Promise.allSettled([
    axios.get<AppleAssociation>(`${base}/.well-known/apple-app-site-association`, { timeout: 8_000, validateStatus: () => true }),
    axios.get<AssetLink[]>(`${base}/.well-known/assetlinks.json`,                { timeout: 8_000, validateStatus: () => true }),
    axios.get(`${base}`, { timeout: 8_000, validateStatus: () => true }),
    axios.get<{ resultCount: number; results: ItunesResult[] }>(
      'https://itunes.apple.com/search',
      { params: { term: domain.replace(/\..+$/, ''), entity: 'software', limit: 5 }, timeout: 8_000 },
    ),
  ]);

  // iOS — apple-app-site-association
  let hasAppleAssociation = false;
  if (appleRes.status === 'fulfilled' && appleRes.value.status === 200) {
    const data = appleRes.value.data;
    hasAppleAssociation = true;
    const details = data.applinks?.details ?? [];
    for (const d of details) {
      const ids = d.appIDs ?? (d.appID ? [d.appID] : []);
      for (const appID of ids) {
        apps.push({ platform: 'ios', appId: appID, deepLinkPaths: d.paths });
      }
    }
  }

  // Android — assetlinks.json
  let hasAndroidAssociation = false;
  if (androidRes.status === 'fulfilled' && androidRes.value.status === 200) {
    const links = androidRes.value.data;
    if (Array.isArray(links)) {
      hasAndroidAssociation = true;
      for (const link of links) {
        if (link.target?.namespace === 'android_app' && link.target.package_name) {
          apps.push({ platform: 'android', appId: link.target.package_name });
        }
      }
    }
  }

  // iTunes Search API — match by bundle IDs already found or by brand name
  if (itunesRes.status === 'fulfilled') {
    for (const result of itunesRes.value.data.results ?? []) {
      const existingIos = apps.find((a) => a.appId === result.bundleId && a.platform === 'ios');
      if (existingIos) {
        existingIos.name = result.trackName;
        existingIos.storeUrl = result.trackViewUrl;
      } else if (!apps.some((a) => a.appId === result.bundleId)) {
        apps.push({
          platform: 'ios',
          appId: result.bundleId,
          name: result.trackName,
          storeUrl: result.trackViewUrl,
        });
      }
    }
  }

  // HTML store links
  let appStoreLinksInHtml: string[] = [];
  if (htmlRes.status === 'fulfilled' && htmlRes.value.status === 200) {
    appStoreLinksInHtml = extractStoreLinks(String(htmlRes.value.data));
  }

  return { apps, hasAppleAssociation, hasAndroidAssociation, appStoreLinksInHtml };
}
