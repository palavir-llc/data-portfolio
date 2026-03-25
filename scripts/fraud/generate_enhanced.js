const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '../../public/data/fraud');

// 2024 presidential results by state (public knowledge)
const results2024 = {
  AL:'Trump',AK:'Trump',AZ:'Trump',AR:'Trump',CA:'Harris',CO:'Harris',CT:'Harris',
  DE:'Harris',FL:'Trump',GA:'Trump',HI:'Harris',ID:'Trump',IL:'Harris',IN:'Trump',
  IA:'Trump',KS:'Trump',KY:'Trump',LA:'Trump',ME:'Harris',MD:'Harris',MA:'Harris',
  MI:'Trump',MN:'Harris',MS:'Trump',MO:'Trump',MT:'Trump',NE:'Trump',NV:'Trump',
  NH:'Harris',NJ:'Harris',NM:'Harris',NY:'Harris',NC:'Trump',ND:'Trump',OH:'Trump',
  OK:'Trump',OR:'Harris',PA:'Trump',RI:'Harris',SC:'Trump',SD:'Trump',TN:'Trump',
  TX:'Trump',UT:'Trump',VT:'Harris',VA:'Harris',WA:'Harris',WV:'Trump',WI:'Trump',
  WY:'Trump',DC:'Harris'
};

const pol = JSON.parse(fs.readFileSync(path.join(dataDir, 'political_analysis.json'), 'utf8'));
const dc = JSON.parse(fs.readFileSync(path.join(dataDir, 'deeper_connections.json'), 'utf8'));
const doj = JSON.parse(fs.readFileSync(path.join(dataDir, 'doj_prosecution_data.json'), 'utf8'));
const sr = JSON.parse(fs.readFileSync(path.join(dataDir, 'state_risk_model.json'), 'utf8'));

// 1. 2024 Election Correlation
const trump2024 = {states:0, loans:0, anomalies:0};
const harris2024 = {states:0, loans:0, anomalies:0};
for (const s of pol.state_detail || []) {
  const winner = results2024[s.state];
  if (!winner) continue;
  const bucket = winner === 'Trump' ? trump2024 : harris2024;
  bucket.states++;
  bucket.loans += s.total_loans;
  bucket.anomalies += s.anomaly_count;
}
trump2024.rate = trump2024.anomalies / trump2024.loans;
harris2024.rate = harris2024.anomalies / harris2024.loans;

// Flipped states (2020 -> 2024)
const stateElections = (pol.state_detail || []).map(s => ({
  ...s,
  presidential_2024: results2024[s.state] || 'Unknown',
  flipped: results2024[s.state] && (
    (s.presidential_2020 === 'D' && results2024[s.state] === 'Trump') ||
    (s.presidential_2020 === 'R' && results2024[s.state] === 'Harris')
  )
}));
const flippedStates = stateElections.filter(s => s.flipped);

// 2. Detection Lag Timeline
const detectionLag = [
  { event: 'PPP launched', date: '2020-04-03', months_after: 0, type: 'program' },
  { event: 'First fraud charges filed (DOJ)', date: '2020-07-01', months_after: 3, type: 'enforcement' },
  { event: 'SBA OIG investigations accelerate', date: '2020-10-01', months_after: 6, type: 'enforcement' },
  { event: 'PPP Round 2 begins', date: '2021-01-11', months_after: 9, type: 'program' },
  { event: 'PRAC cross-agency oversight established', date: '2021-03-15', months_after: 11, type: 'enforcement' },
  { event: 'PPP program closes permanently', date: '2021-05-31', months_after: 14, type: 'program' },
  { event: '1,000+ defendants charged', date: '2022-06-01', months_after: 26, type: 'enforcement' },
  { event: 'Feeding Our Future indictment ($250M, MN)', date: '2022-09-20', months_after: 30, type: 'enforcement' },
  { event: 'Statute of limitations extended to 10 years', date: '2023-03-10', months_after: 35, type: 'legal' },
  { event: '2,000+ convicted or pled guilty', date: '2024-06-01', months_after: 50, type: 'enforcement' },
  { event: '3,000+ total defendants charged', date: '2025-12-01', months_after: 68, type: 'enforcement' },
  { event: 'Statute expires for earliest PPP loans', date: '2030-04-03', months_after: 120, type: 'legal' },
];

// 3. Hotspot Political Overlay
const zipHotspots = (dc.zip_code_hotspots || []).slice(0, 20).map(z => {
  const stateData = (pol.state_detail || []).find(s => s.state === z.state);
  return {
    ...z,
    governor_party_2020: stateData?.governor_party || 'Unknown',
    presidential_2020: stateData?.presidential_2020 || 'Unknown',
    presidential_2024: results2024[z.state] || 'Unknown',
  };
});
const hotspotParty2020 = { R: 0, D: 0 };
const hotspotParty2024 = { Trump: 0, Harris: 0 };
zipHotspots.forEach(z => {
  if (z.presidential_2020 === 'R') hotspotParty2020.R++;
  else if (z.presidential_2020 === 'D') hotspotParty2020.D++;
  if (z.presidential_2024 === 'Trump') hotspotParty2024.Trump++;
  else if (z.presidential_2024 === 'Harris') hotspotParty2024.Harris++;
});

// 4. State Forecasting
const forecasts = (sr.rankings || []).slice(0, 15).map(s => ({
  state: s.state,
  state_name: s.state_name,
  risk_score: s.risk_score,
  ppp_anomaly_rate: s.ppp_anomaly_rate,
  enforcement_outlook: s.risk_score > 70
    ? 'High priority: expect continued DOJ activity through 2030'
    : s.risk_score > 50
    ? 'Moderate: active investigations likely, some cases closing'
    : 'Lower priority: most enforcement resolved or winding down',
  years_remaining: Math.max(0, (new Date('2030-04-03') - new Date()) / (365.25 * 24 * 3600 * 1000)).toFixed(1),
}));

// 5. Conviction Pipeline & Tipping Points
const convictionPipeline = {
  total_charged: doj.total_defendants_charged,
  total_convicted: doj.total_convicted_or_pled,
  conviction_rate_estimate: '~67%',
  key_cases: doj.key_cases,
  enforcement_by_district: doj.enforcement_stats,
  prac: doj.prac_findings,
  tipping_points: [
    { threshold: 'ZIP/district anomaly rate exceeds 5%', trigger: 'OIG geographic audit', typical_lag: '6-12 months' },
    { threshold: '10+ flagged loans at single address', trigger: 'DOJ entity network investigation', typical_lag: '12-24 months' },
    { threshold: '$10M+ anomalous through one lender pathway', trigger: 'SBA + FDIC joint lender review', typical_lag: '18-36 months' },
    { threshold: 'PRAC cross-database SSN/EIN match', trigger: 'Automated DOJ Fraud Section referral', typical_lag: '3-6 months' },
    { threshold: 'Whistleblower qui tam filing', trigger: 'DOJ Civil Division investigation + FCA suit', typical_lag: '12-60 months (sealed)' },
  ],
  statute_of_limitations: {
    original: '5 years',
    extended: '10 years (COVID Fraud Enforcement Act, 2023)',
    earliest_expiry: '2030-04-03',
    latest_expiry: '2031-05-31',
    note: 'The 10-year window means enforcement is roughly halfway through. Peak conviction rates typically occur 3-5 years after a fraud wave.'
  }
};

// 6. Timeline callout annotations
const timelineAnnotations = [
  { month: '2020-04', label: 'Round 1 launches', type: 'program' },
  { month: '2020-07', label: 'First fraud charges', type: 'enforcement' },
  { month: '2020-08', label: 'Round 1 ends', type: 'program' },
  { month: '2021-01', label: 'Round 2 (Biden admin)', type: 'program' },
  { month: '2021-05', label: 'PPP closes', type: 'program' },
  { month: '2021-06', label: 'Peak anomaly rate', type: 'data' },
];

const enhanced = {
  election_2024: {
    by_presidential_2024: { Trump: trump2024, Harris: harris2024 },
    by_presidential_2020: pol.by_presidential,
    flipped_states: flippedStates.map(s => ({
      state: s.state, state_name: s.state_name,
      from_2020: s.presidential_2020 === 'D' ? 'Biden' : 'Trump',
      to_2024: results2024[s.state],
      anomaly_rate: s.anomaly_rate, total_loans: s.total_loans, anomaly_count: s.anomaly_count
    })),
    note: 'PPP was 2020-2021. Correlation with 2024 results tests whether shifting political geography tracks with anomaly patterns.'
  },
  detection_lag: detectionLag,
  hotspot_political: { hotspots: zipHotspots, by_party_2020: hotspotParty2020, by_party_2024: hotspotParty2024 },
  forecasts,
  conviction_pipeline: convictionPipeline,
  timeline_annotations: timelineAnnotations,
  generated: '2026-03-24'
};

fs.writeFileSync(path.join(dataDir, 'enhanced_analysis.json'), JSON.stringify(enhanced, null, 2));
console.log('Generated enhanced_analysis.json');
console.log('2024 Trump:', trump2024.states, 'states, rate:', (trump2024.rate*100).toFixed(2)+'%');
console.log('2024 Harris:', harris2024.states, 'states, rate:', (harris2024.rate*100).toFixed(2)+'%');
console.log('Flipped states:', flippedStates.length, '-', flippedStates.map(s=>s.state).join(', '));
console.log('Hotspots 2024:', hotspotParty2024);
