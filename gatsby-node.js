/**
 * Copyright (c) 2021, 2022, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

/* eslint-disable no-console */
// eslint-disable-next-line import/no-unresolved
const GlobalAgent = require('global-agent');
const process = require('./src/process');
const fetch = require('./src/fetch');
const AuthManagerToken = require('./src/authManager');

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
 *       staticAssetDownload: false
 *       staticAssetRootDir: 'asset'
 *       staticUrlPrefix: ''
 *     },
 * },
 * ]
 *</code></pre></div>
 * <b>contentServer</b> should be set to the base url for your server. For example: https://oceserver.domain.com<br>
 * <b>channelToken</b> should be set to the publishing channel id on the given server<br>
 * <b>proxyUrl</b> (optional) this is only needed if there is a proxy between the local computer and
 * the OCE server. It should be of the form: "http://proxyserver.company.com:port"<br>
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
 * <br>
 * <b>staticAssetDownload</b> (optional) should be set to true if you want to download assets as
 * files to be included via urls in your site. If it is set to the default value of false the
 * binary files will be placed in the Gatsby cache and will be accessible via GraphQL<br>
 * <b>staticAssetRootDir</b> this setting is only used if staticAssetDownload is true. It is used
 * to set a a prefix that will be prepended to all of the urls for downloaded files. For example:
 *  If it is set to "content" then the url of a downloaded image called Logo.jpg
 * will be /content/Logo.jpg.<br>
 * <b>staticUrlPrefix</b> (optional) should be set equal to the pathPrefix defined in the
 * gatsby-config.js file. If pathPrefix is not used or staticAssetDownload is false then this
 * parameter doesn't need to be set.
 * <b>authStr</b> (optional) This parameter is used to set a fixed bearer token string when
 * the plugin is connecting to a secure published channel or is used to download preview data.
 * Note that this token string might have a time limit and will not be renewed by the plugin.
 * It is ignored if oAuthSettings (see below) is set
 * <b>oAuthSettings</b> (optional) This parameter defines the connection settings used to
 * connect to an oAuthServer so that the plugin can get an up-to-date and valid bearer token.
 * It takes the form if an object with the following fields:
 *  clientId: login id used on OAUTH provider
 *  clientSecret: password used on the OAUTH server
 *  clientScopeUrlL: scope URL for the request
 *  idpUrl: URL:  URL used to connect to the OAUTH token provider
 *
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

  const {
    contentServer, channelToken, proxyUrl = '', items: { limit } = 100, items: { query } = '', authStr = '', oAuthSettings = null, preview = false, renditions = 'custom',
    staticAssetDownload = false, staticAssetRootDir = 'assets', staticUrlPrefix = '', debug = false,
  } = configOptions;

  // Work around some clumsiness if this setting originally came from a .env file
  let oAuthObj = null;
  if (oAuthSettings && oAuthSettings.clientId && oAuthSettings.clientSecret
    && oAuthSettings.clientScopeUrl && oAuthSettings.idpUrl) {
    oAuthObj = oAuthSettings;
  }

  console.log('Using OCE plugin with the options: ', {
    contentServer,
    channelToken,
    proxyUrl,
    limit,
    query,
    auth: `${authStr.length} characters`,
    oAuthObj,
    preview,
    renditions,
    staticAssetDownload,
    staticAssetRootDir,
    staticUrlPrefix,
    debug,
  });
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

    // Since Gatsby only uses the OAUTH token for a short time we can
    // create it once and use it for the download.
    const oAuthStr = await AuthManagerToken.AuthManagerToken(authStr, oAuthObj);

    let entities = await fetch.all(contentServer, channelToken, limit, query,
      oAuthStr, preview, debug);
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

    if (staticAssetDownload === true || staticAssetDownload === 'true') {
      console.log('Starting static download');
      await process.prepareForStaticDownload({ staticAssetRootDir });
      await process.downloadMediaFilesToStaticDir({
        entities,
        staticAssetRootDir,
        staticUrlPrefix,
        renditions,
        oAuthStr,
      });
      console.log('Ending static download');
    } else {
    // Get a copy of all digital asset files (.jpg, .png, etc...) and make Gatsby nodes for them
      entities = await process.downloadMediaFiles({
        entities,
        store,
        cache,
        createNode,
        createNodeId,
        touchNode,
        renditions,
        oAuthStr,
      });
    }

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
