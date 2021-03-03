/**
 * Copyright (c) 2021 Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

/* eslint-disable no-console */
// eslint-disable-next-line import/no-unresolved
const GlobalAgent = require('global-agent');
const process = require('./src/process');
const fetch = require('./src/fetch');

/** Main entry point for the plugin (called automatically by Gatsby)
 *  This code will pull assets from an OCE server and create Gatsby
 *  nodes from them for use in an application.
 * <div>
 * Configuration is done via  the gatsby-config.js file in the main project. Here is a sample entry:
 * <br><pre><code>
 *  plugins: [
 *   {
 *     resolve: 'gatsby-source-oce',
 *     options: {
 *       name: 'oce',
 *       contentServer: 'urlToContentServer',
 *       channelToken: 'channelId',
 *       proxyUrl: '',
 *       items: {
 *         limit: 100,
 *         query: '',
 *       },
 *       renditions: 'all',
 *     },
 * },
 * ]
 *</code></pre></div>
 * <b>contentServer</b> should be set to the base url for your server. For example: https://oceserver.domain.com<br>
 * <b>channelToken</b> should be set to the publishing channel id on the given server<br>
 * <b>proxyUrl</b> this is only needed if there is a proxy between the local computer and
 * the OCE server. It should be of the form: "http://proxyserver.company.com:port"
 * <b>limit</b> (optional) How many assets  should be queried from the server in one call.
 * This can generally be left alone <br>
 * <b>query</b> (optional) It is used to limit what class of assets should be downloaded
 * from the channel.  With the default value of '', all assets are downloaded.
 * Note that it can result in incomplete data if a downloaded type references
 * another type that is not included as well.
 * <b>Use with caution!</b><br>
 * <b>renditions</b> can have one of the following values:
 * <ul>
 *  <li>all - both system-generated and custom renditions will be downloaded</li>
 *  <li>custom - only custom renditions will be downloaded</li>
 *  <li>none - no renditions will be downloaded</>
 * </ul>
 * If you plan to leverage the image support in Gatsby it is preferable to set
 * <b>renditions</b> to 'none' or 'custom' because Gatsby offers advanced
 * scaling options just like the OCE system renditions do.
 * If it is set to 'all' then the plugin will download the original content as well as the
 * 4 system renditions of the data, plus any custom renditions. for each digital asset.
 *  If your project uses 100 image assets,the plugin will then download 500+ files from the server
 * (1 original + 4 generated renditions, plus all custom renditions)
 * This is a waste of bandwidth unless you plan to use the oce renditions directly in your site.
 *
 */
exports.sourceNodes = async (
  {
    actions, store, cache, createNodeId, createContentDigest,
  },
  configOptions,
) => {
  const { createNode, touchNode } = actions;

  // Gatsby adds a configOption that's not needed for this plugin, delete it
  // eslint-disable-next-line no-param-reassign
  delete configOptions.plugins;

  // plugin code goes here...
  console.log('Using OCE plugin with the options: ', configOptions);

  const {
    contentServer, channelToken, proxyUrl = '', items: { limit } = 100, items: { query } = '', renditions = 'custom', debug = false,
  } = configOptions;
  try {
    if (proxyUrl !== '') {
      try {
        GlobalAgent.bootstrap();
        global.GLOBAL_AGENT.HTTPS_PROXY = proxyUrl;
        global.GLOBAL_AGENT.HTTP_PROXY = proxyUrl;
      } catch (e) {
        console.log(`ERROR ${e}`);
      }
    }
    let entities = await fetch.all(contentServer, channelToken, limit, query, debug);
    // tidy up the data for further processing
    entities = entities.filter((e) => e != null && (typeof e === 'object'));
    entities = process.cleanUp(entities);
    entities = process.standardizeDates(entities);
    entities = process.FixTypeDefinitions(entities);
    entities = process.normalizeDigitalAsset(entities);

    // Move fields that would conflict with Gatsby ids out of the way
    entities = process.moveFieldsUp(entities);
    // Generate unique Gatsby ids for indexing
    entities = process.createGatsbyIds(createNodeId, entities, channelToken);

    // Get a copy of all digital asset files (.jpg, .png, etc...) and make Gatsby nodes for them
    entities = await process.downloadMediaFiles({
      entities,
      store,
      cache,
      createNode,
      createNodeId,
      touchNode,
      renditions,
    });
    console.log('Completed download of assets');
    // Create nodes for all the downloaded assets
    await process.createNodesFromEntities({ entities, createNode, createContentDigest });
    console.log('Completed node creation');
  } catch (e) {
    console.log(`ERROR ${e}`);
  }
};

const pretty = (o) => JSON.stringify(o, null, 2);

const fileMap = new Map();

exports.onCreateNode = ({ node, actions }, configOptions) => {
  const { createNodeField, createParentChildLink } = actions;
  try {
    const { contentServer } = configOptions;

    if (node.internal.type === 'File') {
      fileMap.set(node.id, node);

      if (node.url && node.url.startsWith(contentServer)) {
        let renditionName = 'original';

        // If true, then the type of rendition is encoded in the name
        if (node.url.includes('responsiveimage')) {
          const brokenName = node.name.split('-');
          // Grab the first part of the name
          [renditionName] = brokenName;
        } else if (node.url.includes('customrendition')) {
          renditionName = 'custom';
        }
        createNodeField({ node, name: 'rendition', value: `${renditionName}` });
      }
    }

    // If the current node is an oceAsset and it is a digital asset, or derivative, we need
    // to link it to its files. We can safely do this because the file nodes are always created
    // before the oceAsset that references them, so they will already be indexed
    if (node.internal.type === 'oceAsset') {
      if (node.typeCategory === 'DigitalAssetType' || (!node.typeCategory && node.oceType === 'DigitalAsset')) {
        // Process the original file
        try {
          if (fileMap.has(node.gatsbyFileNodeId)) {
            const fileNode = fileMap.get(node.gatsbyFileNodeId);
            createParentChildLink({ parent: node, child: fileNode });
          }
        } catch (e) {
          console.log(`ERROR MAIN ${pretty(e)}`);
        }

        // Process the renditions
        try {
          for (let x = 0; x < node.renditions.length; x += 1) {
            const rendition = node.renditions[x];
            if (rendition.gatsbyFileNodeId && fileMap.has(rendition.gatsbyFileNodeId)) {
              const fileNode = fileMap.get(rendition.gatsbyFileNodeId);
              createParentChildLink({ parent: node, child: fileNode });
            }
          }
        } catch (e) {
          console.log(`ERROR RENDITION ${pretty(e)}`);
        }
      }
    }
  } catch (e) {
    console.log(`On node create ${pretty(e)}`);
  }
};
