var Battle = require("./servercode/sim/battle");
var Side = require("./servercode/sim/side");
var Pokemon = require("./servercode/sim/pokemon");
var clone = require("./clone");
var sizeOf = require("object-sizeof")

module.exports = cloneBattleState;


/**
 * @param {Battle} battleState
 * @return {Battle}
 */
function cloneBattleState(battleState){
    let excludeThese = ["currentMod", "parentMod", "dataCache", "formatsCache", "templateCache", "moveCache", "itemCache", "abilityCache", "typeCache", "modsLoaded", "ModdedDex", "Data", "zMoveTable", "log", "inputLog", "format", "cachedFormat", "formatData", "itemData", "prng", "prngSeed", "teamGenerator"];
    return clone(battleState, true, undefined, undefined, excludeThese);
}