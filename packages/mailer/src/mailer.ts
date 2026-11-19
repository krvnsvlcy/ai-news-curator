import { createTransport, type Transporter } from "nodemailer";

export interface MailerConfig {
  /** e.g. smtp://user:pass@smtp.example.com:587 or smtps://…:465; add ?pool=true for pooling. */
  url: string;
  /** e.g. "Curator Daily <letters@example.com>" */
  from: string;
}

/** Returns null when sending isn't configured, so callers can explain what's missing. */
export function getMailerConfig(env: NodeJS.ProcessEnv = process.env): MailerConfig | null {
  const url = env.SMTP_URL?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!url || !from) return null;
  if (!/^smtps?:\/\//.test(url)) throw new Error("SMTP_URL must start with smtp:// or smtps://");
  return { url, from };
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Adds a List-Unsubscribe header so mail clients can show an unsubscribe control. */
  unsubscribeUrl?: string;
}

export interface BatchResult {
  delivered: string[];
  failed: { to: string; error: string }[];
}

export class Mailer {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  static fromConfig(config: MailerConfig): Mailer {
    return new Mailer(createTransport(config.url), config.from);
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(email.unsubscribeUrl ? { list: { unsubscribe: email.unsubscribeUrl } } : {}),
    });
  }

  /** Sends each email individually, a few at a time; one failure doesn't stop the rest. */
  async sendBatch(emails: OutgoingEmail[], concurrency = 3): Promise<BatchResult> {
    const result: BatchResult = { delivered: [], failed: [] };
    let next = 0;
    const worker = async () => {
      while (next < emails.length) {
        const email = emails[next++] as OutgoingEmail;
        try {
          await this.send(email);
          result.delivered.push(email.to);
        } catch (err) {
          result.failed.push({
            to: email.to,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, emails.length) }, worker));
    return result;
  }
}
