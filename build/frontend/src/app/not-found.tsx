import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
export default async function NotFound() {
  const t = await getTranslations("Home");
  return (
    <main className="state-page">
      <h1>{t("missingTitle")}</h1>
      <p>{t("missingText")}</p>
      <Button asChild>
        <a href="/">{t("home")}</a>
      </Button>
    </main>
  );
}
