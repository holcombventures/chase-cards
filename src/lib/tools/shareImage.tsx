import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const SHARE_SIZES = {
  og: { width: 1200, height: 675 },
  ig: { width: 1080, height: 1350 },
} as const;

export type ShareFormat = keyof typeof SHARE_SIZES;

export function shareFormat(value: string | null): ShareFormat {
  return value === "ig" ? "ig" : "og";
}

type ShareCopy = {
  format: ShareFormat;
  kicker: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  price: string;
  verdict: string;
  note: string;
  badge?: string | null;
  disclaimer?: string | null;
};

let fontPromise: Promise<Buffer> | null = null;

function geistFont(): Promise<Buffer> {
  fontPromise ??= readFile(
    join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"),
  );
  return fontPromise;
}

function clip(value: string, max: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export async function shareImageResponse(copy: ShareCopy): Promise<ImageResponse> {
  const size = SHARE_SIZES[copy.format];
  const tall = copy.format === "ig";
  const font = await geistFont();
  const disclaimer = copy.disclaimer ? clip(copy.disclaimer, 280) : "";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#f8fafc",
          color: "#0f172a",
          padding: tall ? 72 : 56,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 18,
              height: 18,
              background: "#fbbf24",
              borderRadius: 4,
              marginRight: 12,
            }}
          />
          <div style={{ display: "flex", fontSize: 24 }}>Chase Cards</div>
          <div style={{ display: "flex", marginLeft: "auto", fontSize: 20, color: "#64748b" }}>
            chasecards.online
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: tall ? 56 : 32,
            fontSize: 22,
            color: "#b45309",
            letterSpacing: 1,
          }}
        >
          {clip(copy.kicker, 48).toUpperCase()}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 18,
            fontSize: tall ? 48 : 40,
            lineHeight: 1.2,
          }}
        >
          {clip(copy.title, 140)}
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 28, color: "#334155" }}>
          {clip(copy.subtitle, 90)}
        </div>
        <div style={{ display: "flex", marginTop: tall ? 56 : 32, fontSize: 22, color: "#64748b" }}>
          {clip(copy.priceLabel, 60)}
        </div>
        <div style={{ display: "flex", marginTop: 8, fontSize: tall ? 68 : 56 }}>
          {clip(copy.price, 24)}
        </div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              background: "#fbbf24",
              color: "#0f172a",
              fontSize: tall ? 40 : 34,
              padding: "14px 26px",
              borderRadius: 999,
            }}
          >
            {clip(copy.verdict, 32)}
          </div>
          {copy.badge ? (
            <div
              style={{
                display: "flex",
                marginLeft: 16,
                background: "#fff7ed",
                color: "#9a3412",
                fontSize: 22,
                padding: "10px 18px",
                borderRadius: 999,
              }}
            >
              {clip(copy.badge, 32)}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 20, color: "#475569" }}>
          {clip(copy.note, 180)}
        </div>
        {disclaimer ? (
          <div style={{ display: "flex", marginTop: 14, fontSize: 16, color: "#64748b", lineHeight: 1.35 }}>
            {disclaimer}
          </div>
        ) : null}
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: font, style: "normal", weight: 400 },
        { name: "Geist", data: font, style: "normal", weight: 700 },
      ],
    },
  );
}
