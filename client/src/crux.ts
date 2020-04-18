import got, { GotError } from 'got';

import {
  EDNVal,
  EDNKeyword,
  toEDNString,
  parseEDNString,
  parseEDNListStream,
  isEDNSet,
  toKeyword,
  toSymbol,
} from './edn';

export type CruxMap = { map: [EDNKeyword, EDNVal][] };

export const cruxIdKeyword = toKeyword('crux.db/id');
const cruxPutKeyword = toKeyword('crux.tx/put');

const toKeywordMap = (obj: Record<string, EDNVal>): CruxMap => {
  return {
    map: Object.entries(obj)
      .filter(([k, v]) => {
        return v !== undefined;
      })
      .map(([k, v]) => {
        return [toKeyword(k), v];
      }),
  };
};

export const setupCrux = ({ prefixUrl }: { prefixUrl: string }) => {
  const httpClient = got.extend({ prefixUrl });
  return {
    async status() {
      try {
        const response = await httpClient.get({
          headers: { 'Content-Type': 'application/edn' },
        });
        const parsed = parseEDNString(response.body, {
          keywordAs: 'string',
          mapAs: 'object',
        });
        return parsed;
      } catch (e) {
        if (e instanceof GotError && e.code === 'ECONNREFUSED') {
          return undefined;
        }
        throw e;
      }
    },

    async submit(
      transactions: Array<
        | [EDNKeyword, { map: [EDNKeyword, EDNVal][] }]
        | [EDNKeyword, { map: [EDNKeyword, EDNVal][] }, Date]
      >,
    ) {
      const response = await httpClient.post('tx-log', {
        headers: { 'Content-Type': 'application/edn' },
        body: toEDNString(transactions),
      });
      const parsed = parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      });
      return {
        txId: parsed['crux.tx/tx-id'],
        txTime: parsed['crux.tx/tx-time'],
      };
    },

    async query(
      {
        find,
        where,
        args,
        // TODO: rules,
        offset,
        limit,
        orderBy,
        timeout,
        fullResults,
      }: {
        find: string[];
        where: [string, string, string][];
        args?: { [arg: string]: EDNVal }[];
        // rules?: string;
        offset?: number;
        limit?: number;
        orderBy?: (
          | { asc: string; desc?: undefined }
          | { desc: string; asc?: undefined }
        )[];
        timeout?: number;
        fullResults?: boolean;
      },
      { validTime }: { validTime?: Date } = {},
    ) {
      // TODO support predicates
      const query = toKeywordMap({
        // TODO: validate that find symbols are in where and _ is not allowed
        find: find.map(toSymbol),
        where: where.map(([e, a, v]) => {
          return [toSymbol(e), toKeyword(a), toSymbol(v)];
        }),
        // TODO: validate that 3rd elem in where is in args
        args:
          args &&
          args.map((arg) => {
            return {
              map: Object.entries(arg).map(([k, v]) => {
                return [toSymbol(k), v];
              }),
            };
          }),
        // rules,
        offset,
        limit,
        'order-by':
				//TODO: assert in where clause
          orderBy &&
          orderBy.map((order) => {
            if (order.asc !== undefined) {
              return [toSymbol(order.asc), toKeyword('asc')];
            }
            return [toSymbol(order.desc), toKeyword('desc')];
          }),
        timeout,
        'full-results?': fullResults,
      });
      const response = await httpClient.post('query', {
        headers: { 'Content-Type': 'application/edn' },
        body: toEDNString(
          toKeywordMap({
            query,
            'valid-time': validTime,
          }),
        ),
      });
      const parsed = parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      }) as any;
      if (fullResults) {
        return parsed.set as Record<string, EDNVal>[];
      }
      return (orderBy ? parsed : parsed.set).map((row) =>
        find.reduce((memo, field, i) => {
          return { ...memo, [field]: row[i] };
        }, {}),
      );
    },

    async readTxLog({ withOps = false, afterTxId = 0 } = {}) {
      const response = await httpClient.stream('tx-log', {
        headers: { 'Content-Type': 'application/edn' },
        searchParams: {
          'with-ops': withOps,
          'after-tx-id': afterTxId,
        },
      });
      return response.pipe(
        parseEDNListStream({
          keywordAs: 'string',
          mapAs: 'object',
          listAs: 'array',
        }),
      );
    },

    async awaitTx(txId: number) {
      const response = await httpClient.get('await-tx', {
        headers: { 'Content-Type': 'application/edn' },
        searchParams: { 'tx-id': txId },
      });
      const parsed = parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      });
      return {
        txId: parsed['crux.tx/tx-id'],
        txTime: parsed['crux.tx/tx-time'],
      };
    },

    async attributeStats() {
      const response = await httpClient.get('attribute-stats', {
        headers: { 'Content-Type': 'application/edn' },
      });
      return parseEDNString(response.body, {
        keywordAs: 'string',
        mapAs: 'object',
      });
    },
  };
};

export const putTx = (
  doc: CruxMap,
  validTime?: Date,
): [EDNKeyword, CruxMap] | [EDNKeyword, CruxMap, Date] => {
  if (validTime === undefined) {
    return [cruxPutKeyword, doc];
  }
  return [cruxPutKeyword, doc, validTime];
};
