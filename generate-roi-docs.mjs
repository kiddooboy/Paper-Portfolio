import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const OUT_DIR = path.resolve('docs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const STYLES = `
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
:root{--green:#16a34a;--blue:#2563eb;--indigo:#4f46e5;--amber:#d97706;--red:#dc2626;--slate:#475569;--bg:#f8fafc;--card:#ffffff;--border:#e2e8f0;--text:#0f172a;--muted:#64748b;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;font-size:10.5pt;line-height:1.65;color:var(--text);background:var(--bg);}

.cover{page-break-after:always;min-height:100vh;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%);padding:60px 72px;color:#fff;position:relative;overflow:hidden;}
.cover::before{content:'';position:absolute;top:-100px;right:-100px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,0.25) 0%,transparent 70%);}
.cover::after{content:'';position:absolute;bottom:-80px;left:-80px;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(22,163,74,0.2) 0%,transparent 70%);}
.cover-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(37,99,235,0.3);border:1px solid rgba(96,165,250,0.4);border-radius:999px;padding:6px 18px;font-size:9pt;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd;margin-bottom:32px;width:fit-content;}
.cover h1{font-size:38pt;font-weight:800;line-height:1.15;color:#fff;margin-bottom:16px;letter-spacing:-.02em;}
.cover h1 span{color:#60a5fa;}
.cover .subtitle{font-size:14pt;font-weight:400;color:#94a3b8;margin-bottom:48px;max-width:560px;}
.cover-meta{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:40px;position:relative;z-index:1;}
.cover-meta-item{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:20px 24px;}
.cmi-label{font-size:8pt;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;}
.cmi-value{font-size:18pt;font-weight:700;color:#fff;}
.cmi-desc{font-size:8.5pt;color:#94a3b8;margin-top:2px;}
.cover-footer{margin-top:60px;font-size:8.5pt;color:#475569;position:relative;z-index:1;}

.toc-page{page-break-after:always;padding:56px 72px;background:var(--card);}
.toc-page h2{font-size:22pt;font-weight:700;margin-bottom:32px;}
.toc-row{display:flex;align-items:baseline;justify-content:space-between;padding:7px 0;border-bottom:1px dashed var(--border);}
.toc-title{font-size:10pt;font-weight:600;}
.toc-sub{font-size:9pt;color:var(--muted);padding-left:18px;}
.toc-pg{font-size:9pt;color:var(--blue);font-weight:600;}

.page{padding:48px 72px;page-break-after:always;background:var(--bg);}
.page:last-child{page-break-after:auto;}

.sh{display:flex;align-items:center;gap:14px;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid var(--border);}
.sn{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13pt;font-weight:700;flex-shrink:0;}
.nb{background:#dbeafe;color:var(--blue);}
.ng{background:#dcfce7;color:var(--green);}
.ni{background:#e0e7ff;color:var(--indigo);}
.na{background:#fef3c7;color:var(--amber);}
.sh h2{font-size:16pt;font-weight:700;}
.stag{margin-left:auto;font-size:8pt;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.1em;}

h3{font-size:11.5pt;font-weight:700;color:var(--text);margin:24px 0 12px;}
h4{font-size:10.5pt;font-weight:600;color:var(--slate);margin:16px 0 8px;}
p{margin-bottom:10px;color:#1e293b;}
ul{padding-left:18px;margin-bottom:10px;}
li{margin-bottom:4px;font-size:10pt;}

.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:16px;}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}

.kpi{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:18px 20px;position:relative;overflow:hidden;}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;}
.kb::before{background:var(--blue);}
.kg::before{background:var(--green);}
.ka::before{background:var(--amber);}
.ki::before{background:var(--indigo);}
.kr::before{background:var(--red);}
.kl{font-size:8pt;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;}
.kv{font-size:20pt;font-weight:800;line-height:1;margin-bottom:4px;}
.kb .kv{color:var(--blue);} .kg .kv{color:var(--green);} .ka .kv{color:var(--amber);} .ki .kv{color:var(--indigo);} .kr .kv{color:var(--red);}
.kd{font-size:8.5pt;color:var(--muted);}

.tw{overflow:hidden;border-radius:10px;border:1px solid var(--border);margin-bottom:20px;}
table{width:100%;border-collapse:collapse;background:var(--card);font-size:9.5pt;}
thead tr{background:#0f172a;}
thead th{color:#e2e8f0;font-weight:600;font-size:8.5pt;text-transform:uppercase;letter-spacing:.06em;padding:10px 14px;text-align:left;}
tbody tr{border-bottom:1px solid var(--border);}
tbody tr:last-child{border-bottom:none;}
tbody tr:nth-child(even){background:#f8fafc;}
td{padding:9px 14px;vertical-align:top;}
td.r,th.r{text-align:right;}
td.c,th.c{text-align:center;}
.tr{background:#eff6ff!important;font-weight:700;}
.tr td{color:var(--blue);}
.gt{background:#0f172a!important;}
.gt td{color:#fff!important;font-weight:700;font-size:10pt;}
.st{background:#f0fdf4!important;font-weight:600;}
.st td{color:var(--green);}

.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:8pt;font-weight:600;}
.bg{background:#dcfce7;color:#15803d;}
.bb{background:#dbeafe;color:#1d4ed8;}
.ba{background:#fef3c7;color:#b45309;}
.br{background:#fee2e2;color:#b91c1c;}
.bi{background:#e0e7ff;color:#4338ca;}
.bs{background:#f1f5f9;color:#475569;}

.cb{border-left:4px solid;border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:16px;}
.cbl{border-color:var(--blue);background:#eff6ff;}
.cgg{border-color:var(--green);background:#f0fdf4;}
.cam{border-color:var(--amber);background:#fffbeb;}
.crd{border-color:var(--red);background:#fef2f2;}
.ct{font-size:9.5pt;font-weight:700;margin-bottom:4px;}
.cbl .ct{color:var(--blue);} .cgg .ct{color:var(--green);} .cam .ct{color:var(--amber);} .crd .ct{color:var(--red);}
.cy{font-size:9pt;color:var(--slate);}

.pr{margin-bottom:12px;}
.pl{display:flex;justify-content:space-between;font-size:9pt;margin-bottom:4px;}
.pl .pn{font-weight:600;} .pl .pv{color:var(--muted);}
.pt{height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;}
.pf{height:100%;border-radius:999px;}
.fb{background:var(--blue);} .fg{background:var(--green);} .fa{background:var(--amber);} .fi{background:var(--indigo);} .fr{background:var(--red);}

.tl{position:relative;padding-left:28px;margin-bottom:16px;}
.tl::before{content:'';position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--border);}
.ti{position:relative;margin-bottom:20px;}
.td{position:absolute;left:-24px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid var(--card);}
.db{background:var(--blue);} .dg{background:var(--green);} .di{background:var(--indigo);} .da{background:var(--amber);}
.tt{font-size:10.5pt;font-weight:700;margin-bottom:4px;}
.ts{font-size:9pt;color:var(--muted);}

.ph{overflow:hidden;border-radius:12px;border:1px solid var(--border);margin-bottom:16px;}
.phh{padding:12px 18px;display:flex;align-items:center;justify-content:space-between;}
.phh h4{margin:0;font-size:11pt;color:#fff;}
.phh .pu{font-size:9pt;color:rgba(255,255,255,.75);}
.phb .phh{background:var(--blue);} .phg .phh{background:var(--green);} .phi .phh{background:var(--indigo);}
.phbody{padding:16px 18px;background:var(--card);}
.card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:16px;}
.tc{color:var(--green);} .tb{color:var(--blue);} .tr2{color:var(--red);} .tm{color:var(--muted);}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
</style>`;

const COVER = `
<div class="cover">
  <div class="cover-badge">Confidential · Strategic Document · 2025</div>
  <h1>ROI &amp; Monetisation<br/><span>Strategy Report</span></h1>
  <p class="subtitle">Cost Analysis, Revenue Modelling &amp; Adoption Roadmap<br/>for the Paper Portfolio Platform — Indian Market</p>
  <div class="cover-meta">
    <div class="cover-meta-item">
      <div class="cmi-label">Break-even</div>
      <div class="cmi-value">Month 3</div>
      <div class="cmi-desc">From deployment go-live</div>
    </div>
    <div class="cover-meta-item">
      <div class="cmi-label">3-Year Net ROI</div>
      <div class="cmi-value">2,744 %</div>
      <div class="cmi-desc">Internal cost-avoidance basis</div>
    </div>
    <div class="cover-meta-item">
      <div class="cmi-label">Organisation Scale</div>
      <div class="cmi-value">27,000</div>
      <div class="cmi-desc">Total users — 3,500 active</div>
    </div>
  </div>
  <div class="cover-footer">
    All figures in Indian Rupees (₹) · Cloud costs at AWS ap-south-1 (Mumbai) rates · Exchange ref: ₹84/USD<br/>
    Paper Portfolio Platform · Version 1.0 · May 2025 · Internal Strategic Review Document
  </div>
</div>`;

const TOC = `
<div class="toc-page">
  <h2>Table of Contents</h2>
  <div class="toc-row"><span class="toc-title">1. Executive Summary</span><span class="toc-pg">3</span></div>
  <div class="toc-row"><span class="toc-sub">Key Metrics · Strategic Rationale · Document Scope</span></div>
  <div class="toc-row"><span class="toc-title">2. Cost Analysis — Build Phase (One-Time)</span><span class="toc-pg">4</span></div>
  <div class="toc-row"><span class="toc-sub">Development · Design · QA · DevOps · Security · Project Management</span></div>
  <div class="toc-row"><span class="toc-title">3. Cost Analysis — Operational (Recurring)</span><span class="toc-pg">5</span></div>
  <div class="toc-row"><span class="toc-sub">Phase 1 / 2 / 3 Monthly Breakdown · Annual · 2-Year · 3-Year TCO</span></div>
  <div class="toc-row"><span class="toc-title">4. Monetisation Strategy</span><span class="toc-pg">7</span></div>
  <div class="toc-row"><span class="toc-sub">Revenue Streams · VaaS Model · Pricing Tiers · Competitive Landscape</span></div>
  <div class="toc-row"><span class="toc-title">5. User Adoption &amp; Scaling Model</span><span class="toc-pg">9</span></div>
  <div class="toc-row"><span class="toc-sub">Phase 1 · 2 · 3 Rollout · KPIs · Revenue per Phase</span></div>
  <div class="toc-row"><span class="toc-title">6. Adoption Strategy &amp; Roadmap</span><span class="toc-pg">11</span></div>
  <div class="toc-row"><span class="toc-sub">Change Management · Internal vs. External · Go-to-Market</span></div>
  <div class="toc-row"><span class="toc-title">7. ROI Summary &amp; Financial Projections</span><span class="toc-pg">13</span></div>
  <div class="toc-row"><span class="toc-sub">Break-even · Payback Period · 1Y / 2Y / 3Y ROI · Sensitivity Analysis</span></div>
  <div class="toc-row"><span class="toc-title">8. Appendix — Assumptions &amp; Methodology</span><span class="toc-pg">15</span></div>
</div>`;

const SEC1 = `
<div class="page">
  <div class="sh"><div class="sn nb">1</div><h2>Executive Summary</h2><span class="stag">Strategic Overview</span></div>
  <p>Paper Portfolio is a real-time stock market simulation platform built for enterprise deployment. It enables employees to practise equity investing, F&amp;O trading, and portfolio management using live NSE/BSE market data with zero financial risk. This document presents a comprehensive cost model in Indian Rupees, a monetisation framework, and a 3-year ROI projection to support internal investment decisions and potential external commercialisation within the Indian market.</p>
  <div class="g4" style="margin-top:20px">
    <div class="kpi kb"><div class="kl">Total Build Cost</div><div class="kv">₹20 L</div><div class="kd">One-time investment</div></div>
    <div class="kpi kg"><div class="kl">Break-even Point</div><div class="kv">Month 3</div><div class="kd">From go-live (Phase 1)</div></div>
    <div class="kpi ki"><div class="kl">3-Year ROI</div><div class="kv">2,744%</div><div class="kd">Internal cost-avoidance</div></div>
    <div class="kpi ka"><div class="kl">External Rev Y3</div><div class="kv">₹8.16 Cr</div><div class="kd">SaaS licensing potential</div></div>
  </div>
  <h3>Strategic Rationale</h3>
  <div class="two">
    <div>
      <div class="cb cgg"><div class="ct">Internal Value</div><div class="cy">Replacing commercial training simulators (avg. ₹800–₹1,500/user/month) with a purpose-built internal platform reduces per-user cost to under <strong>₹23/month</strong> at full scale — a saving of over <strong>₹2.09 Crore per month</strong> with 27,000 users on the platform.</div></div>
      <div class="cb cbl"><div class="ct">External Monetisation</div><div class="cy">The platform fits a <strong>VaaS (Value-as-a-Service)</strong> model. White-labelled and sold to other Indian organisations — corporates, BFSI firms, universities — it can generate ₹8.16 Crore in SaaS revenue by Year 3 with a conservative 125-customer target.</div></div>
    </div>
    <div>
      <div class="cb cam"><div class="ct">Scalability</div><div class="cy">Moving from 1,000 to 27,000 users increases infrastructure costs only ~10×, while cost-avoidance value scales linearly at ~27×. The platform is architecturally ready for horizontal scale via AWS ECS Fargate.</div></div>
      <div class="cb cbl" style="border-color:#4f46e5;background:#eef2ff"><div class="ct" style="color:#4f46e5">Competitive Moat</div><div class="cy">Live NSE/BSE data, AI-assisted trade chat, F&amp;O simulation (options chain, Greeks), MIS intraday, and community features create significant switching costs vs. generic simulators available in the Indian market.</div></div>
    </div>
  </div>
  <h3>Document Scope &amp; Currency</h3>
  <p>All figures are in <strong>Indian Rupees (₹)</strong>. Personnel costs use Indian 2024 market rates. AWS cloud costs are based on ap-south-1 (Mumbai) on-demand rates with 20% Reserved Instance discount, converted at <strong>₹84/USD</strong>. Market data costs reference NSE/BSE authorised data-vendor rate cards (DataFeed India, Global DataFeed). AI API costs use Anthropic Claude Sonnet pricing at projected usage levels, converted to ₹.</p>
</div>`;

const SEC2 = `
<div class="page">
  <div class="sh"><div class="sn nb">2</div><h2>Cost Analysis — Build Phase</h2><span class="stag">One-Time Investment</span></div>
  <div class="cb cbl"><div class="ct">Scope</div><div class="cy">Build costs cover all non-recurring expenditure from project inception to production go-live — development, design, QA, DevOps, documentation, and security hardening. These are incurred once and do not repeat in subsequent years.</div></div>
  <h3>2.1 Detailed Build Cost Breakdown</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Cost Category</th><th>Resource / Detail</th><th>Duration</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr><td><strong>Full-Stack Development</strong></td><td>1 Senior Developer (React, Node.js, SQLite, WebSocket)</td><td>4 months</td><td class="r">₹2,50,000/mo</td><td class="r"><strong>₹10,00,000</strong></td></tr>
        <tr><td><strong>UI/UX Design</strong></td><td>Figma prototyping, component system, dark/light themes</td><td>1.5 months</td><td class="r">₹1,00,000/mo</td><td class="r"><strong>₹1,50,000</strong></td></tr>
        <tr><td><strong>QA &amp; Testing</strong></td><td>Manual test cycles, regression suites, cross-device testing</td><td>1 month</td><td class="r">₹80,000/mo</td><td class="r"><strong>₹80,000</strong></td></tr>
        <tr><td><strong>DevOps / CI-CD Setup</strong></td><td>Docker, Nginx, GitHub Actions, AWS provisioning</td><td>3 weeks</td><td class="r">₹1,20,000/mo</td><td class="r"><strong>₹90,000</strong></td></tr>
        <tr><td><strong>Security Audit &amp; Hardening</strong></td><td>OWASP review, JWT hardening, rate limiting, pen-test</td><td>2 weeks</td><td class="r">₹1,50,000/mo</td><td class="r"><strong>₹75,000</strong></td></tr>
        <tr><td><strong>Technical Documentation</strong></td><td>API docs, architecture docs, user manuals</td><td>1 week</td><td class="r">₹1,00,000/mo</td><td class="r"><strong>₹25,000</strong></td></tr>
        <tr><td><strong>Project Management</strong></td><td>Sprint planning, stakeholder reviews, coordination</td><td>4 months</td><td class="r">₹62,500/mo</td><td class="r"><strong>₹2,50,000</strong></td></tr>
        <tr><td><strong>Contingency (15%)</strong></td><td>Scope changes, integration complexity buffer</td><td>—</td><td class="r">—</td><td class="r"><strong>₹3,30,000</strong></td></tr>
        <tr class="tr"><td colspan="4"><strong>Total One-Time Build Cost</strong></td><td class="r"><strong>₹20,00,000</strong></td></tr>
      </tbody>
    </table>
  </div>
  <h3>2.2 Build Cost Composition</h3>
  <div class="card">
    <div class="pr"><div class="pl"><span class="pn">Full-Stack Development</span><span class="pv">₹10,00,000 — 50.0%</span></div><div class="pt"><div class="pf fb" style="width:50%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Project Management</span><span class="pv">₹2,50,000 — 12.5%</span></div><div class="pt"><div class="pf fa" style="width:12.5%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Contingency</span><span class="pv">₹3,30,000 — 16.5%</span></div><div class="pt"><div class="pf fi" style="width:16.5%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">UI/UX Design</span><span class="pv">₹1,50,000 — 7.5%</span></div><div class="pt"><div class="pf fb" style="width:7.5%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">QA &amp; Testing</span><span class="pv">₹80,000 — 4.0%</span></div><div class="pt"><div class="pf fg" style="width:4%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">DevOps / Infrastructure Setup</span><span class="pv">₹90,000 — 4.5%</span></div><div class="pt"><div class="pf fb" style="width:4.5%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Security Audit</span><span class="pv">₹75,000 — 3.75%</span></div><div class="pt"><div class="pf fr" style="width:3.75%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Documentation</span><span class="pv">₹25,000 — 1.25%</span></div><div class="pt"><div class="pf fa" style="width:1.25%"></div></div></div>
  </div>
  <div class="cb cgg"><div class="ct">Cost Benchmark — Indian Market</div><div class="cy">A comparable enterprise-grade fintech training platform built by an Indian software agency typically costs ₹60–₹1.5 Crore. Paper Portfolio achieves equivalent functionality at <strong>₹20 Lakhs</strong> — due to a lean tech stack, open-source components, and a single skilled senior full-stack developer model. Developer rate of ₹2.5L/month corresponds to ₹30 LPA — standard for a senior full-stack engineer in Bangalore/Mumbai (2024 market).</div></div>
</div>`;

const SEC3 = `
<div class="page">
  <div class="sh"><div class="sn nb">3</div><h2>Cost Analysis — Operational (Recurring)</h2><span class="stag">Monthly · Annual · Multi-Year</span></div>
  <p>Operational costs are segmented by deployment phase, reflecting how infrastructure, support, and API spending scale with user load. All cloud costs are at AWS ap-south-1 (Mumbai) rates.</p>
  <h3>3.1 Phase 1 — Pilot (1,000 Users) · Months 1–6 · ₹62,000/month</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Cost Item</th><th>Specification</th><th class="r">Monthly (₹)</th></tr></thead>
      <tbody>
        <tr><td>Cloud — Compute</td><td>2× t3.medium EC2 (app + API), 20% RI discount</td><td class="r">₹8,800</td></tr>
        <tr><td>Cloud — Database</td><td>db.t3.small RDS (SQLite-compatible)</td><td class="r">₹4,200</td></tr>
        <tr><td>Cloud — Storage &amp; S3</td><td>Static assets, log storage, daily backups</td><td class="r">₹2,000</td></tr>
        <tr><td>Cloud — Networking</td><td>ALB, Route 53, data transfer (~50 GB/mo)</td><td class="r">₹3,000</td></tr>
        <tr><td>Market Data API</td><td>NSE/BSE authorised vendor — basic tier (equity only)</td><td class="r">₹16,000</td></tr>
        <tr><td>AI API (Claude Sonnet)</td><td>~500K tokens/month · ₹252/M input, ₹1,260/M output</td><td class="r">₹10,000</td></tr>
        <tr><td>Monitoring &amp; Alerting</td><td>UptimeRobot Pro + basic log aggregation</td><td class="r">₹1,500</td></tr>
        <tr><td>Domain, SSL, CDN</td><td>Cloudflare Pro + domain renewal (amortised)</td><td class="r">₹1,500</td></tr>
        <tr><td>Dev Support (Part-time)</td><td>10 hrs/month × ₹1,200/hr — patches &amp; bug fixes</td><td class="r">₹12,000</td></tr>
        <tr><td>Email / Notifications</td><td>AWS SES — price alerts, account emails</td><td class="r">₹800</td></tr>
        <tr><td>Misc / Buffer (5%)</td><td>Unplanned usage spikes, minor tools</td><td class="r">₹2,200</td></tr>
        <tr class="tr"><td colspan="2"><strong>Phase 1 Total Monthly</strong></td><td class="r"><strong>₹62,000</strong></td></tr>
      </tbody>
    </table>
  </div>
  <h3>3.2 Phase 2 — Active User Base (3,500 Users) · Months 7–18 · ₹1,36,000/month</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Cost Item</th><th>Specification</th><th class="r">Monthly (₹)</th></tr></thead>
      <tbody>
        <tr><td>Cloud — Compute</td><td>4× t3.large EC2 (auto-scaled), 20% RI discount</td><td class="r">₹22,000</td></tr>
        <tr><td>Cloud — Database</td><td>db.t3.medium RDS + 1 read replica</td><td class="r">₹8,500</td></tr>
        <tr><td>Cloud — Storage &amp; S3</td><td>Increased log volume, community media assets</td><td class="r">₹4,500</td></tr>
        <tr><td>Cloud — Networking</td><td>ALB, higher data transfer (~200 GB/mo)</td><td class="r">₹7,000</td></tr>
        <tr><td>Market Data API</td><td>NSE/BSE standard tier — equity + F&amp;O data feed</td><td class="r">₹29,000</td></tr>
        <tr><td>AI API (Claude Sonnet)</td><td>~2M tokens/month (3.5× user base growth)</td><td class="r">₹23,000</td></tr>
        <tr><td>Monitoring &amp; Alerting</td><td>Datadog Free + enhanced alerting rules</td><td class="r">₹7,000</td></tr>
        <tr><td>Domain, SSL, CDN</td><td>Cloudflare Pro + WAF rules</td><td class="r">₹2,500</td></tr>
        <tr><td>Dev Support (Part-time)</td><td>20 hrs/month × ₹1,200/hr</td><td class="r">₹24,000</td></tr>
        <tr><td>Email / Notifications</td><td>AWS SES — higher volume, price alerts</td><td class="r">₹2,000</td></tr>
        <tr><td>Misc / Buffer (5%)</td><td></td><td class="r">₹6,500</td></tr>
        <tr class="tr"><td colspan="2"><strong>Phase 2 Total Monthly</strong></td><td class="r"><strong>₹1,36,000</strong></td></tr>
      </tbody>
    </table>
  </div>
  <h3>3.3 Phase 3 — Full Organisation (27,000 Users) · Month 19+ · ₹6,12,000/month</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Cost Item</th><th>Specification</th><th class="r">Monthly (₹)</th></tr></thead>
      <tbody>
        <tr><td>Cloud — Compute</td><td>ECS Fargate cluster (auto-scale), multi-AZ ALB</td><td class="r">₹1,55,000</td></tr>
        <tr><td>Cloud — Database</td><td>db.r5.large RDS Multi-AZ + 2 read replicas</td><td class="r">₹58,000</td></tr>
        <tr><td>Cloud — Storage &amp; S3</td><td>High-volume logs, community content, 30-day backups</td><td class="r">₹18,000</td></tr>
        <tr><td>Cloud — Networking</td><td>Multi-AZ ALB, CloudFront CDN, high egress (~2 TB/mo)</td><td class="r">₹36,000</td></tr>
        <tr><td>Market Data API</td><td>NSE/BSE premium — full symbol set, F&amp;O Greeks, OI data</td><td class="r">₹58,000</td></tr>
        <tr><td>AI API (Claude Sonnet)</td><td>~15M tokens/month at full user scale</td><td class="r">₹80,000</td></tr>
        <tr><td>Monitoring / APM</td><td>Datadog Pro — APM, logs, infra dashboards</td><td class="r">₹13,000</td></tr>
        <tr><td>Domain, SSL, CDN</td><td>Cloudflare Business + advanced WAF</td><td class="r">₹7,000</td></tr>
        <tr><td>Full-time Dev (Maintenance)</td><td>1 FTE Senior Engineer dedicated to platform (₹24 LPA)</td><td class="r">₹2,00,000</td></tr>
        <tr><td>Part-time Support Staff</td><td>0.5 FTE — helpdesk, user onboarding, L&amp;D queries</td><td class="r">₹50,000</td></tr>
        <tr><td>Email / Notifications</td><td>AWS SES — high-volume price alerts + digests</td><td class="r">₹10,000</td></tr>
        <tr><td>Misc / Buffer (5%)</td><td></td><td class="r">₹27,000</td></tr>
        <tr class="tr"><td colspan="2"><strong>Phase 3 Total Monthly</strong></td><td class="r"><strong>₹6,12,000</strong></td></tr>
      </tbody>
    </table>
  </div>
</div>`;

const SEC3B = `
<div class="page">
  <div class="sh"><div class="sn nb">3</div><h2>Cost Analysis — Multi-Year Summary</h2><span class="stag">Continued</span></div>
  <h3>3.4 Annual &amp; Cumulative Cost Projections</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Period</th><th>Phase</th><th class="r">One-Time Build</th><th class="r">Operational</th><th class="r">Period Total</th><th class="r">Cumulative</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Year 1</strong><br/><span class="tm" style="font-size:8.5pt">Months 1–12</span></td>
          <td>Build + Phase 1 (mo 1–6) + Phase 2 entry (mo 7–12)</td>
          <td class="r">₹20,00,000</td>
          <td class="r">₹11,88,000<br/><span class="tm" style="font-size:8pt">(₹62K×6 + ₹1.36L×6)</span></td>
          <td class="r"><strong>₹31,88,000</strong></td>
          <td class="r">₹31,88,000</td>
        </tr>
        <tr>
          <td><strong>Year 2</strong><br/><span class="tm" style="font-size:8.5pt">Months 13–24</span></td>
          <td>Phase 2 (mo 13–18) + Phase 3 entry (mo 19–24)</td>
          <td class="r">—</td>
          <td class="r">₹44,88,000<br/><span class="tm" style="font-size:8pt">(₹1.36L×6 + ₹6.12L×6)</span></td>
          <td class="r"><strong>₹44,88,000</strong></td>
          <td class="r">₹76,76,000</td>
        </tr>
        <tr>
          <td><strong>Year 3</strong><br/><span class="tm" style="font-size:8.5pt">Months 25–36</span></td>
          <td>Phase 3 full scale (all 12 months)</td>
          <td class="r">—</td>
          <td class="r">₹73,44,000<br/><span class="tm" style="font-size:8pt">(₹6.12L×12)</span></td>
          <td class="r"><strong>₹73,44,000</strong></td>
          <td class="r">₹1,50,20,000</td>
        </tr>
        <tr class="gt"><td colspan="4"><strong>3-Year Total Cost of Ownership (TCO)</strong></td><td class="r"><strong>₹1,50,20,000</strong></td><td class="r"><strong>₹1.50 Crore</strong></td></tr>
      </tbody>
    </table>
  </div>
  <h3>3.5 Cost per Active User — Unit Economics</h3>
  <div class="g3">
    <div class="kpi kb"><div class="kl">Phase 1 · Per User / Month</div><div class="kv">₹62</div><div class="kd">1,000 users · ₹62,000/mo ops</div></div>
    <div class="kpi kg"><div class="kl">Phase 2 · Per User / Month</div><div class="kv">₹39</div><div class="kd">3,500 users · ₹1,36,000/mo ops</div></div>
    <div class="kpi ki"><div class="kl">Phase 3 · Per User / Month</div><div class="kv">₹23</div><div class="kd">27,000 users · ₹6,12,000/mo ops</div></div>
  </div>
  <div class="cb cgg"><div class="ct">Economy of Scale Advantage</div><div class="cy">As users grow 27× from Phase 1 to Phase 3, monthly ops cost grows only ~10×. Per-user cost falls from ₹62 → ₹23 — a <strong>63% reduction</strong>. Comparable Indian platforms charge ₹800–₹1,500/user/month. Paper Portfolio at full scale is <strong>35–65× cheaper per user</strong>.</div></div>
  <h3>3.6 Cost Category Distribution — Year 3 Steady State (₹6,12,000/month)</h3>
  <div class="card">
    <div class="pr"><div class="pl"><span class="pn">Personnel (Dev ₹2L + Support ₹50K)</span><span class="pv">₹2,50,000/mo — 40.8%</span></div><div class="pt"><div class="pf fb" style="width:40.8%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Cloud Infrastructure (Compute + DB + Net + Storage)</span><span class="pv">₹2,67,000/mo — 43.6%</span></div><div class="pt"><div class="pf fi" style="width:43.6%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">AI API (Claude Sonnet)</span><span class="pv">₹80,000/mo — 13.1%</span></div><div class="pt"><div class="pf fg" style="width:13.1%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Market Data API (NSE/BSE Premium)</span><span class="pv">₹58,000/mo — 9.5%</span></div><div class="pt"><div class="pf fa" style="width:9.5%"></div></div></div>
    <div class="pr"><div class="pl"><span class="pn">Monitoring, CDN, Email, Misc</span><span class="pv">₹57,000/mo — 9.3%</span></div><div class="pt"><div class="pf fr" style="width:9.3%"></div></div></div>
  </div>
</div>`;

const SEC4 = `
<div class="page">
  <div class="sh"><div class="sn ng">4</div><h2>Monetisation Strategy</h2><span class="stag">Revenue Streams &amp; Pricing</span></div>
  <p>Paper Portfolio supports two parallel monetisation tracks: <strong>internal cost-avoidance</strong> (value realised within the organisation) and <strong>external SaaS revenue</strong> (white-labelled licensing to other Indian organisations). Both tracks qualify as a <strong>VaaS (Value-as-a-Service)</strong> model.</p>
  <h3>4.1 VaaS Model Fit Assessment</h3>
  <div class="tw">
    <table>
      <thead><tr><th>VaaS Criterion</th><th>Paper Portfolio Response</th><th class="c">Score</th></tr></thead>
      <tbody>
        <tr><td><strong>Measurable Outcome Delivery</strong></td><td>Quantifiable skill improvement via P&amp;L analytics, trade accuracy scores, portfolio performance vs. Nifty 50 benchmark</td><td class="c"><span class="badge bg">Strong ✓</span></td></tr>
        <tr><td><strong>Recurring Value Creation</strong></td><td>Daily live NSE/BSE data creates fresh simulation scenarios — value compounds during high-volatility events (budget day, RBI policy, earnings seasons)</td><td class="c"><span class="badge bg">Strong ✓</span></td></tr>
        <tr><td><strong>Usage-Based Pricing Potential</strong></td><td>AI chat, F&amp;O simulation, advanced analytics, and leaderboard modules can be metered individually</td><td class="c"><span class="badge bg">Strong ✓</span></td></tr>
        <tr><td><strong>Customer Outcome Alignment</strong></td><td>Employees who improve market knowledge reduce impulsive decisions and align personal investments with organisational financial literacy goals</td><td class="c"><span class="badge bb">Moderate ✓</span></td></tr>
      </tbody>
    </table>
  </div>
  <h3>4.2 Primary Revenue Streams</h3>
  <div class="g2">
    <div class="card" style="border-left:3px solid var(--green)">
      <h4 style="color:var(--green);margin-top:0">Stream A — Internal Cost Avoidance</h4>
      <p style="font-size:9.5pt">Replaces external training platforms. Value is realised as avoided expenditure — measurable against per-seat costs of Indian alternatives.</p>
      <ul style="font-size:9pt">
        <li>A1: Platform licence replacement (vs. Sensibull, paid simulators)</li>
        <li>A2: Reduction in external financial literacy workshops</li>
        <li>A3: Reduced L&amp;D budget for market awareness training</li>
      </ul>
      <span class="badge bg" style="margin-top:8px;display:inline-block">₹2.09 Cr/month at Phase 3</span>
    </div>
    <div class="card" style="border-left:3px solid var(--blue)">
      <h4 style="color:var(--blue);margin-top:0">Stream B — External SaaS Licensing</h4>
      <p style="font-size:9.5pt">White-labelled and sold to Indian corporates, BFSI firms, CA institutes, and universities.</p>
      <ul style="font-size:9pt">
        <li>B1: Monthly/annual SaaS subscriptions per organisation</li>
        <li>B2: White-label / custom-branding add-on fee</li>
        <li>B3: Professional services — onboarding &amp; integration</li>
      </ul>
      <span class="badge bb" style="margin-top:8px;display:inline-block">₹8.16 Cr potential by Year 3</span>
    </div>
    <div class="card" style="border-left:3px solid var(--indigo)">
      <h4 style="color:var(--indigo);margin-top:0">Stream C — Premium Add-on Modules</h4>
      <ul style="font-size:9pt">
        <li>C1: AI-powered personalised coaching &amp; trade feedback</li>
        <li>C2: Advanced F&amp;O strategy simulator (Greeks, payoff diagrams)</li>
        <li>C3: Custom leaderboards and gamification engine</li>
        <li>C4: API access for LMS / HRMS integrations</li>
      </ul>
      <span class="badge bi" style="margin-top:8px;display:inline-block">₹20–40L/year potential</span>
    </div>
    <div class="card" style="border-left:3px solid var(--amber)">
      <h4 style="color:var(--amber);margin-top:0">Stream D — Data &amp; Analytics (Long-term)</h4>
      <ul style="font-size:9pt">
        <li>D1: Anonymised trading behaviour datasets for fintech research</li>
        <li>D2: Retail sentiment indicators from simulated trades</li>
        <li>D3: Sponsored research partnerships with IIMs / IITs</li>
      </ul>
      <span class="badge ba" style="margin-top:8px;display:inline-block">Exploratory — Year 3+</span>
    </div>
  </div>
</div>`;

const SEC4B = `
<div class="page">
  <div class="sh"><div class="sn ng">4</div><h2>Monetisation — Pricing Models</h2><span class="stag">Continued</span></div>
  <h3>4.3 External SaaS Pricing Tiers (Indian Market)</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Tier</th><th>Seat Limit</th><th class="r">Monthly</th><th class="r">Annual</th><th>Target Customer</th><th>Features</th></tr></thead>
      <tbody>
        <tr><td><span class="badge bs">Freemium</span></td><td>Up to 10 users</td><td class="r"><strong>Free</strong></td><td class="r">Free</td><td>Lead generation, individual teams</td><td>Core simulator, Paper Portfolio branding</td></tr>
        <tr><td><span class="badge bs">Starter</span></td><td>Up to 50 users</td><td class="r"><strong>₹15,000</strong></td><td class="r">₹1,50,000</td><td>SME, startup, small HR team</td><td>Core sim, basic analytics, email alerts</td></tr>
        <tr><td><span class="badge bb">Growth</span></td><td>Up to 500 users</td><td class="r"><strong>₹40,000</strong></td><td class="r">₹4,00,000</td><td>Mid-size corp, trading desks</td><td>Starter + F&amp;O sim, leaderboards, AI chat</td></tr>
        <tr><td><span class="badge bi">Business</span></td><td>Up to 2,000 users</td><td class="r"><strong>₹1,00,000</strong></td><td class="r">₹10,00,000</td><td>Large enterprise, BFSI firm</td><td>Growth + custom branding, SSO, admin panel</td></tr>
        <tr><td><span class="badge bg">Enterprise</span></td><td>Unlimited</td><td class="r"><strong>₹2,50,000+</strong></td><td class="r">Custom</td><td>Banks, universities, large corps</td><td>Business + API access, SLA 99.9%, dedicated support</td></tr>
      </tbody>
    </table>
  </div>
  <div class="two">
    <div>
      <h3>4.4 Pricing Rationale</h3>
      <ul>
        <li><strong>Freemium top-of-funnel</strong>: drives organic adoption; B2B SaaS benchmarks suggest 8–12% freemium-to-paid conversion</li>
        <li><strong>Annual billing discount (16.7%)</strong>: improves cash flow predictability and reduces churn</li>
        <li><strong>Seat-based tiers</strong>: align price with value — larger orgs pay more, reflecting support overhead</li>
        <li><strong>Enterprise custom pricing</strong>: enables upsell to professional services (₹5–₹25L one-time implementation)</li>
        <li><strong>Add-on modules</strong> (C1–C4): 20–30% additional ARPU uplift on base subscription</li>
      </ul>
    </div>
    <div>
      <h3>4.5 Competitive Pricing Landscape (India)</h3>
      <div class="tw">
        <table>
          <thead><tr><th>Platform</th><th class="r">Cost / User / Month</th></tr></thead>
          <tbody>
            <tr><td>Sensibull (options platform)</td><td class="r">₹800–₹2,000</td></tr>
            <tr><td>Smallcase custom platforms</td><td class="r">₹500–₹1,200</td></tr>
            <tr><td>Custom LMS + finance modules</td><td class="r">₹400–₹1,500</td></tr>
            <tr><td>Moneybhai (Moneycontrol)</td><td class="r">Free (basic only)</td></tr>
            <tr><td>Zerodha Varsity</td><td class="r">Free (no simulation)</td></tr>
            <tr><td><strong>Paper Portfolio (Phase 3)</strong></td><td class="r"><strong>₹23/user</strong></td></tr>
          </tbody>
        </table>
      </div>
      <div class="cb cgg" style="padding:10px 14px"><div class="ct">35–65× Cheaper</div><div class="cy" style="font-size:8.5pt">Paper Portfolio delivers full simulation + AI + F&amp;O + live data at ₹23/user/month vs. ₹800–₹2,000 for alternatives — not by cutting corners but by leveraging open-source infra and scale economics.</div></div>
    </div>
  </div>
</div>`;

const SEC5 = `
<div class="page">
  <div class="sh"><div class="sn ni">5</div><h2>User Adoption &amp; Scaling Model</h2><span class="stag">Phase-by-Phase Rollout</span></div>
  <h3>5.1 Phase Overview &amp; Go/No-Go Metrics</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Phase</th><th>Timeline</th><th class="r">Users</th><th class="r">Monthly OpEx</th><th class="r">Cost/User/Mo</th><th>Go/No-Go Metrics</th></tr></thead>
      <tbody>
        <tr><td><strong>Phase 1</strong> <span class="badge bb">Pilot</span></td><td>Months 1–6</td><td class="r">1,000</td><td class="r">₹62,000</td><td class="r">₹62</td><td>DAU &gt;200 · D30 retention &gt;40% · NPS &gt;35</td></tr>
        <tr><td><strong>Phase 2</strong> <span class="badge bi">Active Base</span></td><td>Months 7–18</td><td class="r">3,500</td><td class="r">₹1,36,000</td><td class="r">₹39</td><td>DAU &gt;700 · D30 &gt;35% · Support tickets &lt;5/week</td></tr>
        <tr><td><strong>Phase 3</strong> <span class="badge bg">Full Org</span></td><td>Month 19+</td><td class="r">27,000</td><td class="r">₹6,12,000</td><td class="r">₹23</td><td>Uptime &gt;99.5% · Load tested · SSO live · HR endorsement</td></tr>
      </tbody>
    </table>
  </div>
  <div class="ph phb">
    <div class="phh"><h4>Phase 1 — Pilot (1,000 Users) · Months 1–6</h4><span class="pu">₹62,000/month ops</span></div>
    <div class="phbody">
      <div class="two">
        <div>
          <p style="font-size:9pt;margin-bottom:8px"><strong>Monthly savings vs. ₹800/user comparable:</strong></p>
          <div class="tw" style="margin-bottom:0">
            <table>
              <thead><tr><th>Metric</th><th class="r">Value</th></tr></thead>
              <tbody>
                <tr><td>Alternative platform cost (1K × ₹800)</td><td class="r">₹8,00,000/mo</td></tr>
                <tr><td>Paper Portfolio ops cost</td><td class="r">₹62,000/mo</td></tr>
                <tr><td>Monthly net saving</td><td class="r tc"><strong>₹7,38,000</strong></td></tr>
                <tr><td>6-month Phase 1 savings</td><td class="r tc"><strong>₹44,28,000</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p style="font-size:9pt;margin-bottom:6px"><strong>Pilot KPIs to track:</strong></p>
          <ul style="font-size:9pt">
            <li>Daily Active Users — target 200+</li>
            <li>Avg. session length — target 12+ min</li>
            <li>Trades per active user/day — target 3+</li>
            <li>AI chat engagement rate — target 25%+</li>
            <li>D30 retention cohort — target 40%+</li>
            <li>NPS score — target 35+</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div class="ph phg" style="margin-top:12px">
    <div class="phh"><h4>Phase 2 — Active User Base (3,500 Users) · Months 7–18</h4><span class="pu">₹1,36,000/month ops</span></div>
    <div class="phbody">
      <div class="two">
        <div>
          <div class="tw" style="margin-bottom:0">
            <table>
              <thead><tr><th>Metric</th><th class="r">Value</th></tr></thead>
              <tbody>
                <tr><td>Alternative cost (3.5K × ₹800)</td><td class="r">₹28,00,000/mo</td></tr>
                <tr><td>Paper Portfolio ops cost</td><td class="r">₹1,36,000/mo</td></tr>
                <tr><td>Monthly net saving</td><td class="r tc"><strong>₹26,64,000</strong></td></tr>
                <tr><td>12-month Phase 2 total savings</td><td class="r tc"><strong>₹3,19,68,000</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p style="font-size:9pt;margin-bottom:6px"><strong>Phase 2 expansion triggers:</strong></p>
          <ul style="font-size:9pt">
            <li>Pilot NPS &gt;35 with qualitative endorsement</li>
            <li>Zero P0 security incidents in Phase 1</li>
            <li>HR / L&amp;D sign-off on financial literacy gains</li>
            <li>IT team approval of prod infrastructure</li>
            <li>Budget confirmed for Phase 2 maintenance</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
  <div class="ph phi" style="margin-top:12px">
    <div class="phh"><h4>Phase 3 — Full Organisation (27,000 Users) · Month 19+</h4><span class="pu">₹6,12,000/month ops</span></div>
    <div class="phbody">
      <div class="two">
        <div>
          <div class="tw" style="margin-bottom:0">
            <table>
              <thead><tr><th>Metric</th><th class="r">Value</th></tr></thead>
              <tbody>
                <tr><td>Alternative cost (27K × ₹800)</td><td class="r">₹2,16,00,000/mo</td></tr>
                <tr><td>Paper Portfolio ops cost</td><td class="r">₹6,12,000/mo</td></tr>
                <tr><td>Monthly net saving</td><td class="r tc"><strong>₹2,09,88,000</strong></td></tr>
                <tr><td>Annual Phase 3 savings</td><td class="r tc"><strong>₹25,18,56,000</strong></td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <p style="font-size:9pt;margin-bottom:6px"><strong>Phase 3 infra readiness:</strong></p>
          <ul style="font-size:9pt">
            <li>Migrate to ECS Fargate (auto-scale)</li>
            <li>RDS Multi-AZ + read replicas enabled</li>
            <li>CloudFront CDN for asset delivery across India</li>
            <li>SSO / SAML integration with corporate IdP (Azure AD / Okta)</li>
            <li>Load test at 5,000 concurrent users completed</li>
            <li>RBAC for department-level admin</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>`;

const SEC6 = `
<div class="page">
  <div class="sh"><div class="sn na">6</div><h2>Adoption Strategy &amp; Roadmap</h2><span class="stag">Change Management &amp; GTM</span></div>
  <h3>6.1 Step-by-Step Adoption Roadmap</h3>
  <div class="tl">
    <div class="ti"><div class="td db"></div><div class="tt">Month 0–1 · Foundation &amp; Stakeholder Alignment</div><div class="ts">Identify executive sponsor (CFO or CTO). Form cross-functional steering committee (IT, HR/L&amp;D, Finance, Risk). Define success metrics and pilot cohort selection criteria. Obtain legal sign-off on simulated trading data storage under IT policy.</div></div>
    <div class="ti"><div class="td db"></div><div class="tt">Month 1–2 · Pilot Cohort Selection &amp; Onboarding</div><div class="ts">Recruit 1,000 volunteers from Finance, Operations, and Tech departments. Prioritise employees already interested in personal investing. Run 2-hour onboarding workshops. Assign cohort champions (1 per 100 users) for peer support and feedback relay.</div></div>
    <div class="ti"><div class="td db"></div><div class="tt">Month 2–6 · Pilot Execution &amp; Feedback Loop</div><div class="ts">Weekly usage reports to steering committee. Monthly NPS surveys. Bi-weekly product iterations based on feedback. Run internal trading tournaments (budget day, quarterly results season) to drive engagement. Track D7/D14/D30 retention cohort charts.</div></div>
    <div class="ti"><div class="td dg"></div><div class="tt">Month 6 · Phase 1 Review &amp; Go/No-Go Decision</div><div class="ts">Steering committee reviews pilot KPIs. If NPS &gt;35, D30 retention &gt;40%, zero P0 incidents — proceed to Phase 2. Document lessons learned. Prepare Phase 2 budget request (₹44,88,000 annual opex).</div></div>
    <div class="ti"><div class="td dg"></div><div class="tt">Month 7–12 · Phase 2 Rollout (3,500 Active Users)</div><div class="ts">Expand to all 3,000–4,000 consistently active employees. Integrate with internal LMS for formal CPD credit. Launch department leaderboards. Enable HR analytics dashboard showing employee financial literacy improvement metrics.</div></div>
    <div class="ti"><div class="td di"></div><div class="tt">Month 13–18 · Feature Enhancement &amp; SSO Integration</div><div class="ts">Implement SSO/SAML with corporate IdP. Enable RBAC for department admins. Add advanced F&amp;O features (options Greeks, IV charts, payoff diagrams). Prepare ECS Fargate migration for Phase 3 load.</div></div>
    <div class="ti"><div class="td di"></div><div class="tt">Month 19+ · Phase 3 — Full Organisation (27,000 Users)</div><div class="ts">Open access to all 27,000 employees via SSO auto-provisioning. Dedicated maintenance engineer onboarded. Monthly L&amp;D reporting to executive committee. Begin exploration of external white-label licensing to other Indian organisations.</div></div>
    <div class="ti"><div class="td da"></div><div class="tt">Month 24+ · External SaaS Launch</div><div class="ts">White-label the platform. Target Indian BFSI firms, CA institutes, business schools, and fintech startups. First 9 paying customers onboarded. MRR target: ₹2,95,000/month by Month 30.</div></div>
  </div>
  <h3>6.2 Change Management</h3>
  <div class="two">
    <div>
      <h4>Resistance Mitigation</h4>
      <ul style="font-size:9.5pt">
        <li><strong>Privacy concerns:</strong> Clear policy — simulated trades only, no real financial data collected, activity data anonymised in all reports</li>
        <li><strong>"Another tool" fatigue:</strong> Frame as a voluntary employee benefit, not mandatory training — dramatically reduces pushback</li>
        <li><strong>Low engagement risk:</strong> Gamification (Nifty 50 leaderboards, tournaments with gift voucher prizes) drives intrinsic motivation</li>
        <li><strong>IT gatekeeping:</strong> Provide architecture doc, pen-test report, and OWASP compliance checklist upfront</li>
      </ul>
    </div>
    <div>
      <h4>Engagement Acceleration</h4>
      <ul style="font-size:9.5pt">
        <li><strong>Quarterly tournaments:</strong> ₹10,000–₹25,000 prize pools (Amazon/Flipkart vouchers) drive peak engagement</li>
        <li><strong>Budget Day events:</strong> Prediction contests on Union Budget day drive mass participation</li>
        <li><strong>L&amp;D formal credit:</strong> Linking activity to CPD hours dramatically increases voluntary adoption rates</li>
        <li><strong>Executive participation:</strong> Senior leaders on leaderboards signal cultural endorsement</li>
      </ul>
    </div>
  </div>
  <h3>6.3 Internal vs. External Monetisation</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Dimension</th><th>Internal Track</th><th>External SaaS Track</th></tr></thead>
      <tbody>
        <tr><td><strong>Value Type</strong></td><td>Cost avoidance, productivity gain</td><td>New recurring revenue stream</td></tr>
        <tr><td><strong>Time to Value</strong></td><td>Immediate (Month 1)</td><td>18–24 months to meaningful MRR</td></tr>
        <tr><td><strong>Effort Required</strong></td><td>Low — same platform, wider rollout</td><td>High — sales, marketing, legal, SLAs</td></tr>
        <tr><td><strong>Risk Level</strong></td><td>Very Low</td><td>Medium</td></tr>
        <tr><td><strong>3-Year Value</strong></td><td>₹42.72 Crore (gross alt cost avoided)</td><td>₹10.77 Crore potential SaaS revenue</td></tr>
        <tr><td><strong>Recommendation</strong></td><td><span class="badge bg">Prioritise — pursue immediately</span></td><td><span class="badge ba">Strategic — pursue from Month 18+</span></td></tr>
      </tbody>
    </table>
  </div>
</div>`;

const SEC7 = `
<div class="page">
  <div class="sh"><div class="sn ng">7</div><h2>ROI Summary &amp; Break-even Analysis</h2><span class="stag">Financial Projections</span></div>
  <h3>7.1 Month-by-Month Break-even Table</h3>
  <p style="font-size:9.5pt;margin-bottom:12px">Break-even = point where cumulative cost-avoidance savings exceed total investment. Baseline: ₹800/user/month comparable Indian platform.</p>
  <div class="tw">
    <table>
      <thead><tr><th>Month</th><th>Phase</th><th class="r">Users</th><th class="r">Cumul. Cost</th><th class="r">Cumul. Alt Cost</th><th class="r">Net Position</th><th class="c">Status</th></tr></thead>
      <tbody>
        <tr><td>Month 1</td><td>Phase 1</td><td class="r">1,000</td><td class="r">₹20,62,000</td><td class="r">₹8,00,000</td><td class="r tr2"><strong>(₹12,62,000)</strong></td><td class="c"><span class="badge br">Behind</span></td></tr>
        <tr><td>Month 2</td><td>Phase 1</td><td class="r">1,000</td><td class="r">₹21,24,000</td><td class="r">₹16,00,000</td><td class="r tr2"><strong>(₹5,24,000)</strong></td><td class="c"><span class="badge ba">Closing</span></td></tr>
        <tr style="background:#fefce8"><td><strong>Month 3 ★</strong></td><td>Phase 1</td><td class="r"><strong>1,000</strong></td><td class="r"><strong>₹21,86,000</strong></td><td class="r"><strong>₹24,00,000</strong></td><td class="r tc"><strong>+₹2,14,000</strong></td><td class="c"><span class="badge bg">✓ Break-even</span></td></tr>
        <tr><td>Month 6</td><td>Phase 1</td><td class="r">1,000</td><td class="r">₹23,72,000</td><td class="r">₹48,00,000</td><td class="r tc"><strong>+₹24,28,000</strong></td><td class="c"><span class="badge bg">Strong</span></td></tr>
        <tr><td>Month 12</td><td>Phase 2</td><td class="r">3,500</td><td class="r">₹31,88,000</td><td class="r">₹2,16,00,000</td><td class="r tc"><strong>+₹1,84,12,000</strong></td><td class="c"><span class="badge bg">Excellent</span></td></tr>
        <tr><td>Month 24</td><td>Phase 3</td><td class="r">27,000</td><td class="r">₹76,76,000</td><td class="r">₹16,80,00,000</td><td class="r tc"><strong>+₹16,03,24,000</strong></td><td class="c"><span class="badge bg">Outstanding</span></td></tr>
        <tr><td>Month 36</td><td>Phase 3</td><td class="r">27,000</td><td class="r">₹1,50,20,000</td><td class="r">₹42,72,00,000</td><td class="r tc"><strong>+₹41,21,80,000</strong></td><td class="c"><span class="badge bg">Exceptional</span></td></tr>
      </tbody>
    </table>
  </div>
  <div class="cb cgg"><div class="ct">Break-even: Month 3 from Go-Live</div><div class="cy">The ₹20 Lakh build investment is fully recovered by Month 3, driven by ₹7,38,000/month in net savings during the 1,000-user pilot phase. This is an exceptionally fast payback period for any enterprise software deployment — typical enterprise tools break even in 12–24 months.</div></div>
  <h3>7.2 Year-over-Year ROI — Internal Cost Avoidance</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Year</th><th class="r">Total Cost</th><th class="r">Alt Cost Avoided</th><th class="r">Net Value</th><th class="r">Annual ROI</th><th class="r">Cumulative ROI</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Year 1</strong><br/><span class="tm" style="font-size:8pt">Phase 1 (6mo) + Phase 2 entry (6mo)</span></td>
          <td class="r">₹31,88,000</td>
          <td class="r tc">₹2,16,00,000</td>
          <td class="r tc"><strong>+₹1,84,12,000</strong></td>
          <td class="r tc"><strong>578%</strong></td>
          <td class="r tc">578%</td>
        </tr>
        <tr>
          <td><strong>Year 2</strong><br/><span class="tm" style="font-size:8pt">Phase 2 (6mo) + Phase 3 entry (6mo)</span></td>
          <td class="r">₹44,88,000</td>
          <td class="r tc">₹14,64,00,000</td>
          <td class="r tc"><strong>+₹14,19,12,000</strong></td>
          <td class="r tc"><strong>3,162%</strong></td>
          <td class="r tc">1,759%</td>
        </tr>
        <tr>
          <td><strong>Year 3</strong><br/><span class="tm" style="font-size:8pt">Phase 3 full scale × 12 months</span></td>
          <td class="r">₹73,44,000</td>
          <td class="r tc">₹25,92,00,000</td>
          <td class="r tc"><strong>+₹25,18,56,000</strong></td>
          <td class="r tc"><strong>3,429%</strong></td>
          <td class="r tc">2,744%</td>
        </tr>
        <tr class="gt">
          <td><strong>3-Year Total</strong></td>
          <td class="r">₹1,50,20,000</td>
          <td class="r">₹42,72,00,000</td>
          <td class="r"><strong>+₹41,21,80,000</strong></td>
          <td class="r" colspan="2"><strong>3-Year Cumulative ROI: 2,744%</strong></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`;

const SEC7B = `
<div class="page">
  <div class="sh"><div class="sn ng">7</div><h2>ROI — Combined &amp; External Revenue</h2><span class="stag">Continued</span></div>
  <h3>7.3 External SaaS Revenue Growth Model</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Tier</th><th class="r">Y1 Cust.</th><th class="r">Y1 MRR</th><th class="r">Y2 Cust.</th><th class="r">Y2 MRR</th><th class="r">Y3 Cust.</th><th class="r">Y3 MRR</th></tr></thead>
      <tbody>
        <tr><td>Starter (₹15K/mo)</td><td class="r">5</td><td class="r">₹75,000</td><td class="r">20</td><td class="r">₹3,00,000</td><td class="r">60</td><td class="r">₹9,00,000</td></tr>
        <tr><td>Growth (₹40K/mo)</td><td class="r">3</td><td class="r">₹1,20,000</td><td class="r">12</td><td class="r">₹4,80,000</td><td class="r">35</td><td class="r">₹14,00,000</td></tr>
        <tr><td>Business (₹1L/mo)</td><td class="r">1</td><td class="r">₹1,00,000</td><td class="r">6</td><td class="r">₹6,00,000</td><td class="r">20</td><td class="r">₹20,00,000</td></tr>
        <tr><td>Enterprise (₹2.5L+/mo)</td><td class="r">0</td><td class="r">—</td><td class="r">2</td><td class="r">₹5,00,000</td><td class="r">10</td><td class="r">₹25,00,000</td></tr>
        <tr class="st"><td><strong>Total MRR</strong></td><td class="r"><strong>9</strong></td><td class="r"><strong>₹2,95,000</strong></td><td class="r"><strong>40</strong></td><td class="r"><strong>₹18,80,000</strong></td><td class="r"><strong>125</strong></td><td class="r"><strong>₹68,00,000</strong></td></tr>
        <tr class="tr"><td><strong>Annual SaaS Revenue</strong></td><td class="r" colspan="2"><strong>₹35,40,000</strong></td><td class="r" colspan="2"><strong>₹2,25,60,000</strong></td><td class="r" colspan="2"><strong>₹8,16,00,000</strong></td></tr>
      </tbody>
    </table>
  </div>
  <h3>7.4 Combined Model — Internal + External (3-Year)</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Year</th><th class="r">Total Cost</th><th class="r">Internal Savings</th><th class="r">External SaaS Rev</th><th class="r">Total Value</th><th class="r">Combined ROI</th></tr></thead>
      <tbody>
        <tr><td><strong>Year 1</strong></td><td class="r">₹31,88,000</td><td class="r tc">₹2,16,00,000</td><td class="r tb">₹35,40,000</td><td class="r tc"><strong>₹2,51,40,000</strong></td><td class="r tc"><strong>689%</strong></td></tr>
        <tr><td><strong>Year 2</strong></td><td class="r">₹44,88,000</td><td class="r tc">₹14,64,00,000</td><td class="r tb">₹2,25,60,000</td><td class="r tc"><strong>₹16,89,60,000</strong></td><td class="r tc"><strong>3,664%</strong></td></tr>
        <tr><td><strong>Year 3</strong></td><td class="r">₹73,44,000</td><td class="r tc">₹25,92,00,000</td><td class="r tb">₹8,16,00,000</td><td class="r tc"><strong>₹34,08,00,000</strong></td><td class="r tc"><strong>4,542%</strong></td></tr>
        <tr class="gt"><td><strong>3-Year Total</strong></td><td class="r">₹1,50,20,000</td><td class="r">₹42,72,00,000</td><td class="r">₹10,77,00,000</td><td class="r"><strong>₹53,49,00,000</strong></td><td class="r"><strong>~3,462%</strong></td></tr>
      </tbody>
    </table>
  </div>
  <h3>7.5 ROI Sensitivity Analysis</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Scenario</th><th>Assumption</th><th class="r">Y1 ROI</th><th class="r">Y3 ROI</th><th class="r">Break-even</th></tr></thead>
      <tbody>
        <tr><td><span class="badge br">Conservative</span></td><td>Comparable = ₹400/user/mo, Phase 3 only 10K active users</td><td class="r tc">269%</td><td class="r tc">862%</td><td class="r">Month 5</td></tr>
        <tr style="background:#f0fdf4"><td><span class="badge bg">Base Case ✓</span></td><td>Comparable = ₹800/user/mo, Phase 3 = 27K users</td><td class="r tc">578%</td><td class="r tc">2,744%</td><td class="r">Month 3</td></tr>
        <tr><td><span class="badge bb">Optimistic</span></td><td>Comparable = ₹1,500/user/mo + external SaaS 1.5× base</td><td class="r tc">1,147%</td><td class="r tc">5,400%</td><td class="r">Month 2</td></tr>
      </tbody>
    </table>
  </div>
  <div class="g4">
    <div class="kpi kb"><div class="kl">3-Year TCO</div><div class="kv">₹1.50 Cr</div><div class="kd">Total cost of ownership</div></div>
    <div class="kpi kg"><div class="kl">3-Year Net Value</div><div class="kv">₹41.22 Cr</div><div class="kd">Internal savings alone</div></div>
    <div class="kpi ki"><div class="kl">Combined 3-Year</div><div class="kv">₹53.49 Cr</div><div class="kd">Internal + external SaaS</div></div>
    <div class="kpi ka"><div class="kl">Payback Period</div><div class="kv">3 Months</div><div class="kd">On ₹20L build investment</div></div>
  </div>
</div>`;

const SEC8 = `
<div class="page">
  <div class="sh"><div class="sn na">8</div><h2>Appendix — Assumptions &amp; Methodology</h2><span class="stag">Data Sources &amp; Definitions</span></div>
  <h3>A. Cost Methodology</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Item</th><th>Source / Basis</th></tr></thead>
      <tbody>
        <tr><td>Developer rates</td><td>Glassdoor India / Naukri.com 2024 — Senior Full-Stack (React + Node.js) — ₹25–35 LPA → ₹2.5L/month blended incl. employer PF/taxes</td></tr>
        <tr><td>AWS cloud costs</td><td>AWS ap-south-1 (Mumbai) on-demand pricing · 20% Reserved Instance discount · Exchange rate ₹84/USD</td></tr>
        <tr><td>Market data API</td><td>NSE/BSE authorised vendors — DataFeed India, Global DataFeed, Refinitiv tick data — 2024 rate cards</td></tr>
        <tr><td>AI API (Claude Sonnet)</td><td>Anthropic pricing: $3/M input tokens, $15/M output tokens → ₹252/M input, ₹1,260/M output at ₹84/USD</td></tr>
        <tr><td>Comparable platform</td><td>₹800/user/month = blended average of Sensibull (₹800–₹2,000), custom corporate LMS modules (₹400–₹1,500), interactive simulation tools available in India</td></tr>
        <tr><td>Support staff</td><td>Part-time consultant rate ₹1,200/hr; full-time senior engineer ₹24 LPA (₹2L/month)</td></tr>
      </tbody>
    </table>
  </div>
  <h3>B. Key Financial Definitions</h3>
  <div class="two">
    <div><ul style="font-size:9.5pt">
      <li><strong>ROI</strong> = (Net Benefit – Cost) / Cost × 100</li>
      <li><strong>Cumulative ROI</strong> = Σ(Net Benefits) / Σ(Costs) × 100</li>
      <li><strong>Cost Avoidance</strong> = Users × ₹800/user/mo × months</li>
      <li><strong>Net Value</strong> = Cost Avoidance − Total Cost (build + ops)</li>
      <li><strong>MRR</strong> = Monthly Recurring Revenue from SaaS</li>
      <li><strong>TCO</strong> = Total Cost of Ownership (build + 3-year ops)</li>
    </ul></div>
    <div><ul style="font-size:9.5pt">
      <li><strong>Break-even</strong> = Month where Σ(Savings) &gt; Σ(Costs)</li>
      <li><strong>VaaS</strong> = Value-as-a-Service — pricing tied to outcomes</li>
      <li><strong>LPA</strong> = Lakhs Per Annum (Indian salary convention)</li>
      <li><strong>P0 Incident</strong> = Complete platform outage or critical breach</li>
      <li><strong>D30 Retention</strong> = % users active 30 days after first login</li>
      <li><strong>NPS</strong> = Net Promoter Score (scale −100 to +100)</li>
    </ul></div>
  </div>
  <h3>C. Key Risks &amp; Mitigations</h3>
  <div class="tw">
    <table>
      <thead><tr><th>Risk</th><th class="c">Likelihood</th><th class="c">Impact</th><th>Mitigation</th></tr></thead>
      <tbody>
        <tr><td>Low pilot engagement (&lt;200 DAU)</td><td class="c"><span class="badge ba">Medium</span></td><td class="c"><span class="badge ba">Medium</span></td><td>Gamification, cohort champions, CPD credit linkage, Budget Day events</td></tr>
        <tr><td>Market data API cost increase</td><td class="c"><span class="badge bb">Low</span></td><td class="c"><span class="badge ba">Medium</span></td><td>Multi-vendor strategy; NSE direct feed fallback for delayed data</td></tr>
        <tr><td>INR depreciation raising cloud costs</td><td class="c"><span class="badge ba">Medium</span></td><td class="c"><span class="badge bb">Low</span></td><td>Cloud costs are &lt;45% of Phase 3 opex; 10% INR shift = &lt;5% total cost increase</td></tr>
        <tr><td>Infrastructure cost overrun at Phase 3</td><td class="c"><span class="badge bb">Low</span></td><td class="c"><span class="badge ba">Medium</span></td><td>Auto-scaling with AWS Budgets cost caps; monthly review</td></tr>
        <tr><td>Security incident</td><td class="c"><span class="badge bb">Low</span></td><td class="c"><span class="badge br">High</span></td><td>Annual pen-test, WAF, MFA, zero real financial data stored</td></tr>
        <tr><td>External SaaS not reaching MRR target</td><td class="c"><span class="badge ba">Medium</span></td><td class="c"><span class="badge bb">Low</span></td><td>External revenue is purely additive; internal ROI is fully self-sufficient</td></tr>
      </tbody>
    </table>
  </div>
  <h3>D. Recommended Next Steps</h3>
  <div class="tl">
    <div class="ti"><div class="td db"></div><div class="tt">Immediate (0–30 days)</div><div class="ts">Identify executive sponsor · Secure Phase 1 budget (₹31,88,000 Year 1 incl. build) · Begin pilot cohort recruitment from Finance &amp; Operations teams</div></div>
    <div class="ti"><div class="td dg"></div><div class="tt">Short-term (30–90 days)</div><div class="ts">Deploy to AWS ap-south-1 production · Onboard 1,000 pilot users · Establish Datadog/UptimeRobot monitoring · Begin weekly KPI reporting to steering committee</div></div>
    <div class="ti"><div class="td di"></div><div class="tt">Medium-term (90–180 days)</div><div class="ts">Phase 1 review vs. KPI thresholds · Go/No-Go decision for Phase 2 · SSO planning with IT · Phase 2 infrastructure scaling</div></div>
    <div class="ti"><div class="td da"></div><div class="tt">Long-term (18–24 months)</div><div class="ts">Full organisation rollout to 27,000 users · External SaaS launch to Indian BFSI / corporate market · MRR target ₹2,95,000/month · Annual savings target ₹25+ Crore</div></div>
  </div>
  <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center;font-size:8.5pt;color:#64748b">
    Paper Portfolio — ROI &amp; Monetisation Technical Document · Version 2.0 (Indian Rupee Edition) · May 2025<br/>
    All figures in ₹ Indian Rupees. Cloud costs at AWS ap-south-1 rates. Exchange reference: ₹84/USD.<br/>
    Prepared for internal strategic review. Projections based on stated assumptions; actual results may vary.
  </div>
</div>`;

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Paper Portfolio — ROI &amp; Monetisation (₹ Indian)</title>
${STYLES}
</head>
<body>
${COVER}
${TOC}
${SEC1}
${SEC2}
${SEC3}
${SEC3B}
${SEC4}
${SEC4B}
${SEC5}
${SEC6}
${SEC7}
${SEC7B}
${SEC8}
</body>
</html>`;

async function generatePdf() {
  const htmlPath = path.resolve(`${OUT_DIR}/ROI_INR_temp.html`);
  fs.writeFileSync(htmlPath, HTML_CONTENT, 'utf8');
  const browser = await puppeteer.launch({
    headless: 'shell',
    timeout: 90000,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'],
  });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.pdf({
    path: `${OUT_DIR}/ROI_Monetization_Document.pdf`,
    format: 'A4',
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    printBackground: true,
  });
  await browser.close();
  if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
  console.log('✅  docs/ROI_Monetization_Document.pdf generated (Indian Rupees)');
}

(async () => {
  console.log('Generating ROI & Monetisation document (₹ Indian rates)...');
  await generatePdf();
  console.log('\n📄  Saved to docs/ROI_Monetization_Document.pdf');
})();
