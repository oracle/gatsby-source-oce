/**
 * Copyright (c) 2021, 2022, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
const fetch = require('node-fetch');
const { Headers } = require('node-fetch');
const fs = require('fs').promises;

/**
 * This function retrieves all assets found on the provided server/channel pair that
 * match the given query. All these variables are pulled from the plugin configuration
 * set in the gatsby-config.js file found in the calling application.
 * @param {string} contentServer The url for accessing the oce server
 * @param {string} channelToken The publishing channel id used to provide the data
 * @param {number} limit An optional value that can be used to control how many assets
 *  are downloaded at a time
 * @param {string} query An optional query that can be used to filter which assets will be
 * downloaded from the channel. It defaults to all assets and should only be used when necessary
 * to avoid the risk of having assets with unresolvable references.
 * @param {boolean} debug An optional query defaulting to false. If true, it logs the JSON
 * data retrieved from the OCE server.
 */

exports.all = async (contentServer, channelToken, limit, query, oAuthStr, preview, debug) => {
  try {
    await fs.rmdir('.data', { recursive: true });
  } catch (err) {
    console.log(`Warning ${err}`);
  }
  if (debug) {
    await fs.mkdir('.data');
  }

  // const pretty = (o) => JSON.stringify(o, null, 2);

  // Handle preview being a string or a boolean
  const isPreview = (preview && (preview === true || preview === 'true'));

  const fetchItem = async (id) => {
    let item = null;
    const itemUrl = isPreview === true ? `${contentServer}/content/preview/api/v1.1/items/${id}?channelToken=${channelToken}&expand=all` : `${contentServer}/content/published/api/v1.1/items/${id}?channelToken=${channelToken}&expand=all`;

    try {
      const headers = new Headers({
        Authorization: `${oAuthStr}`,
        Accept: '*/*',
        Connection: 'keep-alive',
        'User-Agent': 'oracle/gatsby-source-oce',
      });

      const response = await fetch(itemUrl, { headers });
      item = await response.json();

      // Remove hyphens which can cause issues
      item.type = item.type.replace('-', '');
      if (debug) {
        await fs.writeFile(
          `.data/${id}.json`,
          JSON.stringify(item, null, 2),
          'utf-8',
        );
      }
    } catch (e) {
      console.log(`ERROR Download of item ${id} with URL ${itemUrl} ${e} `);
      throw (e);
    }
    return item;
  };

  const fetchAll = async () => {
  // Fetch a response from the apiUrl

    let itemsArray = [];

    let fetchLimit = ((limit != null && limit > 0) ? limit : 10);
    let hasMore = true;
    let response = null;
    let scrollId = ''; // Used for efficient paging when downloading a large query.

    const headers = new Headers({
      Authorization: `${oAuthStr}`,
      Accept: '*/*',
      Connection: 'keep-alive',
      'User-Agent': 'oracle/gatsby-source-oce',
    });
    console.log('Downloading channel asset list');
    while (hasMore) {
      // Used if a query was added for use with the REST API. The default returns all assets
      const fetchQuery = query ? `&q=${query}` : '&q=(name%20ne%20".*")';

      // Build a URL based on whether published or preview data is desired
      const scrollIdStr = scrollId.length === 0 ? '' : `&scrollId=${scrollId}`;
      const allItemsUrl = `${contentServer}/content/${isPreview === true ? 'preview' : 'published'}/api/v1.1/items?limit=${fetchLimit}&scroll=true&orderBy=id:asc&channelToken=${channelToken}${fetchQuery}${scrollIdStr}`;

      try {
        console.log(allItemsUrl);
        response = await fetch(allItemsUrl, { headers });
        const data = await response.json();
        // The maximum number of assets the server will return based on configuration
        fetchLimit = fetchLimit > data.limit ? limit : fetchLimit;
        if (data.count > 0) {
          itemsArray = itemsArray.concat(data.items);
          // The scroll Id is used when making multiple calls to the server api.
          if (scrollId.length === 0) {
            scrollId = encodeURIComponent(data.scrollId);
          }
        } else {
          hasMore = false;
          console.log('Finished Downloading channel asset list');
        }
      } catch (e) {
        console.log(`ERROR Failed downloading item list using  ${allItemsUrl}`);
        hasMore = false;
      }
    }
    // Now perform some updates on the data to ensure that it will process properly
    try {
      // We have to ensure that the types of any of the items don't have any hyphens.
      // Having a hyphen on a GraphQl index type seems to cause  issues.
      for (let x = 0; x < itemsArray.length; x += 1) {
        itemsArray[x].type = itemsArray[x].type.replace('-', '');
      }

      // console.log(JSON.stringify(itemsArray, null, 2));
      if (debug) {
        await fs.writeFile('.data/items.json', JSON.stringify(itemsArray), 'utf-8');
      }
      return Promise.all(itemsArray.map((e) => e.id).map(fetchItem));
    } catch (err) {
      console.log(err);
      throw err;
    }
  };

  const entities = await fetchAll();
  return entities;
};
