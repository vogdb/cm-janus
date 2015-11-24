var util = require('util');
var Promise = require('bluebird');
var PluginAbstract = require('./abstract.js');
var Stream = require('../stream');
var JanusError = require('../janus-error');

var serviceLocator = require('../service-locator');

function PluginVideo(id, type, proxyConnection) {
  PluginVideo.super_.apply(this, arguments);

  /**
   * @type {Stream}
   */
  this.stream = null;
}

util.inherits(PluginVideo, PluginAbstract);

PluginVideo.TYPE = 'janus.plugin.streaming';

/**
 * @param {Object} message
 * @returns {Promise}
 */
PluginVideo.prototype.processMessage = function(message) {
  var janusMessage = message['janus'];

  if ('message' === janusMessage && 'create' === message['body']['request']) {
    return this.onCreate(message);
  }
  if ('message' === janusMessage && 'watch' === message['body']['request']) {
    return this.onWatch(message);
  }
  if ('webrtcup' === janusMessage) {
    return this.onWebrtcup(message);
  }
  if ('hangup' === janusMessage) {
    return this.onHangup(message);
  }
  if ('detach' === janusMessage) {
    return this.onHangup(message);
  }
  return Promise.resolve();
};

/**
 * @param {Object} message
 * @returns {Promise}
 */
PluginVideo.prototype.onCreate = function(message) {
  var self = this;
  this.proxyConnection.transactions.add(message['transaction'], function(response) {
    self.stream = Stream.generate(message['body']['id'], self.proxyConnection);
    return serviceLocator.get('cm-api-client').publish(self.stream.channelName, self.stream.id, Date.now(), self.proxyConnection.sessionData)
      .then(function() {
        serviceLocator.get('logger').info('adding stream', self.stream);
        serviceLocator.get('streams').add(self.stream);
      })
      .catch(function(error) {
        self.stream.connection.close();
        throw new JanusError.Error('Cannot publish: ', error);
      });
  });
  return Promise.resolve(message);
};

/**
 * @param {Object} message
 * @returns {Promise}
 */
PluginVideo.prototype.onWatch = function(message) {
  var self = this;
  this.proxyConnection.transactions.add(message['transaction'], function(response) {
    self.stream = Stream.generate(message['body']['id'], self.proxyConnection);
    return Promise.resolve();
  });
  return Promise.resolve(message);
};


/**
 * @param {Object} message
 * @returns {Promise}
 */
PluginVideo.prototype.onWebrtcup = function(message) {
  var self = this;
  return serviceLocator.get('cm-api-client').subscribe(this.stream.channelName, this.stream.id, Date.now(), self.proxyConnection.sessionData)
    .then(function() {
      serviceLocator.get('logger').info('adding stream', self.stream);
      serviceLocator.get('streams').add(self.stream);
    })
    .catch(function(error) {
      serviceLocator.get('logger').info('Cannot subscribe: ', error);
      self.stream.proxyConnection.close();
    });
};

/**
 * @param {Object} message
 * @returns {Promise}
 */
PluginVideo.prototype.onHangup = function(message) {
  this.proxyConnection.removePlugin(this.id);
  this.proxyConnection.close();
  return Promise.resolve(message);
};

module.exports = PluginVideo;