# About gatsby-source-oce

A Gatsby source plugin for importing data from an [Oracle Content and Experience](https://docs.oracle.com/en/cloud/paas/content-cloud/headless-cms.html) (OCE) service into a [Gatsby](https://www.gatsbyjs.com) application.

## Installation

Run the following to add this plugin to your package.json:

```shell
npm install @oracle/gatsby-source-oce
```

## Documentation

The OCE Gatsby plugin doesn't have any user-accessible APIs exposed. When configured properly, it will be invoked at either build or develop time by Gatsby and will download your assets and convert them into nodes that you can query with GraphQL.  Two types of nodes are created:

- `OceAsset` nodes. These contain the JSON data for both digital assets and content items.
- `File` nodes. All digital assets have a metadata section that includes URLs that can be used to access the associated binary data (the original file and any applicable renditions). Gatsby downloads these binaries and stores them as file nodes.

### Setup

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
      },
    },
  ],
}
```

### Configuration Options

**`contentServer`** (required)  
This should be set to the base url for your Oracle Content service. The URL uses the pattern `https://<service-name>-<account-name>.cec.ocp.oraclecloud.com` and can be given to you by your OCE service administrator.  

**`channelToken`** (required)  
This should be set to the publishing channel holding your site's content.  

**`proxyUrl`** [optional] *Defaults to empty which uses a direct connection*  
This can be used if there is a network proxy between the machine building your Gatsby project and the OCE server. If a proxy is not being used then omit this field or set it to '' (empty string).  

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
- `all` means that all of the OCE-generated renditions (*thumbnail*, *small*, etc.) will be downloaded as well as any custom renditions.

> NOTE: For each image downloaded, Gatsby will generate multiple renditions of its own to use for responsive display. This means that if you use the `all` value for renditions, Gatsby will generate resized copies of both the original image and for each of the OCE renditions (*thumbnail*, *small*, etc.). This can add a lot of processing time and network load to the build process for support that you may not need. It is recommended that you use the `none` or `custom` option unless you wish to explicitly use the OCE renditions.  

### Content Model

The data model used for OCE data in Gatsby closely models the JSON data provided by the OCE REST interface. There are a few small exceptions though that are needed to avoid conflicts between Gatsby node reserved fields and OCE data. These include:

- All assets are typed as `oceAsset` so that they can be distinguished from other assets in GraphQL queries.
- Some OCE asset fields are renamed to avoid conflicts with reserved Gatsby node field names. `id` becomes `oceId`,  `fields` becomes `oceFields`, and `type` becomes `oceType`.
- In traditional OCE usage, a digital asset provides a URL that can be used to retrieve the binary form(s) of the asset from the server. As Gatsby builds static sites, these binary values must be stored locally and are placed in file nodes in the GraphQL store.  To allow these binary forms to be retrieved easily in a site, a link is established between the file nodes and the digital asset nodes. What this means is that it is possible to traverse an `oceAsset` and find the internal Gatsby representations of its binary data without having to load the file nodes as well. All of an `oceAsset`'s  file data can be found under the field `childrenFile`.

## Examples

You can query `OceAsset` nodes in the following manner:  
(This returns the names and types of all assets. Note that the `type` field is internal to Gatsby, so we use the `oceType` field to get the OCE name for each definition )  

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
        fluid(quality: 100) {
            
          ...GatsbyImageSharpFluid_withWebp
        }                
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

Copyright (c) 2021 Oracle and/or its affiliates.

Released under the Universal Permissive License v1.0 as shown at
<https://oss.oracle.com/licenses/upl/>.
