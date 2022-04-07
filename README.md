# About gatsby-source-oce

A Gatsby source plugin for importing data from an [Oracle Content Management](https://docs.oracle.com/en/cloud/paas/content-cloud/headless-cms.html) service into a [Gatsby](https://www.gatsbyjs.com) application.

## Installation

Run the following to add this plugin to your package.json:

```shell
npm install @oracle/gatsby-source-oce
```

## Documentation

This Gatsby plugin doesn't have any user-accessible APIs exposed. When configured properly, it will be invoked at either build or develop time by Gatsby and will download your assets and convert them into nodes that you can query with GraphQL.  Two types of nodes are created:

- `OceAsset` nodes. These contain the JSON data for both digital assets and content items.
- `File` nodes. All digital assets have a metadata section that includes URLs that can be used to access the associated binary data (the original file and any applicable renditions). Gatsby downloads these binaries and stores them as file nodes.

### Set Up

To use gatsby-source-oce in your Gatsby site, add it to the plugins list in your gatsby-config.js file:  

```javascript
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-source-oce',
      options: {
        name: 'oce',
        contentServer: 'https://<service-name>-<account-name>.cec.ocp.oraclecloud.com',
        channelToken: '...',
        proxyUrl: 'http://proxy.example.com:3128',
        items: {
          limit: 100,
          query: '',
        },
        renditions: 'none',
        preview: false,
        auth: '',
        oAuthSettings: null,
        staticAssetDownload: 'false'.
        staticAssetRootDir: 'asset'

      },
    },
  ],
}
```

### Configuration Options

**`contentServer`** (required)  
This should be set to the base url for your Oracle Content Management service. The URL uses the pattern `https://<service-name>-<account-name>.cec.ocp.oraclecloud.com` and can be given to you by your Content service administrator.  

**`channelToken`** (required)  
This should be set to the publishing channel holding your site's content.  

**`proxyUrl`** [optional] *Defaults to empty which uses a direct connection*  
This can be used if there is a network proxy between the machine building your Gatsby project and the Content server. If a proxy is not being used then omit this field or set it to '' (empty string).  

**`limit`** [optional] *Defaults to 100*  
This can be used to limit how many assets will be queried from the channel at one time.  

**`query`** [optional] *Defaults to empty which selects everything*  
This can be used to reduce the set of assets to be downloaded from the channel.  With the empty default value all assets published to the specified channel will downloaded. Here are some sample queries:

- Query a specific type of asset:  
`'(type eq "productReview")'`
- Query based on a field value:  
`'(name eq "John")'`

Query strings are described in more detail [here](https://docs.oracle.com/en/cloud/paas/content-cloud/rest-api-content-delivery/op-published-api-v1.1-items-get.html).

> NOTE: Overly restrictive queries may result in an incomplete data set if content items reference other assets that are excluded by the query.  For example if you select only items of type `productReview` and these items reference items of type `Author`, then the items of type `Author` will *not* be downloaded to the Gatsby store. Unless there is a huge volume of content published on a channel that you do not need in your application, the safest option is to leave this query option empty.  

**`renditions`** [optional]  
This setting controls which renditions of digital assets will be downloaded. This can have one of three values:  

- `custom` (default) means that only custom renditions will be downloaded.
- `none` means that only the original data will be downloaded.  
- `all` means that all of the system generated renditions (*thumbnail*, *small*, etc.) will be downloaded as well as any custom renditions.

> NOTE: For each image downloaded, Gatsby will generate multiple renditions of its own to use for responsive display. This means that if you use the `all` value for renditions, Gatsby will generate resized copies of both the original image and for each of the system renditions (*thumbnail*, *small*, etc.). This can add a lot of processing time and network load to the build process for support that you may not need. It is recommended that you use the `none` or `custom` option unless you wish to explicitly use the system renditions.  

**`preview`** [optional]  
This setting controls whether the client will be retrieving preview (unpublished) data or not. If true, it must be used with the auth parameter.  It defaults to false.

**`auth`** [optional]  
This setting is used to set authentication tokens required when downloading from a secure publishing channel (preview=false) or preview items. It may use basic auth or
an OAuth bearer token. It defaults to an empty string. Note that using this setting with a bearer token will not refresh the token when it is no longer valid. For that
behavior you need to use the oAuthSettings parameter documented below.

**`oAuthSettings`** [optional]
This setting is used when using OAUTH to authenticate a secure publishing channel or using preview support. Using this will ensure that a valid OAUTH bearer token will
be available to the application. The setting takes the form of an object with the following fields:  
{
   clientId: 'xxxxx',  
   clientSecret: 'xxxxx',  
   clientScopeUrl: 'xxxxx',  
   idpUrl: 'https://identity.server.com'  
}  
  
**`staticAssetDownload`** [optional]  
This setting is used to make the plugin download binary assets into the public directory of the site as opposed to storing them in the internal Gatsby cache. This allows items such as image files to be referenced as direct URLs rather than using GraphQL to access them. It is used in combination with the staticAssetRootDir (described below). The default value is false which means all data will be in the cache instead. 

**`staticAssetRootDir`** [optional]  
This setting is ignored unless staticAssetDownload is set to true. This allows a developer to define a directory in the website that will contain all the downloaded assets. This can help to segregate the items coming from the server from other static data.  The default value is "asset", but it can be set to any string that is a valid directory name. 

**`staticUrlPrefix`** [optional]  
This setting is ignored unless staticAssetDownload is set to true. This needs to be set if the application has a pathPrefix defined in its gatsby-config.js file. In static mode all downloaded files are given a URL relative to the build root (/public) of the application by default. If there is a pathPrefix specified though, then the URLs need to be prefixed with that value as well.  
For example: If there is a file "logo.png" it might be given a default URL of /server/logo.png . If however, the app uses a pathPrefix of /myApplication, this URL should be changed to /myApplication/server/logo.png.  
Setting staticUrlPrefix equal to the pathPrefix will cause the plugin to make this adjustment in the Gatsby cache.   


**`How to use static download:`**  
  Assume there is a digital asset on the server called Logo.jpg that contains an image to be used in a site.  
If staticAssetDownload is false then the binary image will be stored in the cache as well as any selected renditions. (See 'renditions' flag above)   These binary files can then be queried and traversed via GraphQL  
  
If staticAssetDownload is true and staticAssetRootDir is set to 'server' then the file will be available in the website as: /server/Logo.jpg and could be displayed
in an \<img\> tag as \<img src="/server/Logo.jpg"\/>  . If the user has chosen to download all the renditions of the digital assets in their site then the following urls
will be available:   
/server/Logo.jpg     (the original)  
/server/Large/Logo.jpg     (the large rendition)  
/server/Medium/Logo.jpg     (the medium rendition)  
/server/Small/Logo.jpg     (the small rendition)  
/server/Thumbnail/Logo.jpg     (the thumbnail rendition)  

If there are any custom renditions, then they will also appear as
/server/*custom rendition name*/Logo.jpg
 




### Content Model

The data model used for content data in Gatsby closely models the JSON data provided by the Oracle Content Management REST interface. There are a few small exceptions though that are needed to avoid conflicts between Gatsby node reserved fields and Oracle Content Management data. These include:

- All assets are typed as `oceAsset` so that they can be distinguished from other assets in GraphQL queries.
- Some Oracle Content Management asset fields are renamed to avoid conflicts with reserved Gatsby node field names. `id` becomes `oceId`,  `fields` becomes `oceFields`, and `type` becomes `oceType`.
- In traditional Oracle Content Management usage, a digital asset provides a URL that can be used to retrieve the binary form(s) of the asset from the server. As Gatsby builds static sites, these binary values must be stored locally and are placed in file nodes in the GraphQL store.  To allow these binary forms to be retrieved easily in a site, a link is established between the file nodes and the digital asset nodes. What this means is that it is possible to traverse an `oceAsset` and find the internal Gatsby representations of its binary data without having to load the file nodes as well. All of an `oceAsset`'s  file data can be found under the field `childrenFile`.

## Examples

You can query `OceAsset` nodes in the following manner:  
(This returns the names and types of all assets. Note that the `type` field is internal to Gatsby, so we use the `oceType` field to get the Oracle Content Management name for each definition )  

```graphql
{
  allOceAsset {
    nodes {
      name
      oceType
    }
  }
}
```

A similar query where we filter out all assets that are not of type `DigitalAsset`:  

```graphql
{
  allOceAsset(filter: {oceType: {ne: "DigitalAsset"}}) {
    nodes {
      name
    }
  }
}
```

Load the information needed to display the image `Banner1.jpg` as a fluid (responsive) image in Gatsby. What we are doing is to first load the asset by name and then look in the `childrenFile` field to get the data stored in the linked Gatsby file node.  

```graphql
{
  oceAsset(name: {eq: "Banner1.jpg"}) {
    childrenFile {
      name
      fields {
        rendition
      }
      childImageSharp {
        gatsbyImageData(quality: 100, layout: FULL_WIDTH)
      }
    }
  }
}
```

## Contributing

This project welcomes contributions from the community. Before submitting a pull
request, please [review our contribution guide](./CONTRIBUTING.md).

## Security

Please consult the [security guide](./SECURITY.md) for our responsible security
vulnerability disclosure process.

## License

Copyright (c) 2021, 2022, Oracle and/or its affiliates.

Released under the Universal Permissive License v1.0 as shown at
<https://oss.oracle.com/licenses/upl/>.
