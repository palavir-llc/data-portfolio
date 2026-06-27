"use client";

import { useEffect, useRef, useState } from "react";

interface Overview {
  median_earn_5yr: number;
  median_debt: number;
  n_majors: number;
  n_occupations: number;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

/**
 * A compact scrollytelling intro: a sticky panel cycles through the four questions the
 * story answers as the reader scrolls past four steps. Uses IntersectionObserver, no
 * scrollytelling library.
 */
export function Narrative() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    fetch("/data/degree/national_overview.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setOv)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = Number((e.target as HTMLElement).dataset.step);
            if (!Number.isNaN(i)) setActive(i);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  const steps = [
    {
      q: "Where does it lead?",
      body: `A major isn't a job; it's a spray of them. We trace each of ${ov?.n_majors ?? 226} fields to the ${ov?.n_occupations ?? 800}+ occupations its graduates actually enter.`,
      stat: `${ov?.n_majors ?? 226} majors`,
      sub: "→ the jobs they become",
      color: "from-purple-400 to-fuchsia-400",
    },
    {
      q: "What does it pay?",
      body: "Five years out, against the debt it took to get there. Some degrees pay it back in two years; some never quite do.",
      stat: ov ? fmt(ov.median_earn_5yr) : "$58,298",
      sub: ov ? `median 5-yr pay · ${fmt(ov.median_debt)} debt` : "median 5-yr pay",
      color: "from-emerald-400 to-teal-400",
    },
    {
      q: "Will AI come for it?",
      body: "How much of the day-to-day could a language model already do? The uncomfortable answer: the best-paid fields are often the most exposed.",
      stat: "12 fields",
      sub: "well-paid AND in the AI danger zone",
      color: "from-rose-400 to-orange-400",
    },
    {
      q: "Can you afford the life?",
      body: "A six-figure salary in one city is a stretch in another. We put the paycheck against the rent, metro by metro.",
      stat: "379 metros",
      sub: "pay vs. rent, your 30% rule",
      color: "from-sky-400 to-indigo-400",
    },
  ];

  const a = steps[active];

  return (
    <section className="relative mx-auto max-w-5xl px-5">
      <div className="grid gap-8 md:grid-cols-2">
        {/* sticky panel */}
        <div className="top-0 hidden h-screen flex-col justify-center md:sticky md:flex">
          <div
            className={`bg-gradient-to-r ${a.color} bg-clip-text text-6xl font-bold leading-tight text-transparent transition-all duration-500`}
          >
            {a.stat}
          </div>
          <div className="mt-2 text-lg text-neutral-400">{a.sub}</div>
          <div className="mt-8 flex gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 w-10 rounded-full transition-colors ${i === active ? "bg-purple-400" : "bg-neutral-700"}`}
              />
            ))}
          </div>
        </div>

        {/* scroll steps */}
        <div>
          {steps.map((s, i) => (
            <div
              key={i}
              data-step={i}
              ref={(el) => {
                stepRefs.current[i] = el;
              }}
              className="flex flex-col justify-center py-10 md:min-h-screen md:py-16"
            >
              <h2 className="text-3xl font-bold text-neutral-100 sm:text-4xl">{s.q}</h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-neutral-400">{s.body}</p>
              {/* mobile inline stat (sticky panel is hidden on small screens) */}
              <div className={`mt-6 bg-gradient-to-r ${s.color} bg-clip-text text-4xl font-bold text-transparent md:hidden`}>
                {s.stat}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
