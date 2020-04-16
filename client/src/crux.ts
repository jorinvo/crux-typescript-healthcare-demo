import got, { GotError } from 'got';

import {
  EDNVal,
  EDNKeyword,
  toEDNString,
  parseEDNString,
  keyword,
} from './edn';

export type CruxMap = { map: [EDNKeyword, EDNVal][] };

export const cruxIdKeyword = keyword('crux.db/id');
const cruxPutKeyword = keyword('crux.tx/put');

export const setupCrux = ({ prefixUrl }: { prefixUrl: string }) => {
  const httpClient = got.extend({ prefixUrl });
  return {
    async status() {
      try {
        const response = await httpClient.get({
          headers: { 'Content-Type': 'application/edn' },
        });
        const parsed = parseEDNString(response.body, {
          keywordAsString: true,
          mapAsObject: true,
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
        keywordAsString: true,
        mapAsObject: true,
      });
      return {
        txId: parsed['crux.tx/tx-id'],
        txTime: parsed['crux.tx/tx-time'],
      };
    },

    async readTxLog() {
      const response = await httpClient.get('tx-log', {
        headers: { 'Content-Type': 'application/edn' },
        searchParams: {
          'with-ops': false,
          'after-tx-id': 9998,
        },
      });
      console.log('hi');
      const parsed = parseEDNString(response.body, {
        keywordAsString: true,
        mapAsObject: true,
      });
      console.log('parsed');
      console.log(JSON.stringify(parsed, null, 2));
      // console.log((parsed as any).list)
      // return {
      //   txId: parsed['crux.tx/tx-id'],
      //   txTime: parsed['crux.tx/tx-time'],
      // };
    },

    async awaitTx(txId: number) {
      const response = await httpClient.get('await-tx', {
        headers: { 'Content-Type': 'application/edn' },
        searchParams: { 'tx-id': txId },
      });
      const parsed = parseEDNString(response.body, {
        keywordAsString: true,
        mapAsObject: true,
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
        keywordAsString: true,
        mapAsObject: true,
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
