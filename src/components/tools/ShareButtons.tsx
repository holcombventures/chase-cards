"use client";

import { useState } from "react";
import { withShareFormat } from "@/lib/tools/shareLinks";

type Props = {
  path: string;
  filename: string;
  disabled?: boolean;
};

export function ShareButtons({ path, filename, disabled }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function download(format: "og" | "ig") {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(withShareFormat(path, format));
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error || "Could not build the share image.");
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${filename}-${format === "ig" ? "instagram" : "share"}.png`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setMessage("Could not build the share image.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setBusy(true);
    setMessage(null);
    try {
      const sharePath = withShareFormat(path, "og");
      const res = await fetch(sharePath);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage(body?.error || "Could not build the share image.");
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], `${filename}-share.png`, { type: "image/png" });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: "Chase Cards" });
        return;
      }
      await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).toString());
      setMessage("Share link copied.");
    } catch {
      setMessage("Could not share the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => download("og")}
          className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-amber-300/50 disabled:opacity-50"
        >
          Download share image · 1200×675
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => download("ig")}
          className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-amber-300/50 disabled:opacity-50"
        >
          Download Instagram · 1080×1350
        </button>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={share}
          className="rounded-full bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
        >
          Share
        </button>
      </div>
      {message ? <p className="text-xs text-slate-300">{message}</p> : null}
    </div>
  );
}
