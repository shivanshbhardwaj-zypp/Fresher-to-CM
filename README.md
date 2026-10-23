# Bano Zypp Ke CM

Recruitment campaign page and its application intake API, deployed to a path on
the existing zypp.app domain.

```
https://zypp.app/bano-zypp-ke-cm/          the page
https://zypp.app/bano-zypp-ke-cm/api/...   the API
```

Both live on one origin, which is the whole point of the layout: the browser
never makes a cross-origin request, so there is no CORS to configure, no
preflight round-trip, and no second hostname needing its own certificate.

The zypp.app application itself is untouched — this deploys alongside it via two
nginx `location` blocks and knows nothing about the main site's code.

## Layout

```
web/      React 18 + Vite. Static build, served by nginx.
api/      Express 5 + MongoDB. Runs as a container behind nginx.
deploy/   nginx blocks, docker compose, deploy script.
```

## Running it locally

Two terminals. The API first, since the page needs it to submit.

```bash
# 1. API
cd api
cp .env.example .env          # then edit MONGODB_URI and ADMIN_TOKEN
npm install
npm run dev                   # http://localhost:3001
```

```bash
# 2. Web
cd web
npm install
npm run dev                   # http://localhost:5173/bano-zypp-ke-cm/
```

Vite proxies `/bano-zypp-ke-cm/api` to `localhost:3001` and strips the prefix,
which is exactly what nginx does in production — so dev and prod agree, and
same-origin bugs cannot hide until launch.

**MongoDB must be a replica set.** The API writes an application and its
notification event in a single transaction, and a standalone `mongod` cannot do
that, so the server refuses to boot against one. Atlas is a replica set already.
For a local one:

```bash
docker compose -f deploy/docker-compose.yml --profile local-db up -d
```

## Deploying

Once, on the server: paste the two blocks from `deploy/nginx.conf` into the
existing zypp.app `server { }`, then `nginx -t && nginx -s reload`.

After that, every release is:

```bash
./deploy/deploy.sh
```

which typechecks and tests the API, builds both halves, refuses to publish a
frontend build missing the `/bano-zypp-ke-cm/` asset prefix, rsyncs the static
files, restarts the API container, and waits for `/health/ready` before
reloading nginx.

## Configuration

Everything lives in `api/.env` — see `api/.env.example` for the annotated list.
Three that matter:

| Variable | Why it matters |
| --- | --- |
| `MONGODB_URI` | Must be a replica set, or the server will not start. |
| `ADMIN_TOKEN` | Required in production; the server refuses to boot without it, because an unauthenticated admin API would expose every applicant's details. |
| `TRUST_PROXY` | Set to `1` behind the nginx in `deploy/`. Too high lets a client spoof `X-Forwarded-For` and pick its own rate-limit bucket; too low buckets the entire internet into one IP. |

## API

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/api/cm-applications` | public, rate-limited per IP |
| `GET` | `/api/admin/applications` | bearer |
| `GET` | `/api/admin/applications/:id` | bearer |
| `PATCH` | `/api/admin/applications/:id/status` | bearer |
| `GET` | `/api/admin/stats` | bearer |
| `GET` | `/health/live`, `/health/ready` | public |

Reviewing applications:

```bash
curl https://zypp.app/bano-zypp-ke-cm/api/admin/applications -H "Authorization: Bearer $ADMIN_TOKEN"
```

Statuses move `new → shortlisted → interviewing → selected`, with `rejected`
reachable from any of the first three and reversible back to `shortlisted`.
Anything else is refused with a `409` rather than silently applied.

## Tests

```bash
cd api && npm test
```

25 tests against a real MongoDB started in-memory — no fixtures, no credentials,
nothing to set up. They cover the submission contract the frontend depends on:
validation, deduplication, the honeypot, mass-assignment rejection, admin auth
and the status state machine.

## Before launch

- [ ] Set `ADMIN_TOKEN` to a real 32-byte random value.
- [ ] Point `MONGODB_URI` at the production Atlas cluster.
- [ ] Add an `og:image` — see the TODO in `web/index.html`. A recruitment
      campaign lives on WhatsApp and LinkedIn shares, and without one those
      render as a bare link.
