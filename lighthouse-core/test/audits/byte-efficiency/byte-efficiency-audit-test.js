/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Runner = require('../../../runner');
const ByteEfficiencyAudit = require('../../../audits/byte-efficiency/byte-efficiency-audit');
const NetworkNode = require('../../../lib/dependency-graph/network-node');
const CPUNode = require('../../../lib/dependency-graph/cpu-node');

const trace = require('../../fixtures/traces/progressive-app-m60.json');
const devtoolsLog = require('../../fixtures/traces/progressive-app-m60.devtools.log.json');
const assert = require('assert');
const NBSP = '\xa0';

/* eslint-env mocha */

describe('Byte efficiency base audit', () => {
  let graph;

  beforeEach(() => {
    const networkRecord = {
      requestId: 1,
      url: 'http://example.com/',
      parsedURL: {scheme: 'http'},
      _transferSize: 400000,
    };

    Object.defineProperty(networkRecord, 'transferSize', {
      get() {
        return this._transferSize;
      },
    });

    graph = new NetworkNode(networkRecord);
    // add a CPU node to force improvement to TTI
    graph.addDependent(new CPUNode({tid: 1, ts: 0, dur: 50 * 1000}));
  });

  describe('#estimateTransferSize', () => {
    const estimate = ByteEfficiencyAudit.estimateTransferSize;

    it('should estimate by compression ratio when no network record available', () => {
      const result = estimate(undefined, 1000, '', 0.345);
      assert.equal(result, 345);
    });

    it('should return transferSize when asset matches', () => {
      const _resourceType = {_name: 'stylesheet'};
      const result = estimate({_transferSize: 1234, _resourceType}, 10000, 'stylesheet');
      assert.equal(result, 1234);
    });

    it('should estimate by network compression ratio when asset does not match', () => {
      const _resourceType = {_name: 'other'};
      const result = estimate({_resourceSize: 2000, _transferSize: 1000, _resourceType}, 100);
      assert.equal(result, 50);
    });

    it('should not error when missing resource size', () => {
      const _resourceType = {_name: 'other'};
      const result = estimate({_transferSize: 1000, _resourceType}, 100);
      assert.equal(result, 100);
    });
  });

  it('should format as extendedInfo', () => {
    const result = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [],
      },
      graph
    );

    assert.deepEqual(result.extendedInfo.value.results, []);
  });

  it('should set the rawValue', () => {
    const result = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [
          {url: 'http://example.com/', wastedBytes: 200 * 1000},
        ],
      },
      graph
    );

    // 900ms savings comes from the graph calculation
    assert.equal(result.rawValue, 900);
  });

  it('should score the wastedMs', () => {
    const perfectResult = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [{url: 'http://example.com/', wastedBytes: 1 * 1000}],
      },
      graph
    );

    const goodResult = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [{url: 'http://example.com/', wastedBytes: 20 * 1000}],
      },
      graph
    );

    const averageResult = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [{url: 'http://example.com/', wastedBytes: 100 * 1000}],
      },
      graph
    );

    const failingResult = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [{url: 'http://example.com/', wastedBytes: 400 * 1000}],
      },
      graph
    );

    assert.equal(perfectResult.score, 100, 'scores perfect wastedMs');
    assert.ok(goodResult.score > 75 && goodResult.score < 100, 'scores good wastedMs');
    assert.ok(averageResult.score > 50 && averageResult.score < 75, 'scores average wastedMs');
    assert.ok(failingResult.score < 50, 'scores failing wastedMs');
  });

  it('should throw on invalid graph', () => {
    assert.throws(() => {
      ByteEfficiencyAudit.createAuditResult(
        {
          headings: [{key: 'value', text: 'Label'}],
          results: [{wastedBytes: 350, totalBytes: 700, wastedPercent: 50}],
        },
        null
      );
    });
  });

  it('should populate KB', () => {
    const result = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [
          {wastedBytes: 2048, totalBytes: 4096, wastedPercent: 50},
          {wastedBytes: 1986, totalBytes: 5436},
        ],
      },
      graph
    );

    assert.equal(result.extendedInfo.value.results[0].wastedKb, `2${NBSP}KB`);
    assert.equal(result.extendedInfo.value.results[0].totalKb, `4${NBSP}KB`);
    assert.equal(result.extendedInfo.value.results[1].wastedKb, `2${NBSP}KB`);
    assert.equal(result.extendedInfo.value.results[1].totalKb, `5${NBSP}KB`);
  });

  it('should sort on wastedBytes', () => {
    const result = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [
          {wastedBytes: 350, totalBytes: 700, wastedPercent: 50},
          {wastedBytes: 450, totalBytes: 1000, wastedPercent: 50},
          {wastedBytes: 400, totalBytes: 450, wastedPercent: 50},
        ],
      },
      graph
    );

    assert.equal(result.extendedInfo.value.results[0].wastedBytes, 450);
    assert.equal(result.extendedInfo.value.results[1].wastedBytes, 400);
    assert.equal(result.extendedInfo.value.results[2].wastedBytes, 350);
  });

  it('should create a display value', () => {
    const result = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [
          {wastedBytes: 512, totalBytes: 700, wastedPercent: 50},
          {wastedBytes: 512, totalBytes: 1000, wastedPercent: 50},
          {wastedBytes: 1024, totalBytes: 1200, wastedPercent: 50},
        ],
      },
      graph
    );

    assert.ok(result.displayValue.includes(`2${NBSP}KB`), 'contains correct bytes');
  });

  it('should populate potential savings', () => {
    const result = ByteEfficiencyAudit.createAuditResult(
      {
        headings: [{key: 'value', text: 'Label'}],
        results: [
          {wastedBytes: 22416, totalBytes: 104330},
          {wastedBytes: 512, totalBytes: 1024},
          {wastedBytes: 341, totalBytes: 1024},
        ],
      },
      graph
    );

    assert.equal(result.extendedInfo.value.results[0].potentialSavings, `22${NBSP}KB (21%)`);
    assert.equal(result.extendedInfo.value.results[1].potentialSavings, `1${NBSP}KB (50%)`);
    assert.equal(result.extendedInfo.value.results[2].potentialSavings, `0${NBSP}KB (33%)`);
  });

  it('should work on real graphs', () => {
    const artifacts = Runner.instantiateComputedArtifacts();
    return artifacts.requestPageDependencyGraph(trace, devtoolsLog).then(graph => {
      const result = ByteEfficiencyAudit.createAuditResult(
        {
          headings: [{key: 'value', text: 'Label'}],
          results: [
            {url: 'https://www.googletagmanager.com/gtm.js?id=GTM-Q5SW', wastedBytes: 30 * 1024},
          ],
        },
        graph
      );

      assert.equal(result.rawValue, 70);
    });
  });
});
