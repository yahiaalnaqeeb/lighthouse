/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer');
const URL = require('../../lib/url-shim');
const manifestParser = require('../../lib/manifest-parser');

class StartUrl extends Gatherer {
  executeFetchRequest(driver, url) {
    return driver.evaluateAsync(
      `fetch('${url}')`
    );
  }

  afterPass(options) {
    const msgWithExtraDebugString = msg => this.debugString ? `${msg}: ${this.debugString}` : msg;
    return options.driver.goOnline(options)
      .then(() => options.driver.getAppManifest())
      .then(response => response && manifestParser(response.data, response.url, options.url))
      .then(manifest => {
        if (!manifest || !manifest.value) {
          const detailedMsg = manifest && manifest.debugString;
          console.log(manifest);

          if (detailedMsg) {
            const message = `Error fetching web app manifest: ${detailedMsg}`;
            return {
              statusCode: -1,
              debugString: msgWithExtraDebugString(message),
            };
          } else {
            const message = `No usable web app manifest found on page ${options.url}`;
            return {
              statusCode: -1,
              debugString: msgWithExtraDebugString(message),
            };
          }
        }

        if (manifest.value.start_url.debugString) {
          // Even if the start URL had an error, the browser will still supply a fallback URL.
          // Therefore, we only set the debugString here and continue with the fetch.
          return {
            statusCode: -1,
            debugString: msgWithExtraDebugString(manifest.value.start_url.debugString),
          };
        }

        const startUrl = manifest.value.start_url.value;

        return (new Promise(resolve => {
          options.driver.on('Network.responseReceived', function responseReceived({response}) {
            console.log(response);
            if (response.url === startUrl) {
              options.driver.off('Network.responseReceived', responseReceived);

              resolve({
                statusCode: response.status,
                debugString: '',
              });
            }
          });

          options.driver.goOffline(options)
            .then(() => this.executeFetchRequest(options.driver, startUrl))
            .then(() => options.driver.goOnline(options))
            .catch((err) => {
              console.log(err);
              resolve({
                statusCode: -1,
                debugString: msgWithExtraDebugString('Unable to fetch start URL via service worker'),
              });
            });
        }));
      });
  }
}

module.exports = StartUrl;
