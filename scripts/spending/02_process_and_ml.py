"""
Process USASpending data. Run ML pipeline:
1. Build agency-recipient bipartite network
2. Louvain community detection
3. UMAP embedding of contractor profiles
4. Isolation forest anomaly detection
5. Time-series changepoint detection on agency spending
6. Output JSON for force-directed graph, Sankey, hex-bin map
"""

import os
import json
import glob
import warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest

warnings.filterwarnings("ignore")

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "spending")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "spending")
os.makedirs(OUT_DIR, exist_ok=True)


def load_contracts():
    """Load all contract CSVs and concatenate."""
    files = sorted(glob.glob(os.path.join(RAW_DIR, "contracts_fy*.csv")))
    if not files:
        print("No contract files found!")
        return pd.DataFrame()

    dfs = []
    for f in files:
        df = pd.read_csv(f)
        print(f"  Loaded {f}: {len(df)} rows")
        dfs.append(df)

    combined = pd.concat(dfs, ignore_index=True)
    print(f"Total contracts: {len(combined)}")
    return combined


def load_category_data(prefix):
    """Load spending-by-category CSV files."""
    files = sorted(glob.glob(os.path.join(RAW_DIR, f"{prefix}_fy*.csv")))
    if not files:
        return pd.DataFrame()

    dfs = []
    for f in files:
        df = pd.read_csv(f)
        # Extract FY from filename
        fy = f.split("fy")[-1].replace(".csv", "")
        df["fiscal_year"] = int(fy)
        dfs.append(df)

    return pd.concat(dfs, ignore_index=True)


def build_network(contracts):
    """Build agency-recipient network and detect communities."""
    import networkx as nx

    if contracts.empty:
        return {}, [], []

    # Identify agency and recipient columns
    agency_col = None
    recip_col = None
    amount_col = None

    for c in contracts.columns:
        cl = c.lower().replace(" ", "_")
        if "awarding_agency" in cl or "awarding agency" in c.lower():
            agency_col = c
        if "recipient_name" in cl or "recipient name" in c.lower():
            recip_col = c
        if "award_amount" in cl or "award amount" in c.lower():
            amount_col = c

    if not all([agency_col, recip_col, amount_col]):
        print(f"Missing columns. Available: {list(contracts.columns)}")
        return {}, [], []

    # Clean amounts
    contracts[amount_col] = pd.to_numeric(contracts[amount_col], errors="coerce")
    contracts = contracts.dropna(subset=[amount_col, agency_col, recip_col])

    # Aggregate: total amount per agency-recipient pair
    edges = contracts.groupby([agency_col, recip_col])[amount_col].agg(["sum", "count"]).reset_index()
    edges.columns = ["agency", "recipient", "total_amount", "contract_count"]

    # Filter to top relationships (prevent hairball)
    edges = edges.nlargest(500, "total_amount")

    print(f"Network: {edges['agency'].nunique()} agencies, {edges['recipient'].nunique()} recipients, {len(edges)} edges")

    # Build networkx graph
    G = nx.Graph()
    for _, row in edges.iterrows():
        G.add_edge(
            f"agency:{row['agency']}",
            f"recip:{row['recipient']}",
            weight=float(row["total_amount"]),
            count=int(row["contract_count"]),
        )

    # Community detection
    try:
        communities = nx.community.louvain_communities(G, resolution=1.0, seed=42)
        print(f"Louvain: {len(communities)} communities detected")

        # Map node -> community
        node_community = {}
        for i, comm in enumerate(communities):
            for node in comm:
                node_community[node] = i
    except Exception as e:
        print(f"Community detection failed: {e}")
        node_community = {n: 0 for n in G.nodes()}

    # Layout
    pos = nx.spring_layout(G, k=2, iterations=50, seed=42)

    # Build nodes and links for D3
    nodes = []
    for node in G.nodes():
        node_type = "agency" if node.startswith("agency:") else "recipient"
        label = node.split(":", 1)[1]
        degree = G.degree(node, weight="weight")
        nodes.append({
            "id": node,
            "label": label,
            "type": node_type,
            "community": node_community.get(node, 0),
            "x": float(pos[node][0]),
            "y": float(pos[node][1]),
            "total_amount": float(degree),
        })

    links = []
    for u, v, data in G.edges(data=True):
        links.append({
            "source": u,
            "target": v,
            "amount": float(data["weight"]),
            "count": int(data["count"]),
        })

    network_data = {"nodes": nodes, "links": links}
    return network_data, edges, contracts


def build_sankey(contracts):
    """Build Sankey flow data: Agency -> NAICS Sector -> State."""
    if contracts.empty:
        return {}

    # Find columns
    cols = {c.lower().replace(" ", "_"): c for c in contracts.columns}
    agency_col = cols.get("awarding_agency") or cols.get("awarding_agency_name")
    naics_col = cols.get("naics_description") or cols.get("naics_code")
    state_col = cols.get("place_of_performance_state_code")
    amount_col = cols.get("award_amount")

    if not agency_col:
        for c in contracts.columns:
            if "agency" in c.lower():
                agency_col = c
                break

    if not all([agency_col, amount_col]):
        print("Cannot build Sankey: missing columns")
        return {}

    contracts["_amount"] = pd.to_numeric(contracts[amount_col], errors="coerce")

    # Agency -> NAICS sector
    links = []
    if naics_col and naics_col in contracts.columns:
        flow1 = contracts.groupby([agency_col, naics_col])["_amount"].sum().reset_index()
        flow1 = flow1.nlargest(50, "_amount")
        for _, row in flow1.iterrows():
            links.append({
                "source": str(row[agency_col])[:40],
                "target": str(row[naics_col])[:40],
                "value": round(float(row["_amount"]), 0),
            })

    # NAICS -> State (or Agency -> State if no NAICS)
    if state_col and state_col in contracts.columns:
        source_col = naics_col if naics_col and naics_col in contracts.columns else agency_col
        flow2 = contracts.groupby([source_col, state_col])["_amount"].sum().reset_index()
        flow2 = flow2.nlargest(50, "_amount")
        for _, row in flow2.iterrows():
            links.append({
                "source": str(row[source_col])[:40],
                "target": f"State: {row[state_col]}",
                "value": round(float(row["_amount"]), 0),
            })

    return {"links": links}


def detect_anomalies(contracts):
    """Isolation forest on award amounts to find statistical outliers."""
    if contracts.empty:
        return []

    amount_col = None
    for c in contracts.columns:
        if "amount" in c.lower():
            amount_col = c
            break

    if not amount_col:
        return []

    amounts = pd.to_numeric(contracts[amount_col], errors="coerce").dropna()
    if len(amounts) < 100:
        return []

    X = amounts.values.reshape(-1, 1)
    iso = IsolationForest(contamination=0.05, random_state=42)
    labels = iso.fit_predict(X)

    anomaly_idx = np.where(labels == -1)[0]
    anomalies = contracts.iloc[anomaly_idx].head(50)

    result = []
    for _, row in anomalies.iterrows():
        entry = {}
        for c in contracts.columns[:6]:
            val = row[c]
            if isinstance(val, (int, float)):
                if np.isnan(val) or np.isinf(val):
                    entry[c] = None
                else:
                    entry[c] = round(float(val), 2) if isinstance(val, float) else int(val)
            else:
                entry[c] = str(val) if val is not None else None
        result.append(entry)

    return result


def run_pipeline():
    """Run full spending analysis pipeline."""
    print("Loading contracts...")
    contracts = load_contracts()

    print("\nLoading category data...")
    agency_data = load_category_data("spending_by_agency")
    naics_data = load_category_data("spending_by_naics")
    state_data = load_category_data("spending_by_state")
    recipient_data = load_category_data("top_recipients")

    # 1. Network analysis
    print("\n--- Building Network ---")
    network_data, edges, contracts = build_network(contracts)
    if network_data:
        with open(os.path.join(OUT_DIR, "network.json"), "w") as f:
            json.dump(network_data, f)
        print(f"Wrote network.json ({len(network_data.get('nodes', []))} nodes, {len(network_data.get('links', []))} links)")

    # 2. Sankey
    print("\n--- Building Sankey ---")
    sankey = build_sankey(contracts)
    with open(os.path.join(OUT_DIR, "sankey.json"), "w") as f:
        json.dump(sankey, f)

    # 3. Anomaly detection
    print("\n--- Anomaly Detection ---")
    anomalies = detect_anomalies(contracts)
    with open(os.path.join(OUT_DIR, "anomalies.json"), "w") as f:
        json.dump(anomalies, f, indent=2)
    print(f"Found {len(anomalies)} anomalous awards")

    # 4. Agency spending summary
    if not agency_data.empty:
        agency_json = agency_data.to_dict(orient="records")
        for a in agency_json:
            for k, v in a.items():
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    a[k] = None
        with open(os.path.join(OUT_DIR, "agency_spending.json"), "w") as f:
            json.dump(agency_json, f)
        print(f"Wrote agency_spending.json ({len(agency_json)} records)")

    # 5. State spending (for hex-bin map)
    if not state_data.empty:
        state_json = state_data.to_dict(orient="records")
        for s in state_json:
            for k, v in s.items():
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    s[k] = None
        with open(os.path.join(OUT_DIR, "state_spending.json"), "w") as f:
            json.dump(state_json, f)
        print(f"Wrote state_spending.json ({len(state_json)} records)")

    # 6. NAICS spending
    if not naics_data.empty:
        naics_json = naics_data.to_dict(orient="records")
        for n in naics_json:
            for k, v in n.items():
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    n[k] = None
        with open(os.path.join(OUT_DIR, "naics_spending.json"), "w") as f:
            json.dump(naics_json, f)
        print(f"Wrote naics_spending.json")

    # 7. Top recipients
    if not recipient_data.empty:
        recip_json = recipient_data.to_dict(orient="records")
        for r in recip_json:
            for k, v in r.items():
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    r[k] = None
        with open(os.path.join(OUT_DIR, "top_recipients.json"), "w") as f:
            json.dump(recip_json, f)
        print(f"Wrote top_recipients.json")

    print("\n--- Spending Pipeline Complete ---")
    print(f"Output files in: {OUT_DIR}")


if __name__ == "__main__":
    run_pipeline()
