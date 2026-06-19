"""
Phase 11 — empirical major -> occupation flows from ACS PUMS microdata.

The degree->occupation crosswalk elsewhere in this study is *modeled* (CIP->SOC weighted
by OEWS occupational employment). This step builds an **independent, empirical** view of
where graduates actually work, straight from Census ACS Public Use Microdata: among
people who hold a bachelor's degree in a given field (FOD1P) and are employed in an
occupation (OCCP), weighted by the person weight (PWGTP).

It serves two honest purposes and invents nothing:
  1. A real-data "where graduates actually work" layer per field of degree (top occupations
     by weighted share). Cells with too few sampled people are suppressed, never imputed.
  2. A validation of the modeled crosswalk: for fields we can match to a study major, does
     our modeled #1 destination occupation agree with the empirical #1? Reported as an
     overall agreement rate in the methodology.

Granularity is honest: ACS fields (FOD1P, ~170 fields) are coarser than the study's 226
CIP majors, so a field is matched to a major only on a confident name match; unmatched
majors simply get no ACS layer (null), never a fabricated one.

Data: U.S. Census Bureau, ACS 1-Year PUMS (person records) + the Census 2018 Occupation
Code List (OCCP->SOC). Public domain. Per-state files are streamed and deleted as we go,
so peak disk use stays tiny.
"""

import os
import re
import sys
import csv
import json
import zipfile
import requests
import pandas as pd

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RAW = os.path.join(ROOT, "data", "raw", "degree")
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36"}

YEAR = 2023
PUMS_BASE = f"https://www2.census.gov/programs-surveys/acs/data/pums/{YEAR}/1-Year"
STATES = [
    "al", "ak", "az", "ar", "ca", "co", "ct", "de", "dc", "fl", "ga", "hi", "id", "il",
    "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne",
    "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd",
    "tn", "tx", "ut", "vt", "va", "wa", "wv", "wi", "wy",
]

# suppression thresholds (unweighted sampled persons)
MIN_FIELD_N = 50      # a field must have this many sampled grads to publish flows
MIN_CELL_N = 10       # a field x occupation cell needs this many to be shown
TOP_K = 8

SOURCE = {
    "source_key": "acs_pums_flows",
    "name": "ACS PUMS empirical field-of-degree → occupation flows",
    "publisher": "U.S. Census Bureau, American Community Survey (1-Year PUMS)",
    "url": "https://www.census.gov/programs-surveys/acs/microdata.html",
    "vintage": f"{YEAR} (1-Year PUMS)",
    "license": "public domain",
    "attribution": "U.S. Census Bureau, American Community Survey Public Use Microdata "
                   "Sample; occupation mapping via the Census 2018 Occupation Code List.",
    "notes": "Empirical share of employed bachelor's-degree holders in each field (FOD1P) "
             "by occupation (OCCP->SOC), weighted by PWGTP. Cells from fewer than "
             f"{MIN_CELL_N} sampled persons are suppressed; fields under {MIN_FIELD_N} are "
             "omitted. An independent check on the modeled CIP->SOC crosswalk, not a "
             "replacement for it.",
}


def occp_to_soc():
    """OCCP (4-digit Census occ code) -> SOC6, from the Census 2018 Occupation Code List."""
    path = os.path.join(RAW, "occ_soc_xwalk.xlsx")
    df = pd.ExcelFile(path).parse("2018 Census Occ Code List", header=4)
    code_col = "2018 Census Code"
    soc_col = "2018 SOC Code"
    m = {}
    for code, soc in zip(df[code_col], df[soc_col]):
        c = str(code).strip()
        s = str(soc).strip()
        if not re.fullmatch(r"\d{4}", c):       # skip aggregate ranges / headers
            continue
        if not re.fullmatch(r"\d{2}-\d{4}", s):  # skip range SOCs like "11-0000 - 13-0000"
            continue
        m[c] = s
    return m


def soc_census_titles():
    """SOC6 -> readable title, from the Census 2018 Occupation Code List. Covers broad
    SOC groupings (e.g. 25-2020 'Elementary and middle school teachers') that the
    detailed occupations.json doesn't carry."""
    path = os.path.join(RAW, "occ_soc_xwalk.xlsx")
    df = pd.ExcelFile(path).parse("2018 Census Occ Code List", header=4)
    df.columns = [str(c).strip() for c in df.columns]
    out = {}
    for title, code, soc in zip(df["2018 Census Title"], df["2018 Census Code"], df["2018 SOC Code"]):
        s, c, t = str(soc).strip(), str(code).strip(), str(title).strip()
        if re.fullmatch(r"\d{2}-\d{4}", s) and re.fullmatch(r"\d{4}", c) and t and t != "nan":
            out.setdefault(s, t)
    return out


def fod_labels():
    """FOD1P code -> field label, from the PUMS data dictionary."""
    path = os.path.join(RAW, "pums_dict_2023.csv")
    out = {}
    with open(path, encoding="latin-1") as f:
        for row in csv.reader(f):
            if len(row) >= 7 and row[0] == "VAL" and row[1] == "FOD1P":
                code = row[4].strip()
                if re.fullmatch(r"\d{4}", code):
                    out[code] = row[6].strip()
    return out


def stream_state(postal, occ2soc, acc, nacc):
    """Download one state's person file, accumulate weighted + unweighted (FOD1P,SOC) counts."""
    url = f"{PUMS_BASE}/csv_p{postal}.zip"
    cache = os.path.join(RAW, f"csv_p{postal}.zip")
    try:
        r = requests.get(url, headers=HEADERS, timeout=240)
        if r.status_code != 200 or r.content[:2] != b"PK":
            print(f"  {postal}: HTTP {r.status_code}, skipped")
            return
        with open(cache, "wb") as fh:
            fh.write(r.content)
        with zipfile.ZipFile(cache) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".csv"))
            with z.open(name) as fh:
                reader = pd.read_csv(
                    fh, usecols=["FOD1P", "OCCP", "PWGTP"],
                    dtype={"FOD1P": "string", "OCCP": "string"},
                    chunksize=200_000,
                )
                rows = 0
                for chunk in reader:
                    chunk = chunk.dropna(subset=["FOD1P", "OCCP", "PWGTP"])
                    for fod, occp, w in zip(chunk["FOD1P"], chunk["OCCP"], chunk["PWGTP"]):
                        fod = str(fod).split(".")[0].zfill(4)
                        occp = str(occp).split(".")[0].zfill(4)
                        soc = occ2soc.get(occp)
                        if soc is None or not re.fullmatch(r"\d{4}", fod):
                            continue
                        try:
                            wt = float(w)
                        except (TypeError, ValueError):
                            continue
                        key = (fod, soc)
                        acc[key] = acc.get(key, 0.0) + wt
                        nacc[key] = nacc.get(key, 0) + 1
                        rows += 1
        print(f"  {postal}: {rows} grad-employed records")
    except Exception as e:
        print(f"  {postal}: ERROR {type(e).__name__}: {str(e)[:60]}")
    finally:
        if os.path.exists(cache):
            os.remove(cache)


def norm(s):
    s = re.sub(r"[^a-z0-9 ]", " ", str(s).lower())
    return re.sub(r"\s+", " ", s).strip()


def match_fields_to_majors(fields, majors):
    """Confident FOD1P->cip4 name matches only. Returns {cip4: fod1p}."""
    by_norm = {}
    for cip, title in majors.items():
        by_norm.setdefault(norm(title), cip)
    out = {}
    used = set()
    fnorms = {fod: norm(lab) for fod, lab in fields.items()}
    # exact normalized-name matches first
    for fod, fn in fnorms.items():
        if fn in by_norm and by_norm[fn] not in used:
            out[by_norm[fn]] = fod
            used.add(by_norm[fn])
    # then containment matches (one side fully contains the other), unambiguous only
    for fod, fn in fnorms.items():
        if fod in out.values():
            continue
        cands = [cip for nm, cip in by_norm.items()
                 if cip not in used and (fn and (fn in nm or nm in fn)) and abs(len(fn) - len(nm)) <= 6]
        if len(cands) == 1:
            out[cands[0]] = fod
            used.add(cands[0])
    return out


def main():
    if not os.path.exists(os.path.join(RAW, "occ_soc_xwalk.xlsx")):
        print("  Missing occ_soc_xwalk.xlsx (run downloads). Skipping.")
        return
    occ2soc = occp_to_soc()
    fields = fod_labels()
    print(f"OCCP->SOC entries: {len(occ2soc)} | FOD1P fields: {len(fields)}")

    acc, nacc = {}, {}
    print(f"Streaming {len(STATES)} state PUMS files ({YEAR} 1-Year)...")
    for st in STATES:
        stream_state(st, occ2soc, acc, nacc)

    # roll up per field
    soc_titles = soc_census_titles()  # readable fallback for broad SOC groupings
    occ_path = os.path.join(OUT, "occupations.json")
    if os.path.exists(occ_path):
        for o in json.load(open(occ_path, encoding="utf-8")):
            if o.get("soc_title"):
                soc_titles[o["soc6"]] = o["soc_title"]  # prefer the detailed study title

    by_field = {}
    for (fod, soc), wt in acc.items():
        f = by_field.setdefault(fod, {"w": 0.0, "n": 0, "socs": {}})
        f["w"] += wt
        f["n"] += nacc[(fod, soc)]
        s = f["socs"].setdefault(soc, {"w": 0.0, "n": 0})
        s["w"] += wt
        s["n"] += nacc[(fod, soc)]

    fields_out = {}
    for fod, f in by_field.items():
        if f["n"] < MIN_FIELD_N or f["w"] <= 0:
            continue
        tops = []
        for soc, s in f["socs"].items():
            if s["n"] < MIN_CELL_N:
                continue
            tops.append({
                "soc6": soc,
                "soc_title": soc_titles.get(soc),
                "share": round(s["w"] / f["w"], 4),
                "n": s["n"],
            })
        tops.sort(key=lambda x: x["share"], reverse=True)
        if not tops:
            continue
        fields_out[fod] = {
            "field": fields.get(fod, fod),
            "n_sampled": f["n"],
            "top": tops[:TOP_K],
        }

    # map fields -> study majors and validate against the modeled crosswalk
    majors = {}
    land = os.path.join(OUT, "major_landscape.json")
    if os.path.exists(land):
        for m in json.load(open(land, encoding="utf-8")).get("majors", []):
            majors[m["cip4"]] = m["title"]
    cip_to_fod = match_fields_to_majors({k: v["field"] for k, v in fields_out.items()}, majors)

    # modeled top SOC per cip4
    modeled_top = {}
    flows_path = os.path.join(OUT, "degree_occupation_flows.json")
    if os.path.exists(flows_path):
        best = {}
        for fl in json.load(open(flows_path, encoding="utf-8")):
            cip, soc, w = fl.get("cip4"), fl.get("soc6"), fl.get("grad_weight") or 0
            if cip not in best or w > best[cip][1]:
                best[cip] = (soc, w)
        modeled_top = {c: v[0] for c, v in best.items()}

    by_cip = {}
    agree = total = 0
    for cip, fod in cip_to_fod.items():
        fo = fields_out.get(fod)
        if not fo:
            continue
        emp_top = fo["top"][0]["soc6"]
        mod_top = modeled_top.get(cip)
        match = (mod_top is not None and mod_top == emp_top)
        if mod_top is not None:
            total += 1
            agree += int(match)
        by_cip[cip] = {
            "fod1p": fod,
            "field": fo["field"],
            "n_sampled": fo["n_sampled"],
            "acs_top": fo["top"][:5],
            "modeled_top_soc": mod_top,
            "agrees_with_modeled": match,
        }

    agreement_rate = round(agree / total, 3) if total else None
    out = {
        "vintage": f"{YEAR} 1-Year PUMS",
        "attribution": SOURCE["attribution"],
        "note": SOURCE["notes"],
        "min_cell_n": MIN_CELL_N,
        "n_fields": len(fields_out),
        "n_majors_matched": len(by_cip),
        "crosswalk_agreement_rate": agreement_rate,
        "crosswalk_agreement_n": total,
        "by_field": fields_out,
        "by_cip": by_cip,
    }
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "acs_flows.json"), "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    sp = os.path.join(OUT, "sources.json")
    if os.path.exists(sp):
        src = json.load(open(sp, encoding="utf-8"))
        if not any(s.get("source_key") == SOURCE["source_key"] for s in src.get("sources", [])):
            src["sources"].append(SOURCE)
            for d in (OUT, MIRROR):
                with open(os.path.join(d, "sources.json"), "w", encoding="utf-8") as fh:
                    json.dump(src, fh, ensure_ascii=False, indent=2)

    print(f"\nWrote acs_flows.json: {len(fields_out)} fields, {len(by_cip)} majors matched, "
          f"crosswalk agreement {agreement_rate} (n={total}).")


if __name__ == "__main__":
    main()
