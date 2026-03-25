const fs = require('fs');
const path = require('path');
const dataDir = path.join(__dirname, '../../public/data/fraud');

const dc = JSON.parse(fs.readFileSync(path.join(dataDir, 'deeper_connections.json'), 'utf8'));
const pol = JSON.parse(fs.readFileSync(path.join(dataDir, 'political_analysis.json'), 'utf8'));
const sr = JSON.parse(fs.readFileSync(path.join(dataDir, 'state_risk_model.json'), 'utf8'));
const ppp = JSON.parse(fs.readFileSync(path.join(dataDir, 'ppp_state_summary.json'), 'utf8'));

// Approximate lat/lng for major US cities (for map dots)
// These are city-level approximations, not exact ZIP centroids
const cityCoords = {
  'N Kansas City,MO': [39.13, -94.57], 'Atlanta,GA': [33.75, -84.39],
  'GAINESVILLE,GA': [34.30, -83.82], 'Santa Monica,CA': [34.02, -118.50],
  'BILLINGS,MT': [45.78, -108.50], 'SIKESTON,MO': [36.88, -89.59],
  'Sikeston,MO': [36.88, -89.59], 'Allendale,NJ': [41.04, -74.13],
  'ALLENDALE,NJ': [41.04, -74.13], 'PEORIA,IL': [40.69, -89.59],
  'Peoria,IL': [40.69, -89.59], 'Cranston,RI': [41.78, -71.44],
  'Monroe,LA': [32.51, -92.12], 'Raleigh,NC': [35.78, -78.64],
  'ORINDA,CA': [37.88, -122.18], 'SOUTHINGTON,CT': [41.60, -72.88],
  'FLORENCE,KY': [38.99, -84.63], 'ORANGE PARK,FL': [30.17, -81.71],
  'KEARNEY,MO': [39.37, -94.36], 'Schaumburg,IL': [42.03, -88.08],
  'Bangor,ME': [44.80, -68.77], 'Willmar,MN': [45.12, -95.04],
  'IRVINE,CA': [33.68, -117.83], 'Anaheim,CA': [33.84, -117.91],
  'Merrillville,IN': [41.48, -87.33], 'SPARKS GLENCOE,MD': [39.54, -76.65],
  'MIAMI,FL': [25.76, -80.19], 'BRIDGEPORT,CT': [41.18, -73.19],
  'Boulder,CO': [40.01, -105.27], 'Lincolnwood,IL': [42.00, -87.73],
  'Oak Brook,IL': [41.83, -87.93], 'North Palm Beach,FL': [26.82, -80.06],
  'LOUISVILLE,KY': [38.25, -85.76],
  // Major cities for state-level fallback
  'LOS ANGELES,CA': [34.05, -118.24], 'HOUSTON,TX': [29.76, -95.37],
  'NEW YORK,NY': [40.71, -74.01], 'CHICAGO,IL': [41.88, -87.63],
  'DALLAS,TX': [32.78, -96.80], 'PHOENIX,AZ': [33.45, -112.07],
  'SEATTLE,WA': [47.61, -122.33], 'DENVER,CO': [39.74, -104.99],
  'BOSTON,MA': [42.36, -71.06], 'DETROIT,MI': [42.33, -83.05],
  'MINNEAPOLIS,MN': [44.98, -93.27], 'TAMPA,FL': [27.95, -82.46],
};

// Map hotspot ZIPs to coordinates
const hotspotMapped = dc.zip_code_hotspots.map(z => {
  const key = `${z.city},${z.state}`;
  const coords = cityCoords[key] || cityCoords[z.city + ',' + z.state] || null;

  // Get state risk data
  const stateRisk = (sr.rankings || []).find(s => s.state === z.state);
  const stateDetail = (pol.state_detail || []).find(s => s.state === z.state);
  const statePPP = ppp.find(s => s.state === z.state);

  return {
    ...z,
    lat: coords ? coords[0] : null,
    lng: coords ? coords[1] : null,
    state_risk_score: stateRisk?.risk_score || null,
    state_anomaly_rate: statePPP?.anomaly_rate || null,
    zip_vs_state_ratio: statePPP?.anomaly_rate ? (z.rate / statePPP.anomaly_rate).toFixed(1) : null,
  };
});

// Generate ZIP-level predictions
// Risk score = weighted combination of:
//   - ZIP anomaly rate (40%)
//   - Number of loans (scale factor)
//   - State background risk (20%)
//   - Amount per loan anomaly (20%)
//   - Rate vs state average (20%)
const predictions = hotspotMapped
  .filter(z => z.loans >= 10)
  .map(z => {
    const zipRateScore = Math.min(z.rate * 100, 100) * 0.4;
    const stateScore = (z.state_risk_score || 50) * 0.2;
    const ratioScore = Math.min(parseFloat(z.zip_vs_state_ratio || '1') * 10, 100) * 0.2;
    const amountScore = Math.min((z.amount / z.loans) / 10000, 100) * 0.2;
    const composite = zipRateScore + stateScore + ratioScore + amountScore;

    return {
      zip: z.zip.split('-')[0], // 5-digit only
      city: z.city,
      state: z.state,
      lat: z.lat,
      lng: z.lng,
      loans: z.loans,
      anomalies: z.anomalies,
      anomaly_rate: z.rate,
      total_amount: z.amount,
      avg_loan: Math.round(z.amount / z.loans),
      state_risk_score: z.state_risk_score,
      zip_vs_state: z.zip_vs_state_ratio + 'x',
      composite_risk: Math.round(composite),
      investigation_priority: composite > 70 ? 'Critical' : composite > 50 ? 'High' : composite > 30 ? 'Moderate' : 'Lower',
      rationale: [
        z.rate >= 0.9 ? 'Near-total anomaly rate (90%+)' : z.rate >= 0.5 ? 'Majority anomalous (50%+)' : 'Elevated anomaly rate',
        z.loans >= 30 ? 'High loan volume (' + z.loans + ' loans)' : 'Moderate volume',
        z.amount > 10000000 ? 'Large total amount (' + (z.amount/1e6).toFixed(1) + 'M)' : null,
        parseFloat(z.zip_vs_state_ratio || '1') > 20 ? 'Rate ' + z.zip_vs_state_ratio + 'x state average' : null,
      ].filter(Boolean),
    };
  })
  .sort((a, b) => b.composite_risk - a.composite_risk);

// Extended predictions: identify additional ZIPs from state data
// States with high risk scores likely have more undiscovered ZIPs
const stateOutlook = (sr.rankings || []).slice(0, 10).map(s => {
  const stateHotspots = predictions.filter(z => z.state === s.state);
  return {
    state: s.state,
    state_name: s.state_name,
    risk_score: s.risk_score,
    known_hotspot_zips: stateHotspots.length,
    hotspot_details: stateHotspots.slice(0, 3),
    outlook: stateHotspots.length > 0
      ? `${stateHotspots.length} known hotspot ZIP(s). Additional investigation targets likely exist.`
      : 'No ZIP-level hotspots in current data, but state risk score suggests investigation warranted.',
  };
});

const output = {
  hotspots_mapped: hotspotMapped,
  zip_predictions: predictions,
  state_zip_outlook: stateOutlook,
  methodology: 'Composite risk = 40% ZIP anomaly rate + 20% state risk score + 20% rate-vs-state ratio + 20% avg loan size. Predictions are statistical patterns, not confirmed fraud.',
  generated: '2026-03-25',
};

fs.writeFileSync(path.join(dataDir, 'zip_predictions.json'), JSON.stringify(output, null, 2));
console.log('Generated zip_predictions.json');
console.log('Hotspots with coords:', hotspotMapped.filter(z => z.lat).length, '/', hotspotMapped.length);
console.log('ZIP predictions:', predictions.length);
console.log('Top 5 by risk:');
predictions.slice(0, 5).forEach(p => console.log(`  ${p.zip} ${p.city}, ${p.state}: risk=${p.composite_risk} (${p.investigation_priority})`));
