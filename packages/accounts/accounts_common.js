users = new Meteor.Collection("users");
loginTokens = new Meteor.Collection("loginTokens");

Meteor.setupFacebook = function(appId, appUrl) {
  Meteor._facebook = {
    appId: appId,
    appUrl: appUrl
  };
};
