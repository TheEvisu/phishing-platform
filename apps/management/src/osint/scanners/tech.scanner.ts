import axios from 'axios';
import { TechEntry } from '../../schemas/osint-scan.schema';

interface Signature {
  name: string;
  category: string;
  headers?: Array<{ key: string; pattern: RegExp }>;
  html?: RegExp[];
  cookies?: string[];
  scripts?: RegExp[];
  version?: RegExp;
}

const SIGNATURES: Signature[] = [
  // Web servers
  { name: 'Nginx',      category: 'Web Server',   headers: [{ key: 'server', pattern: /nginx/i }] },
  { name: 'Apache',     category: 'Web Server',   headers: [{ key: 'server', pattern: /apache/i }] },
  { name: 'Caddy',      category: 'Web Server',   headers: [{ key: 'server', pattern: /caddy/i }] },
  { name: 'Cloudflare', category: 'CDN',          headers: [{ key: 'server', pattern: /cloudflare/i }] },
  // Backend languages
  { name: 'PHP',        category: 'Language',     headers: [{ key: 'x-powered-by', pattern: /php/i }], cookies: ['PHPSESSID'] },
  { name: 'ASP.NET',    category: 'Framework',    headers: [{ key: 'x-powered-by', pattern: /asp\.net/i }], cookies: ['ASP.NET_SessionId'] },
  { name: 'Ruby on Rails', category: 'Framework', headers: [{ key: 'x-powered-by', pattern: /phusion passenger/i }, { key: 'x-runtime', pattern: /\d/ }] },
  // JS frameworks
  { name: 'Next.js',    category: 'JS Framework', headers: [{ key: 'x-powered-by', pattern: /next\.js/i }], html: [/\/_next\/static\//] },
  { name: 'Nuxt.js',    category: 'JS Framework', html: [/\/_nuxt\//] },
  { name: 'React',      category: 'JS Framework', html: [/react(?:\.min)?\.js|__REACT_DEVTOOLS_GLOBAL_HOOK__|data-reactroot/i] },
  { name: 'Vue.js',     category: 'JS Framework', html: [/vue(?:\.min)?\.js|__vue__|data-v-/i] },
  { name: 'Angular',    category: 'JS Framework', html: [/ng-version=|angular(?:\.min)?\.js/i] },
  { name: 'jQuery',     category: 'JS Library',   html: [/jquery(?:\.min)?\.js|jQuery\s*\(/i] },
  // CMS
  { name: 'WordPress',  category: 'CMS',          html: [/wp-content\/|wp-includes\//i], cookies: ['wordpress_logged_in'] },
  { name: 'Drupal',     category: 'CMS',          html: [/drupal\.js|Drupal\.settings/i], cookies: ['DRUPAL_UID'] },
  { name: 'Joomla',     category: 'CMS',          html: [/\/media\/jui\/|Joomla!/i] },
  { name: 'Ghost',      category: 'CMS',          html: [/ghost\/assets\/|content="Ghost/i] },
  // E-commerce
  { name: 'Shopify',    category: 'E-commerce',   html: [/cdn\.shopify\.com|shopify\.com\/s\/files/i] },
  { name: 'WooCommerce',category: 'E-commerce',   html: [/woocommerce/i] },
  { name: 'Magento',    category: 'E-commerce',   html: [/mage\/|Magento/i] },
  // Analytics
  { name: 'Google Analytics', category: 'Analytics', html: [/google-analytics\.com\/analytics\.js|gtag\(|UA-\d{4,}-\d/i] },
  { name: 'Google Tag Manager', category: 'Analytics', html: [/googletagmanager\.com\/gtm\.js/i] },
  // CDN / hosting
  { name: 'Vercel',     category: 'Hosting',      headers: [{ key: 'x-vercel-id', pattern: /./ }] },
  { name: 'Netlify',    category: 'Hosting',      headers: [{ key: 'x-nf-request-id', pattern: /./ }] },
  { name: 'GitHub Pages', category: 'Hosting',    headers: [{ key: 'server', pattern: /github\.com/i }] },
];

export async function scanTechStack(domain: string): Promise<TechEntry[]> {
  let headers: Record<string, string> = {};
  let html = '';
  let cookies: string[] = [];

  try {
    const res = await axios.get(`https://${domain}`, {
      timeout: 10_000,
      maxRedirects: 3,
      validateStatus: () => true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; security-scanner/1.0)' },
    });
    headers = Object.fromEntries(
      Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), String(v)]),
    );
    html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const cookieHeader = headers['set-cookie'] ?? '';
    cookies = cookieHeader.split(';').map((c) => c.trim().split('=')[0]);
  } catch {
    return [];
  }

  const found: TechEntry[] = [];

  for (const sig of SIGNATURES) {
    let matched = false;
    let confidence = 100;

    if (sig.headers) {
      for (const { key, pattern } of sig.headers) {
        if (headers[key] && pattern.test(headers[key])) {
          matched = true;
          break;
        }
      }
    }

    if (!matched && sig.html) {
      for (const pattern of sig.html) {
        if (pattern.test(html)) {
          matched = true;
          confidence = 85;
          break;
        }
      }
    }

    if (!matched && sig.cookies) {
      for (const cookieName of sig.cookies) {
        if (cookies.some((c) => c.toLowerCase() === cookieName.toLowerCase())) {
          matched = true;
          confidence = 90;
          break;
        }
      }
    }

    if (matched) {
      let version: string | undefined;
      if (sig.version) {
        const match = html.match(sig.version) ?? (headers['x-powered-by'] ?? '').match(sig.version);
        version = match?.[1];
      }
      found.push({ name: sig.name, category: sig.category, version, confidence });
    }
  }

  return found;
}
