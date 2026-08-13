import QRCode from "qrcode";
import { headers } from "next/headers";

// Server component: renders a scannable QR label pointing at a trace URL.
// Scanning the code on a phone lands on /trace?q=<identifier>.
export async function QrLabel({
  identifier,
  size = 128,
}: {
  identifier: string;
  size?: number;
}) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/trace?q=${encodeURIComponent(identifier)}`;

  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="inline-flex flex-col items-center gap-1 rounded-none border border-[var(--line)] bg-[var(--control)] p-2">
      <div
        style={{ width: size, height: size }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className="max-w-[9rem] truncate font-mono text-[10px] text-[var(--muted)]">
        {identifier}
      </div>
    </div>
  );
}
