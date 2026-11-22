"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
export function LanguageSwitch() {
  const locale = useLocale();
  const t = useTranslations("Home");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t("language")}
      aria-busy={pending}
    >
      {(["en", "ur"] as const).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={locale === value}
          disabled={pending}
          onClick={() => {
            document.cookie = `careloop-locale=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
            startTransition(() => router.refresh());
          }}
        >
          {value === "en" ? "English" : "اردو"}
        </button>
      ))}
    </div>
  );
}
