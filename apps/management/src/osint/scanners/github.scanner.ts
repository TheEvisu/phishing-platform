import axios from 'axios';
import { GithubExposureEntry } from '../../schemas/osint-scan.schema';

interface GithubSearchItem {
  repository: { full_name: string };
  path: string;
  html_url: string;
  text_matches?: Array<{ fragment: string }>;
}

async function searchGithub(
  query: string,
  token?: string,
): Promise<GithubSearchItem[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3.text-match+json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await axios.get('https://api.github.com/search/code', {
    params: { q: query, per_page: 30 },
    headers,
    timeout: 10_000,
  });

  return res.data.items ?? [];
}

export async function scanGithubExposure(
  domain: string,
  githubToken?: string,
): Promise<GithubExposureEntry[]> {
  const results: GithubExposureEntry[] = [];

  // Two searches: domain itself and email pattern
  const queries = [
    { query: `"${domain}"`, type: 'domain' },
    { query: `"@${domain}"`, type: 'email' },
  ];

  for (const { query, type } of queries) {
    try {
      const items = await searchGithub(query, githubToken);
      for (const item of items) {
        const snippet = item.text_matches?.[0]?.fragment ?? '';
        results.push({
          repoFullName: item.repository.full_name,
          fileUrl: item.html_url,
          snippet: snippet.slice(0, 300),
          type,
        });
      }
    } catch (err: any) {
      const status = err?.response?.status;
      // 401 = no auth (token required), 403 = rate-limited, 422 = query invalid
      if (status !== 401 && status !== 403 && status !== 422) {
        throw err;
      }
      // If unauthorized and no token configured, abort further queries
      if (status === 401) break;
    }
  }

  return results;
}
