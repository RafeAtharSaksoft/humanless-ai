import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/lib/router";

interface MetricCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  description?: ReactNode;
  to?: string;
  onClick?: () => void;
  /** When true, adds a subtle indigo gradient tint to the card background. */
  accent?: boolean;
  /** Color theme for the icon badge: indigo, emerald, cyan, or amber */
  colorTheme?: "indigo" | "emerald" | "cyan" | "amber";
  /** Sparkline data — array of 0–1 values rendered as a mini bar chart */
  sparkline?: number[];
  /** Change indicator text, e.g. "+2 from last week" */
  change?: ReactNode;
  /** Whether the change is positive (green) or negative (red) */
  changeUp?: boolean;
}

const colorMap = {
  indigo: {
    iconBg: "bg-primary/15",
    iconText: "text-primary",
    barBg: "bg-primary/20",
    barActive: "bg-primary",
  },
  emerald: {
    iconBg: "bg-emerald-500/15",
    iconText: "text-emerald-500",
    barBg: "bg-emerald-500/20",
    barActive: "bg-emerald-500",
  },
  cyan: {
    iconBg: "bg-cyan-500/15",
    iconText: "text-cyan-500",
    barBg: "bg-cyan-500/20",
    barActive: "bg-cyan-500",
  },
  amber: {
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-500",
    barBg: "bg-amber-500/20",
    barActive: "bg-amber-500",
  },
};

export function MetricCard({ icon: Icon, value, label, description, to, onClick, accent, colorTheme, sparkline, change, changeUp }: MetricCardProps) {
  const isClickable = !!(to || onClick);
  const colors = colorTheme ? colorMap[colorTheme] : null;

  const inner = (
    <div
      className={`h-full px-5 py-5 rounded-xl border border-border shadow-sm transition-all${accent ? " bg-gradient-to-br from-primary/8 to-transparent" : ""}${isClickable ? " hover:border-border/80 hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : ""}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {colors ? (
          <div className={`h-9 w-9 rounded-[10px] flex items-center justify-center ${colors.iconBg}`}>
            <Icon className={`h-[18px] w-[18px] ${colors.iconText}`} />
          </div>
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1.5" />
        )}
      </div>
      <p className="text-[28px] font-bold tracking-tight tabular-nums leading-none">
        {value}
      </p>
      {change && (
        <div className={`text-xs flex items-center gap-1 mt-1.5 ${changeUp === false ? "text-red-500" : "text-emerald-500"}`}>
          {changeUp !== undefined && (
            changeUp
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
          )}
          {change}
        </div>
      )}
      {!change && description && (
        <div className="text-xs text-muted-foreground/70 mt-1.5 hidden sm:block">{description}</div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div className="flex items-end gap-[2px] h-8 mt-3">
          {sparkline.map((v, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm transition-colors ${i === sparkline.length - 1 && colors ? colors.barActive : colors ? colors.barBg : "bg-primary/20"}`}
              style={{ height: `${Math.max(v * 100, 8)}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="no-underline text-inherit h-full" onClick={onClick}>
        {inner}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div className="h-full" onClick={onClick}>
        {inner}
      </div>
    );
  }

  return inner;
}
