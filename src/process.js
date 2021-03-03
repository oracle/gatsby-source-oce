/**
 * Copyright (c) 2021 Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
/* eslint-disable no-console */
/* eslint-disable no-shadow */

const { createRemoteFileNode } = require('gatsby-source-filesystem');

exports.cleanUp = (entities) => entities.map((item) => {
  delete item.links;
  delete item.createdDate;
  return item;
});

/**
 * A utility function to reformat dates for storage
 * @private
 */
const isDate = (v) => (typeof v === 'object') && (typeof v.value === 'string' && typeof v.timezone === 'string');

const isDigitalAsset = (e) => (e.typeCategory === 'DigitalAssetType' || (!e.typeCategory && e.oceType === 'DigitalAsset'));

// Standardize dates on ISO 8601 version.
exports.standardizeDates = (entities) => {
  const fixDate = (aggr, kv) => {
    const [key, value] = kv;
    if (Array.isArray(value)) {
      aggr[key] = value.map((v) => (isDate(v) ? v.value : v));
    } else if (isDate(value)) {
      aggr[key] = value.value;
    } else {
      aggr[key] = value;
    }
    return aggr;
  };
  return entities.map((e) => {
    // if value has value && timezone
    e.updatedDate = e.updatedDate.value;
    // handle field values
    e.fields = Object.entries(e.fields).reduce(fixDate, {});
    return e;
  });
};
exports.normalizeDigitalAsset = (entities) => entities.map((e) => {
  if (isDigitalAsset(e)) {
    // console.log(e.id, Object.keys(e.fields))
    e.fields.native = e.fields.native.links
      .filter((f) => f.rel === 'self')
      .reduce((_, f) => f.href, '');
  }
  return e;
});

/**
 * Every Gatsby asset has to have a unique id. This function generates the
 * id based on the OCE asset id and channel id
 * @private
 * @param {*} createNodeId action passed in from Gatsby
 * @param {*} entities An array of asset records to process
 */
exports.createGatsbyIds = (createNodeId, entities, channelToken) => entities.map((e) => {
  e.oceId = e.id;
  e.id = createNodeId(`oracleoce-${e.id}-${channelToken}`);
  return e;
});

exports.FixTypeDefinitions = (entities) => entities.map((e) => {
  // We want to index assets under the generic oceAsset type to make OCE-style queries easier
  e.oceType = e.type;
  e.oceFields = e.fields;
  e.type = 'oceAsset';
  return e;
});

exports.moveFieldsUp = (entities) => entities
  .map(({ fields, ...other }) => ({ ...other, ...fields }));

// const pretty = (o) => JSON.stringify(o, null, 2);

const getMediaList = (element, renditions) => {
  const result = [];
  const baseKey = `oce-media-${element.id}`;
  // Get the asset name less the extension
  const name = element.name.replace(/\....$/, '');

  // We always get the native rendition. The name of the native rendition is the asset name

  result.push({
    key: baseKey.concat('-native'),
    name: `${name}`,
    url: element.native,
    reference: element,
  });

  // Now loop through renditions and grab the first version of each. The name of the rendition
  // is the asset name with a suffix of -renditionType (eq -Thumbnail)

  if (renditions !== 'none') {
    element.renditions.forEach((e) => {
    // We only download system renditions when specifically required
      if ((renditions === 'all') || (renditions === 'custom' && e.type === 'customrendition')) {
        result.push({
          key: baseKey.concat(`${e.name}`),
          name: `${e.name}-${name}`,
          url: `${e.formats[0].links[0].href}`,
          reference: e,
        });
      }
    });
  }
  return result;
};

exports.downloadMediaFiles = async ({
  entities,
  store,
  cache,
  createNode,
  createNodeId,
  touchNode,
  renditions,
}) => Promise.all(
  entities.map(async (e) => {
    if (isDigitalAsset(e)) {
      // Call new function to get all renditions

      const dataItemList = getMediaList(e, renditions);

      let fileNodeID = null;

      for (let x = 0; x < dataItemList.length; x += 1) {
        const mediaObject = dataItemList[x];

        fileNodeID = null;

        const cacheMediaData = await cache.get(mediaObject.key);
        // If we have cached media data and it wasn't modified, reuse
        // previously created file node to not try to re-download
        if (cacheMediaData && e.updatedDate === cacheMediaData.updatedDate) {
          fileNodeID = cacheMediaData.fileNodeID;
          touchNode({ nodeId: cacheMediaData.fileNodeID });
        }

        // If we don't have cached data, download the file
        if (!fileNodeID) {
          try {
            let fileNode = null;
            console.log(`downloading mediaFile ${mediaObject.url}`);
            fileNode = await createRemoteFileNode({
              url: mediaObject.url,
              store,
              cache,
              createNode,
              createNodeId,
              name: mediaObject.name,
            });

            if (fileNode) {
              fileNodeID = fileNode.id;

              await cache.set(mediaObject.key, {
                fileNodeID,
                updatedDate: e.updatedDate,
              });
            }
          } catch (error) {
            console.log(`ERROR!${error}`);
            // Ignore
          }
        }

        if (fileNodeID) {
          if ('reference' in mediaObject) {
            mediaObject.reference.gatsbyFileNodeId = fileNodeID;
          }
        }
      }
    }

    return e;
  }),
);

exports.createNodesFromEntities = async ({ entities, createNode, createContentDigest }) => {
  await entities.forEach(async (e) => {
    const { type, ...entity } = e; // eslint-disable-line no-unused-vars

    const children = [];

    const node = {
      ...entity,
      children,
      parent: null,
      internal: {
        type,
        contentDigest: createContentDigest(JSON.stringify(entity)),
      },
    };

    await createNode(node);
  });
};
