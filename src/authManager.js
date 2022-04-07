/**
 * Copyright (c) 2021, 2022, Oracle and/or its affiliates.
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

/* eslint-disable camelcase */
/**
 * Handles the Bearer authorization needed when using preview content or
 * content published to a secure channel.
 *
 *
 *
 * */
const fetch = require('node-fetch');

exports.AuthManagerToken = async (authStr, authObj) => {
  const getBearerAuth = async (oAuthObject) => {
    // base64 encode clientId:clientSecret
    const authString = `${oAuthObject.clientId}:${oAuthObject.clientSecret}`;
    const authValue = (Buffer.from(authString)).toString('base64');

    // URL encode the clientScopeUrl
    const encodedScopeUrl = encodeURIComponent(oAuthObject.clientScopeUrl);

    // build the full REST end point URL for getting the access token
    const restURL = new URL('/oauth2/v1/token', oAuthObject.idpUrl);

    // make a request to the server to get the access token
    const response = await fetch(restURL.toString(), {
      body: `grant_type=client_credentials&scope=${encodedScopeUrl}`,
      headers: {
        Authorization: `Basic ${authValue}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });
    const responseJSON = await response.json();

    const { access_token } = responseJSON;
    return `Bearer ${access_token}`;
  };

  const oAuthObject = authObj || null;
  let oAuthStr = (authStr && authStr !== '') ? authStr : '';

  // if oAuthObject is given it overrides the passed in any value of authStr
  if (oAuthObject) {
    oAuthStr = await getBearerAuth(oAuthObject);
  }

  return oAuthStr;
};
