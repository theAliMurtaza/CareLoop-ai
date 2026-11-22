import { getTranslations } from "next-intl/server";
export default async function Loading() {
  const t = await getTranslations("Home");
  return (
    <main className="state-page" aria-busy="true">
      <p role="status">{t("loading")}</p>
      <div className="skeleton" aria-hidden="true" />
    </main>
  );
}
