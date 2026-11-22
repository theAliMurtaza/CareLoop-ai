import { getTranslations } from "next-intl/server";
import {
  Infinity as Loop,
  FileText,
  Languages,
  HeartHandshake,
  ShieldCheck,
  Stethoscope,
  Clock3,
  Plus,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { LanguageSwitch } from "@/components/language-switch";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const t = await getTranslations("Home");
  const steps = [
    { Icon: FileText, title: "stepUpload", description: "stepUploadText" },
    {
      Icon: Languages,
      title: "stepUnderstand",
      description: "stepUnderstandText",
    },
    {
      Icon: HeartHandshake,
      title: "stepConnect",
      description: "stepConnectText",
    },
  ] as const;
  return (
    <>
      <a href="#main" className="skip-link">
        {t("skip")}
      </a>
      <header className="site-header">
        <a href="#" className="brand" aria-label="CareLoop">
          <span className="brand-mark">
            <Loop aria-hidden="true" />
          </span>
          <span>
            <b dir="ltr">CareLoop</b>
            <small>{t("tagline")}</small>
          </span>
        </a>
        <nav className="desktop-nav" aria-label={t("navHow")}>
          <a href="#how">{t("navHow")}</a>
          <a href="#promise">{t("navPromise")}</a>
        </nav>
        <a className="text-link" href="/login">
          {t("signIn")}
        </a>
        <LanguageSwitch />
      </header>
      <main id="main">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <span className="pill">
              <Sparkles size={15} aria-hidden="true" />
              {t("prototype")}
            </span>
            <p className="eyebrow">{t("eyebrow")}</p>
            <h1>
              {t("title")}
              <span>{t("titleAccent")}</span>
            </h1>
            <p className="hero-intro">{t("intro")}</p>
            <div className="hero-actions">
              <Button asChild>
                <a href="/register">{t("primary")}</a>
              </Button>
              <a className="text-link" href="#how">
                {t("secondary")}
              </a>
            </div>
            <p className="language-note">
              <Languages size={18} aria-hidden="true" />
              {t("languageNote")}
            </p>
          </div>
          <div className="companion-scene" id="companion">
            <div className="scene-orbit" aria-hidden="true" />
            <Plus className="scene-plus" aria-hidden="true" />
            <div className="companion-heading">
              <span className="brand-mark">
                <Loop aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">{t("companion")}</p>
                <p>{t("greeting")}</p>
              </div>
            </div>
            <article className="report-card" aria-label={t("sample")}>
              <div className="report-top">
                <div className="report-icon">
                  <FileText aria-hidden="true" />
                </div>
                <span className="review-badge">
                  <Clock3 size={14} aria-hidden="true" />
                  {t("review")}
                </span>
              </div>
              <h2>{t("reportName")}</h2>
              <p className="sample-label">{t("sampleLabel")}</p>
              <div className="document-lines" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="explanation">
                <h3>
                  <Sparkles size={17} aria-hidden="true" />
                  {t("whatMeans")}
                </h3>
                <p>{t("explanation")}</p>
              </div>
              <details className="doctor-question">
                <summary>
                  {t("doctor")}
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <p>{t("question")}</p>
              </details>
            </article>
            <div className="care-team">
              <span>
                <Stethoscope aria-hidden="true" />
              </span>
              <div>
                <strong>{t("human")}</strong>
                <p>{t("humanDetail")}</p>
              </div>
            </div>
          </div>
        </section>
        <section id="how" className="how-section section-wrap">
          <div className="section-intro">
            <div>
              <p className="eyebrow">{t("howLabel")}</p>
              <h2>{t("howTitle")}</h2>
            </div>
            <p>{t("howIntro")}</p>
          </div>
          <div className="steps">
            {steps.map(({ Icon, title, description }) => (
              <article key={title}>
                <span className="step-icon">
                  <Icon aria-hidden="true" />
                </span>
                <h3>{t(title)}</h3>
                <p>{t(description)}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="promise" className="promise section-wrap">
          <div>
            <p className="eyebrow">{t("promiseLabel")}</p>
            <h2>{t("promiseTitle")}</h2>
            <p>{t("promiseText")}</p>
          </div>
          <aside>
            <ShieldCheck size={30} aria-hidden="true" />
            <h3>{t("privacy")}</h3>
            <p>{t("privacyText")}</p>
          </aside>
        </section>
        <section className="phase-note section-wrap">
          <span className="phase-icon">
            <Loop aria-hidden="true" />
          </span>
          <div>
            <h2>{t("stage")}</h2>
            <p>{t("stageText")}</p>
          </div>
        </section>
      </main>
      <footer className="section-wrap">
        <div className="medical-notice">
          <ShieldCheck aria-hidden="true" />
          <p>{t("notice")}</p>
        </div>
        <div className="footer-bottom">
          <b dir="ltr">CareLoop</b>
          <span>{t("footer")}</span>
        </div>
      </footer>
    </>
  );
}
