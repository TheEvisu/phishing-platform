import * as tls from 'tls';

export interface SslResult {
  valid: boolean;
  expiresAt?: string;
  issuedAt?: string;
  daysUntilExpiry?: number;
  issuer?: string;
  subject?: string;
  sans: string[];
  protocol?: string;
  selfSigned: boolean;
  wildcard: boolean;
}

export function scanSsl(domain: string): Promise<SslResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ valid: false, sans: [], selfSigned: false, wildcard: false });
    }, 10_000);

    const socket = tls.connect(
      { host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: 10_000 },
      () => {
        clearTimeout(timer);
        const cert = socket.getPeerCertificate(true);
        const protocol = socket.getProtocol() ?? undefined;
        socket.destroy();

        if (!cert?.valid_to) {
          resolve({ valid: false, sans: [], selfSigned: false, wildcard: false });
          return;
        }

        const expiresAt = new Date(cert.valid_to).toISOString();
        const issuedAt = cert.valid_from ? new Date(cert.valid_from).toISOString() : undefined;
        const daysUntilExpiry = Math.floor(
          (new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000,
        );

        const issuer = (cert.issuer as any)?.O ?? (cert.issuer as any)?.CN;
        const subject = (cert.subject as any)?.CN ?? domain;

        const sans: string[] = [];
        if (cert.subjectaltname) {
          for (const part of cert.subjectaltname.split(', ')) {
            if (part.startsWith('DNS:')) sans.push(part.slice(4));
          }
        }

        const selfSigned =
          !!(cert.issuer as any)?.CN &&
          (cert.issuer as any).CN === (cert.subject as any)?.CN &&
          (cert.issuer as any).O === (cert.subject as any)?.O;

        const wildcard = String(subject).startsWith('*.') || sans.some((s) => s.startsWith('*.'));

        resolve({
          valid: daysUntilExpiry > 0 && !selfSigned,
          expiresAt,
          issuedAt,
          daysUntilExpiry,
          issuer,
          subject,
          sans,
          protocol,
          selfSigned,
          wildcard,
        });
      },
    );

    socket.on('error', () => {
      clearTimeout(timer);
      resolve({ valid: false, sans: [], selfSigned: false, wildcard: false });
    });
  });
}
