import { Link } from "react-router";
import { CTA_PRIMARY, KICKER, MarketingPage, WRAP } from "./marketing-chrome";

// Placeholder copy in [brackets] awaits real names, bios, and portraits from
// the practice.
const VALUES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Evidence-based",
    body: "Grounded in current medical research and careful clinical judgment.",
  },
  {
    title: "Holistic",
    body: "The whole person — mind, body, and lifestyle.",
  },
  {
    title: "Compassionate",
    body: "Dignity and patience, never judgment.",
  },
  {
    title: "Responsible",
    body: "We grow our services carefully and safely.",
  },
];

const TEAM: ReadonlyArray<{ name: string; role: string; bio: string }> = [
  {
    name: "[Team Member]",
    role: "Mental Health Provider",
    bio: "[Placeholder] Add a short bio, focus areas, and credentials.",
  },
  {
    name: "[Team Member]",
    role: "Addiction Medicine",
    bio: "[Placeholder] Add a short bio, focus areas, and credentials.",
  },
  {
    name: "[Team Member]",
    role: "Nurse / Clinical Staff",
    bio: "[Placeholder] Add a short bio, focus areas, and credentials.",
  },
  {
    name: "[Team Member]",
    role: "Patient Coordinator",
    bio: "[Placeholder] Add a short bio, focus areas, and credentials.",
  },
];

export default function AboutPage() {
  return (
    <MarketingPage>
      <header className="relative">
        <div className={`${WRAP} relative z-10 pt-14 pb-10`}>
          <span className={`${KICKER} mb-4`}>About us</span>
          <h1 className="m-0 max-w-[17ch] font-display text-[clamp(38px,5vw,64px)] leading-[1.05] tracking-[-0.01em]">
            A modern practice built around the whole person
          </h1>
          <p className="mt-5.5 mb-0 max-w-[58ch] text-[17px] leading-[1.65] text-ink/80">
            We bridge traditional medicine with innovative, evidence-based
            therapies — treating the causes of illness, not simply its symptoms.
          </p>
        </div>
      </header>

      <section id="company" className={`${WRAP} scroll-mt-6 pt-8 pb-6`}>
        <div className="grid grid-cols-1 items-start gap-[clamp(28px,5vw,72px)] md:grid-cols-2">
          <div>
            <span className={`${KICKER} mb-3`}>Our practice</span>
            <h2 className="m-0 mb-4.5 font-display text-[clamp(28px,3.2vw,40px)] leading-[1.1]">
              Whole-person medicine
            </h2>
            <p className="mt-0 mb-3.5 text-base leading-[1.75] text-ink/85">
              Our practice is an outpatient medical clinic focused on treating
              the whole person rather than simply managing symptoms. We combine
              evidence-based mental health care, addiction medicine, medication
              management and holistic health services to help patients achieve
              long-term mental and physical wellness.
            </p>
            <p className="m-0 text-base leading-[1.75] text-ink/85">
              Our philosophy recognizes that mental health is influenced by many
              interconnected factors — brain chemistry, physical health,
              nutrition, sleep, hormones, trauma, lifestyle and environment.
              Instead of relying solely on medication, we develop comprehensive
              plans across the biological, psychological and lifestyle factors
              affecting each patient's health.
            </p>
          </div>
          <div className="flex flex-col gap-4">
            <div className="rounded-card bg-teal-tint px-7 py-6.5">
              <h3 className="m-0 mb-2 font-display text-[20px]">Our vision</h3>
              <p className="m-0 text-[14.5px] leading-[1.7] text-ink/85">
                To become a comprehensive center for behavioral health and
                regenerative medicine — expanding our services responsibly while
                staying committed to compassionate, patient-centered,
                scientifically informed care.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              {VALUES.map((value) => (
                <div
                  key={value.title}
                  className="rounded-2xl bg-surface px-5 py-4.5"
                >
                  <h4 className="m-0 mb-1 font-display text-[16px]">
                    {value.title}
                  </h4>
                  <p className="m-0 text-[13px] leading-[1.55] text-ink/75">
                    {value.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="owner" className="mt-10 scroll-mt-6 bg-surface">
        <div
          className={`${WRAP} grid grid-cols-1 items-center gap-[clamp(28px,5vw,64px)] py-14 md:grid-cols-[340px_minmax(0,1fr)]`}
        >
          <div
            aria-hidden="true"
            className="aspect-[4/5] rounded-card bg-ground shadow-card-raised"
          />
          <div>
            <span className={`${KICKER} mb-3`}>Meet the founder</span>
            <h2 className="m-0 mb-1 font-display text-[clamp(26px,3vw,38px)]">
              Dr. [Owner Name]
            </h2>
            <p className="mt-0 mb-4.5 text-[15px] font-semibold text-primary-deep">
              Founder & Medical Director
            </p>
            <p className="mt-0 mb-3.5 text-base leading-[1.75] text-ink/85">
              [Placeholder bio] Dr. [Owner Name] founded the practice with a
              conviction that mental health care should treat the whole person.
              A medical practitioner with additional training in mental health
              and addiction medicine, they blend evidence-based treatment with a
              holistic view of health.
            </p>
            <p className="m-0 text-base leading-[1.75] text-ink/85">
              [Add credentials, background, and a personal note here.] Their
              goal is to build a practice where patients feel genuinely heard —
              and where innovative therapies are offered responsibly, grounded
              in current evidence.
            </p>
          </div>
        </div>
      </section>

      <section id="team" className={`${WRAP} scroll-mt-6 pt-16 pb-18`}>
        <span className={`${KICKER} mb-3`}>Our team</span>
        <h2 className="m-0 mb-2.5 font-display text-[clamp(28px,3.2vw,40px)]">
          The people behind your care
        </h2>
        <p className="mt-0 mb-9 max-w-[54ch] text-base leading-[1.65] text-ink/80">
          A collaborative team of clinicians and staff dedicated to
          compassionate, patient-centered care.
        </p>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-6 p-0">
          {TEAM.map((member) => (
            <li key={member.role} className="flex flex-col gap-3">
              <div
                aria-hidden="true"
                className="aspect-square rounded-card bg-surface shadow-card"
              />
              <div>
                <h3 className="m-0 font-display text-[19px]">{member.name}</h3>
                <p className="mt-0.5 mb-2 text-[13.5px] font-semibold text-primary-deep">
                  {member.role}
                </p>
                <p className="m-0 text-[13.5px] leading-[1.6] text-ink/75">
                  {member.bio}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${WRAP} pb-18`}>
        <div className="flex flex-wrap items-center justify-between gap-7 rounded-card bg-teal-tint p-[clamp(32px,4vw,56px)]">
          <div>
            <h2 className="m-0 mb-2 font-display text-[clamp(24px,2.6vw,32px)]">
              We'd love to care for you
            </h2>
            <p className="m-0 max-w-[48ch] text-[15.5px] text-ink/80">
              New patients are welcome. Book a comprehensive evaluation to get
              started.
            </p>
          </div>
          <Link to="/book" className={CTA_PRIMARY}>
            Book an appointment
          </Link>
        </div>
      </section>
    </MarketingPage>
  );
}
