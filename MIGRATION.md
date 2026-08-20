# EC2 Migration Runbook — compromised account → new account

Moving `paperportfolio.in` off the compromised instance onto a fresh one.

| | Old (compromised) | New (to launch) |
|---|---|---|
| Public IP | `65.2.45.191` | Elastic IP — _pending_ |
| Region | `ap-south-1` (Mumbai) | `ap-south-1` (Mumbai) |
| Instance | ~1.9 GB RAM + 5 GB swap | `t3.small` — 2 GB RAM |
| OS | Ubuntu | Ubuntu 24.04 or 26.04 LTS |
| SSH user | `ubuntu` | `ubuntu` |

DNS for `paperportfolio.in` is at GoDaddy, so the domain itself is unaffected by
the account change — only the A records needed repointing.

### Status

| Step | State |
|---|---|
| 1. Data rescued (prod + UAT) | ✅ `~/pp-rescue/` |
| 2. New box provisioned | ✅ swap, docker, nginx, certbot, ufw, sqlite3 |
| 3. Secrets + database restored | ✅ 83 users / 157 holdings / 737 orders |
| 4. Secrets rotated | ✅ `JWT_SECRET` + admin. Service API keys reused by decision; Firebase key carried over |
| 5. DNS repointed | ✅ `@` and `www` → `3.6.163.107` |
| 6. TLS issued | ✅ expires 2026-11-18, auto-renewal verified |
| 7. CI repointed | ✅ secrets updated, deploy run green |
| 8. Verified end-to-end | ✅ see below — including forged-token rejection |
| 9. Old box decommissioned | ready — snapshot first |

**Verification results.** Public: `/` 200, `/api/stocks` 200 (20 quotes),
`/api/news` 200 (20 items, sentiment API reached), `/api/stocks/stream` streaming
live NSE data. Authenticated: `/api/portfolio`, `/api/orders`, `/api/watchlists`,
`/api/notifications`, `/api/leaderboard` all 200; `/api/monte-carlo` 200 with a
real simulation. **A JWT signed with the old public secret
`papertrade_secret_2026` is rejected with 401** — the bypass is closed in
production.

> **Port 80 must stay open.** When 443 was added to the security group, 80 was
> removed. HTTPS works, but Let's Encrypt renews over an HTTP-01 challenge on
> **port 80** — with it closed, `certbot renew` will fail and the certificate
> expires 2026-11-18, taking the site down. Both 80 and 443 need to be open.
> Port 80 serves only a 301 to HTTPS, so leaving it open costs nothing.

> **Superseded:** a `t3.micro` was first launched in `us-east-1`
> (`3.239.64.222`). It was replaced with a `t3.small` in `ap-south-1` — Virginia
> added ~200 ms to every NSE poll and every Indian user's page load, and 908 MB
> with no swap could not complete the client build. Nothing was installed on it;
> terminate it so it stops accruing charges.

---

## Read this before you start

**0. Production was signing JWTs with a key published in this repo.** Not a
misconfiguration — a structural gap. `server/.env` never reached the container
at all:

- `.dockerignore` excludes `.env` and `.env.*` from the build context, and
- the runtime stage of the `Dockerfile` copies only `dist`, `node_modules`,
  `package*.json` and `client/dist`.

So `dotenv` found nothing inside the container, and the app's entire environment
was the four variables listed in `docker-compose.yml`: `NODE_ENV`, `PORT`,
`GOOGLE_APPLICATION_CREDENTIALS`, `ANTHROPIC_API_KEY`. The `server/.env` file
sitting on the old host was a leftover from the pm2 era and had no effect.

Everything else fell through to its hardcoded default. `JWT_SECRET` became
`'papertrade_secret_2026'` from [auth.ts](server/src/middleware/auth.ts) — a
string in this **public** repository. Anyone who read the source could sign a
token for any user id with `role: 'admin'` and call every authenticated
endpoint, including the admin panel. `ADMIN_PASSWORD` became `'admin123'` from
[db/index.ts](server/src/db/index.ts).

This is the most likely entry point for the compromise, and **moving AWS accounts
fixes none of it.** Three changes close it:

1. `docker-compose.yml` now has `env_file: ./server/.env`, so the file is
   actually delivered to the container.
2. `JWT_SECRET` now throws at boot under `NODE_ENV=production` rather than
   falling back.
3. The admin bootstrap refuses to seed the default password in production.

**The rescued database may already contain attacker-created accounts or trades.**
Review the `users` table for unfamiliar rows before trusting it.

**1. The data is already rescued.** A consistent snapshot was taken from the old
box while it kept running and now sits in `~/pp-rescue/` on your laptop —
**83 users, 157 holdings, 737 orders**, 50 tables, `PRAGMA integrity_check: ok`.
Alongside it are `firebase-service-account.json` and `env.old` (a record of which
keys were set, not values to reuse). Do not terminate the old instance until the
new one has served real traffic.

**2. Build memory is tight even at 2 GB.** The old 1.9 GB box needed 5 GB of swap
and a split `build` / `up` to avoid OOM-killing the live container mid-deploy.
`scripts/provision-ec2.sh` adds 4 GB of swap; keep running `docker compose build`
and `docker compose up -d` as two steps rather than `up --build`, so a build that
dies cannot take the running site down with it.

**3. Treat everything on the old box as untrusted.** Copy the `.db` files off it
and read the `.env` for reference, but do not copy binaries, `node_modules`, or
shell history onto the new machine, and rotate every secret it held ([Step 4](#step-4--rotate-every-secret)).

---

## Step 1 — Rescue the data ✅ done

Already completed. `sqlite3 .backup` was used rather than a plain `cp` — the
database runs in WAL mode, so copying the file while the container is live can
capture a torn state. `.backup` takes a consistent snapshot with no downtime.

```bash
# what was run, for the record:
ssh -i ~/Downloads/paperportfolio.pem ubuntu@65.2.45.191 \
  'sudo sqlite3 ~/Paper-Portfolio/server/data/papertrading.db ".backup /tmp/pp-backup.db"'
scp -i ~/Downloads/paperportfolio.pem ubuntu@65.2.45.191:/tmp/pp-backup.db ~/pp-rescue/papertrading.db
```

Landed in `~/pp-rescue/`:

| File | Notes |
|---|---|
| `papertrading.db` | 5.6 MB — 83 users, 157 holdings, 737 orders, 50 tables, integrity ok |
| `papertrading-uat.db` | 1.0 MB — the UAT environment's separate database, 1 user, integrity ok |
| `firebase-service-account.json` | project `paperportfolio-4c978` — **rotate, see Step 4** |
| `env.old` | which keys were set. Reference only — every value was on a compromised host |

The old box also held `~/Paper-Portfolio-uat` (branch `UAT`, last commit
2026-05-26). It was **not running** — no pm2 process, no container, and
`uat.paperportfolio.in` has no A record. Only its database was worth keeping;
redeploying UAT is a separate exercise from restoring production.

To re-verify at any point:

```bash
sqlite3 ~/pp-rescue/papertrading.db 'PRAGMA integrity_check;'
sqlite3 ~/pp-rescue/papertrading.db 'SELECT id,email,role,created_at FROM users ORDER BY id DESC LIMIT 20;'
```

That second query is worth actually running — given the JWT issue above, check
the newest accounts for anything you don't recognise before going live with this
database.

---

## Step 2 — Provision the new box

Give the instance a **stable address first**. `3.6.163.107` is an auto-assigned
public IP — it changes every time the instance stops and starts, which would
silently break DNS and invalidate the TLS cert. Allocate an Elastic IP and
associate it before pointing DNS at anything. Every command below assumes:

```bash
KEY=~/path/to/your-new-key.pem     # the keypair this instance was launched with
HOST=ubuntu@3.6.163.107            # replace with the Elastic IP once associated
chmod 600 "$KEY"                   # ssh refuses world-readable keys
```

Security group inbound rules:

| Port | Source | Why |
|---|---|---|
| 22 | your IP only | SSH. Never `0.0.0.0/0`. |
| 80 | `0.0.0.0/0` | HTTP + certbot's challenge |
| 443 | `0.0.0.0/0` | HTTPS |

> **443 is the one people forget.** ufw and nginx can both be perfectly
> configured and HTTPS will still fail from outside if the security group has no
> inbound 443 rule. The symptom is specific: `http://` returns its `301` to
> `https://` normally, and `curl https://…` then returns `000` — a connection
> failure, not an HTTP error. From the box itself,
> `curl -k --resolve paperportfolio.in:443:127.0.0.1 https://paperportfolio.in/`
> returns `200`, which proves nginx is fine and the block is upstream.

Port 5000 must **not** be open. `docker-compose.yml` now binds the app to
`127.0.0.1:5000`, so nginx is the only path in.

Then run the provisioning script — swap, docker, nginx, certbot, ufw, repo clone:

```bash
ssh -i "$KEY" $HOST
git clone https://github.com/kiddooboy/Paper-Portfolio.git ~/Paper-Portfolio
bash ~/Paper-Portfolio/scripts/provision-ec2.sh
```

It is idempotent — re-run it freely.

---

## Step 3 — Put the secrets and data in place

Neither of these is in git. Create them on the box by hand:

```bash
cd ~/Paper-Portfolio
nano server/.env                      # template: server/.env.example
nano firebase-service-account.json    # from Firebase console, see Step 4
chmod 600 server/.env firebase-service-account.json
```

Restore the rescued database:

```bash
mkdir -p ~/Paper-Portfolio/server/data
# from your laptop:
scp -i "$KEY" ~/pp-rescue/papertrading.db $HOST:~/Paper-Portfolio/server/data/
```

Build and start — **separately**, so a failed build cannot take down a running
container on a box this small:

```bash
cd ~/Paper-Portfolio
sudo docker compose build
sudo docker compose up -d
sudo docker compose logs -f --tail=50
```

Confirm it is listening on loopback only:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:5000/   # 200
ss -tlnp | grep 5000                                              # 127.0.0.1:5000
```

---

## Step 4 — Rotate every secret

The old host is compromised, so every credential it held must be assumed stolen.
Generate new values — do not carry anything over from `env.old`.

Note that most of the rows below were **never set in production at all**. Only
`ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` and `MONTE_CARLO_API_KEY` were
present; the rest fell back to defaults compiled into a public repo. `SMTP_*`
being absent also means forgot-password OTP email has simply never worked in
production — set it here if you want that feature live.

| Secret | Where to rotate | Note |
|---|---|---|
| `JWT_SECRET` | `openssl rand -base64 32` | Invalidates all sessions; users log in again. Rotate regardless. |
| `ADMIN_PASSWORD` | choose a new one | The old one was readable in plaintext on the box. |
| `SMTP_PASS` | Google Account → App passwords | Revoke the old app password. |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase console → Service accounts → generate new key | **Delete the old key** — it can mint tokens for any user. |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Only needed on the UAT branch. |
| AWS access keys | old account IAM | Delete every access key and IAM user in the compromised account. |

Separately, and unrelated to the compromise: this repo is **public**, and two AWS
API Gateway keys are committed in its git history —
`MC_API_KEY` ([monteCarlo.ts](server/src/routes/monteCarlo.ts)) and
`SENTIMENT_API_KEY` ([newsService.ts](server/src/services/newsService.ts)).
Both now read from the environment with the old literal as a fallback, so the
features keep working during the migration. Rotate the keys in the account that
owns those Lambdas, set the new values in `server/.env`, and the fallbacks go
cold. Rewriting git history will not help — treat them as public.

---

## Step 5 — Point DNS at the new box

The domain is on **GoDaddy** (`ns23`/`ns24.domaincontrol.com`) — GoDaddy →
My Products → paperportfolio.in → DNS → Manage Zones. Current state: `@` and
`www` both point at the old box `65.2.45.191`; `uat` has no A record.

Edit the existing records rather than adding new ones — two A records for `@`
would round-robin traffic between the old and new box:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | *(elastic IP)* | 600 |
| A | `www` | *(elastic IP)* | 600 |
| A | `uat` | *(elastic IP)* | 600 — only if you redeploy UAT |

GoDaddy's minimum TTL is 600 s; use it for the cutover so mistakes are cheap,
and raise it to 3600 once things are stable. Wait for propagation before moving
on — the old records will be cached for up to their previous TTL:

```bash
dig +short paperportfolio.in
nslookup paperportfolio.in 8.8.8.8
```

---

## Step 6 — TLS

Only after the domain resolves to the new box — certbot validates over HTTP and
will fail otherwise:

```bash
sudo certbot --nginx -d paperportfolio.in -d www.paperportfolio.in
sudo systemctl status certbot.timer      # auto-renewal
sudo certbot renew --dry-run
```

---

## Step 7 — Repoint CI

`.github/workflows/deploy.yml` deploys on every push to `main` and needs no code
change — only its secrets. In GitHub → Settings → Secrets and variables →
Actions:

| Secret | New value |
|---|---|
| `EC2_HOST` | the Elastic IP |
| `EC2_USER` | `ubuntu` |
| `EC2_KEY` | full contents of the new instance's `.pem`, `BEGIN`/`END` lines included |

Delete the old key from the repo secrets. Then push any commit to `main` and
watch the Actions run.

---

## Step 8 — Verify

- [ ] `https://paperportfolio.in` loads over TLS, no cert warning
- [ ] Register a new account, log in, log out
- [ ] "Continue with Google" works — confirms the new Firebase key
- [ ] Market data ticks (`/api/stocks/stream` stays open, prices move)
- [ ] Place a buy order; it appears in the portfolio
- [ ] Forgot-password sends an OTP — confirms SMTP
- [ ] News feed loads with sentiment — confirms `SENTIMENT_API_KEY`
- [ ] Monte Carlo simulation runs — confirms `MC_API_KEY`
- [ ] Existing users can still log in (confirms the DB restored)
- [ ] `sudo docker compose ps` shows the container `Up`
- [ ] Reboot the instance; confirm it comes back by itself

---

## Step 9 — Decommission the old account

Only once the new box has served real traffic for a day or two:

1. Take a final EBS snapshot of the old volume — cheap insurance.
2. Terminate the instance; release its Elastic IP.
3. Delete all IAM users, roles and access keys in the old account.
4. Check for anything still running that you'd miss — the Monte Carlo and
   sentiment Lambdas live in a *different* account and are not affected, but
   confirm nothing else does.
5. Review CloudTrail for how the compromise happened before you close the
   account, or the same thing happens to the new one.
