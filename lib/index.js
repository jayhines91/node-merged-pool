var net = require('net');
var events = require('events');

//Gives us global access to everything we need for each hashing algorithm
require('./algoProperties.js');

var pool = require('./pool.js');
var mergedProxy = require('./mergedProxy.js');
var auxpow = require('./auxpow-builder.js');

exports.daemon = require('./daemon.js');
exports.varDiff = require('./varDiff.js');
exports.proxy = mergedProxy;
exports.auxpow = auxpow;


exports.createPool = function(poolOptions, authorizeFn){
    var newPool = new pool(poolOptions, authorizeFn);
    return newPool;
};
