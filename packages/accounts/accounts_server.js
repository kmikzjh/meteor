var connect = __meteor_bootstrap__.require("connect");

// A map from oauth "state"s to `Future`s on which calling `return`
// will unblock the corresponding outstanding call to `login`
Meteor._oauthFutures = {};

// A map from oauth "state"s to incoming requests that, when processed,
// had no matching future (presumably because the login popup window
// finished its work before the server executed the call to `login`)
Meteor._unmatchedOauthRequests = {};

// XXX add test for supporting both: first receving the oauth request
// and then executing call to `login`; and vice versa

Meteor.setupFacebookSecret = function(secret) {
  Meteor._facebookSecret = secret;
};

// Listen on /_oauth/*
__meteor_bootstrap__.app
  .use(connect.query())
  .use(function (req, res, next) {
    // Any non-oauth request will continue down the default middlewares
    if (req.url.split('/')[1] !== '_oauth') {
      next();
      return;
    }

    Meteor._debug('Incoming OAuth request', req.url, req.query);

    if (!Meteor._facebook)
      throw new Error("Need to call Meteor.setupFacebook first");
    if (!Meteor._facebookSecret)
      throw new Error("Need to call Meteor.setupFacebookSecret first");

    // Close the popup window
    res.writeHead(200, { 'Content-Type': 'text/html' });
    var content =
          '<html><head><script>window.close()</script></head></html>';
    res.end(content, 'utf-8');

    // Try to unblock the appropriate call to `login`
    var future = Meteor._oauthFutures[req.query.state];
    if (future) {
      // Unblock the `login` call
      Meteor._debug("We were expecting you, OAuth request.");
      future.return(Meteor._handleOauthRequest(req));
    } else {
      // Store this request. We expect to soon get a call to `login`
      Meteor._debug("We weren't expecting you, but that's fine. "
                    + "We'll expect the call to login instead.");
      Meteor._unmatchedOauthRequests[req.query.state] = req;
    }
  });

Meteor.methods({
  login: function(options) {
    var findOrCreateUser = function(email, identity) {
      var userIfExists = users.findOne({emails: email});
      if (userIfExists) {
        return userIfExists._id;
      } else {
        // XXX how do we deal with people changing their facebook email
        // addresses? We should probably create users based on facebook id
        // instead.
        return users.insert({emails: [email], identity: identity});
      }
    };

    if (options.oauth) {
      if (options.oauth.version !== 2 || options.oauth.provider !== 'facebook')
        throw new Error("We only support facebook login for now. More soon!");

      var fbAccessToken;
      if (Meteor._unmatchedOauthRequests[options.oauth.state]) {
        // We had previously received the HTTP request with the OAuth code
        fbAccessToken = Meteor._handleOauthRequest(
          Meteor._unmatchedOauthRequests[options.oauth.state]);
        delete Meteor._unmatchedOauthRequests[options.oauth.state];
      } else {
        if (Meteor._oauthFutures[options.oauth.state])
          throw new Error("How can we already have a future set up for " +
                          options.oauth.state + "?");

        // Prepare Future that will be `return`ed when we get an incoming
        // HTTP request with the OAuth code
        Meteor._oauthFutures[options.oauth.state] = new Future;
        fbAccessToken = Meteor._oauthFutures[options.oauth.state].wait();
        delete Meteor._oauthFutures[options.oauth.state];
      }

      // Fetch user's facebook identity
      var identity = Meteor.http.get(
        "https://graph.facebook.com/me?access_token=" + fbAccessToken).data;
      this.setUserId(findOrCreateUser(identity.email));

      // Generate and store a login token for reconnect
      var loginToken = loginTokens.insert({
        fbAccessToken: fbAccessToken,
        userId: this.userId()
      });

      return {
        token: loginToken,
        id: this.userId()
      };
    } else if (options.resume) {
      var loginToken = loginTokens.findOne({_id: options.resume});
      if (!loginToken)
        throw new Meteor.Error("Couldn't find login token");
      this.setUserId(loginToken.userId);

      return {
        token: loginToken,
        id: this.userId()
      };
    } else {
      throw new Error("Neither oauth nor resume in options");
    }
  },

  logout: function() {
    this.setUserId(null);
  }
});

// @returns {String} Facebook access token
Meteor._handleOauthRequest = function(req) {
  var bareUrl = req.url.substring(0, req.url.indexOf('?'));
  var provider = bareUrl.split('/')[2];
  if (provider === 'facebook') {
    Fiber(function() {
      // Request an access token
      var response = Meteor.http.get(
        "https://graph.facebook.com/oauth/access_token?" +
          "client_id=" + Meteor._facebook.appId +
          // XXX what does this redirect_uri even mean?
          "&redirect_uri=" + Meteor._facebook.appUrl + "/_oauth/facebook" +
          "&client_secret=" + Meteor._facebookSecret +
          "&code=" + req.query.code).content;

      // Extract the facebook access token from the response
      var fbAccessToken;
      _.each(response.split('&'), function(kvString) {
        var kvArray = kvString.split('=');
        if (kvArray[0] === 'access_token')
          fbAccessToken = kvArray[1];
        // XXX also parse the "expires" argument?
      });

      return fbAccessToken;
    }).run();
  } else {
    throw new Error("Unknown OAuth provider: " + provider);
  }
};


