"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/fixed-costs", label: "固定費", icon: "💸" },
  { href: "/record", label: "記録", icon: "📋" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50" style={{ backgroundColor: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", borderTop: "1px solid var(--border)" }}>
      <div className="max-w-lg mx-auto flex">
        {tabs.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center relative py-2.5 transition-colors"
              style={{ color: isActive ? "var(--accent)" : "var(--warm-gray-400)" }}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full" style={{ backgroundColor: "var(--accent)" }} />
              )}
              <span className="text-[17px] leading-none">{tab.icon}</span>
              <span className={`text-[10px] mt-1 tracking-wide ${isActive ? "font-medium" : "font-light"}`}>
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
