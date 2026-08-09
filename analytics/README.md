# SunVeda analytics collector

This zero-dependency Node.js script reads the three analytics sources used by
`sunveda.tech` and renders a daily Markdown report:

- Cloudflare GraphQL Analytics API
- Google Analytics Data API (GA4 property `549196538`)
- GoatCounter statistics API

Credentials are never stored in this repository. By default, the collector
reads them from macOS Keychain services prefixed with `sunveda.analytics.`.
Environment variables with the same names are supported for CI or testing.

## Required credentials

| Name | Minimum access |
| --- | --- |
| `CF_API_TOKEN` | Cloudflare Account Analytics: Read and Zone Analytics: Read, restricted to `sunveda.tech` |
| `CF_ZONE_TAG` | The Cloudflare zone ID for `sunveda.tech` |
| `GA_SERVICE_ACCOUNT_JSON` | Google service-account JSON whose email has Viewer access to GA4 property `549196538` |
| `GOATCOUNTER_API_TOKEN` | GoatCounter Read statistics, restricted to `sunveda.goatcounter.com` |

Store a value in Keychain without printing it:

```sh
security add-generic-password -U -a "$USER" -s sunveda.analytics.CF_API_TOKEN -w "VALUE"
```

Use the equivalent service name for each required credential.

## Run

Use a Node.js 20+ runtime:

```sh
node analytics/collect.mjs
node analytics/collect.mjs --json
node analytics/test.mjs
```

The Markdown report keeps Cloudflare HTTP traffic separate from human analytics
and compares each provider within its own measurement model.
