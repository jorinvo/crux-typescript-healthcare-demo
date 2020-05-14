# Demo Crux Usage from TypeScript in the Healthcare Context

## Dependencies

- The client requires a recent version of [node.js](https://nodejs.org/) to be installed
- The server runs inside [Docker](https://www.docker.com/) and also requires [docker-compose](https://github.com/docker/compose) to be installed

## Setup

- Start the Crux server and Prometheus with `docker-compose up`

The following ports ports will be exposed on our local system:

- Crux at http://localhost:3000
- JMX at http://localhost:9010
- Prometheus at http://localhost:9090

## Client

Go into the `clients` directory, then setup the client:

- `npm install && npm run build`

There is a generator script, an event log follower example and a REPL example available.

### Data generator

The generator creates fake data in transactions of 100 documents.

To generate `10*100` documents run:

`NUM_TX=10 npm run gen`

The data contains patients, cases, form definitions and form data.

For details see [`client/src/gen`](client/src/gen).

### Follow the event log

The follower example listens only to the patient events out of all the events and logs info to stdout.

Run this parallel to running the above generator script:

`npm run follow`

The cursor of the follower is also persisted as Crux document, so each patient event is only processed once.

For details see [`client/src/follow.ts`](client/src/follow.ts).

### JavaScript REPL

A JavaScript REPL can be started to interactively use Crux from Node.js:

`npm run repl`

The API functionality documented below can be used from here.

There is also the [`repl.examples.js`](client/repl.examples.js) file with example code to try out in the REPL.

The REPL can also be used as part of shell commands to pipe in JavaScript and return JSON data like this:

```sh
echo 'await crux.attributeStats()' | npm run -s repl | tail -n +1
```

Additionally two demo functions are available:

- `await demo.countLogEvents()` streams all log events and counts them
- `await demo.countPatients()` streams all patients and counts them

For implementation details see [`client/src/repl.ts`](client/src/repl.ts).

## Crux setup

The demo uses a standalone Crux node with [RocksDB](https://rocksdb.org/) as storage for, both, event log and indexes.

It uses the [http-server](https://opencrux.com/docs#config-http) module to expose the API to the node.js client.

[Prometheus](https://prometheus.io/) metrics are exposed for the indexer, queries, RocksDB and the JVM.

`fsync` is enabled for all writes to disk.

The server is packaged as a [Docker image](./server/Dockerfile).
The image includes an uberjar on top of an openjdk *slim* JRE image. No JDK needed.

The Java process is run with JMX enabled and its memory is restricted to 2GB (`-Xmx2G`).

When changing the [Dockerfile](./server/Dockerfile), it can be rebuild with `docker-compose build`.


## Client setup

The client is written in [TypeScript](https://www.typescriptlang.org/index.html).

The [got](https://github.com/sindresorhus/got) library is used to communicate with Crux over HTTP.

The client contains a (partially-implemented) [streaming EDN parser](./client/src/crux/edn.ts),
which uses Node.js streams for streaming responses from Crux and
represents the [EDN](https://github.com/edn-format/edn) data returned from Crux in a JSON-compatible format.

### API Overview

- With `setupCrux` a `crux` object can be created which is bound to a URL.
- `crux.status` returns basic information about the Crux Server and tells you if the server is reachable.
- `crux.submit` is the only way to write data to Crux. A list of transactions is passed. While the transactions are plain data, they can be constructed with the helper functions `putTx`, `deleteTx` and `evictTx`.
- `crux.awaitTx` must be called after submit to know when the transaction has been indexed and is available for querying.
- `crux.query` works like normal Crux queries but instead of an EDN string a JS object is passed. The big difference is how `where` is implemented: The first and last string of the `where` clause are always interpreted as EDN symbols and the middle string is interpreted as EDN keyword. So to pass data for matching, `args` must be used.
- `crux.queryStream` is the same as `crux.query` but returns a stream of EDN objects.
- `crux.readTxLog` returns a stream of transactions from oldest to newest transaction ID.
- A single entity can be retrieved by ID from with `crux.getEntity`. Only keyword and UUID IDs are supported.
- The history of an entity can be retrieved with `crux.getEntityHistory`.
- To get documents from Crux by content-hash `crux.getDocuments` can be called.
- `crux.attributeStats` tells you what data is in the database.
- `toCruxDoc` turns a JS object into a EDN Map with keywords as keys. The `id` attribute of the object is used as `:crux.db/id`.
