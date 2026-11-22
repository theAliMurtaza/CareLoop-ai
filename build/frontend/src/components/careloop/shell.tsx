"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Infinity as Loop,
  LayoutDashboard,
  FileText,
  ChartNoAxesCombined,
  Pill,
  Bell,
  Stethoscope,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LanguageSwitch } from "@/components/language-switch";
import { DoctorNote, Loading, useCopy } from "./shared";
export function AppShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const c = useCopy();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  if (loading || !user) return <Loading />;
  const links = [
    {
      href: "/dashboard",
      Icon: LayoutDashboard,
      label: c("Overview", "جائزہ"),
    },
    { href: "/reports", Icon: FileText, label: c("My reports", "میری رپورٹس") },
    {
      href: "/trends",
      Icon: ChartNoAxesCombined,
      label: c("Trends", "رجحانات"),
    },
    { href: "/medications", Icon: Pill, label: c("Medications", "ادویات") },
    { href: "/reminders", Icon: Bell, label: c("Reminders", "یاد دہانیاں") },
    ...(user.role !== "patient"
      ? [
          {
            href: "/clinic",
            Icon: Stethoscope,
            label: c("Clinic review", "کلینک کا جائزہ"),
          },
        ]
      : []),
  ];
  return (
    <div className="cl-app">
      <a href="#main" className="cl-skip">
        {c("Skip to content", "مواد پر جائیں")}
      </a>
      <aside className="cl-sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Loop aria-hidden="true" />
          </span>
          <span>
            <b>CareLoop</b>
            <small>
              {c("Your connected care space", "آپ کی دیکھ بھال کی جگہ")}
            </small>
          </span>
        </Link>
        <p className="cl-nav-label">{c("YOUR CARE", "آپ کی دیکھ بھال")}</p>
        <nav aria-label={c("Main navigation", "مرکزی راستے")}>
          {links.map(({ href, Icon, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="cl-sidebar-note">
          <ShieldCheck aria-hidden="true" />
          <strong>{c("Synthetic data only", "صرف فرضی ڈیٹا")}</strong>
          <p>
            {c(
              "A space to explore CareLoop safely. No real patient records.",
              "CareLoop کو آزمانے کی جگہ۔ حقیقی مریضوں کی معلومات استعمال نہ کریں۔",
            )}
          </p>
        </div>
      </aside>
      <div className="cl-workspace">
        <header className="cl-topbar">
          <div className="cl-greeting">
            <span className="cl-avatar">
              {profile?.displayName.slice(0, 1) ?? "C"}
            </span>
            <div>
              <strong>{profile?.displayName ?? "CareLoop"}</strong>
              <small>
                {user.role === "patient"
                  ? c("Patient workspace", "مریض کی جگہ")
                  : c("Clinic workspace", "کلینک کی جگہ")}
              </small>
            </div>
          </div>
          <LanguageSwitch />
          <button
            className="cl-icon-btn"
            type="button"
            aria-label={c("Sign out", "سائن آؤٹ")}
            onClick={() => void logout().then(() => router.push("/login"))}
          >
            <LogOut size={20} />
          </button>
        </header>
        <main className="cl-main" id="main">
          {children}
          <DoctorNote />
        </main>
      </div>
    </div>
  );
}
