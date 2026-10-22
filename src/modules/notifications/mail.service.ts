import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  configured(): boolean {
    return Boolean(this.config.get<string>('MAIL_ADDRESS') && this.config.get<string>('MAIL_PASSWORD'));
  }

  async send(to: string, subject: string, text: string, extras?: { code?: string }) {
    if (!this.configured()) {
      return { delivered: false, reason: 'EMAIL_NOT_CONFIGURED' };
    }
    try {
      const info = await this.mailer.sendMail({
        to,
        subject,
        text,
        html: renderMessage({ subject, text, code: extras?.code }),
      });
      return { delivered: true, providerReference: info?.messageId || null };
    } catch (error) {
      this.logger.warn(`Email delivery failed: ${error?.message || 'unknown error'}`);
      return { delivered: false, reason: 'EMAIL_DELIVERY_FAILED' };
    }
  }
}

function renderMessage({ subject, text, code }: { subject: string; text: string; code?: string }) {
  const paragraphs = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && line !== code)
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#12305c;">${escapeHtml(line)}</p>`)
    .join('');
  const codeBlock = code
    ? `<p style="margin:8px 0 20px;padding:18px 16px;border-radius:16px;background:#f4f7fb;border:1px solid #e4ebf5;text-align:center;font-size:32px;letter-spacing:0.42em;font-weight:700;color:#12305c;">${escapeHtml(code)}</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f7fb;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background:#12305c;padding:28px 32px;">
                <p style="margin:0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.18em;color:#ffffff;">AIR RENTAL</p>
                <h1 style="margin:14px 0 0;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:600;color:#ffffff;">${escapeHtml(subject)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 8px;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
                ${paragraphs}
                ${codeBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#6d7f98;">
                Air Rental · monthly tenancies for homes, shops, and offices
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
