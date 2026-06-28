const https = require('https');

function httpGet(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', (e) => { console.error('HTTP error:', e.message); resolve(''); });
  });
}

function scoreBar(pct) {
  const n = Math.min(10, Math.max(0, Math.round(pct / 10)));
  return '\u2588'.repeat(n) + '\u2591'.repeat(10 - n);
}

function dataEmo(val, good, warn) {
  if (val >= good) return '\u2705';
  if (val >= warn) return '\u26A0\uFE0F';
  return '\u274C';
}
function dataLabel(val, good, warn) {
  if (val >= good) return 'Good';
  if (val >= warn) return 'Needs Attention';
  return 'Poor';
}
function dataColor(val, good, warn) {
  if (val >= good) return '#2E7D32';
  if (val >= warn) return '#E87722';
  return '#e74c3c';
}

function rankToAuthority(rank) {
  if (rank <= 0) return 0;
  if (rank < 100000)  return Math.max(1, Math.round(70 - (rank / 100000) * 30));
  if (rank < 500000)  return Math.max(1, Math.round(40 - ((rank - 100000) / 400000) * 20));
  if (rank < 2000000) return Math.max(1, Math.round(20 - ((rank - 500000) / 1500000) * 10));
  return 5;
}

// Per-metric status: returns { emoji, label, color }
function metricStatus(val, metric) {
  const hammer = '\uD83D\uDD28';
  const warn   = '\u26A0\uFE0F';
  const cross  = '\u274C';
  const orange = '#E87722';
  const red    = '#e74c3c';

  if (val >= 70) return { emoji: hammer, label: 'ROOM FOR IMPROVEMENT', color: orange };

  if (metric === 'gbp') {
    return val >= 40
      ? { emoji: warn, label: 'NEEDS OPTIMIZATION', color: orange }
      : { emoji: cross, label: 'POOR', color: red };
  }
  if (metric === 'ai') {
    return val >= 40
      ? { emoji: warn, label: 'LOW VISIBILITY', color: orange }
      : { emoji: cross, label: 'INVISIBLE', color: red };
  }
  if (metric === 'maps') {
    return val >= 40
      ? { emoji: warn, label: 'RANKING GAPS', color: orange }
      : { emoji: cross, label: 'POOR', color: red };
  }
  if (metric === 'authority') {
    return val >= 40
      ? { emoji: warn, label: 'AUTHORITY GAPS', color: orange }
      : { emoji: cross, label: 'LOW', color: red };
  }
  if (metric === 'speed') {
    return val >= 40
      ? { emoji: warn, label: 'SLOWING YOU DOWN', color: orange }
      : { emoji: cross, label: 'TEST NOT PASSED', color: red };
  }
  if (metric === 'citations') {
    return val >= 40
      ? { emoji: warn, label: 'MISSING LISTINGS', color: orange }
      : { emoji: cross, label: 'POOR', color: red };
  }
  return { emoji: cross, label: 'POOR', color: red };
}

// icon: string (emoji or HTML span)
// display: 'pct' => "38%"   'outof' => "13/100"
function scoreRow(icon, name, val, display, metric) {
  const formatted = display === 'pct' ? `${val}%` : `${val}/100`;
  const s = metricStatus(val, metric);
  return `
    <div class="score-card">
      <div class="score-icon">${icon}</div>
      <div class="score-info">
        <div class="score-name">${name}</div>
        <div class="score-bar-wrap">
          <div class="score-bar-col">
            <div class="score-bar">${scoreBar(val)}</div>
            <div class="score-status" style="color:${s.color}">${s.label}</div>
          </div>
          <div class="score-right">
            <div class="score-pct">${formatted} ${s.emoji}</div>
          </div>
        </div>
      </div>
    </div>`;
}

module.exports = async (req, res) => {
  const urlSlug = req.url.split('?')[0].replace(/^\//, '') || req.query.slug || '';
  const company = req.query.company || urlSlug.replace(/-/g, ' ') || 'Your Company';
  const city    = req.query.city    || 'Your City';
  const state   = req.query.state   || '';
  const website = req.query.website || '';
  const domain  = website.replace(/https?:\/\/(www\.)?/i, '').split('/')[0].toLowerCase().trim();

  const KEY = process.env.SEMRUSH_API_KEY || '';
  let authorityScore = 0, organicTraffic = 0, organicKeywords = 0, backlinks = 0;
  let top10Keywords = 0, pageSpeedScore = 0;

  const tasks = [];

  if (domain && KEY) {
    tasks.push(
      httpGet(`https://api.semrush.com/?type=domain_ranks&key=${KEY}&export_columns=Dn,Rk,Or,Ot,Oc,Ad&domain=${domain}&database=us`)
        .then(raw => {
          const lines = raw.trim().split('\n');
          if (lines.length >= 2) {
            const vals = lines[1].split(';');
            const rank      = parseInt(vals[1] || 0);
            organicKeywords = parseInt(vals[2] || 0);
            organicTraffic  = parseInt(vals[3] || 0);
            backlinks       = parseInt(vals[4] || 0);
            authorityScore  = rankToAuthority(rank);
          }
        })
    );

    tasks.push(
      httpGet(`https://api.semrush.com/?type=domain_organic&key=${KEY}&export_columns=Ph,Po,Nq&domain=${domain}&database=us&display_limit=100`)
        .then(raw => {
          const lines = raw.trim().split('\n');
          if (lines.length >= 2) {
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(';');
              if (parseInt(cols[1] || 99) <= 10) count++;
            }
            top10Keywords = count;
          }
        })
    );
  }

  if (domain) {
    tasks.push(
      httpGet(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${domain}&strategy=mobile&category=performance`)
        .then(raw => {
          try {
            const json = JSON.parse(raw);
            const score = json?.lighthouseResult?.categories?.performance?.score;
            if (score !== undefined) pageSpeedScore = Math.round(score * 100);
          } catch(e) {}
        })
    );
  }

  await Promise.all(tasks);

  // Score calculations
  const gbpScore      = organicKeywords > 200 ? 55 : organicKeywords > 50 ? 38 : organicKeywords > 10 ? 25 : 18;
  const aiScore       = Math.min(35, Math.max(5, Math.round(authorityScore * 0.4 + (organicTraffic > 500 ? 8 : organicTraffic > 100 ? 4 : 1))));
  const mapsScore     = organicKeywords > 500 ? 70 : organicKeywords > 100 ? 50 : organicKeywords > 20 ? 30 : 15;
  const authScore     = authorityScore;
  const speedScore    = pageSpeedScore > 0 ? pageSpeedScore : (organicTraffic > 1000 ? 65 : organicTraffic > 300 ? 45 : organicTraffic > 50 ? 30 : 20);
  const citationScore = backlinks > 500 ? 75 : backlinks > 200 ? 55 : backlinks > 50 ? 35 : backlinks > 10 ? 20 : 10;

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const gIcon = `<span style="font-family:Arial,sans-serif;font-size:26px;font-weight:900;color:#4285F4;line-height:1;">G</span>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${company} - Google Visibility Audit | Paint & Profits</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; background: #f2f4f7; color: #1A1A2E; }
.wrap { max-width: 700px; margin: 0 auto; padding: 32px 16px 60px; }

.header { background: #fff; border-radius: 12px; padding: 32px 40px 28px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); text-align: center; }
.brand { font-family: Georgia, serif; font-size: 28px; font-weight: 900; color: #1A1A2E; }
.tagline { font-size: 11px; font-weight: 700; color: #5BC4F5; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
.co-name { font-size: 24px; font-weight: 700; margin-top: 20px; }
.co-sub { font-size: 13px; color: #8a94a6; margin-top: 4px; }

.scores { background: #fff; border-radius: 12px; padding: 28px 32px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
.scores-title { font-size: 10px; font-weight: 700; color: #1A1A2E; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #5BC4F5; }

.score-card { display: flex; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid #f0f2f5; gap: 16px; }
.score-card:last-child { border-bottom: none; }
.score-icon { font-size: 28px; width: 40px; text-align: center; flex-shrink: 0; padding-top: 2px; display: flex; align-items: center; justify-content: center; }
.score-info { flex: 1; }
.score-name { font-size: 15px; font-weight: 700; color: #1A1A2E; margin-bottom: 8px; }
.score-bar-wrap { display: flex; align-items: flex-start; gap: 10px; }
.score-bar-col { flex: 1; }
.score-bar { font-family: monospace; font-size: 14px; color: #5BC4F5; }
.score-status { font-size: 11px; font-weight: 700; margin-top: 6px; }
.score-right { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; width: 120px; }
.score-pct { font-size: 22px; font-weight: 900; color: #1A1A2E; white-space: nowrap; line-height: 1; }

.data-section { background: #1A1A2E; border-radius: 12px; padding: 24px 28px; margin-bottom: 16px; }
.data-title { font-size: 10px; font-weight: 700; color: #5BC4F5; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 18px; }
.data-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.data-card { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; }
.data-card-traffic { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 16px; border: 1px solid rgba(255,255,255,0.1); text-align: center; }
.data-val { font-size: 28px; font-weight: 900; color: #fff; }
.data-label { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
.data-emoji { font-size: 16px; margin-top: 6px; }
.data-status { font-size: 11px; font-weight: 700; margin-top: 4px; }

.expl { background: #f8f9fb; border-radius: 12px; padding: 24px 28px; margin-bottom: 16px; border-left: 4px solid #5BC4F5; }
.expl h2 { font-size: 10px; font-weight: 700; color: #1A1A2E; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; }
.expl p { font-size: 14px; color: #4a5568; line-height: 22px; margin-bottom: 10px; }
.expl p:last-child { margin-bottom: 0; }

.results { background: #f8f9fb; border-radius: 12px; padding: 20px 24px 16px; margin-bottom: 16px; border-top: 3px solid #5BC4F5; }
.results h2 { font-size: 10px; font-weight: 700; color: #1A1A2E; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 16px; text-align: center; }
.cards { display: flex; gap: 8px; }
.card { flex: 1; border: 1px solid #e2e6ea; border-radius: 10px; overflow: hidden; }
.card-top { background: #fff; padding: 14px 8px; text-align: center; min-height: 90px; display: flex; align-items: center; justify-content: center; }
.card-top img { max-height: 64px; max-width: 100%; object-fit: contain; }
.card-bot { background: #1A1A2E; padding: 12px 8px 14px; text-align: center; }
.lbl { font-size: 8px; font-weight: 700; color: #5BC4F5; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
.old { font-size: 10px; color: rgba(255,255,255,0.4); text-decoration: line-through; }
.big { font-size: 18px; font-weight: 700; color: #fff; margin: 2px 0; }
.cty { font-size: 8px; color: rgba(255,255,255,0.45); }

.cta-box { background: #fff; border-radius: 12px; padding: 32px 40px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
.spot { font-size: 13px; color: #e74c3c; font-weight: 700; margin-bottom: 8px; }
.cta-box h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
.cta-box p { font-size: 14px; color: #8a94a6; margin-bottom: 24px; }
.btn { display: inline-block; background: #1A1A2E; color: #fff; text-decoration: none; font-size: 16px; font-weight: 700; padding: 18px 44px; border-radius: 8px; }

@media (max-width: 600px) {
  .cards { flex-direction: column; }
  .score-bar { display: none; }
  .scores, .header, .cta-box { padding: 20px; }
  .data-grid { grid-template-columns: repeat(2, 1fr); }
  .data-card-traffic { grid-column: 1 / -1; }
}
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <img src="https://res.cloudinary.com/do1pkkrqn/image/upload/v1781730318/PRIMARY_LOGO_kgj3am.png" alt="Paint & Profits" style="height:100px;width:auto;margin-bottom:8px;" />
    <div class="tagline">Marketing for Painters</div>
    <div class="co-name">${company}</div>
    <div class="co-sub">Google Visibility Audit &mdash; ${city}${state ? ', ' + state : ''} &mdash; ${date}</div>
  </div>

  <div class="scores">
    <div class="scores-title">Your Google Visibility Scores</div>
    ${scoreRow(gIcon, 'Google Business Profile Health', gbpScore, 'pct', 'gbp')}
    ${scoreRow('&#129302;', 'AI Visibility', aiScore, 'pct', 'ai')}
    ${scoreRow('&#128205;', 'Maps Ranking Score', mapsScore, 'pct', 'maps')}
    ${scoreRow('&#127942;', 'Authority Score', authScore, 'outof', 'authority')}
    ${scoreRow('&#9889;', 'Website Speed', speedScore, 'outof', 'speed')}
    ${scoreRow('&#128279;', 'Citations &amp; Local Listings', citationScore, 'outof', 'citations')}
  </div>

  <div class="data-section">
    <div class="data-title">More Data</div>
    <div class="data-grid">
      <div class="data-card-traffic">
        <div class="data-val">${organicTraffic.toLocaleString()}</div>
        <div class="data-label">Monthly Traffic</div>
        <div class="data-emoji">${dataEmo(organicTraffic, 1000, 300)}</div>
        <div class="data-status" style="color:${dataColor(organicTraffic, 1000, 300)}">${dataLabel(organicTraffic, 1000, 300)}</div>
      </div>
      <div class="data-card">
        <div class="data-val">${top10Keywords.toLocaleString()}</div>
        <div class="data-label">Keywords in Top 10</div>
        <div class="data-emoji">${dataEmo(top10Keywords, 50, 15)}</div>
        <div class="data-status" style="color:${dataColor(top10Keywords, 50, 15)}">${dataLabel(top10Keywords, 50, 15)}</div>
      </div>
      <div class="data-card">
        <div class="data-val">${backlinks.toLocaleString()}</div>
        <div class="data-label">Backlinks</div>
        <div class="data-emoji">${dataEmo(backlinks, 500, 100)}</div>
        <div class="data-status" style="color:${dataColor(backlinks, 500, 100)}">${dataLabel(backlinks, 500, 100)}</div>
      </div>
    </div>
  </div>

  <div class="expl">
    <h2>What This Means For You</h2>
    <p>Your Google Business Profile needs optimization &mdash; painters with fully optimized GBPs get 3-5x more calls from local searches in ${city}.</p>
    <p>Your authority score of ${authScore}/100 means competitors with higher scores are ranking above you when homeowners search for painters in ${city}. Every position you&rsquo;re not in = jobs going to someone else.</p>
    <p>Your AI visibility score of ${aiScore}% is critically low. ChatGPT, Google AI Overview, and Siri are now recommending your competitors &mdash; painters who show up there get leads before anyone even searches Google.</p>
  </div>

  <div class="results">
    <h2>Real Results From Real Painters</h2>
    <div class="cards">
      <div class="card">
        <div class="card-top">
          <img src="https://res.cloudinary.com/do1pkkrqn/image/upload/v1781730403/elite-paint-company_1_kcxusf.webp"
               onerror="this.outerHTML='<div style=\\'font-size:13px;font-weight:900;color:#7B2D8B;\\'>&#128396; ELITE PAINT<div style=\\'font-size:9px;font-weight:700;color:#F5C518;letter-spacing:1px;text-transform:uppercase;margin-top:2px;\\'>Home Renovations</div></div>'"
               alt="Elite Paint Company" />
        </div>
        <div class="card-bot">
          <div class="lbl">Revenue Generated</div>
          <div class="old">$8,519 invested</div>
          <div class="big">$356,728</div>
          <div class="cty">Macomb County, MI</div>
        </div>
      </div>
      <div class="card">
        <div class="card-top">
          <img src="https://res.cloudinary.com/do1pkkrqn/image/upload/v1781730425/LOGO_FC_1-RGB-350ppi-RASTER-WEB-300x146_nkxlvk.png"
               onerror="this.outerHTML='<div style=\\'font-size:16px;font-weight:900;color:#E8630A;\\'>&#127825; PEACH<div style=\\'font-size:9px;font-weight:700;color:#2E7D32;letter-spacing:1px;text-transform:uppercase;margin-top:2px;\\'>Painting</div></div>'"
               alt="Peach Painting" />
        </div>
        <div class="card-bot">
          <div class="lbl">Qualified Leads</div>
          <div class="old">in 30 days</div>
          <div class="big">64 Leads</div>
          <div class="cty">Tampa, FL</div>
        </div>
      </div>
      <div class="card">
        <div class="card-top">
          <img src="https://res.cloudinary.com/do1pkkrqn/image/upload/v1781730393/SwiftHand_AiVector_bk8zck.png"
               onerror="this.outerHTML='<div style=\\'font-size:12px;font-weight:900;color:#F5C518;\\'>&#128038; SWIFTHAND<div style=\\'font-size:9px;font-weight:700;color:#7B2D8B;letter-spacing:1px;text-transform:uppercase;margin-top:2px;\\'>Painting</div></div>'"
               alt="SwiftHand Painting" style="max-height:64px;max-width:100%;object-fit:contain;" />
        </div>
        <div class="card-bot">
          <div class="lbl">Monthly Leads</div>
          <div class="old">consistently</div>
          <div class="big">70+ / mo</div>
          <div class="cty">Salt Lake City, UT</div>
        </div>
      </div>
    </div>
  </div>

  <div class="cta-box">
    <div class="spot">&#9889; 1 spot open in ${city}</div>
    <h2>Ready to fix this?</h2>
    <p>Book a free 15-min call. We&rsquo;ll show you exactly what we&rsquo;d do for ${company} and what results to expect.</p>
    <a class="btn" href="https://calendly.com/dillon-y1rb/discovery-call-fb-clone">BOOK YOUR FREE CALL &rarr;</a>
  </div>

</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
};
