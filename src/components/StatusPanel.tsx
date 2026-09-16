type Props = {
  variant: "loading" | "empty" | "error";
  title: string;
  message?: string;
};

export function StatusPanel({ variant, title, message }: Props) {
  const accent =
    variant === "error"
      ? "border-rose-500/30 bg-rose-950/40 text-rose-100"
      : variant === "empty"
        ? "border-slate-500/20 bg-slate-900/50 text-slate-200"
        : "border-amber-400/20 bg-slate-900/50 text-slate-200";

  return (
    <div
      className={`mx-auto flex max-w-lg flex-col items-center gap-2 rounded-2xl border px-6 py-10 text-center ${accent}`}
      role={variant === "error" ? "alert" : "status"}
    >
      {variant === "loading" ? (
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400"
          aria-hidden
        />
      ) : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      {message ? <p className="text-sm opacity-80">{message}</p> : null}
    </div>
  );
}
