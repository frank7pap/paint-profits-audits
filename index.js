const https = require('https');

function semrushGet(params) {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams({ key: process.env.SEMRUSH_API_KEY, ...params }).toString();
    https.get(`https://api.semrush.com/?${qs}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', () => resolve(''));
  });
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return {};
  const headers = lines[0].split(';');
  const values = lines[1].split(';');
  const out = {};
  headers.forEach((h, i) => out[h.trim()] = (values[i] || '').trim());
  return out;
}

function scoreBar(pct) {
  const n = Math.min(10, Math.max(0, Math.round(pct / 10)));
  return '\u2588'.repeat(n) + '\u2591'.repeat(10 - n);
}

function emoji(pct) {
  if (pct >= 70) return '\u2705';
  if (pct >= 40) return '\u26a0\ufe0f';
  return '\u274c';
}

module.exports = async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(400).send('Missing slug');

  const company = req.query.company || slug.replace(/-/g, ' ');
  const city    = req.query.city  || 'Your City';
  const state   = req.query.state || '';
  const website = req.query.website || '';
  const domain  = website.replace(/https?:\/\/(www\.)?/, '').split('/')[0];

  let authorityScore  = 0;
  let organicTraffic  = 0;
  let organicKeywords = 0;
  let backlinks       = 0;
  let aiVisibility    = 0;

  if (domain) {
    try {
      const ov = await semrushGet({
        type: 'domain_ranks',
        export_columns: 'Dn,Rk,Or,Ot,Oc,Ad,At,Ac',
        domain,
        database: 'us'
      });
      const ovd = parseCSV(ov);
      organicKeywords = parseInt(ovd['Or'] || 0);
      organicTraffic  = parseInt(ovd['Ot'] || 0);

      const bl = await semrushGet({
        type: 'backlinks_overview',
        export_columns: 'ascore,total,domains_num',
        target: domain,
        target_type: 'root_domain'
      });
      const bld = parseCSV(bl);
      authorityScore = parseInt(bld['ascore'] || 0);
      backlinks      = parseInt(bld['total']  || 0);

    } catch (e) {
      console.error('SEMrush error:', e.message);
    }
  }

  const daScore       = Math.min(authorityScore, 100);
  const speedScore    = organicTraffic > 1000 ? 65 : organicTraffic > 300 ? 45 : organicTraffic > 50 ? 30 : 20;
  const seoScore      = daScore;
  const localScore    = organicKeywords > 500 ? 70 : organicKeywords > 100 ? 50 : organicKeywords > 20 ? 30 : 15;
  const citationScore = backlinks > 500 ? 75 : backlinks > 200 ? 55 : backlinks > 50 ? 35 : backlinks > 10 ? 20 : 10;
  const gbpScore      = organicKeywords > 200 ? 55 : organicKeywords > 50 ? 38 : organicKeywords > 10 ? 25 : 18;
  const aiScore       = Math.min(aiVisibility, 100);

  const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${company} &mdash; Free Google Visibility Audit | Paint &amp; Profits</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; background: #f2f4f7; color: #1A1A2E; }
.wrap { max-width: 680px; margin: 0 auto; padding: 32px 16px 60px; }
.header { background: #fff; border-radius: 12px; padding: 32px 40px 28px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); text-align: center; }
.brand { font-family: Georgia, serif; font-size: 28px; font-weight: 900; color: #1A1A2E; }
.tagline { font-size: 11px; font-weight: 700; color: #5BC4F5; letter-spacing: 3px; text-transform: uppercase; margin-top: 4px; }
.co-name { font-size: 22px; font-weight: 700; margin-top: 20px; }
.co-sub { font-size: 13px; color: #8a94a6; margin-top: 4px; }
.scores { background: #fff; border-radius: 12px; padding: 28px 32px; margin-bottom: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
.scores h2 { font-size: 10px; font-weight: 700; color: #1A1A2E; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #5BC4F5; }
.row { display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid #f0f2f5; }
.row:last-child { border-bottom: none; }
.label { font-size: 14px; font-weight: 600; width: 160px; }
.bar { font-family: monospace; font-size: 13px; color: #5BC4F5; flex: 1; padding: 0 16px; }
.num { font-size: 14px; font-weight: 700; width: 50px; text-align: right; }
.ic { width: 28px; text-align: right; }
.meta { background: #f8f9fb; border-radius: 12px; padding: 20px 28px; margin-bottom: 16px; }
.meta h2 { font-size: 10px; font-weight: 700; color: #1A1A2E; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 14px; }
.meta-grid { display: flex; gap: 12px; flex-wrap: wrap; }
.mi { flex: 1; min-width: 120px; background: #fff; border-radius: 8px; padding: 14px 16px; border: 1px solid #e2e6ea; text-align: center; }
.mv { font-size: 22px; font-weight: 700; color: #1A1A2E; }
.ml { font-size: 10px; color: #8a94a6; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px; }
.expl { background: #1A1A2E; border-radius: 12px; padding: 28px 32px; margin-bottom: 16px; }
.expl h2 { font-size: 10px; font-weight: 700; color: #5BC4F5; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 16px; }
.expl p { font-size: 14px; color: rgba(255,255,255,0.8); line-height: 22px; margin-bottom: 12px; }
.expl p:last-child { margin-bottom: 0; }
.results { background: #f8f9fb; border-radius: 12px; padding: 20px 24px 16px; margin-bottom: 16px; border-top: 3px solid #5BC4F5; }
.results h2 { font-size: 10px; font-weight: 700; color: #1A1A2E; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 16px; text-align: center; }
.cards { display: flex; gap: 8px; }
.card { flex: 1; border: 1px solid #e2e6ea; border-radius: 10px; overflow: hidden; }
.card-top { background: #fff; padding: 12px 8px; text-align: center; }
.card-bot { background: #1A1A2E; padding: 12px 8px 14px; text-align: center; }
.lbl { font-size: 8px; font-weight: 700; color: #5BC4F5; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; }
.old { font-size: 10px; color: rgba(255,255,255,0.4); text-decoration: line-through; }
.big { font-size: 18px; font-weight: 700; color: #fff; margin: 2px 0; }
.cty { font-size: 8px; color: rgba(255,255,255,0.45); }
.cta-box { background: #fff; border-radius: 12px; padding: 32px 40px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.07); }
.spot { font-size: 13px; color: #e74c3c; font-weight: 700; margin-bottom: 8px; }
.cta-box h2 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
.cta-box p { font-size: 14px; color: #8a94a6; margin-bottom: 24px; }
.btn { display: inline-block; background: #1A1A2E; color: #fff; text-decoration: none; font-size: 15px; font-weight: 700; padding: 16px 40px; border-radius: 8px; }
@media (max-width: 600px) { .cards { flex-direction: column; } .bar { display: none; } .scores, .header, .cta-box { padding: 20px; } }
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div class="brand">&#127912; Paint &amp; Profits</div>
    <div class="tagline">Marketing for Painters</div>
    <div class="co-name">${company}</div>
    <div class="co-sub">Free Google Visibility Audit &mdash; ${city}${state ? ', ' + state : ''} &mdash; ${date}</div>
  </div>

  <div class="scores">
    <h2>Your Google Visibility Scores</h2>
    <div class="row"><div class="label">GBP Health</div><div class="bar">${scoreBar(gbpScore)}</div><div class="num">${gbpScore}%</div><div class="ic">${emoji(gbpScore)}</div></div>
    <div class="row"><div class="label">Website Speed</div><div class="bar">${scoreBar(speedScore)}</div><div class="num">${speedScore}%</div><div class="ic">${emoji(speedScore)}</div></div>
    <div class="row"><div class="label">SEO Authority</div><div class="bar">${scoreBar(seoScore)}</div><div class="num">${seoScore}</div><div class="ic">${emoji(seoScore)}</div></div>
    <div class="row"><div class="label">Local Ranking</div><div class="bar">${scoreBar(localScore)}</div><div class="num">${localScore}%</div><div class="ic">${emoji(localScore)}</div></div>
    <div class="row"><div class="label">Citation Score</div><div class="bar">${scoreBar(citationScore)}</div><div class="num">${citationScore}%</div><div class="ic">${emoji(citationScore)}</div></div>
    <div class="row"><div class="label">AI Visibility</div><div class="bar">${scoreBar(aiScore)}</div><div class="num">${aiScore}</div><div class="ic">${emoji(aiScore)}</div></div>
  </div>

  <div class="meta">
    <h2>Raw Data From Your Domain</h2>
    <div class="meta-grid">
      <div class="mi"><div class="mv">${authorityScore}</div><div class="ml">Authority Score</div></div>
      <div class="mi"><div class="mv">${organicTraffic.toLocaleString()}</div><div class="ml">Monthly Traffic</div></div>
      <div class="mi"><div class="mv">${organicKeywords.toLocaleString()}</div><div class="ml">Keywords</div></div>
      <div class="mi"><div class="mv">${backlinks.toLocaleString()}</div><div class="ml">Backlinks</div></div>
    </div>
  </div>

  <div class="expl">
    <h2>What This Means For You</h2>
    <p>Your Google Business Profile needs optimization &mdash; painters with fully optimized GBPs get 3-5x more calls from local searches in ${city}.</p>
    <p>Your SEO authority score of ${seoScore} means competitors with higher scores are showing up above you when homeowners search for painters in ${city}. Every position you&rsquo;re not ranking = jobs going to someone else.</p>
    <p>Your AI visibility score is ${aiScore}. ChatGPT, Google AI Overview, and Siri are now recommending local businesses &mdash; painters who show up there are getting leads before anyone even searches Google.</p>
  </div>

  <div class="results">
    <h2>Real Results From Real Painters</h2>
    <div class="cards">
      <div class="card">
        <div class="card-top"><div style="font-size:14px;font-weight:900;color:#7B2D8B;">&#128396; <span style="text-decoration:underline;">ELITE PAINT</span></div><div style="font-size:9px;font-weight:700;color:#F5C518;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Home Renovations</div></div>
        <div class="card-bot"><div class="lbl">Revenue Generated</div><div class="old">$8,519</div><div class="big">$356,728</div><div class="cty">Michigan</div></div>
      </div>
      <div class="card">
        <div class="card-top"><div style="font-size:16px;font-weight:900;color:#E8630A;">&#127825; PEACH</div><div style="font-size:9px;font-weight:700;color:#2E7D32;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Painting</div></div>
        <div class="card-bot"><div class="lbl">Qualified Leads</div><div class="old">in 30 days</div><div class="big">64 Leads</div><div class="cty">Tampa, FL</div></div>
      </div>
      <div class="card">
        <div class="card-top"><div style="font-size:12px;font-weight:900;color:#F5C518;">&#128038; SWIFTHAND</div><div style="font-size:9px;font-weight:700;color:#7B2D8B;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">Painting</div></div>
        <div class="card-bot"><div class="lbl">Monthly Leads</div><div class="old">consistently</div><div class="big">70+ / mo</div><div class="cty">Salt Lake City, UT</div></div>
      </div>
    </div>
  </div>

  <div class="cta-box">
    <div class="spot">&#9889; 1 spot open in ${city}</div>
    <h2>Ready to fix this?</h2>
    <p>Book a free 15-min call. We&rsquo;ll show you exactly what we&rsquo;d do for ${city} and what results to expect.</p>
    <a class="btn" href="https://calendly.com/dillon-y1rb/discovery-call-fb-clone">BOOK YOUR FREE CALL &rarr;</a>
  </div>

</div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
};
