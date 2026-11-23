"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Infinity as Loop,
  ShieldCheck,
  HeartHandshake,
  Check,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { LanguageSwitch } from "@/components/language-switch";
import { api } from "@/lib/api";
import { DoctorNote, ErrorState, useCopy } from "./shared";
export function AuthScreen({ register = false }: { register?: boolean }) {
  const auth = useAuth(),
    router = useRouter(),
    c = useCopy();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (register) {
        await auth.register(email, password, name);
        router.push("/onboarding");
      } else {
        await auth.login(email, password);
        router.push("/dashboard");
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Loop />
          </span>
          <b>CareLoop</b>
        </Link>
        <LanguageSwitch />
      </header>
      <main className="cl-auth">
        <section>
          <p className="eyebrow">
            {c(
              "YOUR CARE STARTS WITH CLARITY",
              "بہتر سمجھ سے دیکھ بھال کا آغاز",
            )}
          </p>
          <h1>
            {register
              ? c("A little clarity, together.", "آئیں مل کر بہتر سمجھیں۔")
              : c("Welcome back.", "دوبارہ خوش آمدید۔")}
          </h1>
          <p className="cl-muted">
            {c(
              "Explore your synthetic reports and stay connected to your care team.",
              "اپنی فرضی رپورٹس دیکھیں اور طبی ٹیم سے جڑے رہیں۔",
            )}
          </p>
          <form onSubmit={(event) => void submit(event)} className="cl-form">
            {register && (
              <label>
                {c("Full name", "پورا نام")}
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              {c("Email address", "ای میل")}
              <input
                dir="ltr"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoComplete="username"
              />
            </label>
            <label>
              {c("Password", "پاس ورڈ")}
              <input
                type="password"
                required
                minLength={register ? 12 : 8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            {register && (
              <label className="cl-checkbox">
                <input type="checkbox" required />
                {c(
                  "I agree to CareLoop's terms of service and patient privacy policy.",
                  "میں CareLoop کی شرائط اور مریض کی رازداری کی پالیسی سے متفق ہوں۔",
                )}
              </label>
            )}
            {error !== null && <ErrorState error={error} />}
            <button className="cl-btn" disabled={busy}>
              {busy
                ? c("Please wait…", "انتظار کریں…")
                : register
                  ? c("Create account", "اکاؤنٹ بنائیں")
                  : c("Sign in", "سائن ان")}
            </button>
          </form>
          <p className="cl-auth-switch">
            {register
              ? c("Already have an account?", "اکاؤنٹ موجود ہے؟")
              : c("New to CareLoop?", "CareLoop پر نئے ہیں؟")}{" "}
            <Link href={register ? "/login" : "/register"}>
              {register
                ? c("Sign in", "سائن ان")
                : c("Create an account", "اکاؤنٹ بنائیں")}
            </Link>
          </p>
          <DoctorNote />
        </section>
        <aside>
          <HeartHandshake size={42} />
          <h2>
            {c("Understanding, in your language.", "اپنی زبان میں سمجھیں۔")}
          </h2>
          <p>
            {c(
              "A calmer way to prepare for your next conversation with your doctor.",
              "ڈاکٹر سے اگلی گفتگو کی تیاری کا پرسکون طریقہ۔",
            )}
          </p>
          {[
            c("Plain English and Urdu", "آسان انگریزی اور اردو"),
            c("Reference ranges with clear labels", "واضح حوالہ جاتی حدود"),
            c(
              "Human review stays central",
              "انسانی جائزہ بنیادی حیثیت رکھتا ہے",
            ),
          ].map((item) => (
            <p className="cl-auth-benefit" key={item}>
              <Check size={19} />
              {item}
            </p>
          ))}
          <div className="cl-notice">
            <ShieldCheck />
            <p>
              {c(
                "This is a synthetic-data demonstration. It is not a clinical service.",
                "یہ فرضی ڈیٹا کا نمونہ ہے، طبی خدمت نہیں۔",
              )}
            </p>
          </div>
        </aside>
      </main>
    </>
  );
}
export function Onboarding() {
  const { profile, reloadProfile } = useAuth(),
    router = useRouter(),
    c = useCopy();
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [age, setAge] = useState(profile?.age ?? 35),
    [sex, setSex] = useState<"female" | "male" | "unspecified">(
      profile?.sex ?? "unspecified",
    ),
    [locale, setLocale] = useState<"en" | "ur">(profile?.locale ?? "en"),
    [name, setName] = useState(profile?.displayName ?? ""),
    [zone, setZone] = useState(profile?.timezone ?? "Asia/Karachi");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await api("/profile", {
        method: "PUT",
        body: JSON.stringify({
          displayName: name,
          age,
          sex,
          locale,
          timezone: zone,
        }),
      });
      document.cookie = `careloop-locale=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
      await reloadProfile();
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="cl-onboarding cl-card">
      <p className="eyebrow">
        {c("MAKE YOURSELF AT HOME", "اپنی جگہ تیار کریں")}
      </p>
      <h1>{c("Let’s set up your care space.", "آئیں آپ کی جگہ تیار کریں۔")}</h1>
      <ol className="cl-stepper">
        {[
          c("Profile", "پروفائل"),
          c("Language", "زبان"),
          c("Ready", "تیار"),
        ].map((label, i) => (
          <li
            key={label}
            aria-current={step === i + 1 ? "step" : undefined}
            className={step >= i + 1 ? "complete" : ""}
          >
            <span>{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <form className="cl-form" onSubmit={(e) => void submit(e)}>
        {step === 1 && (
          <>
            <label>
              {c("Fictional display name", "فرضی نام")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <label>
              {c("Synthetic age (adult demo)", "فرضی عمر (بالغ نمونہ)")}
              <input
                type="number"
                min={18}
                max={120}
                value={age}
                onChange={(e) => setAge(Number(e.target.value))}
                required
              />
            </label>
            <label>
              {c("Reference-range sex context", "حوالہ جاتی حدود کے لیے جنس")}
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value as typeof sex)}
              >
                <option value="unspecified">
                  {c("Not specified", "درج نہیں")}
                </option>
                <option value="female">{c("Female", "خاتون")}</option>
                <option value="male">{c("Male", "مرد")}</option>
              </select>
            </label>
          </>
        )}
        {step === 2 && (
          <>
            <label>
              {c("Explanation language", "وضاحت کی زبان")}
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value as typeof locale)}
              >
                <option value="en">English</option>
                <option value="ur">اردو</option>
              </select>
            </label>
            <label>
              {c("Timezone", "ٹائم زون")}
              <input
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                required
                placeholder="Asia/Karachi"
              />
            </label>
          </>
        )}
        {step === 3 && (
          <div className="cl-notice">
            <ShieldCheck />
            <p>
              {c(
                "Your profile is ready. Upload only synthetic reports. Medication records must reflect instructions you already received from a clinician; CareLoop will not create a prescription.",
                "آپ کی پروفائل تیار ہے۔ صرف فرضی رپورٹس اپ لوڈ کریں۔ ادویات میں صرف ڈاکٹر کی پہلے سے دی ہوئی ہدایات درج کریں؛ CareLoop نسخہ نہیں بنائے گا۔",
              )}
            </p>
          </div>
        )}
        {error !== null && <ErrorState error={error} />}
        <div className="cl-actions">
          {step > 1 && (
            <button
              className="cl-btn cl-secondary"
              type="button"
              onClick={() => setStep(step - 1)}
            >
              {c("Back", "واپس")}
            </button>
          )}
          <button className="cl-btn" disabled={busy}>
            {step === 3
              ? c("Open my dashboard", "میرا ڈیش بورڈ کھولیں")
              : c("Continue", "جاری رکھیں")}
          </button>
        </div>
      </form>
    </div>
  );
}
