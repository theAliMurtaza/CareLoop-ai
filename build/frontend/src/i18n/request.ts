import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import en from "../../messages/en.json";
import ur from "../../messages/ur.json";
export default getRequestConfig(async () => {
  const locale =
    (await cookies()).get("careloop-locale")?.value === "ur" ? "ur" : "en";
  return {
    locale,
    messages: locale === "ur" ? ur : en,
    timeZone: "Asia/Karachi",
  };
});
