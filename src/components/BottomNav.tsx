"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "ホーム", icon: "🏠" },
  { href: "/record", label: "記録", icon: "＋" },
  { href: "/analysis", label: "分析", icon: "📊" },
  { href: "/settings", label: "設定", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="max-w-lg mx-auto flex">
        {tabs.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center py-2 text-xs transition ${
                isActive ? "text-emerald-600 font-bold" : "text-gray-400"
              }`}
            >
              <span className={`text-xl ${tab.icon === "＋" ? "bg-emerald-600 text-white rounded-full w-10 h-10 flex items-center justify-center text-2xl -mt-4 shadow-lg" : ""}`}>
                {tab.icon}
              </span>
              <span className={tab.icon === "＋" ? "mt-0.5" : "mt-0.5"}>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
