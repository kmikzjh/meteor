// Copied from http://stackoverflow.com/a/4599967
var newwindow;
var openCenteredPopup = function(url, width, height) {
  var screenX     = typeof window.screenX != 'undefined' ? window.screenX : window.screenLeft,
      screenY     = typeof window.screenY != 'undefined' ? window.screenY : window.screenTop,
      outerWidth  = typeof window.outerWidth != 'undefined' ? window.outerWidth : document.body.clientWidth,
      outerHeight = typeof window.outerHeight != 'undefined' ? window.outerHeight : (document.body.clientHeight - 22),
      left        = parseInt(screenX + ((outerWidth - width) / 2), 10),
      top         = parseInt(screenY + ((outerHeight - height) / 2.5), 10),
      features    = ('width=' + width + ',height=' + height + ',left=' + left + ',top=' + top);

  newwindow = window.open(url, 'Login', features);

  if (window.focus)
    newwindow.focus();

  return false;
};
// End copied code

Meteor.loginWithFacebook = function () {
  if (!Meteor._facebook)
    throw new Error("Need to call Meteor.setupFacebook first");

  var oauthState = Meteor.uuid();

  openCenteredPopup(
    'https://www.facebook.com/dialog/oauth?client_id=' + Meteor._facebook.appId +
      '&redirect_uri=' + Meteor._facebook.appUrl + '/_oauth/facebook' +
      '&scope=email&state=' + oauthState,
    1000, 600); // XXX should we use different dimensions, e.g. on mobile?

  Meteor.apply('login', [
    {oauth: {version: 2, provider: 'facebook', state: oauthState}}
  ], {wait: true}, function(error, result) {
    Meteor.default_connection.setUserId(result.id);
    Meteor.default_connection.onReconnect = function() {
      Meteor.apply('login', [{resume: result.token}], {wait: true});
    };
  });
};
