import { HeaderBlob, KICKER, MarketingPage, WRAP } from "./marketing-chrome";

/**
 * Public journal page. Static placeholder content until a real content source
 * exists — the category chips are presentational and the post cards are not
 * links because there are no post detail pages yet. The newsletter form is
 * UI-only for the same reason.
 */

const CATEGORIES = [
  "All",
  "Mental health",
  "Addiction medicine",
  "Holistic care",
  "Practice news",
] as const;

const TAG = "self-start rounded-full px-2.5 py-0.5 text-[11px]";
const TAG_STYLES: Record<string, string> = {
  "Mental health": "bg-clay-100 text-clay-800",
  "Addiction medicine": "bg-sage-100 text-sage-800",
};
const TAG_NEUTRAL = "bg-sand-deep text-ink/80";

const POSTS: ReadonlyArray<{
  category: string;
  title: string;
  excerpt: string;
  author: string;
  read: string;
}> = [
  {
    category: "Mental health",
    title: "Understanding treatment-resistant depression",
    excerpt:
      "What it means when antidepressants haven't worked — and the options that may help.",
    author: "Dr. [Owner Name]",
    read: "5 min",
  },
  {
    category: "Addiction medicine",
    title: "MAT, explained without the stigma",
    excerpt:
      "How medication-assisted treatment supports recovery from opioid and alcohol use.",
    author: "[Team Provider]",
    read: "7 min",
  },
  {
    category: "Holistic care",
    title: "Sleep is a mental health intervention",
    excerpt:
      "Small, evidence-based changes to sleep that can meaningfully shift mood.",
    author: "[Team Provider]",
    read: "4 min",
  },
  {
    category: "Mental health",
    title: "What to expect from ketamine therapy",
    excerpt: "A plain-language walk-through of candidacy, sessions and safety.",
    author: "Dr. [Owner Name]",
    read: "6 min",
  },
  {
    category: "Holistic care",
    title: "The gut, hormones and your mood",
    excerpt: "Why an integrative evaluation looks well beyond the brain.",
    author: "[Team Provider]",
    read: "5 min",
  },
  {
    category: "Practice news",
    title: "Expanding our services, responsibly",
    excerpt:
      "A look at what's coming — Spravato, peptides and hyperbaric oxygen therapy.",
    author: "Canyon Creek Team",
    read: "3 min",
  },
];

/** Sage-tinted stand-in until real post imagery exists. */
function ImagePlaceholder({ className }: { className: string }) {
  return <div aria-hidden="true" className={`bg-sage-200 ${className}`} />;
}

function Byline({ author, read }: { author: string; read: string }) {
  return (
    <div className="mt-0.5 flex items-center gap-2 text-[12.5px] text-ink/60">
      <span>{author}</span>
      <span>·</span>
      <span>{read} read</span>
    </div>
  );
}

export default function BlogPage() {
  return (
    <MarketingPage>
      <header className="relative">
        <HeaderBlob size={400} />
        <div className={`${WRAP} relative z-10 pt-14 pb-9`}>
          <span className={`${KICKER} mb-4`}>Journal</span>
          <h1 className="m-0 max-w-[16ch] font-display text-[clamp(38px,5vw,64px)] leading-[1.05] tracking-[-0.01em]">
            Notes on mind, body &amp; recovery
          </h1>
          <p className="mt-5.5 mb-0 max-w-[56ch] text-[17px] leading-[1.65] text-ink/80">
            Evidence-based perspectives on mental health, addiction medicine and
            whole-person wellness from our team.
          </p>
        </div>
      </header>

      <div className={`${WRAP} pb-7`}>
        <div className="flex flex-wrap gap-2.5">
          {CATEGORIES.map((c) => (
            <span
              key={c}
              className={`rounded-full px-3.5 py-1.5 text-[11px] ${
                c === "All" ? "bg-clay-100 text-clay-800" : TAG_NEUTRAL
              }`}
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* Featured post */}
      <section className={`${WRAP} pb-11`}>
        <article className="grid items-center gap-[clamp(24px,4vw,48px)] overflow-hidden rounded-organic bg-sand-deep md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <ImagePlaceholder className="h-full min-h-[300px] w-full" />
          <div className="p-[clamp(24px,3vw,44px)] md:pl-0">
            <span className={`${TAG} inline-flex bg-clay-100 text-clay-800`}>
              Featured · Mental health
            </span>
            <h2 className="mt-3.5 mb-3 font-display text-[clamp(24px,2.8vw,34px)] leading-[1.15]">
              Why treating the whole person changes outcomes
            </h2>
            <p className="m-0 mb-4 max-w-[46ch] text-[15px] leading-[1.65] text-ink/80">
              Sleep, nutrition, hormones and trauma all shape mental health.
              Here's how an integrative evaluation uncovers what a symptom
              checklist can miss.
            </p>
            <div className="flex items-center gap-2.5 text-[13px] text-ink/60">
              <span className="inline-block size-7 rounded-full bg-sage-200" />
              <span>Dr. [Owner Name]</span>
              <span>·</span>
              <span>6 min read</span>
            </div>
          </div>
        </article>
      </section>

      {/* Post grid */}
      <section className={`${WRAP} pb-16`}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6.5">
          {POSTS.map((post) => (
            <article key={post.title} className="flex flex-col gap-3.5">
              <ImagePlaceholder className="aspect-[16/10] w-full rounded-organic shadow-organic-sm" />
              <span
                className={`${TAG} ${TAG_STYLES[post.category] ?? TAG_NEUTRAL}`}
              >
                {post.category}
              </span>
              <h3 className="m-0 font-display text-[21px] leading-[1.2]">
                {post.title}
              </h3>
              <p className="m-0 text-sm leading-[1.6] text-ink/80">
                {post.excerpt}
              </p>
              <Byline author={post.author} read={post.read} />
            </article>
          ))}
        </div>
      </section>

      {/* Newsletter */}
      <section className={`${WRAP} pb-18`}>
        <div className="rounded-organic bg-sage-100 p-[clamp(32px,4vw,52px)]">
          <h2 className="m-0 mb-2.5 max-w-[22ch] font-display text-[clamp(24px,2.6vw,32px)]">
            Get thoughtful health writing in your inbox
          </h2>
          <p className="mt-0 mb-5.5 max-w-[48ch] text-[15.5px] text-ink/80">
            Occasional notes from our clinicians. No spam — unsubscribe any
            time.
          </p>
          <div className="flex max-w-[460px] flex-wrap gap-3">
            <label htmlFor="newsletter-email" className="sr-only">
              Email address
            </label>
            <input
              id="newsletter-email"
              type="email"
              placeholder="you@example.com"
              className="min-w-[200px] flex-1 rounded-full border border-ink/15 bg-sand px-3.5 py-2 text-sm text-ink caret-clay hover:border-ink/45 focus-visible:border-clay focus-visible:outline-none"
            />
            <button
              type="button"
              className="cursor-pointer rounded-full bg-clay px-5.5 py-2.5 font-display text-sm text-sand hover:bg-clay-600"
            >
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </MarketingPage>
  );
}
