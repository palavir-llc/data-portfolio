/* eslint-disable @typescript-eslint/no-explicit-any */
import { promises as fs } from "fs";
import path from "path";

export interface MajorPage {
  slug: string;
  cip4: string;
  title: string;
  earn_5yr: number | null;
  earn_1yr: number | null;
  debt: number | null;
  payoff_yrs: number | null;
  ai_beta: number | null;
  adjusted_premium: number | null;
  top_occupation: string | null;
  n_programs: number;
  n_schools: number;
  gender_gap_pct: number | null;
  earn_male: number | null;
  earn_female: number | null;
  ge_fail_rate: number | null;
  net_price: number | null;
  job_growth_pct: number | null;
  outlook_vintage: string | null;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

let cache: MajorPage[] | null = null;

async function readJson(name: string): Promise<any> {
  const p = path.join(process.cwd(), "public", "data", "degree", name);
  return JSON.parse(await fs.readFile(p, "utf-8"));
}

export async function getMajors(): Promise<MajorPage[]> {
  if (cache) return cache;
  const [land, out, outlook] = await Promise.all([
    readJson("major_landscape.json"),
    readJson("major_outcomes.json").catch(() => ({ majors: [] })),
    readJson("job_outlook.json").catch(() => ({ by_cip: {}, vintage: null })),
  ]);
  const outByCip: Record<string, any> = Object.fromEntries(
    (out.majors ?? []).map((m: any) => [m.cip4, m]),
  );
  const olByCip: Record<string, any> = outlook.by_cip ?? {};
  const seen = new Set<string>();
  cache = (land.majors as any[]).map((m) => {
    // prefer the pipeline-generated slug (single source of truth); fall back if absent
    let slug = m.slug as string | undefined;
    if (!slug) {
      slug = slugify(m.title);
      if (!slug || seen.has(slug)) slug = `${slug}-${m.cip4.replace(".", "")}`;
    }
    seen.add(slug);
    const o = outByCip[m.cip4] ?? {};
    return {
      slug,
      cip4: m.cip4,
      title: m.title,
      earn_5yr: m.earn_5yr ?? null,
      earn_1yr: m.earn_1yr ?? null,
      debt: m.debt ?? null,
      payoff_yrs: m.payoff_yrs ?? null,
      ai_beta: m.ai_beta ?? null,
      adjusted_premium: m.adjusted_premium ?? null,
      top_occupation: m.top_occupation ?? null,
      n_programs: m.n_programs ?? 0,
      n_schools: m.n_schools ?? 0,
      gender_gap_pct: o.gender_gap_pct ?? null,
      earn_male: o.earn_male ?? null,
      earn_female: o.earn_female ?? null,
      ge_fail_rate: o.ge_fail_rate ?? null,
      net_price: o.net_price ?? null,
      job_growth_pct:
        (olByCip[m.cip4]?.coverage ?? 0) >= 0.5 ? olByCip[m.cip4]?.growth_wt ?? null : null,
      outlook_vintage: outlook.vintage ?? null,
    };
  });
  return cache;
}

export async function getMajorBySlug(slug: string): Promise<MajorPage | null> {
  const majors = await getMajors();
  return majors.find((m) => m.slug === slug) ?? null;
}
