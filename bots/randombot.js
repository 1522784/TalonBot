/* Randombot - to be used primarily for testing
Can also be used as a fallback, in case another decision algorithm
fails or crashes */

var _ = require("underscore");
var log = require('log4js').getLogger("minimax");
var logState = require("./../logState")

var decide = module.exports.decide = function(battle, choices) {
    //logState(log, battle);
    return _.shuffle(choices)[0];
};