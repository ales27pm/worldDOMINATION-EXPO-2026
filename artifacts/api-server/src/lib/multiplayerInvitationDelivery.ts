import type { GameState } from "../../../mobile/game/types";
import nodemailer from "nodemailer";

type MaybePromise<T> = T | Promise<T>;

export interface MultiplayerInvitationDeliveryPayload {
  type: "multiplayer.seat_invitation.created";
  schemaVersion: 1;
  match: {
    id: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    lobbyStatus: "joinable" | "active" | "finished";
    phase: GameState["phase"];
    turn: number;
    objective: GameState["setup"]["objective"];
    turnStyle: NonNullable<GameState["setup"]["turnStyle"]>;
  };
  seat: {
    playerId: number;
    playerName: string;
  };
  inviter: {
    playerId: number;
    playerName: string;
    userId: string | null;
  };
  recipient: {
    userId: string;
  };
  invitation: {
    createdAt: string;
  };
}

export interface MultiplayerInvitationDelivery {
  deliver(payload: MultiplayerInvitationDeliveryPayload): MaybePromise<void>;
}

export interface MultiplayerInvitationEmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface MultiplayerInvitationEmailTransport {
  sendMail(message: MultiplayerInvitationEmailMessage): MaybePromise<unknown>;
}

export class CompositeMultiplayerInvitationDelivery implements MultiplayerInvitationDelivery {
  constructor(private readonly deliveries: MultiplayerInvitationDelivery[]) {}

  async deliver(payload: MultiplayerInvitationDeliveryPayload): Promise<void> {
    let firstError: unknown;
    for (const delivery of this.deliveries) {
      try {
        await delivery.deliver(payload);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) {
      throw firstError;
    }
  }
}

export class WebhookMultiplayerInvitationDelivery implements MultiplayerInvitationDelivery {
  constructor(
    private readonly options: {
      url: string;
      token?: string;
      timeoutMs?: number;
    },
  ) {}

  async deliver(payload: MultiplayerInvitationDeliveryPayload): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 3_000);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const token = this.options.token?.trim();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(this.options.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Invitation webhook failed with HTTP ${response.status}.`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class EmailMultiplayerInvitationDelivery implements MultiplayerInvitationDelivery {
  constructor(
    private readonly options: {
      transport: MultiplayerInvitationEmailTransport;
      from: string;
      replyTo?: string;
      subjectPrefix?: string;
      appUrl?: string;
    },
  ) {}

  async deliver(payload: MultiplayerInvitationDeliveryPayload): Promise<void> {
    const to = emailAddressForTrustedUserId(payload.recipient.userId);
    if (!to) {
      throw new Error("Invitation recipient trusted user ID is not an email address.");
    }

    const commandUrl = multiplayerCommandUrl(this.options.appUrl);
    const subject = singleLine(
      `${this.options.subjectPrefix?.trim() || "worldDOMINATION"} invitation from ${payload.inviter.playerName}`,
    );
    const text = invitationEmailText(payload, commandUrl);
    const html = invitationEmailHtml(payload, commandUrl);
    await this.options.transport.sendMail({
      from: singleLine(this.options.from),
      to,
      subject,
      text,
      html,
      ...(this.options.replyTo?.trim() ? { replyTo: singleLine(this.options.replyTo) } : {}),
    });
  }
}

export function createConfiguredMultiplayerInvitationDelivery(
  env: NodeJS.ProcessEnv = process.env,
  options: {
    createEmailTransport?: (smtpUrl: string) => MultiplayerInvitationEmailTransport;
  } = {},
): MultiplayerInvitationDelivery | null {
  const deliveries: MultiplayerInvitationDelivery[] = [];
  const webhookUrl = env.MULTIPLAYER_INVITATION_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    deliveries.push(new WebhookMultiplayerInvitationDelivery({
      url: webhookUrl,
      token: env.MULTIPLAYER_INVITATION_WEBHOOK_TOKEN,
      timeoutMs: parsePositiveInteger(env.MULTIPLAYER_INVITATION_WEBHOOK_TIMEOUT_MS),
    }));
  }

  const smtpUrl = env.MULTIPLAYER_INVITATION_EMAIL_SMTP_URL?.trim();
  const emailFrom = env.MULTIPLAYER_INVITATION_EMAIL_FROM?.trim();
  if (smtpUrl && emailFrom) {
    deliveries.push(new EmailMultiplayerInvitationDelivery({
      transport: options.createEmailTransport?.(smtpUrl) ??
        (nodemailer.createTransport(smtpUrl) as MultiplayerInvitationEmailTransport),
      from: emailFrom,
      replyTo: env.MULTIPLAYER_INVITATION_EMAIL_REPLY_TO,
      subjectPrefix: env.MULTIPLAYER_INVITATION_EMAIL_SUBJECT_PREFIX,
      appUrl: env.MULTIPLAYER_PUBLIC_APP_URL,
    }));
  }

  if (deliveries.length === 0) {
    return null;
  }

  return deliveries.length === 1 ? deliveries[0] ?? null : new CompositeMultiplayerInvitationDelivery(deliveries);
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function emailAddressForTrustedUserId(userId: string): string | null {
  const normalized = userId.trim();
  if (
    normalized.length > 254 ||
    /[\r\n<>"'()[\]\\,;:]/.test(normalized) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function multiplayerCommandUrl(appUrl: string | undefined): string | null {
  if (!appUrl?.trim()) {
    return null;
  }
  try {
    return new URL("/multiplayer", appUrl).toString();
  } catch {
    return null;
  }
}

function invitationEmailText(payload: MultiplayerInvitationDeliveryPayload, commandUrl: string | null): string {
  const lines = [
    "You have been invited to a worldDOMINATION multiplayer match.",
    "",
    `Match: ${payload.match.id}`,
    `Seat: Player ${payload.seat.playerId} - ${payload.seat.playerName}`,
    `Invited by: Player ${payload.inviter.playerId} - ${payload.inviter.playerName}`,
    `Mode: ${payload.match.turnStyle}`,
    `Objective: ${payload.match.objective}`,
    `Phase: ${payload.match.phase}`,
    `Turn: ${payload.match.turn}`,
    "",
    commandUrl
      ? `Open the multiplayer command screen: ${commandUrl}`
      : "Open the multiplayer command screen and refresh pending invitations.",
  ];
  return lines.map(singleLine).join("\n");
}

function invitationEmailHtml(payload: MultiplayerInvitationDeliveryPayload, commandUrl: string | null): string {
  const details = [
    ["Match", payload.match.id],
    ["Seat", `Player ${payload.seat.playerId} - ${payload.seat.playerName}`],
    ["Invited by", `Player ${payload.inviter.playerId} - ${payload.inviter.playerName}`],
    ["Mode", payload.match.turnStyle],
    ["Objective", payload.match.objective],
    ["Phase", payload.match.phase],
    ["Turn", String(payload.match.turn)],
  ];
  const detailItems = details
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join("");
  const action = commandUrl
    ? `<p><a href="${escapeHtml(commandUrl)}">Open the multiplayer command screen</a>.</p>`
    : "<p>Open the multiplayer command screen and refresh pending invitations.</p>";
  return [
    "<p>You have been invited to a worldDOMINATION multiplayer match.</p>",
    `<ul>${detailItems}</ul>`,
    action,
  ].join("");
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
