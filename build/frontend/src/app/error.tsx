"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("Home");
  return (
    <main className="state-page">
      <h1>{t("errorTitle")}</h1>
      <p role="alert">{t("errorText")}</p>
      <Button onClick={reset}>{t("retry")}</Button>
    </main>
  );
}
