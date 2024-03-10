# Discohook API

Here is some information detailing public API endpoints that you can utilize if you are developing for Discohook.

Base URL for all requests: `https://discohook.app/api/v1`

## Share Links

If you are currently using `share.discohook.app`, migrate ASAP; it will stop being hosted soon!

### Create Share Link

`POST /share`

Your request must be in total fewer than 24.5 MiB as indicated by the `Content-Length` header. This is a limitation of Cloudflare KV.

##### Request Body (JSON)

| Key    | Type                                               | Optional            |
|--------|----------------------------------------------------|---------------------|
| data   | [QueryData](/packages/site/app/types/QueryData.ts) | no                  |
| ttl    | integer (seconds), `300000` <= n <= `2419200000`   | default `604800000` |
<!-- | origin | string (origin of a whitelisted instance)          | yes                 | -->

##### Response Body (JSON)

| Key     | Type             |
|---------|------------------|
| id      | string           |
<!-- | origin  | string           | -->
| url     | string (url)     |
| expires | string (ISO8601) |

Share URLs follow this format: `https://discohook.app/?share={id}`. This formatting is done for you in the `url` response property, and you should prefer to use this URL instead of constructing your own.

### Get Share Link

`GET /share/{id}`

Get message data for a share ID. If the ID was valid but has since expired, the error body (status 404) should include an `expiredAt` property (ISO8601 timestamp). Do note that share IDs are allowed to be re-used after they have expired, so this value may not be what you expected.

##### Response Body (JSON)

| Key     | Type                                               |
|---------|----------------------------------------------------|
| data    | [QueryData](/packages/site/app/types/QueryData.ts) |
| expires | string (ISO8601)                                   |

<!--
Whoops, I just remembered this endpoint requires user authentication. I want to also allow developers to create access tokens so I'm leaving this here for now.

## Donations

### Get Donation Key

`POST /donate/{type}`

`{type}` can currently be `btc`.

This endpoint is a bit weird, but I decided to document it in case someone wanted to set up some sort of program that donates once a month in order to maintain a subscription. When donating with cryptocurrencies, set your `message` to the `key` returned by this endpoint. -->