"""Political analysis: PPP fraud patterns by state political affiliation."""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from utils.geo import STATE_FIPS, STATE_NAMES

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fraud")

# Governor party during PPP period (2020-2021)
governor_party_2020 = {
    "AL": "R", "AK": "R", "AZ": "R", "AR": "R", "CA": "D", "CO": "D", "CT": "D",
    "DE": "D", "FL": "R", "GA": "R", "HI": "D", "ID": "R", "IL": "D", "IN": "R",
    "IA": "R", "KS": "D", "KY": "D", "LA": "D", "ME": "D", "MD": "R", "MA": "R",
    "MI": "D", "MN": "D", "MS": "R", "MO": "R", "MT": "R", "NE": "R", "NV": "D",
    "NH": "R", "NJ": "D", "NM": "D", "NY": "D", "NC": "D", "ND": "R", "OH": "R",
    "OK": "R", "OR": "D", "PA": "D", "RI": "D", "SC": "R", "SD": "R", "TN": "R",
    "TX": "R", "UT": "R", "VT": "R", "VA": "D", "WA": "D", "WV": "R", "WI": "D",
    "WY": "R", "DC": "D",
}

# State government trifecta (2020): R=Republican trifecta, D=Democrat, S=Split
trifecta_2020 = {
    "AL": "R", "AK": "R", "AZ": "R", "AR": "R", "CA": "D", "CO": "D", "CT": "D",
    "DE": "D", "FL": "R", "GA": "R", "HI": "D", "ID": "R", "IL": "D", "IN": "R",
    "IA": "R", "KS": "S", "KY": "S", "LA": "S", "ME": "D", "MD": "S", "MA": "S",
    "MI": "S", "MN": "S", "MS": "R", "MO": "R", "MT": "S", "NE": "R", "NV": "D",
    "NH": "S", "NJ": "D", "NM": "D", "NY": "D", "NC": "S", "ND": "R", "OH": "R",
    "OK": "R", "OR": "D", "PA": "S", "RI": "D", "SC": "R", "SD": "R", "TN": "R",
    "TX": "R", "UT": "R", "VT": "S", "VA": "D", "WA": "D", "WV": "R", "WI": "S",
    "WY": "R", "DC": "D",
}

# 2020 Presidential vote winner by state
presidential_2020 = {
    "AL": "R", "AK": "R", "AZ": "D", "AR": "R", "CA": "D", "CO": "D", "CT": "D",
    "DE": "D", "FL": "R", "GA": "D", "HI": "D", "ID": "R", "IL": "D", "IN": "R",
    "IA": "R", "KS": "R", "KY": "R", "LA": "R", "ME": "D", "MD": "D", "MA": "D",
    "MI": "D", "MN": "D", "MS": "R", "MO": "R", "MT": "R", "NE": "R", "NV": "D",
    "NH": "D", "NJ": "D", "NM": "D", "NY": "D", "NC": "R", "ND": "R", "OH": "R",
    "OK": "R", "OR": "D", "PA": "D", "RI": "D", "SC": "R", "SD": "R", "TN": "R",
    "TX": "R", "UT": "R", "VT": "D", "VA": "D", "WA": "D", "WV": "R", "WI": "D",
    "WY": "R", "DC": "D",
}

ppp_states = json.load(open(os.path.join(DATA_DIR, "ppp_state_summary.json")))

results = []
for s in ppp_states:
    st = s["state"]
    if st not in governor_party_2020:
        continue
    results.append({
        **s,
        "governor_party": governor_party_2020[st],
        "trifecta": trifecta_2020.get(st, "S"),
        "presidential_2020": presidential_2020.get(st, "?"),
    })


def agg(subset):
    tl = sum(r["total_loans"] for r in subset)
    ta = sum(r["anomaly_count"] for r in subset)
    amt = sum(r["total_amount"] for r in subset)
    a_amt = sum(r["anomaly_amount"] for r in subset)
    return {
        "states": len(subset),
        "total_loans": tl,
        "anomalies": ta,
        "rate": round(ta / max(tl, 1), 4),
        "total_amount": round(amt),
        "anomaly_amount": round(a_amt),
    }


print("=== BY GOVERNOR PARTY ===")
for party, label in [("R", "Republican"), ("D", "Democrat")]:
    a = agg([r for r in results if r["governor_party"] == party])
    print(f"{label} ({a['states']} states): {a['rate']*100:.2f}% anomalous ({a['anomalies']:,}/{a['total_loans']:,})")

print("\n=== BY TRIFECTA ===")
for status, label in [("R", "Republican Trifecta"), ("D", "Democrat Trifecta"), ("S", "Split")]:
    a = agg([r for r in results if r["trifecta"] == status])
    print(f"{label} ({a['states']} states): {a['rate']*100:.2f}% anomalous")

print("\n=== BY 2020 PRESIDENTIAL VOTE ===")
for party, label in [("R", "Trump states"), ("D", "Biden states")]:
    a = agg([r for r in results if r["presidential_2020"] == party])
    print(f"{label} ({a['states']} states): {a['rate']*100:.2f}% anomalous")

output = {
    "context": {
        "ppp_round1": "April-August 2020: Trump administration, SBA Administrator Jovita Carranza",
        "ppp_round2": "January-June 2021: Biden administration (from Jan 20), SBA Administrator Isabel Guzman (from March 2021)",
        "note": "PPP was bipartisan (CARES Act passed 96-0 in Senate). State-level patterns reflect local economic conditions, business density, and lender behavior more than political affiliation.",
    },
    "by_governor": {
        "R": agg([r for r in results if r["governor_party"] == "R"]),
        "D": agg([r for r in results if r["governor_party"] == "D"]),
    },
    "by_trifecta": {
        "R": agg([r for r in results if r["trifecta"] == "R"]),
        "D": agg([r for r in results if r["trifecta"] == "D"]),
        "S": agg([r for r in results if r["trifecta"] == "S"]),
    },
    "by_presidential": {
        "Trump": agg([r for r in results if r["presidential_2020"] == "R"]),
        "Biden": agg([r for r in results if r["presidential_2020"] == "D"]),
    },
    "state_detail": [{
        "state": r["state"], "state_name": r["state_name"],
        "anomaly_rate": r["anomaly_rate"], "governor_party": r["governor_party"],
        "trifecta": r["trifecta"], "presidential_2020": r["presidential_2020"],
        "total_loans": r["total_loans"], "anomaly_count": r["anomaly_count"],
    } for r in results],
}

for d in [DATA_DIR, os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "fraud")]:
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "political_analysis.json"), "w") as f:
        json.dump(output, f, indent=2)

print("\nSaved political_analysis.json")
