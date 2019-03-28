/* Randombot - to be used primarily for testing
Can also be used as a fallback, in case another decision algorithm
fails or crashes */

var _ = require("underscore");
var util = require('util')
var logger = require('log4js').getLogger("minimax");

var decide = module.exports.decide = function(battle, choices) {
    logger.info(battle.p1.pokemon.map(poke => {
        return {
            name: poke.name,
            health: poke.hp + "/" + poke.maxhp,
            moves: poke.moveSlots.map(move => move.id + " pp:" + move.pp),
            transformed: poke.transformed,
            boosts: poke.boosts,
            stats: poke.stats,
            level: poke.level,
            volatiles: util.inspect(poke.volatiles),
            statusData: poke.statusData
        }
    }))
    logger.info(battle.p2.pokemon.map(poke => {
        return {
            name: poke.name,
            health: poke.hp + "/" + poke.maxhp,
            moves: poke.moveSlots.map(move => move.id + " pp:" + move.pp),
            transformed: poke.transformed,
            boosts: poke.boosts,
            stats: poke.stats,
            level: poke.level,
            volatiles: util.inspect(poke.volatiles),
            statusData: poke.statusData
        }
    }))
    return _.shuffle(choices)[0];
};